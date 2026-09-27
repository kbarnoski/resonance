/** Route loading state (maturity audit 2026-09-26 #7). */
export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-void">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/40 animate-pulse">
        opening…
      </p>
    </div>
  );
}
