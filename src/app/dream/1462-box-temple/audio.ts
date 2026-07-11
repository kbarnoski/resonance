// ─────────────────────────────────────────────────────────────────────────────
// 1462-box-temple · audio.ts — the temple resonates as you travel through it.
//
//   A bank of high-Q band-pass "corridor" voices. Each frame the CPU marches the
//   SAME Mandelbox fold at the camera (mandelbox.ts) and hands us:
//     • per-iteration radii  → each iteration that FOLDED lights one voice, whose
//       pitch is read CONTINUOUSLY from that iteration's radius (the local temple
//       dimension). Pitches are NOT snapped to any scale — they are inharmonic,
//       alien, and set directly by the geometry. That is the point.
//     • fold counts          → density → drive: deeper folding = more voices, more
//       intense, opens the drone bed and the voice presence.
//     • DE at the camera      → proximity to a wall → reverb send + brightness:
//       gliding close = near, present, dry; open chamber = distant, reverberant.
//   Crossing a fold boundary (total fold count changes) fires a resonant PING —
//   a transient excitation of one voice.
//
//   Safety: master ramps from silence, peaks ≤ 0.22, DynamicsCompressor limiter
//   before destination, ≤ 8 corridor voices + one low bed. Deterministic noise.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import type { FoldSample } from "./mandelbox";

const NVOICES = 8;
const F_MIN = 95;
const F_MAX = 1500;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map a temple radius to a frequency — log-continuous, never scale-snapped. */
function radiusToFreq(r: number): number {
  const lo = 0.08;
  const hi = 8;
  const rc = Math.min(hi, Math.max(lo, r));
  const n = (Math.log(rc) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return F_MIN * Math.pow(F_MAX / F_MIN, n);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

interface Voice {
  bp: BiquadFilter;
  sine: OscillatorNode;
  sineGain: GainNode;
  sustain: GainNode;
  ping: GainNode;
  freq: number;
}

export interface TempleAudio {
  /** Feed the current camera fold-sample; drive is the 0..1 fold intensity. */
  update(sample: FoldSample, drive: number): void;
  /** Excite one voice transiently (fold-boundary crossing). */
  pulse(voiceIndex: number, strength: number): void;
  /** Smoothed 0..1 activity, for the visual glow. */
  level(): number;
  stop(): void;
}

type BiquadFilter = BiquadFilterNode;

export function makeTempleAudio(ctx: AudioContext, peak: number): TempleAudio {
  const now = ctx.currentTime;

  // ── master chain: bus → limiter → destination, ramp from silence ──
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.min(0.22, peak), now + 3.0);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(12, now);
  limiter.ratio.setValueAtTime(14, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.22, now);

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── cavernous reverb: voice bus runs THROUGH it, wet set by wall proximity ──
  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 5.5, decay: 2.6, wet: 0.5 });
  reverb.output.connect(master);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 0.5;
  voiceBus.connect(reverb.input);

  // ── shared deterministic noise source, fanned into every band-pass ──
  const rnd = mulberry32(0x1462b0c5);
  const noiseLen = Math.floor(ctx.sampleRate * 2);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = rnd() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  // ── the corridor voices ──
  const voices: Voice[] = [];
  for (let i = 0; i < NVOICES; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 220;
    bp.Q.value = 18;

    const sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.value = 220;
    const sineGain = ctx.createGain();
    sineGain.gain.value = 0.18;

    const sustain = ctx.createGain();
    sustain.gain.value = 0.0001;
    const ping = ctx.createGain();
    ping.gain.value = 1;

    noise.connect(bp);
    bp.connect(sustain);
    sine.connect(sineGain);
    sineGain.connect(sustain);
    sustain.connect(ping);
    ping.connect(voiceBus);

    sine.start();
    voices.push({ bp, sine, sineGain, sustain, ping, freq: 220 });
  }
  noise.start();

  // ── low inharmonic bed (NOT a just chord — fractal-derived ratios) ──
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 44,
    ratios: [1, 1.34, 1.78, 2.29, 2.97],
    cutoffLow: 150,
    cutoffHigh: 1700,
    peakGain: 0.1,
  });

  let levelSmooth = 0;
  let stopped = false;

  return {
    update(sample: FoldSample, drive: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const de = sample.de;

      // wall proximity: small DE = near a surface = present & dry; open = wet
      const proximity = clamp(1 - de / 0.12, 0, 1); // 1 near wall, 0 open
      reverb.setWet(0.72 - 0.42 * proximity);

      // density → drive the bed
      const density = clamp((sample.boxFolds + sample.sphereFolds) / 20, 0, 1);
      drone.setDrive(clamp(0.35 * density + 0.65 * drive, 0, 1));

      // each folded iteration lights one voice at its radius-derived pitch
      const n = Math.min(NVOICES, sample.radii.length);
      let active = 0;
      for (let i = 0; i < NVOICES; i++) {
        const v = voices[i];
        if (i < n && sample.folded[i]) {
          active++;
          const f = radiusToFreq(sample.radii[i]);
          v.freq = f;
          v.bp.frequency.setTargetAtTime(f, t, 0.08);
          v.sine.frequency.setTargetAtTime(f, t, 0.08);
          // near a wall the voices sit present & resonant; open = softer
          v.bp.Q.setTargetAtTime(12 + 22 * proximity, t, 0.15);
          const g = (0.16 + 0.16 * proximity + 0.12 * drive) / Math.sqrt(active + 1);
          v.sustain.gain.setTargetAtTime(g, t, 0.12);
        } else {
          v.sustain.gain.setTargetAtTime(0.0001, t, 0.25);
        }
      }

      const target = 0.25 * proximity + 0.55 * density + 0.2 * drive;
      levelSmooth += (clamp(target, 0, 1) - levelSmooth) * 0.1;
    },

    pulse(voiceIndex: number, strength: number) {
      if (stopped) return;
      const v = voices[voiceIndex % NVOICES];
      const t = ctx.currentTime;
      const s = 1 + clamp(strength, 0, 1.4);
      v.ping.gain.cancelScheduledValues(t);
      v.ping.gain.setValueAtTime(Math.max(0.5, v.ping.gain.value), t);
      v.ping.gain.linearRampToValueAtTime(s, t + 0.008);
      v.ping.gain.setTargetAtTime(1, t + 0.01, 0.14);
    },

    level() {
      return levelSmooth;
    },

    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      } catch {
        /* closing */
      }
      const killAt = t + 0.6;
      try {
        noise.stop(killAt);
      } catch {
        /* already stopped */
      }
      for (const v of voices) {
        try {
          v.sine.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      drone.stop();
    },
  };
}
