"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shuffle, Sparkles, Plus, Share2, Trash2, Wand2, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { REALMS } from "@/lib/journeys/realms";
import { JOURNEYS, getJourney } from "@/lib/journeys/journeys";
import { PHASE_ORDER } from "@/lib/journeys/phase-interpolation";
import { getAiImageService } from "@/lib/journeys/ai-image-service";
import { useAudioStore } from "@/lib/audio/audio-store";
import { ensureResumed } from "@/lib/audio/audio-engine";
import { createClient } from "@/lib/supabase/client";
import { ShareSheet } from "@/components/ui/share-sheet";
import type { Journey } from "@/lib/journeys/types";
import { PAIRED_TRACKS, PAIRED_STORAGE } from "@/lib/journeys/paired-tracks";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { JOURNEY_PATHS, getPathForJourney, isPathCulminationUnlocked, GRAND_CULMINATION_ID } from "@/lib/journeys/paths";
import { usePathProgressStore } from "@/lib/journeys/path-progress-store";
import { getCulminationJourney } from "@/lib/journeys/culmination-journeys";
import { getDeviceTier } from "@/lib/audio/device-tier";

/** Journeys pinned to the top of the grid (in order) */
const PINNED_JOURNEY_IDS = ["ghost", "first-snow"];

interface JourneySelectorProps {
  open: boolean;
  onClose: () => void;
}

export function JourneySelector({ open, onClose }: JourneySelectorProps) {
  const router = useRouter();
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
  const [customPaths, setCustomPaths] = useState<Array<{
    id: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    journeyIds: string[];
    culminationJourneyId: string | null;
    shareToken: string | null;
    accent: string;
    glow: string;
  }>>([]);
  /** Full Journey objects for every path member — keyed by journey id so we can
   *  look them up when a path is expanded and the user clicks a track. */
  const [pathJourneyMap, setPathJourneyMap] = useState<Record<string, Journey>>({});
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareSheet, setShareSheet] = useState<{ url: string; title: string } | null>(null);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [view, setView] = useState<"journeys" | "paths">("journeys");
  const completedJourneyIds = usePathProgressStore((s) => s.completedJourneyIds);
  const completedCulminationIds = usePathProgressStore((s) => s.completedCulminationIds);
  const grandCulminationUnlocked = usePathProgressStore((s) => s.grandCulminationUnlocked);

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
        // Journeys that belong to a user-owned path are "path-only" — they
        // should only appear via /path/[token], not in the flat selector list.
        const { data: pathRows } = await supabase
          .from("journey_paths")
          .select("id, name, subtitle, description, journey_ids, share_token, accent_color, glow_color, culmination_journey_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        const pathJourneyIds = new Set<string>();
        for (const row of pathRows ?? []) {
          for (const jid of (row.journey_ids ?? []) as string[]) pathJourneyIds.add(jid);
          // Also exclude the culmination journey — it lives on the path,
          // not in the flat list.
          if (row.culmination_journey_id) pathJourneyIds.add(row.culmination_journey_id as string);
        }
        setCustomPaths(
          (pathRows ?? []).map((row) => ({
            id: row.id as string,
            name: (row.name as string) ?? "Untitled Path",
            subtitle: (row.subtitle as string) ?? null,
            description: (row.description as string) ?? null,
            journeyIds: (row.journey_ids ?? []) as string[],
            culminationJourneyId: (row.culmination_journey_id as string) ?? null,
            shareToken: (row.share_token as string) ?? null,
            accent: (row.accent_color as string) ?? "#d0a070",
            glow: (row.glow_color as string) ?? "#e0b080",
          }))
        );

        // Fetch full journey rows for every path member + culmination so we
        // can render the inline expansion and play tracks via handleJourneyClick.
        if (pathJourneyIds.size > 0) {
          const { data: pathJourneyRows } = await supabase
            .from("journeys")
            .select("*")
            .in("id", Array.from(pathJourneyIds));
          const map: Record<string, Journey> = {};
          for (const jRow of pathJourneyRows ?? []) {
            const r = jRow as Record<string, unknown>;
            map[r.id as string] = {
              id: r.id as string,
              name: (r.name as string) ?? "Untitled",
              subtitle: (r.subtitle as string) ?? "",
              description: (r.description as string) ?? "",
              realmId: (r.realm_id as string) ?? "custom",
              aiEnabled: true,
              phases: (r.phases as Journey["phases"]) ?? [],
              storyText: (r.story_text as string) ?? null,
              recordingId: (r.recording_id as string) ?? null,
              userId: r.user_id as string,
              audioReactive: !!(r.audio_reactive),
              creatorName: (r.creator_name as string) ?? null,
              photographyCredit: (r.photography_credit as string) ?? null,
              dedication: (r.dedication as string) ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...(r.theme ? { theme: r.theme as any } : {}),
              ...(Array.isArray(r.local_image_urls) && r.local_image_urls.length > 0
                ? { localImageUrls: r.local_image_urls as string[] }
                : {}),
            } as Journey;
          }
          setPathJourneyMap(map);
        }

        const { data, error } = await supabase
          .from("journeys")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (!error && data) {
          // Filter out built-in share stubs — by theme flag or by matching built-in name
          const builtinNames = new Set(JOURNEYS.map((j) => j.name));
          const journeys: Journey[] = data
            .filter((row: Record<string, unknown>) => {
              const theme = row.theme as Record<string, unknown> | null;
              if (theme?.builtinJourneyId) return false;
              if (builtinNames.has(row.name as string)) return false;
              if (pathJourneyIds.has(row.id as string)) return false;
              return true;
            })
            .map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: (row.name as string) ?? "Untitled Journey",
            subtitle: (row.subtitle as string) ?? "",
            description: (row.description as string) ?? "",
            realmId: (row.realm_id as string) ?? "custom",
            aiEnabled: true,
            phases: (row.phases as Journey["phases"]) ?? [],
            storyText: (row.story_text as string) ?? null,
            recordingId: (row.recording_id as string) ?? null,
            userId: row.user_id as string,
            audioReactive: !!(row.audio_reactive),
            creatorName: (row.creator_name as string) ?? null,
            photographyCredit: (row.photography_credit as string) ?? null,
            dedication: (row.dedication as string) ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(row.theme ? { theme: row.theme as any } : {}),
            ...(Array.isArray(row.local_image_urls) && row.local_image_urls.length > 0
              ? { localImageUrls: row.local_image_urls as string[] }
              : {}),
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
      const { journey, dbRecord } = await res.json();
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
        userId: dbRecord?.user_id,
        ...(journey.theme ? { theme: journey.theme } : {}),
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
  // (random pool is scoped to the current user — never another user's recordings)
  const loadCustomJourneyTrack = useCallback(async (journey: Journey) => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (journey.recordingId) {
        const { data: rec } = await supabase
          .from("recordings")
          .select("id, title, audio_url, artist")
          .eq("id", journey.recordingId)
          .eq("user_id", user.id)
          .single();
        if (rec) {
          play({ id: rec.id, title: rec.title, audioUrl: `/api/audio/${rec.id}`, artist: rec.artist ?? undefined }, 0);
          return;
        }
      }
      // No specific recording or not found — load a random track from this user's library
      const { data } = await supabase
        .from("recordings")
        .select("id, title, audio_url, artist")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        const row = data[Math.floor(Math.random() * data.length)];
        play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}`, artist: row.artist ?? undefined }, 0);
      }
    } catch (err) {
      console.warn("[journey] failed to load track for custom journey:", err);
    }
  }, [play]);

  // Build grouped + flat journey lists — pinned journeys go first
  const { groupedByRealm } = useMemo(() => {
    // Group all journeys by realm, preserving realm order
    const groups: { realm: typeof REALMS[number]; journeys: Journey[] }[] = [];
    for (const realm of REALMS) {
      const rj = JOURNEYS.filter((j) => j.realmId === realm.id);
      if (rj.length > 0) {
        groups.push({ realm, journeys: rj });
      }
    }
    return { groupedByRealm: groups };
  }, []);

  // Pinned journeys (New Releases) and rest (Featured)
  const pinnedSet = useMemo(() => new Set(PINNED_JOURNEY_IDS), []);
  const realmMap = useMemo(() => new Map(REALMS.map(r => [r.id, r])), []);

  const pinnedJourneys = useMemo(() => {
    const pinned: { journey: Journey; realm: typeof REALMS[number] }[] = [];
    for (const id of PINNED_JOURNEY_IDS) {
      const j = JOURNEYS.find(jj => jj.id === id);
      if (j) {
        const r = realmMap.get(j.realmId);
        if (r) pinned.push({ journey: j, realm: r });
      }
    }
    return pinned;
  }, [realmMap]);

  const restJourneys = useMemo(() => {
    return groupedByRealm.flatMap(({ realm, journeys }) =>
      journeys
        .filter(j => !pinnedSet.has(j.id))
        .map(journey => ({ journey, realm }))
    );
  }, [groupedByRealm, pinnedSet]);

  if (!open) return null;

  const selectJourney = async (journey: Journey, withAi: boolean) => {
    // Unlock AudioContext in user gesture context — must happen before any await.
    // Mobile browsers require resume() within a tap/click handler; once async work
    // starts, the gesture context is lost and play() silently fails.
    ensureResumed();

    setAiImageEnabled(withAi);

    const pairedSearch = PAIRED_TRACKS[journey.id];
    const currentTrack = useAudioStore.getState().currentTrack;

    // Hoist cue markers and duration for direct event wiring after startJourney
    let pendingCues: { time: number; label: string }[] = [];
    let pendingDuration = 0;

    // If this journey has a paired track, always load it from the beginning
    // (even if another track is currently playing)
    if (pairedSearch) {
      let trackLoaded = false;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("recordings")
          .select("id, title, audio_url, duration, artist")
          .eq("user_id", user.id)
          .ilike("title", pairedSearch)
          .limit(1);

        if (!error && data?.[0]) {
          const row = data[0];
          console.log("[journey] loading paired track:", row.title);
          play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}`, duration: row.duration ?? undefined, artist: row.artist ?? undefined }, 0);
          trackLoaded = true;
          pendingDuration = row.duration ?? 0;

          // Also load analysis + cue markers for the paired track
          // so auto-detected events and manual bass hit markers fire during the journey
          const [analysisRes, markersRes] = await Promise.all([
            supabase.from("analyses").select("*").eq("recording_id", row.id).single(),
            supabase.from("markers").select("time, label").eq("recording_id", row.id).eq("type", "cue").order("time"),
          ]);
          if (analysisRes.data) {
            useAudioStore.getState().setAnalysis(analysisRes.data);
          }
          const cues = (markersRes.data ?? []) as { time: number; label: string }[];
          if (cues.length > 0) {
            useAudioStore.getState().setCueMarkers(cues);
            pendingCues = cues;
          }

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
        // from the current user's own library
        if (!trackLoaded) {
          const { data: fallback } = await supabase
            .from("recordings")
            .select("id, title, audio_url, artist")
            .eq("user_id", user.id)
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
            play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}`, artist: row.artist ?? undefined }, 0);
  
          }
        }
      } catch (err) {
        console.warn("[journey] failed to load paired track:", err);
      }
    } else {
      // No paired track — load a random recording from the current user's library
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("recordings")
          .select("id, title, audio_url, artist")
          .eq("user_id", user.id)
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
          play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}`, artist: row.artist ?? undefined }, 0);

        } else {
          console.warn("[journey] no recordings found, starting journey without audio");
        }
      } catch (err) {
        console.warn("[journey] failed to load random track:", err);
      }
    }

    startJourney(journey.id);

    // Wire cue marker events directly to the engine AFTER start.
    // The React effect in visualizer-client may not fire in time because
    // engine.start() clears eventMarkers and duration may still be 0.
    // Using the DB duration (pendingDuration) avoids the race condition.
    if (pendingCues.length > 0 && pendingDuration > 0) {
      const engine = getJourneyEngine();
      engine.setEvents(
        pendingCues.map(c => ({ time: c.time, type: "bass_hit" as const, intensity: 1.0 })),
        pendingDuration
      );
      console.log(`[journey] direct-wired ${pendingCues.length} cue markers (duration: ${pendingDuration}s)`);
    }

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
      {/* Card hover styles. The "shader window" backdrop-filter blur is gorgeous
          on Apple Silicon but tanks frame rates on older GPUs (the compositor
          re-samples the running visualizer behind every card on every frame).
          High-tier devices keep the effect; medium/low fall back to a flat
          translucent fill. */}
      <style>{getDeviceTier() === "high" ? `
        .jcard {
          transition: background-color 0.15s ease, border-color 0.15s ease;
          -webkit-backdrop-filter: brightness(2.2) saturate(1.2) blur(24px);
          backdrop-filter: brightness(2.2) saturate(1.2) blur(24px);
        }
        .jcard:not(.jcard-active):hover {
          background-color: rgba(255,255,255,0.03) !important;
          border-color: rgba(255,255,255,0.12) !important;
          -webkit-backdrop-filter: brightness(3.5) saturate(1.4) blur(16px) !important;
          backdrop-filter: brightness(3.5) saturate(1.4) blur(16px) !important;
        }
        .jcard.jcard-active {
          -webkit-backdrop-filter: brightness(2.8) saturate(1.3) blur(20px);
          backdrop-filter: brightness(2.8) saturate(1.3) blur(20px);
        }
      ` : `
        .jcard {
          transition: background-color 0.15s ease, border-color 0.15s ease;
          background-color: rgba(255,255,255,0.025);
        }
        .jcard:not(.jcard-active):hover {
          background-color: rgba(255,255,255,0.06) !important;
          border-color: rgba(255,255,255,0.14) !important;
        }
        .jcard.jcard-active {
          background-color: rgba(255,255,255,0.05);
        }
      `}</style>
      {/* Full-area journey browser — solid black, no blur */}
      <div
        className="absolute inset-0 overflow-y-auto overflow-x-hidden"
        style={{ zIndex: 80, backgroundColor: "#000", willChange: "scroll-position", overscrollBehaviorY: "contain" }}
      >
        <div className="mx-auto px-5 md:px-8 pt-10" style={{ maxWidth: "72rem", paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))" }}>

          {/* ── Header with Journeys/Paths toggle ── */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              {(["journeys", "paths"] as const).map((tab, i) => (
                <div key={tab} className="flex items-center gap-3">
                  {i > 0 && (
                    <span className="text-white/15" style={{ fontSize: "0.5rem" }}>
                      &bull;
                    </span>
                  )}
                  <button
                    onClick={() => setView(tab)}
                    className="relative pb-1.5 transition-colors duration-150"
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      fontSize: "0.72rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: view === tab ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                    }}
                  >
                    {tab === "journeys" ? "Journeys" : "Paths"}
                    {view === tab && (
                      <span
                        className="absolute bottom-0 left-0 right-0"
                        style={{
                          height: "2px",
                          backgroundColor: "rgba(255,255,255,0.4)",
                          borderRadius: "1px",
                        }}
                      />
                    )}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/create")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/35 hover:text-white/70 hover:bg-white/10 transition-colors duration-75"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create
              </button>
            </div>
          </div>

          {/* ── Paths View ── */}
          {view === "paths" && (
          <div className="mb-12">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              <span
                className="text-white/30"
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Paths
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            </div>

            {/* Custom user paths — Welcome Home and any future albums. Matches
                the built-in path expansion pattern exactly: click to expand,
                list journeys, tap a journey to play via handleJourneyClick. */}
            {customPaths.length > 0 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                {customPaths.map((path) => {
                  const isExpanded = expandedPath === path.id;
                  const completedCount = path.journeyIds.filter((id) => completedJourneyIds.includes(id)).length;
                  const total = path.journeyIds.length;
                  const culminationUnlocked = total > 0 && completedCount === total;
                  const culmJourney = path.culminationJourneyId ? pathJourneyMap[path.culminationJourneyId] : null;
                  const shareUrl = path.shareToken
                    ? (typeof window !== "undefined" ? `${window.location.origin}/path/${path.shareToken}` : `/path/${path.shareToken}`)
                    : null;
                  const copyLink = async (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (!shareUrl) return;
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      toast.success("Path link copied");
                    } catch {
                      toast.error("Copy failed");
                    }
                  };
                  return (
                    <div
                      key={path.id}
                      className="jcard rounded-xl"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.01)",
                        border: `1px solid rgba(255,255,255,0.08)`,
                        padding: "16px 20px",
                      }}
                    >
                      {/* Header — click to toggle */}
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpandedPath(isExpanded ? null : path.id)}
                      >
                        <div className="flex items-start gap-2.5 mb-2">
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                            style={{
                              backgroundColor: path.accent,
                              boxShadow: `0 0 4px ${path.glow}30`,
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <span
                              className="text-white/80 block"
                              style={{
                                fontFamily: "var(--font-geist-sans)",
                                fontWeight: 300,
                                fontSize: "0.95rem",
                              }}
                            >
                              {path.name}
                            </span>
                            {path.subtitle && (
                              <span
                                className="text-white/35 block mt-0.5"
                                style={{
                                  fontSize: "0.68rem",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                {path.subtitle}
                              </span>
                            )}
                          </div>
                          {path.shareToken && (
                            <button
                              type="button"
                              onClick={copyLink}
                              className="p-1.5 rounded-md text-white/30 hover:text-white/80 transition-colors shrink-0"
                              title="Copy share link"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ChevronDown
                            className="h-3.5 w-3.5 text-white/20 shrink-0 mt-1 transition-transform duration-200"
                            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 ml-4 mt-2">
                          {path.journeyIds.map((jid) => {
                            const done = completedJourneyIds.includes(jid);
                            return (
                              <div
                                key={jid}
                                style={{
                                  width: "5px",
                                  height: "5px",
                                  borderRadius: "50%",
                                  backgroundColor: done ? path.accent : "rgba(255,255,255,0.15)",
                                  boxShadow: done ? `0 0 4px ${path.glow}40` : "none",
                                }}
                              />
                            );
                          })}
                          <span
                            style={{
                              fontFamily: "var(--font-geist-mono)",
                              fontSize: "0.6rem",
                              color: "rgba(255,255,255,0.3)",
                              marginLeft: "0.4rem",
                            }}
                          >
                            {completedCount} of {total}
                          </span>
                        </div>
                      </div>

                      {/* Expanded — inline journey list */}
                      {isExpanded && (
                        <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <div className="flex flex-col gap-1">
                            {path.journeyIds.map((jid, idx) => {
                              const journey = pathJourneyMap[jid];
                              if (!journey) return null;
                              const isComplete = completedJourneyIds.includes(jid);
                              const isActive = activeJourney?.id === jid;
                              return (
                                <div
                                  key={jid}
                                  className="flex items-center gap-3 py-1.5 cursor-pointer group rounded-md px-2 hover:bg-white/[0.03] transition-colors"
                                  onClick={() => handleJourneyClick(journey)}
                                  style={{
                                    backgroundColor: isActive ? "rgba(255,255,255,0.04)" : undefined,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.58rem",
                                      fontFamily: "var(--font-geist-mono)",
                                      color: "rgba(255,255,255,0.25)",
                                      letterSpacing: "0.08em",
                                      minWidth: "1.25rem",
                                    }}
                                  >
                                    {String(idx + 1).padStart(2, "0")}
                                  </span>
                                  <div
                                    style={{
                                      width: "6px",
                                      height: "6px",
                                      borderRadius: "50%",
                                      backgroundColor: isComplete ? path.accent : "rgba(255,255,255,0.15)",
                                      flexShrink: 0,
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div
                                      className="text-white/80 group-hover:text-white truncate"
                                      style={{
                                        fontFamily: "var(--font-geist-sans)",
                                        fontWeight: 300,
                                        fontSize: "0.85rem",
                                      }}
                                    >
                                      {journey.name}
                                    </div>
                                  </div>
                                  {isActive && (
                                    <span
                                      style={{
                                        fontSize: "0.55rem",
                                        fontFamily: "var(--font-geist-mono)",
                                        color: "rgba(255,255,255,0.4)",
                                        letterSpacing: "0.08em",
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      Playing
                                    </span>
                                  )}
                                </div>
                              );
                            })}

                            {/* Culmination row — locked until all done */}
                            {culmJourney && (
                              <div
                                className={`flex items-center gap-3 py-2 mt-1 rounded-md px-2 transition-colors ${
                                  culminationUnlocked ? "cursor-pointer hover:bg-white/[0.05]" : "cursor-not-allowed opacity-60"
                                }`}
                                onClick={() => culminationUnlocked && handleJourneyClick(culmJourney)}
                                style={{
                                  borderTop: "1px solid rgba(255,255,255,0.06)",
                                  marginTop: "8px",
                                  paddingTop: "12px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.55rem",
                                    fontFamily: "var(--font-geist-mono)",
                                    color: path.accent,
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                    minWidth: "1.25rem",
                                  }}
                                >
                                  ★
                                </span>
                                <div
                                  style={{
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "50%",
                                    backgroundColor: culminationUnlocked ? path.accent : "rgba(255,255,255,0.12)",
                                    flexShrink: 0,
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div
                                    className="truncate"
                                    style={{
                                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                                      fontStyle: "italic",
                                      fontSize: "0.95rem",
                                      color: culminationUnlocked ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                                    }}
                                  >
                                    {culmJourney.name}
                                  </div>
                                  {!culminationUnlocked && (
                                    <div
                                      style={{
                                        fontSize: "0.58rem",
                                        fontFamily: "var(--font-geist-mono)",
                                        color: "rgba(255,255,255,0.35)",
                                        marginTop: "2px",
                                      }}
                                    >
                                      Finish all {total} to unlock
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {JOURNEY_PATHS.map((path) => {
                const isExpanded = expandedPath === path.id;
                const completed = path.journeyIds.filter((id) => completedJourneyIds.includes(id)).length;
                const total = path.journeyIds.length;
                const culminationUnlocked = isPathCulminationUnlocked(path, completedJourneyIds);
                const culminationCompleted = completedCulminationIds.includes(path.culminationJourneyId);
                const culmination = getCulminationJourney(path.culminationJourneyId);

                return (
                  <div
                    key={path.id}
                    className="jcard rounded-xl"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.01)",
                      border: `1px solid rgba(255,255,255,0.06)`,
                      padding: "16px 20px",
                    }}
                  >
                    {/* Collapsed header — always visible */}
                    <div
                      className="cursor-pointer"
                      onClick={() => setExpandedPath(isExpanded ? null : path.id)}
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                          style={{
                            backgroundColor: path.palette.accent,
                            boxShadow: `0 0 4px ${path.palette.glow}30`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <span
                            className="text-white/80 block"
                            style={{
                              fontFamily: "var(--font-geist-sans)",
                              fontWeight: 300,
                              fontSize: "0.95rem",
                            }}
                          >
                            {path.name}
                          </span>
                          <span
                            className="text-white/35 block mt-0.5"
                            style={{
                              fontSize: "0.68rem",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {path.subtitle}
                          </span>
                        </div>
                        <ChevronDown
                          className="h-3.5 w-3.5 text-white/20 shrink-0 mt-1 transition-transform duration-200"
                          style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                        />
                      </div>
                      {/* Progress dots + count */}
                      <div className="flex items-center gap-1.5 ml-4">
                        {path.journeyIds.map((jid) => (
                          <div
                            key={jid}
                            style={{
                              width: "5px",
                              height: "5px",
                              borderRadius: "50%",
                              backgroundColor: completedJourneyIds.includes(jid)
                                ? path.palette.accent
                                : "rgba(255,255,255,0.15)",
                            }}
                          />
                        ))}
                        <span
                          style={{
                            fontFamily: "var(--font-geist-mono)",
                            fontSize: "0.6rem",
                            color: "rgba(255,255,255,0.3)",
                            marginLeft: "0.4rem",
                          }}
                        >
                          {completed} of {total}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail — journey list */}
                    {isExpanded && (
                      <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex flex-col gap-1">
                          {path.journeyIds.map((jid, idx) => {
                            const journey = getJourney(jid);
                            if (!journey) return null;
                            const isComplete = completedJourneyIds.includes(jid);
                            const isActive = activeJourney?.id === jid;
                            return (
                              <div
                                key={jid}
                                className="flex items-center gap-3 py-1.5 cursor-pointer group rounded-md px-2 hover:bg-white/[0.03] transition-colors"
                                onClick={() => handleJourneyClick(journey)}
                                style={{
                                  backgroundColor: isActive ? "rgba(255,255,255,0.04)" : undefined,
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily: "var(--font-geist-mono)",
                                    fontSize: "0.6rem",
                                    color: "rgba(255,255,255,0.25)",
                                    width: "1rem",
                                    textAlign: "right",
                                  }}
                                >
                                  {idx + 1}.
                                </span>
                                <span
                                  className="flex-1"
                                  style={{
                                    fontFamily: "var(--font-geist-sans)",
                                    fontWeight: 300,
                                    fontSize: "0.85rem",
                                    color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
                                  }}
                                >
                                  {journey.name}
                                </span>
                                {isComplete && (
                                  <div
                                    style={{
                                      width: "5px",
                                      height: "5px",
                                      borderRadius: "50%",
                                      backgroundColor: path.palette.accent,
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Culmination row */}
                        <div
                          className="mt-3 pt-3 flex items-center gap-3 px-2"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          {culminationUnlocked ? (
                            <div
                              className="flex items-center gap-3 cursor-pointer group rounded-md py-1.5 flex-1 hover:bg-white/[0.03] transition-colors"
                              onClick={() => {
                                if (culmination) {
                                  ensureResumed();
                                  startJourney(path.culminationJourneyId);
                                  onClose();
                                }
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "var(--font-geist-sans)",
                                  fontWeight: 300,
                                  fontSize: "0.85rem",
                                  color: path.palette.accent,
                                  textShadow: `0 0 8px ${path.palette.glow}40`,
                                }}
                              >
                                {culmination?.name ?? "Culmination"}
                              </span>
                              {culminationCompleted && (
                                <div
                                  style={{
                                    width: "5px",
                                    height: "5px",
                                    borderRadius: "50%",
                                    backgroundColor: path.palette.accent,
                                  }}
                                />
                              )}
                            </div>
                          ) : (
                            <div className="flex-1 py-1.5">
                              <span
                                style={{
                                  fontFamily: "var(--font-geist-mono)",
                                  fontSize: "0.65rem",
                                  color: "rgba(255,255,255,0.25)",
                                }}
                              >
                                Complete all journeys to reveal
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grand Culmination — The Spirit */}
            {grandCulminationUnlocked && (
              <div
                className="mt-4 jcard rounded-xl cursor-pointer"
                style={{
                  backgroundColor: "rgba(160,128,208,0.03)",
                  border: "1px solid rgba(160,128,208,0.15)",
                  padding: "16px 20px",
                }}
                onClick={() => {
                  ensureResumed();
                  startJourney(GRAND_CULMINATION_ID);
                  onClose();
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: "#c0a0f0",
                      boxShadow: "0 0 6px rgba(192,160,240,0.3)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-geist-sans)",
                      fontWeight: 300,
                      fontSize: "0.95rem",
                      color: "#c0a0f0",
                      textShadow: "0 0 8px rgba(192,160,240,0.3)",
                    }}
                  >
                    The Spirit
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      fontSize: "0.65rem",
                      color: "rgba(255,255,255,0.25)",
                    }}
                  >
                    the infinite inner landscape
                  </span>
                </div>
              </div>
            )}
          </div>
          )}

          {/* ── Journeys View ── */}
          {view === "journeys" && (<>

          {/* ── New Releases (desktop) ── */}
          <div className="hidden md:block mb-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              <span
                className="text-white/30"
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                New Releases
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {pinnedJourneys.map(({ journey, realm }) => {
                const isActive = activeJourney?.id === journey.id;
                const accent = realm.palette.accent;
                return (
                  <div
                    key={journey.id}
                    className={`jcard cursor-pointer group rounded-xl${isActive ? " jcard-active" : ""}`}
                    style={{
                      backgroundColor: isActive
                        ? `${accent}05`
                        : "rgba(255,255,255,0.01)",
                      border: `1px solid ${isActive ? `${accent}20` : "rgba(255,255,255,0.06)"}`,
                      borderLeft: isActive ? `2px solid ${accent}` : undefined,
                      padding: "24px",
                    }}
                    onClick={() => handleJourneyClick(journey)}
                  >
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
                          className="text-white/35"
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

                    <div className="flex items-center gap-2 mb-1">
                      {completedJourneyIds.includes(journey.id) && (() => {
                        const jp = getPathForJourney(journey.id);
                        return jp ? (
                          <div
                            className="shrink-0"
                            style={{
                              width: "4px",
                              height: "4px",
                              borderRadius: "50%",
                              backgroundColor: jp.palette.accent,
                            }}
                          />
                        ) : null;
                      })()}
                      <h3
                        className="text-white/85"
                        style={{
                          fontFamily: "var(--font-geist-sans)",
                          fontWeight: 300,
                          fontSize: "1.2rem",
                        }}
                      >
                        {journey.name}
                      </h3>
                    </div>

                    <p
                      className="text-white/35 mb-2"
                      style={{
                        fontSize: "0.72rem",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {journey.subtitle}
                    </p>

                    {journey.description && (
                      <p
                        className="text-white/40 mb-3"
                        style={{
                          fontSize: "0.68rem",
                          fontFamily: "var(--font-geist-mono)",
                          lineHeight: 1.5,
                        }}
                      >
                        {journey.description}
                      </p>
                    )}

                    {renderPhaseArc(journey, accent, "100%")}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── New Releases (mobile) ── */}
          <div className="md:hidden mb-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              <span
                className="text-white/30"
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                New Releases
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            </div>

            <div className="divide-y divide-white/[0.04]">
              {pinnedJourneys.map(({ journey, realm }) => {
                const isActive = activeJourney?.id === journey.id;
                const accent = realm.palette.accent;
                return (
                  <div
                    key={journey.id}
                    className="py-4 cursor-pointer group transition-colors"
                    style={{
                      backgroundColor: isActive ? "rgba(255,255,255,0.03)" : "transparent",
                      borderLeft: isActive ? `2px solid ${accent}` : "2px solid transparent",
                      paddingLeft: "12px",
                    }}
                    onClick={() => handleJourneyClick(journey)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        {completedJourneyIds.includes(journey.id) && (() => {
                          const jp = getPathForJourney(journey.id);
                          return jp ? (
                            <div
                              className="shrink-0 mt-2"
                              style={{
                                width: "4px",
                                height: "4px",
                                borderRadius: "50%",
                                backgroundColor: jp.palette.accent,
                              }}
                            />
                          ) : null;
                        })()}
                        <div className="min-w-0 flex-1">
                          <span
                            className="block text-white/85"
                            style={{
                              fontFamily: "var(--font-geist-sans)",
                              fontWeight: 300,
                              fontSize: "1rem",
                              lineHeight: 1.25,
                            }}
                          >
                            {journey.name}
                          </span>
                          <span
                            className="block text-white/35 mt-0.5"
                            style={{
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-geist-mono)",
                              lineHeight: 1.35,
                            }}
                          >
                            {journey.subtitle}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
                        className="text-white/45 mb-2"
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

          {/* ── Featured divider ── */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            <span
              className="text-white/30"
              style={{
                fontSize: "0.65rem",
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Featured
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
          </div>


          {/* ── Mobile List — md:hidden ── */}
          <div className="md:hidden">

          {/* ── Realm Sections (excluding pinned) ── */}
          {groupedByRealm.map(({ realm, journeys: allJourneys }) => {
            const journeys = allJourneys.filter(j => !pinnedSet.has(j.id));
            if (journeys.length === 0) return null;
            return (
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
                  className="text-white/35"
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
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {completedJourneyIds.includes(journey.id) && (() => {
                            const jp = getPathForJourney(journey.id);
                            return jp ? (
                              <div
                                className="shrink-0 mt-2"
                                style={{
                                  width: "4px",
                                  height: "4px",
                                  borderRadius: "50%",
                                  backgroundColor: jp.palette.accent,
                                }}
                              />
                            ) : null;
                          })()}
                          <div className="min-w-0 flex-1">
                            <span
                              className="block text-white/85"
                              style={{
                                fontFamily: "var(--font-geist-sans)",
                                fontWeight: 300,
                                fontSize: "1rem",
                                lineHeight: 1.25,
                              }}
                            >
                              {journey.name}
                            </span>
                            <span
                              className="block text-white/35 mt-0.5"
                              style={{
                                fontSize: "0.75rem",
                                fontFamily: "var(--font-geist-mono)",
                                lineHeight: 1.35,
                              }}
                            >
                              {journey.subtitle}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
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
                          className="text-white/45 mb-2"
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
            );
          })}

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
                  const realm = journey.realmId !== "custom" ? REALMS.find((r) => r.id === journey.realmId) : null;
                  const accent = journey.theme?.palette?.accent ?? realm?.palette.accent ?? "#8b5cf6";
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
                        ensureResumed();
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
                            className="text-white/35 truncate"
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
                          className="text-white/45 mb-2"
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
              {restJourneys.map(({ journey, realm }) => {
                const isActive = activeJourney?.id === journey.id;
                const accent = realm.palette.accent;
                return (
                  <div
                    key={journey.id}
                    className={`jcard cursor-pointer group rounded-xl${isActive ? " jcard-active" : ""}`}
                    style={{
                      backgroundColor: isActive
                        ? `${accent}05`
                        : "rgba(255,255,255,0.01)",
                      border: `1px solid ${isActive ? `${accent}20` : "rgba(255,255,255,0.06)"}`,
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
                          className="text-white/35"
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

                    {/* Journey name + completion dot */}
                    <div className="flex items-center gap-2 mb-1">
                      {completedJourneyIds.includes(journey.id) && (() => {
                        const jp = getPathForJourney(journey.id);
                        return jp ? (
                          <div
                            className="shrink-0"
                            style={{
                              width: "4px",
                              height: "4px",
                              borderRadius: "50%",
                              backgroundColor: jp.palette.accent,
                            }}
                          />
                        ) : null;
                      })()}
                      <h3
                        className="text-white/85"
                        style={{
                          fontFamily: "var(--font-geist-sans)",
                          fontWeight: 300,
                          fontSize: "1.05rem",
                        }}
                      >
                        {journey.name}
                      </h3>
                    </div>

                    {/* Subtitle */}
                    <p
                      className="text-white/35 mb-2"
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
                        className="text-white/40 mb-3 line-clamp-2"
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
                    className="text-white/30"
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
                    const cRealm = journey.realmId !== "custom" ? REALMS.find((r) => r.id === journey.realmId) : null;
                    const accent = journey.theme?.palette?.accent ?? cRealm?.palette.accent ?? "#8b5cf6";
                    return (
                      <div
                        key={journey.id}
                        className={`jcard cursor-pointer group rounded-xl${isActive ? " jcard-active" : ""}`}
                        style={{
                          backgroundColor: isActive
                            ? `${accent}05`
                            : "rgba(255,255,255,0.01)",
                          border: `1px solid ${isActive ? `${accent}20` : "rgba(255,255,255,0.06)"}`,
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
                        {/* Top row: accent dot + name ... share + delete */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: accent,
                                boxShadow: `0 0 4px ${journey.theme?.palette?.glow ?? cRealm?.palette.glow ?? accent}30`,
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
                              {cRealm?.name?.toUpperCase() ?? "CUSTOM"}
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

          </>)}
          {/* end journeys view */}

        </div>
      </div>

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
