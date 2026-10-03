import { scrub, scrubString } from "./scrub";
import {
  buildEnvelope,
  buildEvent,
  envelopeUrl,
  normalizeError,
  parseDsn,
  type ParsedDsn,
  type SentryEvent,
} from "./sentry";

/**
 * Error reporting without an SDK. `createErrorReporter` returns a Sentry
 * reporter (envelope POST with fetch) when a DSN is set and a console
 * reporter (one JSON line on stderr) otherwise. Everything is scrubbed of
 * personal data first, and reporting never throws.
 */

export type ErrorContext = {
  level?: SentryEvent["level"];
  tags?: Record<string, string | undefined>;
  extra?: Record<string, unknown>;
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
};

export interface ErrorReporter {
  readonly kind: "sentry" | "console";
  captureException(error: unknown, context?: ErrorContext): Promise<void>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ReporterOptions = {
  dsn?: string | null;
  sampleRate?: string | number | null;
  environment?: string;
  release?: string;
  platform: SentryEvent["platform"];
  fetch?: FetchLike;
  random?: () => number;
  sink?: (line: string) => void;
};

/** SENTRY_SAMPLE_RATE: a number between 0 and 1; anything else means 1 (send everything). */
export function parseSampleRate(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 1;
  const rate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1, Math.max(0, rate));
}

function cleanTags(tags: ErrorContext["tags"]): Record<string, string> | undefined {
  if (!tags) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) if (value) out[key] = value.slice(0, 200);
  return Object.keys(out).length ? out : undefined;
}

function cleanHeaders(
  headers: NonNullable<ErrorContext["request"]>["headers"],
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

export function createConsoleReporter(
  sink: (line: string) => void = (line) => console.error(line),
): ErrorReporter {
  return {
    kind: "console",
    async captureException(error, context) {
      try {
        const { type, value, stack } = normalizeError(error);
        sink(
          JSON.stringify({
            level: context?.level ?? "error",
            msg: scrubString(`${type}: ${value}`),
            time: new Date().toISOString(),
            context: scrub({
              stack,
              tags: cleanTags(context?.tags),
              extra: context?.extra,
              request: context?.request && {
                ...context.request,
                headers: cleanHeaders(context.request.headers),
              },
            }),
          }),
        );
      } catch {
        // Reporting must never throw.
      }
    },
  };
}

export function createSentryReporter(
  dsn: ParsedDsn,
  options: Omit<ReporterOptions, "dsn"> & { fallback?: ErrorReporter },
): ErrorReporter {
  const sampleRate = parseSampleRate(options.sampleRate);
  const random = options.random ?? Math.random;
  const fallback = options.fallback ?? createConsoleReporter(options.sink);
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    kind: "sentry",
    async captureException(error, context) {
      if (sampleRate < 1 && random() >= sampleRate) return;
      try {
        const raw = buildEvent({
          error,
          platform: options.platform,
          level: context?.level,
          environment: options.environment,
          release: options.release,
          tags: cleanTags(context?.tags),
          extra: context?.extra,
          request: context?.request && {
            url: context.request.url,
            method: context.request.method,
            headers: cleanHeaders(context.request.headers),
          },
        });
        const event = { ...scrub(raw), event_id: raw.event_id };
        const res = await doFetch(envelopeUrl(dsn), {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: buildEnvelope(event, dsn),
          keepalive: true,
        });
        if (!res.ok && res.status !== 429) await fallback.captureException(error, context);
      } catch {
        await fallback.captureException(error, context);
      }
    },
  };
}

export function createErrorReporter(options: ReporterOptions): ErrorReporter {
  const dsn = parseDsn(options.dsn);
  return dsn ? createSentryReporter(dsn, options) : createConsoleReporter(options.sink);
}
