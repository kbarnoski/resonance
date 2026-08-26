"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { usePathProgressStore } from "@/lib/journeys/path-progress-store";
import { Eyebrow, DisplayTitle, MonoLabel } from "@/components/ui/typography";

interface CulminationCardProps {
  journeyIds: string[];
  culmination: {
    name: string;
    subtitle: string | null;
    description: string | null;
    share_token: string | null;
  };
  /** Path's own share token — so the culmination journey link can
   *  carry pathToken and expose the Close/Back-to-path nav. */
  pathShareToken: string;
  accent: string;
  glow: string;
}

export function CulminationCard({ journeyIds, culmination, pathShareToken, accent, glow }: CulminationCardProps) {
  // Hydration guard — the store reads from localStorage on client only. Render
  // the locked state on the server + first client render, then reconcile.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const completedIds = usePathProgressStore((s) => s.completedJourneyIds);

  const completedCount = mounted
    ? journeyIds.filter((id) => completedIds.includes(id)).length
    : 0;
  const total = journeyIds.length;
  const unlocked = mounted && completedCount === total;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-4 mb-5">
        <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
        <Eyebrow as="span" style={{ color: accent }}>
          Culmination
        </Eyebrow>
        <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
      </div>

      {unlocked && culmination.share_token ? (
        <Link
          href={`/journey/${culmination.share_token}?pathToken=${pathShareToken}`}
          className="group block rounded-xl px-5 py-5 transition-colors duration-instant hover:bg-white/[0.05]"
          style={{
            border: `1px solid ${accent}40`,
            backgroundColor: "rgba(255,255,255,0.02)",
            boxShadow: `0 0 32px ${glow}12`,
          }}
        >
          <DisplayTitle
            as="div"
            className="font-normal text-2xl leading-[1.25] tracking-normal"
            style={{
              background: `linear-gradient(180deg, #fff 0%, ${glow} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {culmination.name}
          </DisplayTitle>
          {culmination.subtitle && (
            <MonoLabel className="mt-1 text-[0.7rem] tracking-[0.04em] text-ink-faint">
              {culmination.subtitle}
            </MonoLabel>
          )}
          {culmination.description && (
            <p
              className="mt-2"
              style={{
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.82rem",
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.6,
              }}
            >
              {culmination.description}
            </p>
          )}
          <Eyebrow
            className="mt-3 opacity-60 transition-opacity duration-instant group-hover:opacity-100"
            style={{ color: accent }}
          >
            Enter →
          </Eyebrow>
        </Link>
      ) : (
        // Locked teaser — shows the title (so the user sees what's coming) but
        // blurs/dims the details and displays the X of N progress.
        <div
          className="block rounded-xl px-5 py-5 relative overflow-hidden"
          style={{
            border: `1px solid rgba(255,255,255,0.08)`,
            backgroundColor: "rgba(255,255,255,0.01)",
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <Lock className="h-3.5 w-3.5 text-white/35" />
            <Eyebrow as="span" className="tracking-[0.14em] text-white/40">
              Locked
            </Eyebrow>
          </div>
          <DisplayTitle
            as="div"
            className="font-normal text-2xl leading-[1.25] tracking-normal text-white/55"
            style={{ filter: "blur(0.4px)" }}
          >
            {culmination.name}
          </DisplayTitle>
          {culmination.subtitle && (
            // Deliberately dim (/30): the locked teaser blurs/dims details
            // by design — treated as disabled text, not readable copy.
            <MonoLabel className="mt-1 text-[0.7rem] tracking-[0.04em] text-white/30">
              {culmination.subtitle}
            </MonoLabel>
          )}

          {/* Progress row — stepper dots + "X of 13" */}
          <div className="mt-5">
            <MonoLabel className="mb-2.5 text-[0.68rem] tracking-[0.04em] text-white/55">
              {completedCount} of {total} journeys complete — finish the album to unlock
            </MonoLabel>
            <div className="flex items-center gap-1.5 flex-wrap">
              {journeyIds.map((id, i) => {
                const done = completedIds.includes(id);
                return (
                  <div
                    key={id}
                    title={`Step ${i + 1}`}
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: done ? accent : "rgba(255,255,255,0.1)",
                      boxShadow: done ? `0 0 6px ${glow}55` : "none",
                      transition:
                        "background-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
