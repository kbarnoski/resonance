import { useEffect } from "react";
import { useAudioStore } from "./audio-store";
import { ensureResumed, getAnalyserNode } from "./audio-engine";
import { isKineticJourneyName } from "@/lib/journeys/kinetic";
import { fetchPackLocalImages, isPackActive } from "@/lib/offline/pack-client";
import { JOURNEYS, getJourney } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getParticlePresent } from "@/lib/journeys/particle-presence";
import { disableParticlesForSession } from "@/lib/particles/shared-engine";
import { PARTICLES_SESSION_KEY } from "@/lib/journeys/particle-lead";

// Rolling frame-rate meter (2026-10-05: a steady slowdown never trips the
// >50ms gap recorder — Karel saw journeys crawl while the log stayed clean).
const frameTimes: number[] = [];
let frameMeterStarted = false;
function startFrameMeter(): void {
  if (frameMeterStarted || typeof window === "undefined") return;
  frameMeterStarted = true;
  let last = performance.now();
  const tick = (now: number) => {
    frameTimes.push(now - last);
    last = now;
    if (frameTimes.length > 600) frameTimes.splice(0, frameTimes.length - 600);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
/** fps and p95 frame ms over roughly the last 3 s */
function frameStats(): { fps: number; p95: number } | null {
  const recent: number[] = [];
  let acc = 0;
  for (let i = frameTimes.length - 1; i >= 0 && acc < 3000; i--) { recent.push(frameTimes[i]); acc += frameTimes[i]; }
  if (recent.length < 5) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  return { fps: Math.round((recent.length / acc) * 1000), p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]) };
}

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
  } else if (cmd === "prev" && context === "loop") {
    window.dispatchEvent(new Event("installation-operator-prev"));
  } else if (cmd === "set-next" && context === "loop") {
    window.dispatchEvent(new CustomEvent("installation-operator-set", { detail: 1 }));
  } else if (cmd === "set-prev" && context === "loop") {
    window.dispatchEvent(new CustomEvent("installation-operator-set", { detail: -1 }));
  } else if (cmd === "break" && context === "loop") {
    window.location.href = "/room";
  } else if (cmd === "loop" && context !== "loop") {
    window.location.href = "/room/installation?loop=1";
  } else if (cmd === "particles-on" || cmd === "particles-default") {
    // session-only A/B switch (kiosk tab). No reload — a reloaded kiosk page
    // is autoplay-blocked; it takes effect on the next journey mount (jump).
    try {
      if (cmd === "particles-on") window.sessionStorage.setItem(PARTICLES_SESSION_KEY, "1");
      else window.sessionStorage.removeItem(PARTICLES_SESSION_KEY);
    } catch { /* storage blocked */ }
  } else if (cmd === "particles-off") {
    // A/B performance check on the real kiosk GPU without a reload
    disableParticlesForSession("remote: particles-off");
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
  } else if (cmd.startsWith("master:") && context === "loop") {
    const v = cmd.slice(7);
    window.dispatchEvent(new CustomEvent("installation-operator-master", { detail: v === "off" ? null : v }));
  } else if (cmd.startsWith("jump:")) {
    // Jump the loop to a specific journey (grouped phone browser). The
    // loop client resolves the journey id across its programs; outside
    // the loop, ?start=<journey-id> resolves it during page build.
    const jid = cmd.slice(5);
    if (context === "loop") {
      window.dispatchEvent(
        new CustomEvent("installation-operator-jump-journey", { detail: jid })
      );
    } else {
      window.location.href = `/room/installation?loop=1&start=${encodeURIComponent(jid)}`;
    }
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
  // Deterministic mode (2026-09-19): only journeys with an explicit
  // pairing are launchable — resolve-track 404s everything else, which
  // used to strand a silent journey with no operator feedback.
  const launchable = JOURNEYS.filter((j) => j.recordingId || PAIRED_TRACKS[j.id]);
  const journey =
    id === "random"
      ? launchable[Math.floor(Math.random() * launchable.length)]
      : getJourney(id);
  if (!journey) return;

  ensureResumed();
  // Close the kiosk's selector/library overlays — an auto-opened
  // journey browser otherwise sits opaque over the launched visuals.
  window.dispatchEvent(new Event("kiosk-remote-journey-launch"));
  const store = useAudioStore.getState();
  store.setAiImageEnabled(journey.aiEnabled);
  store.startJourney(journey.id);

  try {
    const params = new URLSearchParams();
    if (journey.recordingId) params.set("recordingId", journey.recordingId);
    const pairedSearch = PAIRED_TRACKS[journey.id];
    if (pairedSearch) params.set("search", pairedSearch);
    const res = await fetch(`/api/pack/resolve-track?${params}`);
    if (!res.ok) {
      // Flight-record the strand instead of failing silently.
      void fetch("/api/pack/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: `dj-launch-failed ${journey.id} — no paired track (HTTP ${res.status})` }),
      }).catch(() => {});
      return;
    }
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

/** Build-freshness watchdog (Karel 2026-09-30: "i opened the app...
 *  im not sure its up to date which is a huge issue in our testing
 *  workflow"): a page opened from browser cache can be STALE even
 *  when the server is new. Poll the server's build id; on mismatch,
 *  reload once (sessionStorage-guarded against loops). Any stale
 *  window self-heals within ~20s of opening. */
function useBuildWatchdog(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const mine = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev";
    if (mine === "dev") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { commit } = (await r.json()) as { commit?: string };
        if (commit && commit !== mine && commit !== "dev") {
          const key = `resonance-reload-${commit}`;
          if (sessionStorage.getItem(key)) return; // already tried once
          sessionStorage.setItem(key, "1");
          window.location.reload();
        }
      } catch { /* server briefly down — holding page handles it */ }
    }, 20_000);
    return () => clearInterval(id);
  }, [enabled]);
}

export function useKioskRemote(context: KioskRemoteContext): void {
  useBuildWatchdog(!!context);
  useEffect(() => {
    if (!context) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      const s = useAudioStore.getState();
      try {
        const res = await fetch(`/api/pack/remote${typeof window !== "undefined" && new URLSearchParams(window.location.search).get("key") ? `?key=${new URLSearchParams(window.location.search).get("key")}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "kiosk",
            status: {
              context,
              // Build identity — the deploy script polls this to verify
              // the PAGE (not just the server) is running the new build
              // (2026-09-30: two deploys ran under a stale page).
              build: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev",
              // Kinetic diagnostics (2026-09-30: "i see nothing
              // responding to sound" — this pinpoints the dead link).
              diag: {
                ar: s.activeJourney?.audioReactive ?? null,
                kin: isKineticJourneyName(s.activeJourney?.name),
                an: !!getAnalyserNode(),
                // Particle engine state (2026-10-05 kiosk verification):
                // "on" = drawing now, "idle" = enabled but not presenting,
                // otherwise the failsafe's disable reason.
                pt:
                  ((window as unknown as Record<string, unknown>).__resonanceParticlesDisabled as string | undefined) ??
                  (getParticlePresent() ? "on" : "idle"),
                fr: (startFrameMeter(), frameStats()),
                // is the kiosk window actually visible? (hidden = Chrome pauses drawing)
                vis: typeof document !== "undefined" ? document.visibilityState : null,
              },
              // Karel 2026-09-20: the remote must ALWAYS name what is on
              // screen. Between journeys the loop publishes a phase label
              // (set title card / dedication) on window; fall back to it.
              journey:
                s.activeJourney?.name ??
                ((window as unknown as Record<string, unknown>)
                  .__resonanceKioskPhaseLabel as string | undefined) ??
                null,
              track: s.currentTrack?.title ?? null,
              isPlaying: s.isPlaying,
              currentTime: Math.round(s.currentTime),
              duration: Math.round(s.duration),
              volume: s.volume,
              programs:
                (window as unknown as Record<string, unknown>)
                  .__resonanceKioskPrograms ?? null,
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
