"use client";

import { useState, useEffect } from "react";
import { X, Shuffle, RotateCcw, Sparkles, Zap } from "lucide-react";
import { REALMS } from "@/lib/journeys/realms";
import { JOURNEYS, getJourneysByRealm } from "@/lib/journeys/journeys";
import { PHASE_ORDER } from "@/lib/journeys/phase-interpolation";
import { getAiImageService } from "@/lib/journeys/ai-image-service";
import { useAudioStore } from "@/lib/audio/audio-store";
import { createClient } from "@/lib/supabase/client";
import type { Journey } from "@/lib/journeys/types";
import type { Realm } from "@/lib/journeys/types";

const WINTER_REALM = REALMS.find((r) => r.id === "winter") ?? null;

interface JourneySelectorProps {
  open: boolean;
  onClose: () => void;
}

export function JourneySelector({ open, onClose }: JourneySelectorProps) {
  const startJourney = useAudioStore((s) => s.startJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);
  const activeJourney = useAudioStore((s) => s.activeJourney);
  const play = useAudioStore((s) => s.play);
  const duration = useAudioStore((s) => s.duration);
  const setAiImageEnabled = useAudioStore((s) => s.setAiImageEnabled);

  // Default to Winter realm when no journey is active
  const [selectedRealm, setSelectedRealm] = useState<Realm | null>(
    WINTER_REALM
  );
  const [aiAvailable, setAiAvailable] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState<Journey | null>(null);

  // Check AI availability on open
  useEffect(() => {
    if (open) {
      getAiImageService()
        .checkAvailability()
        .then(setAiAvailable);
    }
  }, [open]);

  if (!open) return null;

  const realmJourneys = selectedRealm
    ? getJourneysByRealm(selectedRealm.id)
    : [];

  const selectJourney = async (journey: Journey, withAi: boolean) => {
    setAiImageEnabled(withAi);

    // If no track is playing, auto-load one: prefer "snowflake", fall back to any recording
    if (!useAudioStore.getState().currentTrack) {
      try {
        const supabase = createClient();

        // Try snowflake first
        let { data, error } = await supabase
          .from("recordings")
          .select("id, title, audio_url")
          .ilike("title", "%snowflake%")
          .limit(1);

        // Fall back to most recent recording
        if (!data?.[0] || error) {
          ({ data, error } = await supabase
            .from("recordings")
            .select("id, title, audio_url")
            .order("created_at", { ascending: false })
            .limit(1));
        }

        if (!error && data?.[0]) {
          const row = data[0];
          console.log("[journey] auto-playing track:", row.title);
          play({ id: row.id, title: row.title, audioUrl: row.audio_url });
          // Small delay to let audio engine initialize the track
          await new Promise((r) => setTimeout(r, 200));
        } else {
          console.warn("[journey] no recordings found, starting journey without audio");
        }
      } catch (err) {
        console.warn("[journey] failed to load default track:", err);
      }
    }

    startJourney(journey.id);
    setShowCostDialog(null);
    onClose();
  };

  const handleJourneyClick = (journey: Journey) => {
    if (journey.aiEnabled && aiAvailable) {
      setShowCostDialog(journey);
    } else {
      selectJourney(journey, false);
    }
  };

  const selectRandom = () => {
    const random = JOURNEYS[Math.floor(Math.random() * JOURNEYS.length)];
    selectJourney(random, false);
  };

  const clearJourney = () => {
    stopJourney();
    onClose();
  };

  const estimatedCost = showCostDialog
    ? getAiImageService().estimateCost(duration || 300, 1)
    : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-300"
        style={{
          backdropFilter: "blur(32px) saturate(1.2)",
          WebkitBackdropFilter: "blur(32px) saturate(1.2)",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
        }}
        onClick={onClose}
      />

      {/* Cost dialog */}
      {showCostDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-8">
          <div
            className="pointer-events-auto p-6 rounded-2xl max-w-sm w-full"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(24px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-white/60" />
              <h3
                className="text-white/90 text-sm"
                style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 400 }}
              >
                AI Imagery
              </h3>
            </div>
            <p
              className="text-white/40 mb-4"
              style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
            >
              This journey uses AI-generated images that morph with the music.
              Est. ~${estimatedCost.toFixed(2)} for this track.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => selectJourney(showCostDialog, true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white/90 transition-all hover:bg-white/15"
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-geist-mono)",
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <Sparkles className="h-3 w-3" />
                Start with AI
              </button>
              <button
                onClick={() => selectJourney(showCostDialog, false)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white/50 transition-all hover:bg-white/8 hover:text-white/70"
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-geist-mono)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <Zap className="h-3 w-3" />
                Shader Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2
                className="text-white/90 text-2xl tracking-tight"
                style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 200 }}
              >
                {selectedRealm ? selectedRealm.name : "Journeys"}
              </h2>
              <p
                className="text-white/30 mt-1"
                style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
              >
                {selectedRealm
                  ? selectedRealm.subtitle
                  : "Choose a realm to begin"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedRealm && (
                <button
                  onClick={() => setSelectedRealm(null)}
                  className="px-3 py-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                  style={{
                    fontSize: "0.7rem",
                    fontFamily: "var(--font-geist-mono)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  All Realms
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Realm cards — show when no realm is selected */}
            {!selectedRealm && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {REALMS.map((realm) => (
                  <button
                    key={realm.id}
                    onClick={() => setSelectedRealm(realm)}
                    className="text-left p-4 rounded-2xl transition-all duration-200 group hover:bg-white/5"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {/* Accent glow */}
                    <div
                      className="w-3 h-3 rounded-full mb-3"
                      style={{
                        backgroundColor: realm.palette.accent,
                        boxShadow: `0 0 16px ${realm.palette.glow}40`,
                      }}
                    />
                    <h3
                      className="text-white/80 text-sm leading-tight group-hover:text-white/95 transition-colors"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        fontWeight: 400,
                      }}
                    >
                      {realm.name}
                    </h3>
                    <p
                      className="text-white/25 mt-1"
                      style={{
                        fontSize: "0.65rem",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {realm.subtitle}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Journey list — show when a realm is selected */}
            {selectedRealm && (
              <div className="space-y-3 mb-6">
                {realmJourneys.map((journey) => (
                  <button
                    key={journey.id}
                    onClick={() => handleJourneyClick(journey)}
                    className={`w-full text-left p-5 rounded-2xl transition-all duration-200 group ${
                      activeJourney?.id === journey.id
                        ? "ring-1 ring-white/20"
                        : "hover:bg-white/5"
                    }`}
                    style={{
                      backgroundColor:
                        activeJourney?.id === journey.id
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3
                          className="text-white/90 text-lg leading-tight"
                          style={{
                            fontFamily: "var(--font-geist-sans)",
                            fontWeight: 300,
                          }}
                        >
                          {journey.name}
                        </h3>
                        <p
                          className="text-white/30 mt-0.5"
                          style={{
                            fontSize: "0.75rem",
                            fontFamily: "var(--font-geist-mono)",
                          }}
                        >
                          {journey.subtitle}
                        </p>
                      </div>
                      {journey.aiEnabled && aiAvailable && (
                        <div
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                          style={{
                            fontSize: "0.6rem",
                            fontFamily: "var(--font-geist-mono)",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            color: "rgba(255, 255, 255, 0.4)",
                          }}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          AI
                        </div>
                      )}
                    </div>

                    <p
                      className="text-white/20 mb-3"
                      style={{
                        fontSize: "0.7rem",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {journey.description}
                    </p>

                    {/* Phase arc visualization */}
                    <div className="flex gap-[2px]">
                      {PHASE_ORDER.map((phaseId) => {
                        const phase = journey.phases.find(
                          (p) => p.id === phaseId
                        );
                        if (!phase) return null;
                        const width = (phase.end - phase.start) * 100;
                        return (
                          <div
                            key={phaseId}
                            className="h-[3px] rounded-full"
                            style={{
                              width: `${width}%`,
                              backgroundColor: `${selectedRealm.palette.accent}${
                                phaseId === "transcendence" ? "cc" : "40"
                              }`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </button>
                ))}

                {realmJourneys.length === 0 && (
                  <p
                    className="text-white/20 text-center py-8"
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    No journeys available for this realm
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/5">
            <button
              onClick={selectRandom}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-geist-mono)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Random Journey
            </button>
            {activeJourney && (
              <button
                onClick={clearJourney}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-geist-mono)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Stop Journey
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
