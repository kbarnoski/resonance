"use client";

import { useState, useEffect } from "react";
import type { JourneyPhaseId, Journey } from "@/lib/journeys/types";
import { PHASE_ORDER } from "@/lib/journeys/phase-interpolation";

interface JourneyPhaseIndicatorProps {
  journey: Journey;
  currentPhase: JourneyPhaseId | null;
}

const PHASE_LABELS: Record<JourneyPhaseId, string> = {
  threshold: "Threshold",
  expansion: "Expansion",
  transcendence: "Transcendence",
  illumination: "Illumination",
  return: "Return",
  integration: "Integration",
};

/**
 * Thin horizontal bar at the top of the viewport during journeys.
 * Shows 6 segments for phases, current phase glows.
 * Phase name fades in briefly on transition.
 */
export function JourneyPhaseIndicator({
  journey,
  currentPhase,
}: JourneyPhaseIndicatorProps) {
  const [showLabel, setShowLabel] = useState(false);
  const [displayPhase, setDisplayPhase] = useState<JourneyPhaseId | null>(null);

  // Show phase label briefly on transition
  useEffect(() => {
    if (!currentPhase) return;
    setDisplayPhase(currentPhase);
    setShowLabel(true);
    const timer = setTimeout(() => setShowLabel(false), 2500);
    return () => clearTimeout(timer);
  }, [currentPhase]);

  // Get the realm's accent color from journey's first phase palette
  const accent = journey.phases[0]?.palette.accent ?? "#fff";

  return (
    <div
      className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
      style={{ padding: "0 24px" }}
    >
      {/* Phase segments bar */}
      <div className="flex gap-[2px] pt-3">
        {PHASE_ORDER.map((phaseId) => {
          const phase = journey.phases.find((p) => p.id === phaseId);
          if (!phase) return null;

          const width = (phase.end - phase.start) * 100;
          const isCurrent = phaseId === currentPhase;
          const isPast =
            currentPhase &&
            PHASE_ORDER.indexOf(phaseId) <
              PHASE_ORDER.indexOf(currentPhase);

          return (
            <div
              key={phaseId}
              className="h-[2px] rounded-full transition-all duration-1000"
              style={{
                width: `${width}%`,
                backgroundColor: isCurrent
                  ? accent
                  : isPast
                    ? `${accent}60`
                    : "rgba(255, 255, 255, 0.1)",
                boxShadow: isCurrent
                  ? `0 0 8px ${accent}80, 0 0 2px ${accent}`
                  : "none",
              }}
            />
          );
        })}
      </div>

      {/* Phase label — fades in/out on transition */}
      <div
        className="flex items-center justify-center mt-2 transition-opacity duration-500"
        style={{ opacity: showLabel ? 1 : 0 }}
      >
        <span
          className="text-white/40"
          style={{
            fontSize: "0.6rem",
            fontFamily: "var(--font-geist-mono)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          {displayPhase ? PHASE_LABELS[displayPhase] : ""}
        </span>
      </div>
    </div>
  );
}
