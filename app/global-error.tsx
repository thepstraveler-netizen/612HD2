"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it has no translations or styles from the app: the text
 * is shown in English and Hindi together.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { level: "fatal", tags: { handler: "global-error", digest: error.digest } });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#ffffff",
          color: "#0B2E6B",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
          <p lang="hi" style={{ fontSize: 18, margin: "0 0 16px" }}>
            कुछ गड़बड़ हो गई
          </p>
          <p style={{ color: "#475569", margin: "0 0 24px" }}>
            Please try again. · <span lang="hi">कृपया फिर से कोशिश करें।</span>
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#0B2E6B",
              color: "#ffffff",
              border: 0,
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Try again · <span lang="hi">फिर से कोशिश करें</span>
          </button>
          {error.digest ? (
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 24 }}>Reference: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
