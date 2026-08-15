"use client";

import { useEffect } from "react";

/** Per-route error boundary for The Room — keeps a Room crash from
 *  bubbling to the app-level boundary and losing the audio context. */
export default function RoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Resonance] Room error:", error);
  }, [error]);

  return (
    <div
      className="min-h-dvh flex items-center justify-center"
      style={{ backgroundColor: "#000", color: "#fff" }}
    >
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <h2
          style={{
            fontFamily: "var(--font-geist-sans)",
            fontSize: "1.5rem",
            fontWeight: 200,
            color: "rgba(255,255,255,0.9)",
          }}
        >
          The Room hit a snag
        </h2>
        <p
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.78rem",
            color: "rgba(255,255,255,0.45)",
            maxWidth: "24rem",
          }}
        >
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          style={{
            border: "1px solid rgba(255,255,255,0.2)",
            fontSize: "0.8rem",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
