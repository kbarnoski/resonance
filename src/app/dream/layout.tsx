import type { ReactNode } from "react";
import Link from "next/link";
import { ManifestNav } from "./archive/_nav";
import { DreamVotesProvider } from "./_shared/votes-provider";
import { AudioCleanup } from "./_shared/audio-cleanup";

// ── Deployment model (2026-08-25) ──────────────────────────────────────────
// The ~1,150 numbered prototypes are pure "use client" shells with no data
// dependencies — prerendering each of them was the bulk of every deploy's
// build. This segment default makes them render on demand instead. Pages
// that ARE worth prerendering opt back in with their own page-level
// `export const dynamic = "force-static"` (which overrides this layout
// default): the /dream index, /dream/history*, /dream/archive/[page], and
// the /dream/archive/manifest route.
//
// Because dynamic rendering runs in a lambda where the source tree is NOT
// bundled, this layout must never touch the filesystem — the prev/next nav
// gets its slug order from the build-time static manifest instead (see
// ./archive/_nav.tsx).
export const dynamic = "force-dynamic";

export default function DreamLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Vercel sets VERCEL_ENV to "production" on main, "preview" on branch
  // deploys, "development" locally. Only label the dream lab as a
  // sandbox on previews / dev — production has the canonical /dream
  // URL and shouldn't claim to be a sandbox.
  const env = process.env.VERCEL_ENV ?? "development";
  const subtitle =
    env === "production" ? "live" : "sandbox — preview branch";

  return (
    <DreamVotesProvider>
      <AudioCleanup />
      <div className="min-h-screen bg-background text-foreground font-sans">
        <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 border-b border-border bg-background/70 backdrop-blur-sm">
          <Link
            href="/dream"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
          >
            RESONANCE / DREAM
          </Link>
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/70">
            {subtitle}
          </span>
        </header>
        <main className="pt-12">{children}</main>
        <ManifestNav />
      </div>
    </DreamVotesProvider>
  );
}
