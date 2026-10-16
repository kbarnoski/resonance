"use client";

import { useEffect, useState } from "react";

/**
 * TITLES BETWEEN TRACKS (Karel 2026-10-16) — one row, shown on every tab where
 * titles matter (Sets, Joseph, More). Hide keeps the same transition, just no
 * name on screen. Optimistic: the tap shows at once; the kiosk's report wins
 * once it agrees (or after 6 s).
 */
export function TitlesRow({ titles, send }: { titles: "on" | "off" | null | undefined; send: (cmd: string) => void }) {
  const [tap, setTap] = useState<{ v: "on" | "off"; at: number } | null>(null);
  useEffect(() => {
    if (!tap) return;
    if (titles === tap.v) { setTap(null); return; }
    const id = setTimeout(() => setTap(null), Math.max(0, 6000 - (Date.now() - tap.at)));
    return () => clearTimeout(id);
  }, [titles, tap]);
  const shown = (tap?.v ?? titles ?? "on") === "on";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-faint">Titles between tracks</span>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
        {(["on", "off"] as const).map((v) => (
          <button
            type="button"
            key={v}
            className={`min-h-11 rounded-none px-4 text-xs transition-colors duration-instant ${(shown ? "on" : "off") === v ? "bg-primary/20 text-ink" : "text-ink-mute active:bg-white/[0.06]"}`}
            onClick={() => {
              setTap({ v, at: Date.now() });
              send(`titles:${v}`);
            }}
          >
            {v === "on" ? "Show" : "Hide"}
          </button>
        ))}
      </div>
    </div>
  );
}
