// ─────────────────────────────────────────────────────────────────────────────
// 9944-restrata · audio.ts — a never-silent spectral void with N INDEPENDENT
// voices, one per visual stratum.
//
//   • an ever-present inharmonic drone bed sits underneath forever.
//   • N "stratum voices" — each a small stack of stretched (inharmonic) partials
//     on its own fundamental, panned to its own place in the stereo field so the
//     strata scatter across many streams. Each voice blooms with an envelope the
//     page hands in per frame, sampled at (t + offset_i): its OWN timeline.
//   • everything routes through a long convolution reverb, then the ear-safety
//     master bus.
//
//   This module never sees the offsets. The page samples the SAME swell shape at
//   a DIFFERENT time per voice and hands the results here — that is the whole
//   trick. When every voice's envelope is driven at t (all bound) the strata
//   bloom as one event; as they drift, each voice pulses on its own clock.
//
//   No Math.random / Date.now anywhere — the reverb IR and drone are deterministic.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb } from "../_shared/visionary/convolutionVoid";
import { startDroneBank } from "../_shared/visionary/droneBank";
import { STRATA } from "./void-gl";

export interface VoidAudio {
  /** Feed the per-stratum (already time-shifted) swell envelopes 0..1 per frame. */
  setEnvelopes(env: number[]): void;
  /** Feed the per-stratum bind amount 0..1 (1 bound) — bound voices lock in. */
  setBound(bound: number[]): void;
  stop(): void;
}

// Inharmonic / spectral drone bed — irrational, non-pentatonic, non-JI.
const DRONE_RATIOS = [1, Math.SQRT2, Math.sqrt(5), Math.sqrt(7), 3];

// Per-stratum fundamentals: a stretched inharmonic ladder (NOT a chord).
// Inner ring = low, outer ring = high, mirroring the visual radii.
const VOICE_FUNDAMENTALS = [55.0, 84.2, 132.6, 183.7, 253.4];
// Each voice adds one stretched partial (bar-mode-ish) for a bell-like shimmer.
const PARTIAL_STRETCH = 2.76;

export function makeVoidAudio(ctx: AudioContext): VoidAudio {
  const master = createSafeMaster(ctx, { gain: 0.17 });

  const reverb = createVoidReverb(ctx, { seconds: 6.5, decay: 2.3, wet: 0.8 });
  reverb.output.connect(master.input);

  // ── ever-present inharmonic drone bed ──
  const drone = startDroneBank(ctx, reverb.input, {
    root: 44,
    ratios: DRONE_RATIOS,
    cutoffLow: 150,
    cutoffHigh: 700,
    peakGain: 0.16,
  });
  drone.setDrive(0.1);

  // ── N stratum voices, each on its own pan + filter ──
  interface Voice {
    gain: GainNode;
    lp: BiquadFilterNode;
    oscs: OscillatorNode[];
  }
  const voices: Voice[] = [];

  for (let i = 0; i < STRATA; i++) {
    const fund = VOICE_FUNDAMENTALS[i];

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + i * 250;
    lp.Q.value = 0.8;

    // scatter the strata across the stereo field
    const panner = ctx.createStereoPanner();
    panner.pan.value = ((i / (STRATA - 1)) * 2 - 1) * 0.85;

    gain.connect(lp);
    lp.connect(panner);
    panner.connect(reverb.input);

    const oscs: OscillatorNode[] = [];
    // fundamental + one stretched partial (quieter)
    const specs: Array<{ mul: number; g: number; detune: number }> = [
      { mul: 1, g: 0.55, detune: i % 2 === 0 ? 4 : -4 },
      { mul: PARTIAL_STRETCH, g: 0.22, detune: i % 2 === 0 ? -6 : 6 },
    ];
    for (const s of specs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * s.mul;
      osc.detune.value = s.detune;
      const g = ctx.createGain();
      g.gain.value = s.g;
      osc.connect(g);
      g.connect(gain);
      osc.start();
      oscs.push(osc);
    }

    voices.push({ gain, lp, oscs });
  }

  let stopped = false;

  return {
    setEnvelopes(env: number[]) {
      if (stopped) return;
      const now = ctx.currentTime;
      let sum = 0;
      for (let i = 0; i < voices.length; i++) {
        const e = Math.min(1, Math.max(0, env[i] ?? 0));
        sum += e;
        voices[i].gain.gain.setTargetAtTime(0.0001 + e * 0.14, now, 0.03);
      }
      // the drone gains a little body under the collective swell
      drone.setDrive(0.1 + 0.12 * (sum / Math.max(1, voices.length)));
    },
    setBound(bound: number[]) {
      if (stopped) return;
      const now = ctx.currentTime;
      for (let i = 0; i < voices.length; i++) {
        const b = Math.min(1, Math.max(0, bound[i] ?? 0));
        // a bound voice opens up and sits forward; an adrift voice stays darker
        voices[i].lp.frequency.setTargetAtTime(700 + i * 220 + b * 1400, now, 0.2);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      for (const v of voices) {
        try {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
          v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        } catch {
          /* ctx closing */
        }
        for (const osc of v.oscs) {
          try {
            osc.stop(now + 0.7);
          } catch {
            /* already stopped */
          }
        }
      }
      drone.stop();
      master.disconnect();
    },
  };
}
