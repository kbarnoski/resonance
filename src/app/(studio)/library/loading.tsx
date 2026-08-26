export default function LibraryLoading() {
  // Quiet static skeleton — no pulse/shimmer. Placeholder blocks sit at
  // bg-white/[0.04] (the path pages' quiet placeholder register) while
  // preserving the library page's layout footprint.
  return (
    <div className="space-y-6">
      {/* Header with search */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-white/[0.04]" />
        <div className="h-9 w-24 rounded bg-white/[0.04]" />
      </div>
      <div className="h-10 w-full rounded-md bg-white/[0.04]" />

      {/* Recording cards */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-white/[0.06] px-6 py-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-lg bg-white/[0.04]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-white/[0.04]" />
              <div className="h-3 w-32 rounded bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
