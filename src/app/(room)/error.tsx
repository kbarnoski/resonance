"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Route-group error boundary (maturity audit 2026-09-26 #7) — keeps a
 *  crash here from falling through to the generic root screen. Never
 *  renders error.message to visitors (stack/path leakage); the digest is
 *  enough to correlate with server logs. */
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
  // Unattended kiosk (Karel 2026-10-05: "says the room hit a snag" after a
  // deploy swapped the server under the page): nobody is there to press
  // "Try again", so the installation retries on its own — re-render first,
  // then a full reload to the loop if that fails again.
  useEffect(() => {
    if (!window.location.pathname.startsWith("/room/installation")) return;
    let tries = 0;
    try { tries = Number(window.sessionStorage.getItem("room-error-retries") ?? 0); } catch { /* blocked */ }
    const id = window.setTimeout(() => {
      try { window.sessionStorage.setItem("room-error-retries", String(tries + 1)); } catch { /* blocked */ }
      if (tries % 2 === 0) reset();
      else window.location.href = "/room/installation?loop=1";
    }, 4000);
    return () => window.clearTimeout(id);
  }, [reset]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-void text-white">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <h2 className="text-2xl font-extralight text-white/90">Something drifted off course</h2>
        <p className="text-sm text-white/60 max-w-sm">The experience hit a snag. Your music and journeys are safe.</p>
        {error.digest && (
          <p className="font-mono text-xs text-white/40">ref: {error.digest}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="min-h-[44px] rounded-md border border-white/20 bg-white/5 px-5 text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            Try again
          </button>
          <Link
            href="/"
            className="min-h-[44px] rounded-md border border-white/20 bg-white/5 px-5 text-sm text-white/80 transition-colors hover:bg-white/10 inline-flex items-center"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
