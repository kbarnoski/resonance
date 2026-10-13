import { useEffect } from "react";
import { useAudioStore } from "./audio-store";
import { ensureResumed, getAnalyserNode } from "./audio-engine";
import { isFullKineticJourney } from "@/lib/journeys/kinetic";
import { fetchPackLocalImages, isPackActive } from "@/lib/offline/pack-client";
import { JOURNEYS, getJourney } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getParticlePresent } from "@/lib/journeys/particle-presence";
import { disableParticlesForSession } from "@/lib/particles/shared-engine";
import { glitchRecord } from "@/lib/journeys/glitch-recorder";
import { PARTICLES_SESSION_KEY } from "@/lib/journeys/particle-lead";
import {
  parsePresenterCommand,
  presenterReduce,
  restorePresenter,
  serializePresenter,
  PRESENTER_STORAGE_KEY,
} from "./presenter-machine";
import { useVjBridge } from "@/lib/vj-bridge/use-vj-bridge";

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
export type KioskRemoteContext = "loop" | "room" | "live" | null;

const POLL_MS = 2_000;
/** Gap between long-polls (the parked request itself lasts ≤ 1.5 s). */
const KIOSK_GAP_MS = 300;

/** PRESENTER (song by song) commands — presenter-machine.ts. In the loop
 *  they drive the loop client; elsewhere (Live Theatre / DJ room) settings
 *  are stored for the loop to pick up, and NEXT / play-now enter the loop. */
function runPresenterCommand(cmd: string, context: KioskRemoteContext): boolean {
  const ev = parsePresenterCommand(cmd);
  if (!ev) return false;
  if (context === "loop") {
    window.dispatchEvent(new CustomEvent("installation-presenter", { detail: ev }));
    return true;
  }
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(PRESENTER_STORAGE_KEY); } catch { /* storage blocked */ }
  const state = restorePresenter(raw);
  const kiosk = context === "live" ? "&kiosk=1" : "";
  if (ev.type === "next" || ev.type === "play-now") {
    const target = ev.type === "play-now" ? ev.ref : state.cued;
    const start = target ? `${target.journeyId}@${target.programId}` : state.setId;
    if (ev.type === "play-now") {
      try { window.localStorage.setItem(PRESENTER_STORAGE_KEY, serializePresenter({ ...state, cued: null })); } catch { /* ok */ }
    }
    window.location.href = `/room/installation?loop=1${start ? `&start=${encodeURIComponent(start)}` : ""}${kiosk}`;
    return true;
  }
  if (ev.type === "set-playback" || ev.type === "set-hold-on" || ev.type === "set-set" || ev.type === "cue" || ev.type === "clear-cue") {
    const next = presenterReduce(state, ev, []).state;
    try { window.localStorage.setItem(PRESENTER_STORAGE_KEY, serializePresenter(next)); } catch { /* ok */ }
  }
  return true;
}

function runCommand(cmd: string, context: KioskRemoteContext): void {
  const store = useAudioStore.getState();
  if (runPresenterCommand(cmd, context)) return;
  if (cmd.startsWith("mark:")) {
    // MARK (Karel 2026-10-12): he taps "Mark glitch" the moment he sees one;
    // the phone's send time puts it on the exact second of the track (the
    // kiosk only polls every 2 s), so the recorder + footage find the frame
    const sent = Number(cmd.slice(5)) || Date.now();
    const lag = Math.max(0, Math.min(10, (Date.now() - sent) / 1000));
    const t = Math.max(0, (store.currentTime || 0) - lag);
    glitchRecord("karel-mark", `${store.activeJourney?.name ?? "?"} @${t.toFixed(1)}s (lag ${lag.toFixed(1)}s)`);
  } else if (cmd === "toggle-play") {
    store.togglePlayPause();
  } else if (cmd === "live" && context !== "live") {
    // LIVE THEATRE (Karel 2026-10-11): he plays the Nord; the kiosk listens
    // and wanders the catalogue (live-theatre-client.tsx). Full page load.
    window.location.href = "/room/installation?live=1&kiosk=1";
  } else if (cmd === "skip" && context === "live") {
    window.dispatchEvent(new Event("live-next"));
  } else if (cmd === "skip" && context === "loop") {
    window.dispatchEvent(new Event("installation-operator-skip"));
  } else if (cmd === "prev" && context === "loop") {
    window.dispatchEvent(new Event("installation-operator-prev"));
  } else if (cmd === "set-next" && context === "loop") {
    window.dispatchEvent(new CustomEvent("installation-operator-set", { detail: 1 }));
  } else if (cmd === "set-prev" && context === "loop") {
    window.dispatchEvent(new CustomEvent("installation-operator-set", { detail: -1 }));
  } else if (cmd === "title-hold") {
    // Karel 2026-10-10: "go to the title screen with piano and resonance hanging
    // out … introduce it and leave it up until i formally start" — the loop
    // fades out and HOLDS the statement card until "title-release"
    if (context === "loop") window.dispatchEvent(new Event("installation-operator-title-hold"));
    else window.location.href = `/room/installation?loop=1&titlehold=1${context === "live" ? "&kiosk=1" : ""}`;
  } else if (cmd === "title-release" && context === "loop") {
    window.dispatchEvent(new Event("installation-operator-title-release"));
  } else if (cmd === "break" && context === "loop") {
    window.location.href = "/room";
  } else if (cmd === "loop" && context !== "loop") {
    window.location.href = context === "live" ? "/room/installation?loop=1&kiosk=1" : "/room/installation?loop=1";
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
    // "jump:<jid>@<program id>" — the program the piece was tapped under
    // (Rise Above borrows album pieces, so a journey id alone is ambiguous).
    const [jid, programId] = cmd.slice(5).split("@");
    if (context === "loop") {
      window.dispatchEvent(
        new CustomEvent("installation-operator-jump-journey", { detail: programId ? `${jid}@${programId}` : jid })
      );
    } else {
      window.location.href = `/room/installation?loop=1&start=${encodeURIComponent(programId ? `${jid}@${programId}` : jid)}${context === "live" ? "&kiosk=1" : ""}`;
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
      window.location.href = `/room/installation?loop=1&start=${encodeURIComponent(id)}${context === "live" ? "&kiosk=1" : ""}`;
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
  // VJ bridge (TouchDesigner / Resolume via scripts/osc-relay.mjs): every
  // kiosk context mounts this hook, so the bridge runs wherever the show
  // does. Off unless ?osc=1 / the kiosk setting — then a no-op (ref-counted).
  useVjBridge();
  useEffect(() => {
    if (!context) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const key = new URLSearchParams(window.location.search).get("key");
    // LONG-POLL (2026-10-13, "no delays"): the bus parks this request until a
    // phone command arrives (≤ 1.5 s), so taps reach the kiosk in ms; the
    // status still goes up every ~1.8 s, and right after every command.
    const url = `/api/pack/remote?wait=1${key ? `&key=${encodeURIComponent(key)}` : ""}`;
    const schedule = (ms: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      const s = useAudioStore.getState();
      let next = POLL_MS;
      try {
        const res = await fetch(url, {
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
                kin: isFullKineticJourney(s.activeJourney),
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
              // Live Theatre: "MIDI: Nord Stage 3 connected · 12 notes/min" (midi-input.ts)
              midi:
                ((window as unknown as Record<string, unknown>).__resonanceMidiStatus as string | null | undefined) ?? null,
              programs:
                (window as unknown as Record<string, unknown>)
                  .__resonanceKioskPrograms ?? null,
              // PRESENTER: playback (auto / manual = song by song), hold
              // setting, status (playing / fading / holding / going), the
              // set playing from, current, cued and what NEXT will play
              presenter:
                (context === "loop"
                  ? (window as unknown as Record<string, unknown>).__resonancePresenter
                  : null) ?? null,
            },
          }),
        });
        if (stopped) return;
        if (res.ok) {
          const { commands } = (await res.json()) as { commands?: string[] };
          for (const cmd of commands ?? []) runCommand(cmd, context);
          // ECHO at once (lab 2026-10-13: playback:auto still read "manual" on
          // the phone 3 s later): this POST's status was snapshotted BEFORE the
          // commands ran — post the fresh status right away.
          next = (commands?.length ?? 0) > 0 ? 150 : KIOSK_GAP_MS;
        }
      } catch { /* hotspot-local fetch; transient failures are fine */ }
      schedule(next);
    };

    void fetchPackLocalImages().then(() => {
      if (stopped || !isPackActive()) return;
      void tick();
    });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [context]);
}
