"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Shuffle, RotateCcw, Sparkles, Play, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { REALMS } from "@/lib/journeys/realms";
import { JOURNEYS } from "@/lib/journeys/journeys";
import { PHASE_ORDER } from "@/lib/journeys/phase-interpolation";
import { getAiImageService } from "@/lib/journeys/ai-image-service";
import { useAudioStore } from "@/lib/audio/audio-store";
import { createClient } from "@/lib/supabase/client";
import { CreateJourneyDialog } from "@/components/journeys/create-journey-dialog";
import { ShareSheet } from "@/components/ui/share-sheet";
import type { Journey } from "@/lib/journeys/types";

const FEATURED_JOURNEY_ID = "first-snow";

// Journeys paired with specific tracks — always load from the beginning
const PAIRED_TRACKS: Record<string, string> = {
  "first-snow": "%KB_SFLAKE%",
  "inferno": "%KB_REALIZED%",
  "cosmic-drift": "%17th St 61%",
  "folsom-street": "%Folsom St 5%",
};

// Storage file search patterns — fallback when track isn't in recordings table
const PAIRED_STORAGE: Record<string, string> = {
  "folsom-street": "Folsom St 5",
};

interface JourneySelectorProps {
  open: boolean;
  onClose: () => void;
}

export function JourneySelector({ open, onClose }: JourneySelectorProps) {
  const startJourney = useAudioStore((s) => s.startJourney);
  const startCustomJourney = useAudioStore((s) => s.startCustomJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);
  const activeJourney = useAudioStore((s) => s.activeJourney);
  const play = useAudioStore((s) => s.play);
  const setAiImageEnabled = useAudioStore((s) => s.setAiImageEnabled);

  const [aiAvailable, setAiAvailable] = useState(false);
  const [customJourneys, setCustomJourneys] = useState<Journey[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareSheet, setShareSheet] = useState<{ url: string; title: string } | null>(null);

  // Check AI availability on open
  useEffect(() => {
    if (open) {
      getAiImageService()
        .checkAvailability()
        .then(setAiAvailable);
    }
  }, [open]);

  // Fetch custom journeys when selector opens
  useEffect(() => {
    if (!open) return;
    const fetchCustom = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("journeys")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (!error && data) {
          // Transform DB rows to Journey objects
          const journeys: Journey[] = data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: (row.name as string) ?? "Untitled Journey",
            subtitle: (row.subtitle as string) ?? "",
            description: (row.description as string) ?? "",
            realmId: (row.realm_id as string) ?? "heaven",
            aiEnabled: true,
            phases: (row.phases as Journey["phases"]) ?? [],
            storyText: (row.story_text as string) ?? null,
            recordingId: (row.recording_id as string) ?? null,
          }));
          setCustomJourneys(journeys);
        }
      } catch (err) {
        console.warn("[journey] failed to fetch custom journeys:", err);
      }
    };
    fetchCustom();
  }, [open]);

  // Share a custom journey — get share token then open share sheet
  const handleShare = useCallback(async (journeyId: string, journeyName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSharingId(journeyId);
    try {
      const res = await fetch("/api/journeys/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journeyId }),
      });
      if (!res.ok) throw new Error("Failed to share");
      const { token } = await res.json();
      const url = `${window.location.origin}/journey/${token}`;
      setShareSheet({ url, title: `${journeyName} — a Resonance journey` });
    } catch {
      toast.error("Failed to share journey");
    } finally {
      setSharingId(null);
    }
  }, []);

  // Share a built-in journey — creates a DB snapshot with deterministic seed
  const handleShareBuiltIn = useCallback(async (journeyId: string, journeyName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSharingId(journeyId);
    try {
      const res = await fetch("/api/journeys/share-builtin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journeyId }),
      });
      if (!res.ok) throw new Error("Failed to share");
      const { token } = await res.json();
      const url = `${window.location.origin}/journey/${token}`;
      setShareSheet({ url, title: `${journeyName} — a Resonance journey` });
    } catch {
      toast.error("Failed to share journey");
    } finally {
      setSharingId(null);
    }
  }, []);

  // Delete a custom journey (with confirmation)
  const handleDelete = useCallback(async (journeyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const journey = customJourneys.find((j) => j.id === journeyId);
    const name = journey?.name ?? "this journey";
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(journeyId);
    try {
      const res = await fetch(`/api/journeys/${journeyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setCustomJourneys((prev) => prev.filter((j) => j.id !== journeyId));
      if (activeJourney?.id === journeyId) stopJourney();
      toast.success("Journey deleted");
    } catch {
      toast.error("Failed to delete journey");
    } finally {
      setDeletingId(null);
    }
  }, [activeJourney, stopJourney, customJourneys]);

  // Load a track for a custom journey — specific recording if set, else random
  const loadCustomJourneyTrack = useCallback(async (journey: Journey) => {
    const supabase = createClient();
    try {
      if (journey.recordingId) {
        const { data: rec } = await supabase
          .from("recordings")
          .select("id, title, audio_url")
          .eq("id", journey.recordingId)
          .single();
        if (rec) {
          play({ id: rec.id, title: rec.title, audioUrl: `/api/audio/${rec.id}` }, 0);
          await new Promise((r) => setTimeout(r, 300));
          return;
        }
      }
      // No specific recording or not found — load a random track
      const { data } = await supabase
        .from("recordings")
        .select("id, title, audio_url")
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        const row = data[Math.floor(Math.random() * data.length)];
        play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}` }, 0);
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      console.warn("[journey] failed to load track for custom journey:", err);
    }
  }, [play]);

  // Build flat journey list: featured first, then grouped by realm
  const { featured, groupedByRealm } = useMemo(() => {
    const feat = JOURNEYS.find((j) => j.id === FEATURED_JOURNEY_ID) ?? null;
    const rest = JOURNEYS.filter((j) => j.id !== FEATURED_JOURNEY_ID);

    // Group remaining by realm, preserving realm order
    const groups: { realm: typeof REALMS[number]; journeys: Journey[] }[] = [];
    for (const realm of REALMS) {
      const rj = rest.filter((j) => j.realmId === realm.id);
      if (rj.length > 0) {
        groups.push({ realm, journeys: rj });
      }
    }

    return { featured: feat, groupedByRealm: groups };
  }, []);

  if (!open) return null;

  const selectJourney = async (journey: Journey, withAi: boolean) => {
    setAiImageEnabled(withAi);

    const pairedSearch = PAIRED_TRACKS[journey.id];
    const currentTrack = useAudioStore.getState().currentTrack;

    // If this journey has a paired track, always load it from the beginning
    // (even if another track is currently playing)
    if (pairedSearch) {
      let trackLoaded = false;
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("recordings")
          .select("id, title, audio_url")
          .ilike("title", pairedSearch)
          .limit(1);

        if (!error && data?.[0]) {
          const row = data[0];
          console.log("[journey] loading paired track:", row.title);
          play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}` }, 0);
          trackLoaded = true;
          await new Promise((r) => setTimeout(r, 300));
        } else {
          // Fallback: track not in recordings table — try storage directly
          const storageSearch = PAIRED_STORAGE[journey.id];
          if (storageSearch) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: files } = await supabase.storage
                .from("recordings")
                .list(user.id, { search: storageSearch, limit: 1 });
              if (files?.[0]) {
                const filePath = `${user.id}/${files[0].name}`;
                const { data: signedData } = await supabase.storage
                  .from("recordings")
                  .createSignedUrl(filePath, 3600);
                if (signedData?.signedUrl) {
                  const title = files[0].name
                    .replace(/^\d+-/, "")
                    .replace(/\.[^.]+$/, "");
                  console.log("[journey] loading paired track from storage:", title);
                  play(
                    { id: `storage-${files[0].name}`, title, audioUrl: signedData.signedUrl },
                    0
                  );
                  trackLoaded = true;
                  await new Promise((r) => setTimeout(r, 300));
                }
              }
            }
          }
        }

        // If paired track not found anywhere, fall back to a random recording
        if (!trackLoaded) {
          const { data: fallback } = await supabase
            .from("recordings")
            .select("id, title, audio_url")
            .order("created_at", { ascending: false });
          if (fallback && fallback.length > 0) {
            // Exclude Joseph's track from random pool
            const pool = fallback.filter(
              (r) => !r.title?.toLowerCase().includes("without") ||
                     !r.title?.toLowerCase().includes("brightness")
            );
            const candidates = pool.length > 0 ? pool : fallback;
            const row = candidates[Math.floor(Math.random() * candidates.length)];
            console.log("[journey] paired track not found, random fallback:", row.title);
            play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}` }, 0);
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      } catch (err) {
        console.warn("[journey] failed to load paired track:", err);
      }
    } else {
      // No paired track — load a random recording (excluding Joseph's track)
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("recordings")
          .select("id, title, audio_url")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          // Exclude Joseph's track from the random pool
          const pool = data.filter(
            (r) => !r.title?.toLowerCase().includes("without") ||
                   !r.title?.toLowerCase().includes("brightness")
          );
          const candidates = pool.length > 0 ? pool : data;
          const row = candidates[Math.floor(Math.random() * candidates.length)];
          console.log("[journey] random track:", row.title);
          play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}` }, 0);
          await new Promise((r) => setTimeout(r, 300));
        } else {
          console.warn("[journey] no recordings found, starting journey without audio");
        }
      } catch (err) {
        console.warn("[journey] failed to load random track:", err);
      }
    }

    startJourney(journey.id);
    onClose();
  };

  const handleJourneyClick = (journey: Journey) => {
    // Always enable AI for journeys — AiImageLayer handles availability internally
    selectJourney(journey, journey.aiEnabled);
  };

  const selectRandom = () => {
    const pool = JOURNEYS;
    const random = pool[Math.floor(Math.random() * pool.length)];
    selectJourney(random, random.aiEnabled);
  };

  const clearJourney = () => {
    stopJourney();
  };

  const renderJourneyCard = (journey: Journey, realmAccent: string) => {
    const isActive = activeJourney?.id === journey.id;
    return (
      <div
        key={journey.id}
        className={`w-full text-left p-5 rounded-2xl transition-all duration-200 group cursor-pointer ${
          isActive ? "ring-1 ring-white/20" : "hover:bg-white/5"
        }`}
        style={{
          backgroundColor: isActive
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        onClick={() => handleJourneyClick(journey)}
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
          <div className="flex items-center gap-2">
            {journey.id === FEATURED_JOURNEY_ID && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  fontSize: "0.6rem",
                  fontFamily: "var(--font-geist-mono)",
                  backgroundColor: "rgba(144, 184, 224, 0.1)",
                  border: "1px solid rgba(144, 184, 224, 0.2)",
                  color: "rgba(144, 184, 224, 0.7)",
                }}
              >
                Featured
              </div>
            )}
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

        {/* Phase arc + Start button + Share */}
        <div className="flex items-center gap-3">
          <div className="flex gap-[2px] flex-1">
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
                    backgroundColor: `${realmAccent}${
                      phaseId === "transcendence" ? "cc" : "40"
                    }`,
                  }}
                />
              );
            })}
          </div>
          <button
            onClick={(e) => handleShareBuiltIn(journey.id, journey.name, e)}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
            title="Share Journey"
            disabled={sharingId === journey.id}
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleJourneyClick(journey);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all shrink-0"
            style={{
              fontSize: "0.7rem",
              fontFamily: "var(--font-geist-mono)",
              border: `1px solid ${realmAccent}30`,
              backgroundColor: `${realmAccent}08`,
            }}
          >
            <Play className="h-3 w-3" style={{ fill: "currentColor" }} />
            {isActive ? "Restart" : "Start"}
          </button>
        </div>
      </div>
    );
  };

  const winterRealm = REALMS.find((r) => r.id === "winter");
  const featuredAccent = winterRealm?.palette.accent ?? "#90b8e0";

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
                Journeys
              </h2>
              <p
                className="text-white/30 mt-1"
                style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
              >
                Immersive audio-visual experiences
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable content — flat list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Featured journey pinned at top */}
            {featured && (
              <div className="mb-6">
                {renderJourneyCard(featured, featuredAccent)}
              </div>
            )}

            {/* Remaining journeys grouped by realm */}
            {groupedByRealm.map(({ realm, journeys }) => (
              <div key={realm.id} className="mb-6">
                {/* Realm section header */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: realm.palette.accent,
                      boxShadow: `0 0 8px ${realm.palette.glow}40`,
                    }}
                  />
                  <span
                    className="text-white/40"
                    style={{
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {realm.name}
                  </span>
                </div>

                <div className="space-y-3">
                  {journeys.map((journey) =>
                    renderJourneyCard(journey, realm.palette.accent)
                  )}
                </div>
              </div>
            ))}

            {/* Custom journeys */}
            {customJourneys.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
                  />
                  <span
                    className="text-white/40"
                    style={{
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    Your Journeys
                  </span>
                </div>

                <div className="space-y-3">
                  {customJourneys.map((journey) => {
                    const isActive = activeJourney?.id === journey.id;
                    const realm = REALMS.find((r) => r.id === journey.realmId);
                    const accent = realm?.palette.accent ?? "#888";
                    return (
                      <div
                        key={journey.id}
                        className={`w-full text-left p-5 rounded-2xl transition-all duration-200 group cursor-pointer ${
                          isActive ? "ring-1 ring-white/20" : "hover:bg-white/5"
                        }`}
                        style={{
                          backgroundColor: isActive
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                        onClick={async () => {
                          setAiImageEnabled(journey.aiEnabled);
                          await loadCustomJourneyTrack(journey);
                          startCustomJourney(journey);
                          onClose();
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3
                              className="text-white/90 text-lg leading-tight"
                              style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 300 }}
                            >
                              {journey.name}
                            </h3>
                            <p
                              className="text-white/30 mt-0.5"
                              style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
                            >
                              {journey.subtitle}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
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
                              Custom
                            </div>
                            <button
                              onClick={(e) => handleShare(journey.id, journey.name, e)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                              title="Share Journey"
                              disabled={sharingId === journey.id}
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(journey.id, e)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-red-400/70 hover:bg-red-400/5 transition-colors"
                              title="Delete Journey"
                              disabled={deletingId === journey.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p
                          className="text-white/20"
                          style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)" }}
                        >
                          {journey.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
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
            <button
              onClick={() => setCreateDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-geist-mono)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Journey
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
                Stop {activeJourney?.name || "Journey"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Create Journey Dialog */}
      <CreateJourneyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={async (journey) => {
          setCustomJourneys((prev) => [journey, ...prev]);
          setAiImageEnabled(true);
          await loadCustomJourneyTrack(journey);
          startCustomJourney(journey);
          onClose();
        }}
      />

      {/* Share Sheet */}
      <ShareSheet
        open={!!shareSheet}
        onClose={() => setShareSheet(null)}
        url={shareSheet?.url ?? ""}
        title={shareSheet?.title ?? ""}
        text="Check out this journey on Resonance"
      />
    </>
  );
}
