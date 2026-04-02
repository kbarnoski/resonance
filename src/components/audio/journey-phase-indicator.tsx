"use client";

import { useState, useEffect, useRef } from "react";
import type { JourneyPhaseId, Journey } from "@/lib/journeys/types";

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
 * Journey phase overlay — centered phase name + guidance phrase.
 * Detects phase transitions from the currentPhase prop (driven by frame data)
 * and picks a random guidance phrase from the journey definition.
 * Fades in on transitions, holds, then fades out.
 */
export function JourneyPhaseIndicator({
  journey,
  currentPhase,
}: JourneyPhaseIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const [displayPhrase, setDisplayPhrase] = useState<string | null>(null);
  const [displayPhaseId, setDisplayPhaseId] = useState<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontLoadedRef = useRef(false);
  const usedIndicesRef = useRef<Map<string, number>>(new Map());

  // Load Cormorant Garamond via Google Fonts
  useEffect(() => {
    if (fontLoadedRef.current) return;
    fontLoadedRef.current = true;
    const id = "journey-guidance-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&display=swap";
    document.head.appendChild(link);
  }, []);

  // Reset used indices when journey changes
  useEffect(() => {
    usedIndicesRef.current.clear();
    prevPhaseRef.current = null;
  }, [journey.id]);

  // Detect phase changes from the frame-driven currentPhase prop
  useEffect(() => {
    if (!currentPhase) return;

    // Only trigger on actual phase change
    if (currentPhase === prevPhaseRef.current) return;
    prevPhaseRef.current = currentPhase;

    // Find phase data and pick a guidance phrase
    const phaseData = journey.phases.find((p) => p.id === currentPhase);
    if (!phaseData) return;

    let guidance: string | null = null;
    if (phaseData.guidancePhrases.length > 0) {
      // Pick a random phrase (different from last used for this phase)
      const lastIdx = usedIndicesRef.current.get(currentPhase) ?? -1;
      let idx = Math.floor(Math.random() * phaseData.guidancePhrases.length);
      if (idx === lastIdx && phaseData.guidancePhrases.length > 1) {
        idx = (idx + 1) % phaseData.guidancePhrases.length;
      }
      usedIndicesRef.current.set(currentPhase, idx);
      guidance = phaseData.guidancePhrases[idx];
    }

    setDisplayPhaseId(currentPhase);
    setDisplayPhrase(guidance);
    setVisible(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 6000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentPhase, journey]);

  // Get accent color from current phase palette
  const currentPhaseData = currentPhase
    ? journey.phases.find((p) => p.id === currentPhase)
    : journey.phases[0];
  const accent = currentPhaseData?.palette.accent ?? "#fff";

  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
    >
      <div
        className="flex flex-col items-center gap-5 max-w-[80vw] text-center"
        style={{
          opacity: visible ? 1 : 0,
          transition: visible
            ? "opacity 1.5s cubic-bezier(0.23, 1, 0.32, 1)"
            : "opacity 2s cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {/* Phase name — large, prominent */}
        {displayPhaseId && (
          <span
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 300,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(255, 255, 255, 0.7)",
              textShadow: `0 2px 8px rgba(0,0,0,0.8), 0 0 60px ${accent}40, 0 0 120px ${accent}20`,
            }}
          >
            {journey.phaseLabels?.[displayPhaseId as JourneyPhaseId]
              ?? PHASE_LABELS[displayPhaseId as JourneyPhaseId]
              ?? displayPhaseId}
          </span>
        )}

        {/* Guidance phrase */}
        {displayPhrase && (
          <p
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 300,
              fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)",
              lineHeight: 1.4,
              letterSpacing: "-0.01em",
              color: "rgba(255, 255, 255, 0.55)",
              textShadow: `0 1px 6px rgba(0,0,0,0.7), 0 0 40px ${accent}30`,
              maxWidth: "600px",
            }}
          >
            {displayPhrase}
          </p>
        )}
      </div>
    </div>
  );
}
