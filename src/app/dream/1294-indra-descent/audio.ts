// 1294-indra-descent — audio.ts (OUTPUT ONLY, no mic)
//
// The packing is a JUST-INTONATION instrument. A circle's bend maps to PITCH —
// bigger circles (small bend) sound low, tiny deep circles sound high — quantised
// to a 5-limit just scale so tangent neighbours land on consonant intervals. One
// strike is scheduled as a whole CASCADE: the tangency-graph walk hands us a list
// of arrivals {freq, amp, whenSec} and we voice each on a pooled bank, so a single
// tap unfolds a decaying chord rippling outward along the tangent edges.
//
// Under it sits a low ROOT+FIFTH drone bed. Everything runs voices + drone →
// void reverb → DynamicsCompressor limiter → master gain (≤0.3, fade-in) → out.
// Full teardown on stop().

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_PEAK = 0.3;
const ROOT_HZ = 123.47; // ~B2 — a low, calm root

// 5-limit just intonation (Ptolemaic-ish), octave-folded so any degree is pure.
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];

/** Bend → frequency. Bigger circle (small |bend|) → lower tone. Quantised to the
 *  JI scale across octaves so struck circles and their neighbours harmonise. */
export function bendToFreq(bend: number): number {
  const b = Math.max(1, Math.abs(bend));
  // ~2.5 scale-steps per doubling of bend; seed circles rest near the root.
  const step = Math.max(0, Math.min(34, Math.round(Math.log2(b) * 2.5)));
  const oct = Math.floor(step / JI.length);
  const deg = ((step % JI.length) + JI.length) % JI.length;
  return ROOT_HZ * Math.pow(2, oct) * JI[deg];
}

interface Voice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  busyUntil: number;
}

export interface AudioEngine {
  /** Current AudioContext time in seconds (for scheduling a cascade). */
  now(): number;
  /** Voice one grain of the cascade. `size` 0..1 scales loudness + length. */
  strike(freq: number, amp: number, size: number, whenSec: number): void;
  /** Nudge the drone bed's brightness/level with recent activity 0..1. */
  swell(activity: number): void;
  stop(): void;
}

const VOICE_COUNT = 24;

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const t0 = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, t0 + 2.0);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-14, t0);
  limiter.knee.setValueAtTime(10, t0);
  limiter.ratio.setValueAtTime(16, t0);
  limiter.attack.setValueAtTime(0.003, t0);
  limiter.release.setValueAtTime(0.28, t0);
  limiter.connect(master);

  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.5 });
  reverb.output.connect(limiter);

  // Low root + fifth bed so the descent always rests on a chord.
  const drone: DroneBank = startDroneBank(ctx, reverb.input, {
    root: ROOT_HZ / 2,
    ratios: [1, 3 / 2, 2],
    cutoffLow: 80,
    cutoffHigh: 760,
    peakGain: 0.1,
  });
  drone.setDrive(0.06);

  // Soften the voices before the void; keep a little dry path for onset clarity.
  const voiceBus = ctx.createBiquadFilter();
  voiceBus.type = "lowpass";
  voiceBus.frequency.setValueAtTime(3400, t0);
  voiceBus.Q.setValueAtTime(0.5, t0);
  voiceBus.connect(reverb.input);
  const dryTap = ctx.createGain();
  dryTap.gain.setValueAtTime(0.5, t0);
  voiceBus.connect(dryTap);
  dryTap.connect(limiter);

  // ── Pooled bell-ish voices: a partial + a soft sub-octave ──
  const voices: Voice[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 4 === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(ROOT_HZ, t0);
    osc.detune.setValueAtTime(i % 2 === 0 ? -2.5 : 2.5, t0);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(ROOT_HZ / 2, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    osc.connect(gain);
    sub.connect(gain);
    gain.connect(voiceBus);
    osc.start();
    sub.start();
    voices.push({ osc, sub, gain, busyUntil: 0 });
  }
  let rr = 0;
  let stopped = false;

  return {
    now() {
      return ctx.currentTime;
    },

    strike(freq: number, amp: number, size: number, whenSec: number) {
      if (stopped) return;
      const when = Math.max(ctx.currentTime, whenSec);
      const a = Math.max(0, Math.min(1, amp));
      const s = Math.max(0, Math.min(1, size));
      if (a < 0.01) return;

      // Prefer a voice free by `when`; else steal round-robin.
      let idx = -1;
      for (let i = 0; i < VOICE_COUNT; i++) {
        if (voices[i].busyUntil <= when) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        idx = rr;
        rr = (rr + 1) % VOICE_COUNT;
      }
      const v = voices[idx];

      const peak = (0.03 + 0.1 * s) * a;
      const attack = 0.006 + 0.025 * s;
      const release = 0.9 + 2.6 * s;

      v.osc.frequency.setValueAtTime(freq, when);
      v.sub.frequency.setValueAtTime(freq / 2, when);
      v.gain.gain.cancelScheduledValues(when);
      v.gain.gain.setValueAtTime(0.0001, when);
      v.gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), when + attack);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);
      v.busyUntil = when + attack + release * 0.55;
    },

    swell(activity: number) {
      if (stopped) return;
      const a = Math.max(0, Math.min(1, activity));
      drone.setDrive(0.06 + 0.34 * a);
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
        /* ctx already closing */
      }
      drone.stop();
      const killAt = t + 0.6;
      for (const v of voices) {
        try {
          v.osc.stop(killAt);
          v.sub.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 750);
    },
  };
}
