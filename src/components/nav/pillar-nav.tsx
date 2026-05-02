"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal, Disc3, Compass, Route } from "lucide-react";
import { cn } from "@/lib/utils";

// Top-level IA: four peer pillars. Studio is the workshop side; Vizes,
// Journeys, and Paths are the listening side. The immersive player at
// /play is a destination these surfaces feed into — it intentionally has
// no pillar nav of its own.
const PILLARS = [
  { href: "/library", label: "Studio", icon: SlidersHorizontal, match: ["/library", "/recording", "/compare", "/collections", "/insights", "/settings", "/upload", "/create", "/batch-analyze"] },
  { href: "/vizes", label: "Vizes", icon: Disc3, match: ["/vizes"] },
  { href: "/journeys", label: "Journeys", icon: Compass, match: ["/journeys"] },
  { href: "/paths", label: "Paths", icon: Route, match: ["/paths"] },
];

function isActive(pathname: string, pillar: (typeof PILLARS)[number]): boolean {
  if (pillar.match.some((m) => pathname === m || pathname.startsWith(m + "/"))) return true;
  return pathname === pillar.href.split("?")[0];
}

export function PillarNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop — thin top bar, fixed across the four browse surfaces. */}
      <nav
        aria-label="Primary"
        className="hidden md:flex sticky top-0 z-40 items-center gap-1 px-4 h-12 border-b border-white/[0.06] bg-black/95 backdrop-blur"
      >
        {PILLARS.map((p) => {
          const Icon = p.icon;
          const active = isActive(pathname, p);
          return (
            <Link
              key={p.label}
              href={p.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-white/[0.08] text-white/90"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]",
              )}
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <Icon className="h-3.5 w-3.5" />
              {p.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile — bottom tab bar. min-h-[64px] respects safe-area and
          gives 44px+ touch targets per pillar. */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/[0.06] bg-black"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {PILLARS.map((p) => {
          const Icon = p.icon;
          const active = isActive(pathname, p);
          return (
            <Link
              key={p.label}
              href={p.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors min-h-[56px]",
                active ? "text-white/90" : "text-white/45 active:text-white/80",
              )}
            >
              <Icon className="h-5 w-5" />
              <span
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.04em",
                }}
              >
                {p.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
