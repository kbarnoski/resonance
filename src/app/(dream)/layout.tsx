import type { ReactNode } from "react";
import Link from "next/link";

export default function DreamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/70 backdrop-blur-sm">
        <Link href="/dream" className="text-xs tracking-widest text-white/60 hover:text-white">
          RESONANCE / DREAM
        </Link>
        <span className="text-[10px] text-white/30">sandbox — not production</span>
      </header>
      <main className="pt-12">{children}</main>
    </div>
  );
}
