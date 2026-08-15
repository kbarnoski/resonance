"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches errors thrown by the root layout
 * itself (where app/error.tsx can't help). Must render its own
 * <html>/<body> because the root layout has crashed. Styles are
 * inline-only for the same reason (globals.css may not be loaded).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Resonance] Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
            textAlign: "center",
            padding: "0 1.5rem",
          }}
        >
          <h2
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: "1.5rem",
              fontWeight: 200,
              color: "rgba(255,255,255,0.9)",
              margin: 0,
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.78rem",
              color: "rgba(255,255,255,0.45)",
              maxWidth: "24rem",
              margin: 0,
            }}
          >
            {error.message || "An unexpected error occurred."}
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                color: "rgba(255,255,255,0.8)",
                backgroundColor: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: "0.8rem",
                fontFamily: "ui-monospace, monospace",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              // full reload on purpose: in global-error the root layout (and
              // client router) may be broken, so <Link> can't be trusted here
              onClick={() => { window.location.href = "/"; }}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                color: "rgba(255,255,255,0.8)",
                backgroundColor: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: "0.8rem",
                fontFamily: "ui-monospace, monospace",
                cursor: "pointer",
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
