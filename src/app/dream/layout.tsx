import type { ReactNode } from "react";
import { readdir } from "fs/promises";
import path from "path";
import Link from "next/link";
import { PrototypeNav } from "./_shared/prototype-nav";
import { DreamVotesProvider } from "./_shared/votes-provider";
import { AudioCleanup } from "./_shared/audio-cleanup";

/** Read prototype slugs from disk at build time, ordered newest-first
 *  to match the dashboard. Drives the prev/next nav. */
async function loadOrderedSlugs(): Promise<string[]> {
  const entries = await readdir(path.join(process.cwd(), "src/app/dream"), {
    withFileTypes: true,
  });
  return entries
    .filter((e) => e.isDirectory() && /^\d+-/.test(e.name))
    .map((e) => e.name)
    .sort(
      (a, b) =>
        parseInt(b.split("-")[0], 10) - parseInt(a.split("-")[0], 10)
    );
}

export default async function DreamLayout({
  children,
}: {
  children: ReactNode;
}) {
  const slugs = await loadOrderedSlugs();
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
        <PrototypeNav slugs={slugs} />
      </div>
    </DreamVotesProvider>
  );
}
