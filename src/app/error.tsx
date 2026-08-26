"use client";

import { useEffect } from "react";
import { MonoLabel } from "@/components/ui/typography";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Resonance] Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-void text-white">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <h2
          className="text-2xl font-extralight text-white/90"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          Something went wrong
        </h2>
        {/* Never render error.message to visitors — it can carry stack
            fragments, file paths, or backend details. Full error goes to
            the console above; the digest is enough to correlate with
            server logs. */}
        <MonoLabel
          as="p"
          className="max-w-[24rem] text-[0.78rem] tracking-normal text-ink-faint"
        >
          An unexpected error occurred.
          {error.digest ? ` (ref ${error.digest})` : ""}
        </MonoLabel>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-white/20 px-5 py-2.5 font-mono text-[0.8rem] text-white/80 transition-colors duration-instant ease-enter hover:bg-white/10 hover:text-white"
          >
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="rounded-lg border border-white/20 px-5 py-2.5 font-mono text-[0.8rem] text-white/80 no-underline transition-colors duration-instant ease-enter hover:bg-white/10 hover:text-white"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
