"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Route-group error boundary (maturity audit 2026-09-26 #7) — keeps a
 *  crash here from falling through to the generic root screen. Never
 *  renders error.message to visitors (stack/path leakage); the digest is
 *  enough to correlate with server logs. */
export default function ShareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Resonance] Share error:", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-void text-white">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <h2 className="text-2xl font-extralight text-white/90">This share hit a snag</h2>
        <p className="text-sm text-white/60 max-w-sm">The link is fine — the page stumbled. Try again in a moment.</p>
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
