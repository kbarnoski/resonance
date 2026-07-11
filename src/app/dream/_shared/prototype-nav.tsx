"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VoteButtons, VoteIndicator } from "./vote-buttons";

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
    "text-muted-foreground hover:bg-accent hover:text-foreground";
  const btnDisabled = "text-muted-foreground/40 cursor-not-allowed";

  return (
    <nav className="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover/85 px-1.5 py-1 shadow-lg backdrop-blur-md">
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
          className="rounded-full bg-accent/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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

        <span className="ml-1 flex items-center gap-1 border-l border-border pl-2">
          <VoteIndicator slug={slug} />
          <VoteButtons slug={slug} compact />
        </span>
      </div>
    </nav>
  );
}
