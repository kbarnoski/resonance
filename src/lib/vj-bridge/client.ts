// VJ bridge — the browser side. Wires VjBridgeCore to the real show: the
// audio store, the journey engine's frames, the particle lead layer's tap,
// MIDI notes and morph clips. OFF unless ?osc=1 / the kiosk setting
// (protocol.ts vjBridgeConfig); off = no socket, no timer, no listeners.
//
// Start it with useVjBridge() (use-vj-bridge.ts); run scripts/osc-relay.mjs
// beside the kiosk to turn the frames into OSC for TouchDesigner.

import { useAudioStore } from "@/lib/audio/audio-store";
import { getAnalyserNode } from "@/lib/audio/audio-engine";
import { getMidiState, type MidiEvent } from "@/lib/audio/midi-input";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getParticlePresent } from "@/lib/journeys/particle-presence";
import { onClipEnded, onClipStarted } from "@/lib/journeys/video-activity";
import { statementHoldActive } from "@/lib/particles/shared-engine";
import type { JourneyFrame } from "@/lib/journeys/types";
import { VjBridgeCore, type VjShowState, type WsLike } from "./bridge-core";
import { vjBridgeConfig } from "./protocol";
import { VJ_TAP } from "./tap";

/** The lead layer's bytes are used while they are this fresh. */
const TAP_FRESH_MS = 250;

let core: VjBridgeCore | null = null;
let refs = 0;
let teardown: (() => void) | null = null;

function storages(): { session: Storage | null; local: Storage | null } {
  let session: Storage | null = null, local: Storage | null = null;
  try { session = window.sessionStorage; } catch { /* blocked */ }
  try { local = window.localStorage; } catch { /* blocked */ }
  return { session, local };
}

/** Start (ref-counted: the loop + visualizer clients may both ask). Returns
 *  the release function. A no-op when the bridge is off. */
export function startVjBridge(): () => void {
  if (typeof window === "undefined") return () => {};
  const { session, local } = storages();
  const cfg = vjBridgeConfig(window.location.search, session, local);
  if (!cfg.on) return () => {};
  refs++;
  if (!core) {
    let latestFrame: JourneyFrame | null = null;
    let morph: { at: number; dur: number } | null = null;
    let fallbackBytes: Uint8Array | null = null;
    const engine = getJourneyEngine();
    const offFrame = engine.onFrame((f) => { latestFrame = f; }); // reference only
    const offStart = onClipStarted((e) => {
      if (!e.travel) return;
      morph = { at: e.at, dur: Number.isFinite(e.duration) && e.duration > 0 ? e.duration : 5 };
      VJ_TAP.events.push(["morph", 1, morph.dur]);
    });
    const offEnd = onClipEnded((e) => {
      if (!e.travel) return;
      morph = null;
      VJ_TAP.events.push(["morph", 0, 0]);
    });
    // MIDI (Live Theatre / ?midi=1): subscribe once the input exists
    let offMidi: (() => void) | null = null;
    const midiPoll = window.setInterval(() => {
      const m = getMidiState();
      if (!m || offMidi) return;
      offMidi = m.on((e: MidiEvent) => {
        if (e.type === "noteon") VJ_TAP.events.push(["note", e.note, e.velocity, e.at]);
        else if (e.type === "noteoff") VJ_TAP.events.push(["noteoff", e.note, e.at]);
        else if (e.type === "pedal") VJ_TAP.events.push(["pedal", e.down ? 1 : 0, e.at]);
      });
      window.clearInterval(midiPoll);
    }, 2000);

    const show = (): VjShowState => {
      const s = useAudioStore.getState();
      const j = s.activeJourney;
      const active = !!j && engine.isActive();
      const f = active ? latestFrame : null;
      const phaseIndex = j && f ? Math.max(0, j.phases.findIndex((p) => p.id === f.phase)) : 0;
      const now = performance.now();
      const morphOn = !!morph && now < morph.at + morph.dur * 1000 + 500;
      const label = (window as unknown as Record<string, unknown>).__resonanceKioskPhaseLabel;
      return {
        time: s.currentTime || 0,
        duration: s.duration || 0,
        playing: s.isPlaying,
        holding: statementHoldActive(),
        volume: s.volume,
        label: typeof label === "string" ? label : null,
        bpm: typeof s.analysis?.tempo === "number" ? s.analysis.tempo : null,
        journeyId: j?.id ?? null,
        journeyName: j?.name ?? null,
        phase: f?.phase ?? s.journeyPhase ?? null,
        phaseIndex,
        phaseCount: j?.phases.length ?? 0,
        phaseProgress: f?.phaseProgress ?? 0,
        progress: f?.progress ?? (s.duration ? (s.currentTime || 0) / s.duration : 0),
        themePalette: f ? [f.palette.primary, f.palette.secondary, f.palette.accent, f.palette.glow] : null,
        shader: active ? engine.getCurrentShaderMode() : s.vizMode,
        dualShader: f?.dualShaderMode ?? null,
        shaderOpacity: f?.shaderOpacity ?? (active ? 0 : 1),
        particlesOn: getParticlePresent(),
        morphOn,
        morphProgress: morphOn && morph ? Math.min(1, (now - morph.at) / (morph.dur * 1000)) : 0,
      };
    };

    const spectrum = (): ArrayLike<number> | null => {
      // prefer the lead layer's own buffer (already read this frame) — the
      // bridge adds no analyser reads while particles run
      if (VJ_TAP.bytes && performance.now() - VJ_TAP.bytesAt < TAP_FRESH_MS) return VJ_TAP.bytes;
      const a = getAnalyserNode();
      if (!a) return null;
      if (!fallbackBytes || fallbackBytes.length !== a.frequencyBinCount) fallbackBytes = new Uint8Array(a.frequencyBinCount);
      try { a.getByteFrequencyData(fallbackBytes as Uint8Array<ArrayBuffer>); } catch { return null; }
      return fallbackBytes;
    };

    core = new VjBridgeCore(cfg, {
      createSocket: (url) => new WebSocket(url) as unknown as WsLike,
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id as number),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
      now: () => performance.now(),
      spectrum,
      show,
    });
    core.start();
    (window as unknown as Record<string, unknown>).__resonanceVjBridge = core; // diagnostics (stats / connected)
    teardown = () => {
      offFrame(); offStart(); offEnd();
      offMidi?.();
      window.clearInterval(midiPoll);
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refs = Math.max(0, refs - 1);
    if (refs === 0 && core) {
      core.stop();
      core = null;
      teardown?.();
      teardown = null;
    }
  };
}
