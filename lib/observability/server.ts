import { createErrorReporter, type ErrorContext, type ErrorReporter } from "./errors";

/**
 * Server-side reporter (Node and Edge). Reads SENTRY_DSN and
 * SENTRY_SAMPLE_RATE directly rather than through lib/env.server so that
 * instrumentation.ts can import it (`server-only` is not resolvable there).
 */

let reporter: ErrorReporter | undefined;

export function serverReporter(): ErrorReporter {
  reporter ??= createErrorReporter({
    dsn: process.env.SENTRY_DSN,
    sampleRate: process.env.SENTRY_SAMPLE_RATE,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    platform: "node",
  });
  return reporter;
}

export function reportServerError(error: unknown, context?: ErrorContext): Promise<void> {
  return serverReporter().captureException(error, {
    ...context,
    tags: { runtime: process.env.NEXT_RUNTIME || "nodejs", ...context?.tags },
  });
}
