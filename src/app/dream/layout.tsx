import type { ReactNode } from "react";
import { readdir } from "fs/promises";
import path from "path";
import Link from "next/link";
import { PrototypeNav } from "./_shared/prototype-nav";
import { DreamVotesProvider } from "./_shared/votes-provider";

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

  return (
    <DreamVotesProvider>
      <div className="min-h-screen bg-black text-white font-mono">
        <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/70 backdrop-blur-sm">
          <Link
            href="/dream"
            className="text-xs tracking-widest text-white/60 hover:text-white"
          >
            RESONANCE / DREAM
          </Link>
          <span className="text-[10px] text-white/30">
            sandbox — not production
          </span>
        </header>
        <main className="pt-12">{children}</main>
        <PrototypeNav slugs={slugs} />
      </div>
    </DreamVotesProvider>
  );
}
