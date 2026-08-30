import { useEffect } from "react";
import { useAudioStore } from "./audio-store";
import { ensureResumed } from "./audio-engine";
import { fetchPackLocalImages, isPackActive } from "@/lib/offline/pack-client";
import { JOURNEYS, getJourney } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";

/**
 * Kiosk side of the phone remote (Tramokyo offline installation).
 *
 * Polls /api/pack/remote every 2s: posts a now-playing status snapshot
 * and executes any commands queued by the phone at /remote. Only runs
 * once the offline-pack probe confirms the kiosk (online the route
 * 404s and the probe never activates, so this is inert in production).
 *
 * Pass context=null to disable (e.g. the visualizer inside the attract
 * loop defers to the loop client's instance so only one poller runs).
 */
export type KioskRemoteContext = "loop" | "room" | null;

const POLL_MS = 2_000;

function runCommand(cmd: string, context: KioskRemoteContext): void {
  const store = useAudioStore.getState();
  if (cmd === "toggle-play") {
    store.togglePlayPause();
  } else if (cmd === "skip" && context === "loop") {
    window.dispatchEvent(new Event("installation-operator-skip"));
  } else if (cmd === "break" && context === "loop") {
    window.location.href = "/room";
  } else if (cmd === "loop" && context !== "loop") {
    window.location.href = "/room/installation?loop=1";
  } else if (cmd === "reload") {
    // Phone-remote recovery: a full page reload fixes most kiosk
    // wedges (dead shaders, stuck audio element, broken phase machine)
    // without anyone physically reaching the laptop. Valid in every
    // context — the attract loop re-enters on its own after reload.
    window.location.reload();
  } else if (cmd.startsWith("volume:")) {
    const v = Number(cmd.slice(7));
    if (Number.isFinite(v)) store.setVolume(v);
  } else if (cmd.startsWith("journey:") && context === "room") {
    void launchJourney(cmd.slice(8));
  } else if (cmd.startsWith("program:")) {
    // Jump the attract loop to a program's starting point. In the loop
    // context the client restarts in place; from anywhere else (e.g.
    // broken into /room) navigate back into the loop at that program —
    // the page already resolves ?start=<program-id>.
    const id = cmd.slice(8);
    if (context === "loop") {
      window.dispatchEvent(
        new CustomEvent("installation-operator-program", { detail: id })
      );
    } else {
      window.location.href = `/room/installation?loop=1&start=${encodeURIComponent(id)}`;
    }
  }
}

// Mirrors journey-selector's offline selectJourney branch — the selector
// can't launch while closed (its handler lives past an early return), and
// on the kiosk the pack route is always the right path anyway. Audio is
// already gesture-unlocked by the time a remote command can arrive.
async function launchJourney(id: string): Promise<void> {
  const journey =
    id === "random"
      ? JOURNEYS[Math.floor(Math.random() * JOURNEYS.length)]
      : getJourney(id);
  if (!journey) return;

  ensureResumed();
  const store = useAudioStore.getState();
  store.setAiImageEnabled(journey.aiEnabled);
  store.startJourney(journey.id);

  try {
    const params = new URLSearchParams();
    if (journey.recordingId) params.set("recordingId", journey.recordingId);
    const pairedSearch = PAIRED_TRACKS[journey.id];
    if (pairedSearch) params.set("search", pairedSearch);
    const res = await fetch(`/api/pack/resolve-track?${params}`);
    if (!res.ok) return;
    const { track, analysis, cues } = await res.json();
    if (!track) return;
    // A newer remote/user selection may have superseded this launch
    if (useAudioStore.getState().activeJourney?.id !== journey.id) return;
    useAudioStore.getState().play(
      {
        id: track.id,
        title: track.title,
        audioUrl: `/api/audio/${track.id}`,
        duration: track.duration ?? undefined,
        artist: track.artist ?? undefined,
      },
      0,
    );
    if (analysis) useAudioStore.getState().setAnalysis(analysis);
    const packCues = (cues ?? []) as { time: number; label: string }[];
    if (packCues.length > 0 && track.duration) {
      useAudioStore.getState().setCueMarkers(packCues);
      getJourneyEngine().setEvents(
        packCues.map((c) => ({ time: c.time, type: "bass_hit" as const, intensity: 1.0 })),
        track.duration,
      );
    }
  } catch { /* pack route unreachable — visuals still started */ }
}

export function useKioskRemote(context: KioskRemoteContext): void {
  useEffect(() => {
    if (!context) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      const s = useAudioStore.getState();
      try {
        const res = await fetch("/api/pack/remote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "kiosk",
            status: {
              context,
              journey: s.activeJourney?.name ?? null,
              track: s.currentTrack?.title ?? null,
              isPlaying: s.isPlaying,
              currentTime: Math.round(s.currentTime),
              duration: Math.round(s.duration),
              volume: s.volume,
            },
          }),
        });
        if (!res.ok || stopped) return;
        const { commands } = (await res.json()) as { commands?: string[] };
        for (const cmd of commands ?? []) runCommand(cmd, context);
      } catch { /* hotspot-local fetch; transient failures are fine */ }
    };

    void fetchPackLocalImages().then(() => {
      if (stopped || !isPackActive()) return;
      timer = setInterval(() => void tick(), POLL_MS);
      void tick();
    });

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [context]);
}
