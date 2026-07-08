// 1285-apollonian-gasket — audio.ts (OUTPUT ONLY, no mic)
//
// The gasket IS a chord. A circle's curvature (bend) maps to PITCH — bigger
// circles (small bend) sound low, tiny deep circles sound high — quantised to a
// 5-limit just-intonation pentatonic so every tap harmonises. Each struck circle
// plays one voice from a pooled bank: soft attack, long release scaled by size.
// Underneath sits a low ROOT + FIFTH drone bed so the packing always rests on a
// chord. Everything runs through a convolution void and a DynamicsCompressor
// limiter into a master gain ≤ 0.3 with a short fade-in.
//
//   voices + drone bed → void reverb → limiter → master (≤0.3, ramp) → out.
//   Full teardown on stop().

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_PEAK = 0.3;
const ROOT_HZ = 130.81; // ~C3

// 5-limit just-intonation pentatonic — pure, consonant, no wolf intervals.
const JI = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

/** Bend → frequency. Bigger circle (small bend) → lower tone. Quantised to the
 *  JI pentatonic across octaves so struck circles always harmonise. */
export function bendToFreq(bend: number): number {
  const b = Math.max(2, Math.abs(bend));
  // ~3 pentatonic steps per doubling of bend; seed circles sit near the root.
  const step = Math.max(0, Math.min(22, Math.round(Math.log2(b / 2) * 3)));
  const oct = Math.floor(step / JI.length);
  const deg = ((step % JI.length) + JI.length) % JI.length;
  return ROOT_HZ * Math.pow(2, oct) * JI[deg];
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  busyUntil: number;
}

export interface AudioEngine {
  /** Sound a struck circle: bend → pitch, size (0..1) → loudness + length. */
  strike(bend: number, size: number): void;
  stop(): void;
}

const VOICE_COUNT = 16;

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 1.8);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-12, now);
  limiter.knee.setValueAtTime(8, now);
  limiter.ratio.setValueAtTime(16, now);
  limiter.attack.setValueAtTime(0.003, now);
  limiter.release.setValueAtTime(0.25, now);
  limiter.connect(master);

  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.42 });
  reverb.output.connect(limiter);

  // Low root + fifth bed so the packing always sits on a chord.
  const drone: DroneBank = startDroneBank(ctx, reverb.input, {
    root: ROOT_HZ / 2,
    ratios: [1, 3 / 2, 2],
    cutoffLow: 90,
    cutoffHigh: 900,
    peakGain: 0.11,
  });
  drone.setDrive(0.08);

  // Soften the pearlescent voices a touch before the void.
  const voiceBus = ctx.createBiquadFilter();
  voiceBus.type = "lowpass";
  voiceBus.frequency.setValueAtTime(3200, now);
  voiceBus.Q.setValueAtTime(0.5, now);
  voiceBus.connect(reverb.input);
  voiceBus.connect(limiter); // a little dry path for crisp onsets

  // ── Pooled just-intonation voices ──
  const voices: Voice[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 3 === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(ROOT_HZ, now);
    osc.detune.setValueAtTime(i % 2 === 0 ? -3 : 3, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    osc.connect(gain);
    gain.connect(voiceBus);
    osc.start();
    voices.push({ osc, gain, busyUntil: 0 });
  }
  let rr = 0;

  // Gentle drone swell as the gasket fills (driven by strike density, then it
  // relaxes back toward rest between flurries).
  let activity = 0;
  let lastStrike = now;

  let stopped = false;

  return {
    strike(bend: number, size: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const s = Math.max(0, Math.min(1, size));
      const freq = bendToFreq(bend);

      // Prefer a free voice; else round-robin steal the oldest.
      let idx = -1;
      for (let i = 0; i < VOICE_COUNT; i++) {
        if (voices[i].busyUntil <= t) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        idx = rr;
        rr = (rr + 1) % VOICE_COUNT;
      }
      const v = voices[idx];

      // Bigger circles: louder, longer, softer attack.
      const peak = 0.05 + 0.11 * s;
      const attack = 0.008 + 0.03 * s;
      const release = 1.4 + 2.4 * s;

      v.osc.frequency.setTargetAtTime(freq, t, 0.01);
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
      v.gain.gain.linearRampToValueAtTime(peak, t + attack);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
      v.busyUntil = t + attack + release * 0.6;

      // Relax accumulated activity by the time elapsed, then add this strike.
      activity = Math.max(0, activity - (t - lastStrike) * 0.35);
      activity = Math.min(1, activity + 0.12);
      lastStrike = t;
      drone.setDrive(0.08 + 0.32 * activity);
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
        } catch {
          /* already stopped */
        }
      }
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 700);
    },
  };
}
