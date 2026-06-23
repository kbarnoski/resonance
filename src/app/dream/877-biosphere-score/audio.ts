/*
 * 877 · BIOSPHERE SCORE — audio engine (Web Audio API only)
 *
 * Signal chain (safety-first):
 *   voices → masterGain(0.22) → lowpass → compressor(-10dB, 20:1) → destination
 *   masterGain → analyser  (TAP ONLY — never routed to destination)
 *
 * An always-on ambient pad keeps the piece from ever being silent. Soft
 * attacks (≥30ms) everywhere. AudioContext is resumed inside the Start tap
 * for iOS. Each incoming observation triggers ONE event in its section's
 * voice; the harmony module decides the pitch, so it is always consonant.
 */

import type { Section } from "./structure";
import { midiToFreq } from "./structure";

export type AudioEngine = {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  analyser: AnalyserNode;
  padGain: GainNode;
  padOscs: OscillatorNode[];
  padFilter: BiquadFilterNode;
  freqData: Uint8Array<ArrayBuffer>;
};

type AudioCtor = typeof AudioContext;

export function createAudioEngine(): AudioEngine | null {
  const Ctor: AudioCtor | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.22;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7000;
  lowpass.Q.value = 0.4;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 20;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  const freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

  // master → lowpass → compressor → destination
  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);
  // master → analyser (tap only, NOT to destination)
  master.connect(analyser);

  // Always-on ambient drone: two slightly detuned saws through a soft lowpass.
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 600;
  padFilter.Q.value = 0.7;
  padGain.connect(padFilter);
  padFilter.connect(master);

  const padOscs: OscillatorNode[] = [];
  for (const f of [55, 55.3, 82.5]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.connect(padGain);
    o.start();
    padOscs.push(o);
  }
  // Fade the pad in softly.
  padGain.gain.setTargetAtTime(0.18, ctx.currentTime, 1.2);

  return { ctx, master, lowpass, analyser, padGain, padOscs, padFilter, freqData };
}

/**
 * Update the always-on pad to reflect the long-form arc.
 * `richness` (0..1) opens the filter and thickens the drone; `density`
 * (0..1) nudges brightness. Smooth, slow changes only.
 */
export function applyArc(engine: AudioEngine, richness: number, density: number): void {
  const t = engine.ctx.currentTime;
  const cutoff = 420 + richness * 1600 + density * 500;
  engine.padFilter.frequency.setTargetAtTime(cutoff, t, 1.5);
  engine.padGain.gain.setTargetAtTime(0.14 + richness * 0.12, t, 1.5);
  // Master lowpass also brightens as the ensemble fills out.
  engine.lowpass.frequency.setTargetAtTime(4500 + richness * 5000, t, 1.5);
}

function pan(ctx: AudioContext, value: number): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, value));
  return p;
}

/**
 * Trigger one section voice at a chosen MIDI pitch. `intensity` (0..1) scales
 * loudness for accenting busy passages; `focused` brightens a soloed section.
 * All envelopes use ≥30ms attacks. Oscillators are short-lived and auto-stop.
 */
export function triggerVoice(
  engine: AudioEngine,
  section: Section,
  midi: number,
  panValue: number,
  intensity: number,
  focused: boolean
): void {
  const { ctx, master } = engine;
  const t = ctx.currentTime;
  const freq = midiToFreq(midi);
  const panner = pan(ctx, panValue);
  panner.connect(master);

  const baseGain = (focused ? 0.34 : 0.2) * (0.55 + intensity * 0.65);

  switch (section.voice) {
    case "flute": {
      // Bright sine + soft vibrato; long-ish bloom.
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vibGain = ctx.createGain();
      vibGain.gain.value = freq * 0.006;
      vib.connect(vibGain);
      vibGain.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(baseGain, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g);
      g.connect(panner);
      o.start(t);
      vib.start(t);
      o.stop(t + 1.7);
      vib.stop(t + 1.7);
      break;
    }
    case "cello": {
      // Warm sawtooth through a gentle lowpass; slow swell.
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = freq * 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(baseGain, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(lp);
      lp.connect(g);
      g.connect(panner);
      o.start(t);
      o.stop(t + 2.7);
      break;
    }
    case "pizz": {
      // Pizzicato/granular tick: triangle with a fast-but-soft pluck.
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(baseGain * 0.9, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g);
      g.connect(panner);
      o.start(t);
      o.stop(t + 0.34);
      break;
    }
    case "pad": {
      // Sustained pad swell — plants thicken the bed.
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(baseGain * 0.7, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.0);
      o.connect(g);
      o2.connect(g);
      g.connect(panner);
      o.start(t);
      o2.start(t);
      o.stop(t + 4.1);
      o2.stop(t + 4.1);
      break;
    }
    case "sub": {
      // Sub drone pulse for fungi — deep, slow.
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(baseGain * 0.8, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(g);
      g.connect(panner);
      o.start(t);
      o.stop(t + 3.5);
      break;
    }
    case "croak": {
      // Amphibian/reptile mid pluck with a quick downward bend.
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(freq * 1.06, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = freq * 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(baseGain * 0.85, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(lp);
      lp.connect(g);
      g.connect(panner);
      o.start(t);
      o.stop(t + 0.72);
      break;
    }
    case "bell":
    default: {
      // Watery mid bell for fish / other.
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 2.01;
      const g2 = ctx.createGain();
      g2.gain.value = 0.3;
      o2.connect(g2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(baseGain, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g);
      g2.connect(g);
      g.connect(panner);
      o.start(t);
      o2.start(t);
      o.stop(t + 1.9);
      o2.stop(t + 1.9);
      break;
    }
  }
}

export function readSpectrum(engine: AudioEngine): Uint8Array {
  engine.analyser.getByteFrequencyData(engine.freqData);
  return engine.freqData;
}

/** Full teardown: fade pad, stop oscillators, close context. */
export function destroyAudioEngine(engine: AudioEngine): void {
  const { ctx, padGain, padOscs } = engine;
  try {
    const t = ctx.currentTime;
    padGain.gain.cancelScheduledValues(t);
    padGain.gain.setTargetAtTime(0, t, 0.1);
    for (const o of padOscs) {
      try {
        o.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 400);
  } catch {
    void ctx.close().catch(() => {});
  }
}
