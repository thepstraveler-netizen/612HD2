"use client";

import { useEffect } from "react";
import { installGlobalErrorHandlers } from "@/lib/observability/client";

/**
 * Listens for uncaught errors and unhandled promise rejections in the
 * browser. instrumentation-client.ts normally installs these first; this is
 * a no-op then.
 */
export function ErrorReporting() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return null;
}
