"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Shuffle, Sparkles, Plus, Share2, Trash2, Wand2, Loader2 } from "lucide-react";
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
import { PAIRED_TRACKS, PAIRED_STORAGE } from "@/lib/journeys/paired-tracks";

const FEATURED_JOURNEY_ID = "first-snow";

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
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const analysis = useAudioStore((s) => s.analysis);

  const [aiAvailable, setAiAvailable] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
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

  // Auto-generate journey from current track's analysis
  const handleAutoGenerate = useCallback(async () => {
    if (!currentTrack || autoGenerating) return;
    setAutoGenerating(true);
    try {
      const res = await fetch("/api/journeys/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: currentTrack.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate");
      }
      const { journey } = await res.json();
      // Add to custom journeys list
      const customJourney: Journey = {
        id: journey.id,
        name: journey.name,
        subtitle: journey.subtitle,
        description: journey.description,
        realmId: journey.realmId,
        phases: journey.phases,
        aiEnabled: true,
        recordingId: currentTrack.id,
      };
      setCustomJourneys((prev) => [customJourney, ...prev]);
      setAiImageEnabled(true);
      startCustomJourney(customJourney);
      onClose();
      toast.success(`Journey "${journey.name}" created`);
    } catch (err) {
      console.error("Auto-generate failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate journey");
    } finally {
      setAutoGenerating(false);
    }
  }, [currentTrack, autoGenerating, startCustomJourney, setAiImageEnabled, onClose]);

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

  // Flat list for desktop grid — realm embedded on each card
  const flatJourneys = useMemo(() => {
    return groupedByRealm.flatMap(({ realm, journeys }) =>
      journeys.map((journey) => ({ journey, realm }))
    );
  }, [groupedByRealm]);

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

  const winterRealm = REALMS.find((r) => r.id === "winter");
  const featuredAccent = winterRealm?.palette.accent ?? "#90b8e0";

  // Phase arc renderer
  const renderPhaseArc = (journey: Journey, accent: string, maxWidth = "200px") => (
    <div className="flex gap-[2px]" style={{ maxWidth }}>
      {PHASE_ORDER.map((phaseId) => {
        const phase = journey.phases.find((p) => p.id === phaseId);
        if (!phase) return null;
        const width = (phase.end - phase.start) * 100;
        return (
          <div
            key={phaseId}
            className="rounded-full"
            style={{
              width: `${width}%`,
              height: "2px",
              backgroundColor: `${accent}${phaseId === "transcendence" ? "cc" : "40"}`,
            }}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {/* Card hover styles — CSS-only, no JS event handlers */}
      <style>{`
        .jcard { transition: background-color 0.15s ease, border-color 0.15s ease; }
        .jcard:not(.jcard-active):hover {
          background-color: rgba(255,255,255,0.04) !important;
          border-color: rgba(255,255,255,0.07) !important;
        }
      `}</style>
      {/* Full-area journey browser — solid black, no blur */}
      <div
        className="absolute inset-0 overflow-y-auto"
        style={{ zIndex: 7, backgroundColor: "#000", willChange: "scroll-position" }}
      >
        <div className="mx-auto px-5 md:px-8 pt-10 pb-24" style={{ maxWidth: "72rem" }}>

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-10">
            <h1
              className="text-white/90"
              style={{
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 200,
                fontSize: "1.8rem",
                letterSpacing: "-0.02em",
              }}
            >
              Journeys
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={selectRandom}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/35 hover:text-white/70 hover:bg-white/10 transition-colors duration-150"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <Shuffle className="h-3.5 w-3.5" />
                Random
              </button>
              <button
                onClick={() => setCreateDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/35 hover:text-white/70 hover:bg-white/10 transition-colors duration-150"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create
              </button>
              {currentTrack && analysis?.status === "completed" && (
                <button
                  onClick={handleAutoGenerate}
                  disabled={autoGenerating}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-white/35 hover:text-white/70 hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {autoGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  {autoGenerating ? "Generating..." : "Generate"}
                </button>
              )}
            </div>
          </div>

          {/* ── Featured Journey (Mobile) ── */}
          {featured && (
            <div className="md:hidden mb-12">
              <span
                className="text-white/25 mb-4 block"
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Featured
              </span>
              <div
                className="cursor-pointer group"
                onClick={() => handleJourneyClick(featured)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2
                      className="text-white/90 mb-1"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        fontWeight: 200,
                        fontSize: "1.5rem",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {featured.name}
                    </h2>
                    <p
                      className="text-white/40 mb-2"
                      style={{
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {featured.subtitle}
                    </p>
                    <p
                      className="text-white/45 mb-4"
                      style={{
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-geist-mono)",
                        lineHeight: 1.6,
                        maxWidth: "32rem",
                      }}
                    >
                      {featured.description}
                    </p>
                  </div>
                  {featured.aiEnabled && aiAvailable && (
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0 ml-4"
                      style={{
                        fontSize: "0.6rem",
                        fontFamily: "var(--font-geist-mono)",
                        backgroundColor: "rgba(255, 255, 255, 0.04)",
                        color: "rgba(255, 255, 255, 0.3)",
                      }}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {renderPhaseArc(featured, featuredAccent, "220px")}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJourneyClick(featured);
                    }}
                    className="px-4 py-1.5 rounded-md text-white/50 hover:text-white/90 transition-all"
                    style={{
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-geist-mono)",
                      border: `1px solid ${featuredAccent}30`,
                      backgroundColor: `${featuredAccent}08`,
                    }}
                  >
                    {activeJourney?.id === featured.id ? "Restart" : "Begin"}
                  </button>
                  <button
                    onClick={(e) => handleShareBuiltIn(featured.id, featured.name, e)}
                    className="p-1.5 rounded-md text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Share"
                    disabled={sharingId === featured.id}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Featured Journey (Desktop Hero Card) ── */}
          {featured && (
            <div
              className="hidden md:block mb-12 cursor-pointer group rounded-xl p-6 jcard"
              style={{
                backgroundColor: activeJourney?.id === featured.id
                  ? `${featuredAccent}08`
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${activeJourney?.id === featured.id ? `${featuredAccent}20` : "rgba(255,255,255,0.05)"}`,
                borderLeft: activeJourney?.id === featured.id ? `2px solid ${featuredAccent}` : undefined,
              }}
              onClick={() => handleJourneyClick(featured)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: featuredAccent,
                      boxShadow: `0 0 6px ${featuredAccent}30`,
                    }}
                  />
                  <span
                    className="text-white/30"
                    style={{
                      fontSize: "0.65rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {winterRealm?.name?.toUpperCase() ?? "WINTER"}
                  </span>
                  <span
                    className="text-white/20"
                    style={{
                      fontSize: "0.6rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Featured
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {featured.aiEnabled && aiAvailable && (
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{
                        fontSize: "0.6rem",
                        fontFamily: "var(--font-geist-mono)",
                        backgroundColor: "rgba(255, 255, 255, 0.04)",
                        color: "rgba(255, 255, 255, 0.3)",
                      }}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </div>
                  )}
                  <button
                    onClick={(e) => handleShareBuiltIn(featured.id, featured.name, e)}
                    className="p-1.5 rounded-md text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Share"
                    disabled={sharingId === featured.id}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <h2
                className="text-white/90 mb-1.5"
                style={{
                  fontFamily: "var(--font-geist-sans)",
                  fontWeight: 200,
                  fontSize: "1.4rem",
                  letterSpacing: "-0.01em",
                }}
              >
                {featured.name}
              </h2>
              <p
                className="text-white/30 mb-3"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {featured.subtitle}
              </p>
              <p
                className="text-white/35 mb-5"
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "var(--font-geist-mono)",
                  lineHeight: 1.6,
                  maxWidth: "48rem",
                }}
              >
                {featured.description}
              </p>
              <div className="mb-5">
                {renderPhaseArc(featured, featuredAccent, "100%")}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleJourneyClick(featured);
                }}
                className="px-5 py-2 rounded-md text-white/50 hover:text-white/90 transition-all"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono)",
                  border: `1px solid ${featuredAccent}30`,
                  backgroundColor: `${featuredAccent}08`,
                }}
              >
                {activeJourney?.id === featured.id ? "Restart" : "Begin"}
              </button>
            </div>
          )}

          {/* ── Mobile List — md:hidden ── */}
          <div className="md:hidden">

          {/* ── Realm Sections ── */}
          {groupedByRealm.map(({ realm, journeys }) => (
            <div key={realm.id} className="mb-10">
              {/* Realm header */}
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: realm.palette.accent,
                    boxShadow: `0 0 6px ${realm.palette.glow}30`,
                  }}
                />
                <span
                  className="text-white/30"
                  style={{
                    fontSize: "0.65rem",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {realm.name}
                </span>
              </div>

              {/* Journey rows */}
              <div className="divide-y divide-white/[0.04]">
                {journeys.map((journey) => {
                  const isActive = activeJourney?.id === journey.id;
                  return (
                    <div
                      key={journey.id}
                      className="py-3.5 cursor-pointer group transition-colors"
                      style={{
                        backgroundColor: isActive ? "rgba(255,255,255,0.03)" : "transparent",
                        borderLeft: isActive ? `2px solid ${realm.palette.accent}` : "2px solid transparent",
                        paddingLeft: "12px",
                      }}
                      onClick={() => handleJourneyClick(journey)}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span
                            className="text-white/85 shrink-0"
                            style={{
                              fontFamily: "var(--font-geist-sans)",
                              fontWeight: 300,
                              fontSize: "1rem",
                            }}
                          >
                            {journey.name}
                          </span>
                          <span
                            className="text-white/30 truncate"
                            style={{
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {journey.subtitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {isActive && (
                            <span
                              className="text-white/40"
                              style={{
                                fontSize: "0.6rem",
                                fontFamily: "var(--font-geist-mono)",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              Playing
                            </span>
                          )}
                          {journey.aiEnabled && aiAvailable && (
                            <div
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                              style={{
                                fontSize: "0.55rem",
                                fontFamily: "var(--font-geist-mono)",
                                color: "rgba(255, 255, 255, 0.25)",
                              }}
                            >
                              <Sparkles className="h-2 w-2" />
                              AI
                            </div>
                          )}
                          <button
                            onClick={(e) => handleShareBuiltIn(journey.id, journey.name, e)}
                            className={`p-1.5 rounded-md text-white/20 hover:text-white/50 transition-all ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            title="Share"
                            disabled={sharingId === journey.id}
                          >
                            <Share2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {journey.description && (
                        <p
                          className="text-white/40 mb-2"
                          style={{
                            fontSize: "0.7rem",
                            fontFamily: "var(--font-geist-mono)",
                            lineHeight: 1.5,
                          }}
                        >
                          {journey.description}
                        </p>
                      )}
                      {renderPhaseArc(journey, realm.palette.accent)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Custom Journeys ── */}
          {customJourneys.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.15)" }}
                />
                <span
                  className="text-white/30"
                  style={{
                    fontSize: "0.65rem",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Your Journeys
                </span>
              </div>

              <div className="divide-y divide-white/[0.04]">
                {customJourneys.map((journey) => {
                  const isActive = activeJourney?.id === journey.id;
                  const realm = REALMS.find((r) => r.id === journey.realmId);
                  const accent = realm?.palette.accent ?? "#888";
                  return (
                    <div
                      key={journey.id}
                      className="py-3.5 cursor-pointer group transition-colors"
                      style={{
                        backgroundColor: isActive ? "rgba(255,255,255,0.03)" : "transparent",
                        borderLeft: isActive ? `2px solid ${accent}` : "2px solid transparent",
                        paddingLeft: "12px",
                      }}
                      onClick={async () => {
                        setAiImageEnabled(journey.aiEnabled);
                        await loadCustomJourneyTrack(journey);
                        startCustomJourney(journey);
                        onClose();
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span
                            className="text-white/85 shrink-0"
                            style={{
                              fontFamily: "var(--font-geist-sans)",
                              fontWeight: 300,
                              fontSize: "1rem",
                            }}
                          >
                            {journey.name}
                          </span>
                          <span
                            className="text-white/30 truncate"
                            style={{
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {journey.subtitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {isActive && (
                            <span
                              className="text-white/40"
                              style={{
                                fontSize: "0.6rem",
                                fontFamily: "var(--font-geist-mono)",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              Playing
                            </span>
                          )}
                          <button
                            onClick={(e) => handleShare(journey.id, journey.name, e)}
                            className={`p-1.5 rounded-md text-white/20 hover:text-white/50 transition-all ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            title="Share"
                            disabled={sharingId === journey.id}
                          >
                            <Share2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(journey.id, e)}
                            className={`p-1.5 rounded-md text-white/20 hover:text-red-400/60 transition-all ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            title="Delete"
                            disabled={deletingId === journey.id}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {journey.description && (
                        <p
                          className="text-white/40 mb-2"
                          style={{
                            fontSize: "0.7rem",
                            fontFamily: "var(--font-geist-mono)",
                            lineHeight: 1.5,
                          }}
                        >
                          {journey.description}
                        </p>
                      )}
                      {renderPhaseArc(journey, accent)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          </div>{/* end md:hidden mobile list */}

          {/* ── Desktop Card Grid — hidden md:block ── */}
          <div className="hidden md:block">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {flatJourneys.map(({ journey, realm }) => {
                const isActive = activeJourney?.id === journey.id;
                const accent = realm.palette.accent;
                return (
                  <div
                    key={journey.id}
                    className={`jcard cursor-pointer group rounded-xl${isActive ? " jcard-active" : ""}`}
                    style={{
                      backgroundColor: isActive
                        ? `${accent}08`
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isActive ? `${accent}20` : "rgba(255,255,255,0.05)"}`,
                      borderLeft: isActive ? `2px solid ${accent}` : undefined,
                      padding: "20px",
                    }}
                    onClick={() => handleJourneyClick(journey)}
                  >
                    {/* Top row: realm dot + name ... AI badge + share */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: accent,
                            boxShadow: `0 0 4px ${realm.palette.glow}30`,
                          }}
                        />
                        <span
                          className="text-white/30"
                          style={{
                            fontSize: "0.6rem",
                            fontFamily: "var(--font-geist-mono)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          {realm.name.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {journey.aiEnabled && aiAvailable && (
                          <div
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                            style={{
                              fontSize: "0.55rem",
                              fontFamily: "var(--font-geist-mono)",
                              color: "rgba(255, 255, 255, 0.25)",
                            }}
                          >
                            <Sparkles className="h-2 w-2" />
                            AI
                          </div>
                        )}
                        <button
                          onClick={(e) => handleShareBuiltIn(journey.id, journey.name, e)}
                          className="p-1.5 rounded-md text-white/20 hover:text-white/50 transition-all opacity-0 group-hover:opacity-100"
                          title="Share"
                          disabled={sharingId === journey.id}
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Journey name */}
                    <h3
                      className="text-white/85 mb-1"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        fontWeight: 300,
                        fontSize: "1.05rem",
                      }}
                    >
                      {journey.name}
                    </h3>

                    {/* Subtitle */}
                    <p
                      className="text-white/30 mb-2"
                      style={{
                        fontSize: "0.72rem",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {journey.subtitle}
                    </p>

                    {/* Description — 2 line clamp */}
                    {journey.description && (
                      <p
                        className="text-white/35 mb-3 line-clamp-2"
                        style={{
                          fontSize: "0.68rem",
                          fontFamily: "var(--font-geist-mono)",
                          lineHeight: 1.5,
                        }}
                      >
                        {journey.description}
                      </p>
                    )}

                    {/* Phase arc — full card width */}
                    {renderPhaseArc(journey, accent, "100%")}
                  </div>
                );
              })}
            </div>

            {/* ── Custom Journeys (Desktop) ── */}
            {customJourneys.length > 0 && (
              <>
                <div className="flex items-center gap-4 my-8">
                  <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                  <span
                    className="text-white/25"
                    style={{
                      fontSize: "0.65rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    Your Journeys
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customJourneys.map((journey) => {
                    const isActive = activeJourney?.id === journey.id;
                    const realm = REALMS.find((r) => r.id === journey.realmId);
                    const accent = realm?.palette.accent ?? "#888";
                    return (
                      <div
                        key={journey.id}
                        className={`jcard cursor-pointer group rounded-xl${isActive ? " jcard-active" : ""}`}
                        style={{
                          backgroundColor: isActive
                            ? `${accent}08`
                            : "rgba(255,255,255,0.02)",
                          border: `1px solid ${isActive ? `${accent}20` : "rgba(255,255,255,0.05)"}`,
                          borderLeft: isActive ? `2px solid ${accent}` : undefined,
                          padding: "20px",
                        }}
                        onClick={async () => {
                          setAiImageEnabled(journey.aiEnabled);
                          await loadCustomJourneyTrack(journey);
                          startCustomJourney(journey);
                          onClose();
                        }}
                      >
                        {/* Top row: realm dot + name ... share + delete */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: accent,
                                boxShadow: `0 0 4px ${realm?.palette.glow ?? accent}30`,
                              }}
                            />
                            <span
                              className="text-white/30"
                              style={{
                                fontSize: "0.6rem",
                                fontFamily: "var(--font-geist-mono)",
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                              }}
                            >
                              {realm?.name?.toUpperCase() ?? "CUSTOM"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => handleShare(journey.id, journey.name, e)}
                              className="p-1.5 rounded-md text-white/20 hover:text-white/50 transition-all opacity-0 group-hover:opacity-100"
                              title="Share"
                              disabled={sharingId === journey.id}
                            >
                              <Share2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(journey.id, e)}
                              className="p-1.5 rounded-md text-white/20 hover:text-red-400/60 transition-all opacity-0 group-hover:opacity-100"
                              title="Delete"
                              disabled={deletingId === journey.id}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Journey name */}
                        <h3
                          className="text-white/85 mb-1"
                          style={{
                            fontFamily: "var(--font-geist-sans)",
                            fontWeight: 300,
                            fontSize: "1.05rem",
                          }}
                        >
                          {journey.name}
                        </h3>

                        {/* Subtitle */}
                        <p
                          className="text-white/30 mb-2"
                          style={{
                            fontSize: "0.72rem",
                            fontFamily: "var(--font-geist-mono)",
                          }}
                        >
                          {journey.subtitle}
                        </p>

                        {/* Description — 2 line clamp */}
                        {journey.description && (
                          <p
                            className="text-white/35 mb-3 line-clamp-2"
                            style={{
                              fontSize: "0.68rem",
                              fontFamily: "var(--font-geist-mono)",
                              lineHeight: 1.5,
                            }}
                          >
                            {journey.description}
                          </p>
                        )}

                        {/* Phase arc — full card width */}
                        {renderPhaseArc(journey, accent, "100%")}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>{/* end desktop grid */}

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
