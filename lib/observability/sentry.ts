/**
 * Just enough of Sentry's wire protocol to send error events with fetch,
 * without the SDK: DSN parsing, the envelope endpoint, event building and
 * the envelope format (https://develop.sentry.dev/sdk/envelopes/).
 */

export type ParsedDsn = {
  raw: string;
  protocol: "http" | "https";
  publicKey: string;
  host: string;
  /** Path prefix before the project id ("" for sentry.io). */
  path: string;
  projectId: string;
};

export function parseDsn(dsn: string | null | undefined): ParsedDsn | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn.trim());
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return null;
  const publicKey = decodeURIComponent(url.username);
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!publicKey || !url.host || !projectId || !/^\d+$/.test(projectId)) return null;
  return {
    raw: `${protocol}://${publicKey}@${url.host}${segments.length ? `/${segments.join("/")}` : ""}/${projectId}`,
    protocol,
    publicKey,
    host: url.host,
    path: segments.length ? `/${segments.join("/")}` : "",
    projectId,
  };
}

/** Envelope endpoint with auth in the query string, so browsers need no custom headers (no CORS preflight). */
export function envelopeUrl(dsn: ParsedDsn): string {
  const query = new URLSearchParams({
    sentry_key: dsn.publicKey,
    sentry_version: "7",
    sentry_client: "ps-traveler/1.0",
  });
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/?${query.toString()}`;
}

export type StackFrame = {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
};

export type SentryEvent = {
  event_id: string;
  timestamp: number;
  platform: "node" | "javascript";
  level: "fatal" | "error" | "warning";
  logger: string;
  environment?: string;
  release?: string;
  exception: {
    values: { type: string; value: string; stacktrace?: { frames: StackFrame[] } }[];
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  request?: { url?: string; method?: string; headers?: Record<string, string> };
};

const V8_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/** Parses V8 and Firefox/Safari stacks; Sentry wants frames oldest first. */
export function parseStack(stack: string | undefined, limit = 50): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!match) continue;
    const [, fn, filename, lineno, colno] = match;
    frames.push({
      function: fn || undefined,
      filename,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !/node_modules|^node:|^internal\//.test(filename),
    });
    if (frames.length >= limit) break;
  }
  return frames.reverse();
}

export function normalizeError(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    const value = error.message || (typeof digest === "string" ? `digest ${digest}` : "");
    return { type: error.name || "Error", value, stack: error.stack };
  }
  if (typeof error === "string") return { type: "Error", value: error };
  try {
    return { type: "NonError", value: JSON.stringify(error)?.slice(0, 1000) ?? String(error) };
  } catch {
    return { type: "NonError", value: String(error) };
  }
}

export function newEventId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID().replace(/-/g, "");
  let id = "";
  for (let i = 0; i < 32; i += 1) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

export function buildEvent(input: {
  error: unknown;
  platform: SentryEvent["platform"];
  level?: SentryEvent["level"];
  environment?: string;
  release?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  request?: SentryEvent["request"];
  eventId?: string;
  now?: Date;
}): SentryEvent {
  const { type, value, stack } = normalizeError(input.error);
  const frames = parseStack(stack);
  return {
    event_id: input.eventId ?? newEventId(),
    timestamp: (input.now ?? new Date()).getTime() / 1000,
    platform: input.platform,
    level: input.level ?? "error",
    logger: "ps-traveler",
    environment: input.environment,
    release: input.release,
    exception: { values: [{ type, value, ...(frames.length ? { stacktrace: { frames } } : {}) }] },
    tags: input.tags,
    extra: input.extra,
    request: input.request,
  };
}

export function buildEnvelope(event: SentryEvent, dsn: ParsedDsn, sentAt: Date = new Date()): string {
  const payload = JSON.stringify(event);
  const header = JSON.stringify({ event_id: event.event_id, sent_at: sentAt.toISOString(), dsn: dsn.raw });
  const item = JSON.stringify({
    type: "event",
    content_type: "application/json",
    length: new TextEncoder().encode(payload).length,
  });
  return `${header}\n${item}\n${payload}\n`;
}
