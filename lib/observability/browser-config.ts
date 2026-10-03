// Kept out of lib/env.ts so the browser error reporter doesn't pull zod into every page.
/**
 * Browser error reporting (optional). Without NEXT_PUBLIC_SENTRY_DSN errors go
 * to the browser console only. Each var is referenced explicitly so Next
 * inlines it.
 */
export function sentryBrowserConfig(): {
  dsn: string | undefined;
  sampleRate: string | undefined;
  environment: string | undefined;
  release: string | undefined;
} {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    sampleRate: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE || undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
  };
}
