import { sentryBrowserConfig } from "./browser-config";
import { createErrorReporter, type ErrorContext, type ErrorReporter } from "./errors";

/**
 * Browser-side reporting: NEXT_PUBLIC_SENTRY_DSN when set, the console
 * otherwise. `installGlobalErrorHandlers` listens for uncaught errors and
 * unhandled promise rejections once per page, ignores well-known noise and
 * caps how many reports one page view can send.
 */

let reporter: ErrorReporter | undefined;
const MAX_REPORTS_PER_PAGE = 20;
let sent = 0;
const recent = new Set<string>();

const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /AbortError/i,
  /Load failed$/i,
  /Failed to fetch$/i,
  /NetworkError when attempting to fetch/i,
  /ChunkLoadError/i,
];

export function browserReporter(): ErrorReporter {
  const config = sentryBrowserConfig();
  reporter ??= createErrorReporter({ ...config, platform: "javascript" });
  return reporter;
}

export function shouldIgnoreBrowserError(message: string, filename?: string): boolean {
  if (filename && /^(chrome|moz|safari(-web)?)-extension:/.test(filename)) return true;
  return IGNORED.some((pattern) => pattern.test(message));
}

export function reportClientError(error: unknown, context?: ErrorContext): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (sent >= MAX_REPORTS_PER_PAGE || recent.has(message)) return;
  sent += 1;
  recent.add(message);
  void browserReporter().captureException(error, {
    ...context,
    request: {
      url: window.location.href,
      headers: { "User-Agent": navigator.userAgent },
      ...context?.request,
    },
  });
}

type FlaggedWindow = Window & { __psErrorHandlers?: boolean };

export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;
  const w = window as FlaggedWindow;
  if (w.__psErrorHandlers) return;
  w.__psErrorHandlers = true;
  window.addEventListener("error", (event) => {
    const message = event.error instanceof Error ? event.error.message : event.message;
    if (shouldIgnoreBrowserError(message ?? "", event.filename)) return;
    reportClientError(event.error ?? new Error(message || "Unknown error"), {
      tags: { handler: "window.onerror" },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    if (shouldIgnoreBrowserError(message)) return;
    reportClientError(reason, { tags: { handler: "unhandledrejection" } });
  });
}
