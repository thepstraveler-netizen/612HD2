import type { Instrumentation } from "next";

/**
 * Server error reporting. Next calls `onRequestError` for errors thrown while
 * rendering, in route handlers, server actions and middleware (Node and Edge).
 * Errors go to Sentry when SENTRY_DSN is set, otherwise to the log as JSON.
 */

export function register(): void {}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportServerError } = await import("@/lib/observability/server");
  await reportServerError(error, {
    tags: {
      router: context.routerKind,
      route: context.routePath,
      route_type: context.routeType,
      render_source: context.renderSource,
      revalidate_reason: context.revalidateReason,
    },
    extra: { digest: (error as { digest?: unknown } | null)?.digest },
    request: { url: request.path, method: request.method, headers: request.headers },
  });
};
