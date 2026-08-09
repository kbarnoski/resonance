// ─────────────────────────────────────────────────────────────────────────────
// 7592-floatwell · audio.ts
//
// A deep, boundless cosmic-ambient drone for the sensory-deprivation float.
// It is deliberately meditative, not melodic: a just-intonation detuned drone
// bed (shared `droneBank`) fed through a vast code-generated convolution void
// (shared `convolutionVoid`), plus a single slowly-rotating overtone that phases
// in as the descent deepens. There is NO percussion, NO melody — only a low
// drone whose amplitude swells with the viewer's breath and whose spectrum
// slowly opens with depth.
//
//   graph:  droneBank ─┐
//           shimmer  ──┤→ breathGain → voidReverb → master → destination
//
//   • breathGain    — modulated per rAF frame by the breath phase (the swell).
//   • voidReverb    — 6 s cistern tail, mostly wet, for boundlessness.
//   • master        — 4 s fade-in on start, fade-out on stop.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { createVoidReverb } from "../_shared/visionary/convolutionVoid";

type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export interface VoidAudio {
  ctx: AudioContext;
  /** Slow descent depth 0..1 → opens the drone spectrum + reveals the overtone. */
  setDepth(d: number): void;
  /** Per-frame breath swell 0..1 → amplitude of the whole bed. */
  setBreath(swell: number): void;
  /** Graceful teardown: fade, stop oscillators, close context. */
  stop(): void;
}

const ROOT = 55; // A1 — a low, calm foundation.

/** Boot the whole void audio graph. Returns null if Web Audio is unavailable. */
export function startVoidAudio(): VoidAudio | null {
  const w = window as WebAudioWindow;
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  void ctx.resume();

  const now = ctx.currentTime;

  // ── master with a slow bloom-in ───────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.5, now + 4);
  master.connect(ctx.destination);

  // ── vast void reverb: mostly wet, long dark tail ──────────────────────────
  const reverb = createVoidReverb(ctx, { seconds: 6, decay: 2.2, wet: 0.74 });
  reverb.output.connect(master);

  // ── breath swell gain: the whole bed passes through here ──────────────────
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.7;
  breathGain.connect(reverb.input);

  // ── just-intonation drone bed (calm sub → gently opening) ─────────────────
  const drone: DroneBank = startDroneBank(ctx, breathGain, {
    root: ROOT,
    // 1, 3/2, 2, 9/4, 3 → A1 · E2 · A2 · B2 · E3 — an open, spacious just chord.
    ratios: [1, 3 / 2, 2, 9 / 4, 3],
    cutoffLow: 150,
    cutoffHigh: 1300,
    peakGain: 0.42,
  });

  // ── a single slowly-rotating overtone that emerges with depth ─────────────
  // 5th harmonic of the root (a just major third, two octaves up): consonant,
  // bell-like. Slow frequency + amplitude LFOs make it feel like it rotates.
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = ROOT * 5; // 275 Hz

  const detuneLfo = ctx.createOscillator();
  detuneLfo.type = "sine";
  detuneLfo.frequency.value = 0.05;
  const detuneDepth = ctx.createGain();
  detuneDepth.gain.value = 6; // ±6 cents
  detuneLfo.connect(detuneDepth);
  detuneDepth.connect(shimmer.detune);

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0001; // opens with depth via setDepth()
  shimmer.connect(shimmerGain);
  shimmerGain.connect(breathGain);

  const ampLfo = ctx.createOscillator();
  ampLfo.type = "sine";
  ampLfo.frequency.value = 0.07;
  const ampLfoDepth = ctx.createGain();
  ampLfoDepth.gain.value = 0.02;
  ampLfo.connect(ampLfoDepth);
  ampLfoDepth.connect(shimmerGain.gain); // adds around the center set by setDepth

  shimmer.start();
  detuneLfo.start();
  ampLfo.start();

  let stopped = false;

  return {
    ctx,
    setDepth(d: number) {
      if (stopped) return;
      const depth = Math.min(1, Math.max(0, d));
      const t = ctx.currentTime;
      drone.setDrive(depth * 0.85);
      // overtone center gain rises with depth (quiet — the sub stays foundation).
      shimmerGain.gain.setTargetAtTime(0.012 + depth * 0.05, t, 0.4);
    },
    setBreath(swell: number) {
      if (stopped) return;
      const s = Math.min(1, Math.max(0, swell));
      // 0.5..1.0 range — the drone never fully disappears, it breathes.
      breathGain.gain.setTargetAtTime(0.5 + 0.5 * s, ctx.currentTime, 0.06);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      } catch {
        /* context already closing */
      }
      drone.stop();
      const killAt = t + 0.9;
      for (const osc of [shimmer, detuneLfo, ampLfo]) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      window.setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      }, 1100);
    },
  };
}
