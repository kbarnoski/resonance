"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Floating prev/next strip pinned to the bottom of the viewport on
 *  prototype detail pages (/dream/N-foo). Hidden on the dashboard
 *  (/dream) and history (/dream/history). Order matches the dashboard
 *  ordering (newest first), so "prev" walks up the list toward newer
 *  prototypes and "next" walks down toward older ones. */
export function PrototypeNav({ slugs }: { slugs: string[] }) {
  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/dream\/(\d+-[\w-]+)(?:\/|$)/);
  if (!match) return null;

  const slug = match[1];
  const idx = slugs.indexOf(slug);
  if (idx === -1) return null;

  const newer = idx > 0 ? slugs[idx - 1] : null;
  const older = idx < slugs.length - 1 ? slugs[idx + 1] : null;
  const position = `${idx + 1} / ${slugs.length}`;

  const btnBase =
    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const btnEnabled =
    "text-white/85 hover:bg-white/[0.08] hover:text-white";
  const btnDisabled = "text-white/25 cursor-not-allowed";

  return (
    <nav className="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/85 px-1.5 py-1 shadow-lg backdrop-blur-md">
        {newer ? (
          <Link
            href={`/dream/${newer}`}
            className={`${btnBase} ${btnEnabled}`}
            title={`Newer: ${newer}`}
          >
            ← prev
          </Link>
        ) : (
          <span className={`${btnBase} ${btnDisabled}`}>← prev</span>
        )}

        <Link
          href="/dream"
          className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/65 transition-colors hover:bg-white/[0.12] hover:text-white"
          title="Back to the full prototype index"
        >
          ↑ all · {position}
        </Link>

        {older ? (
          <Link
            href={`/dream/${older}`}
            className={`${btnBase} ${btnEnabled}`}
            title={`Older: ${older}`}
          >
            next →
          </Link>
        ) : (
          <span className={`${btnBase} ${btnDisabled}`}>next →</span>
        )}
      </div>
    </nav>
  );
}
