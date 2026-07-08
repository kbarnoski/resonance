// 1284-quantum-etch — audio.ts
//
// The wavefunction sings its own SPECTRUM. We bin the radial k-spectrum of ψ
// (|FFT(ψ)|² gathered by |k|) into a handful of bands and drive a small
// just-intonation PARTIAL BANK from them: a locked scar / standing pattern has a
// sharp, low k-spectrum → a stable, dark chord; a fast spreading packet fills
// the high bands → a wider, brighter cluster. Overall presence opens a master
// lowpass so the chord brightens as probability gathers in view. A pooled
// MALLET pings when the packet strikes a wall. Under it all: the shared drone
// bed and an enormous convolution void for scale.
//
//   voices + mallets + bed → void → DynamicsCompressor limiter → master (≤0.3,
//   2 s fade-in) → destination. Full teardown on stop().

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_PEAK = 0.3;

// A just-intonation chord: root, major third, fifth, minor seventh, octave.
const RATIOS = [1, 5 / 4, 3 / 2, 7 / 4, 2];
const ROOT_HZ = 98; // ~G2
export const BAND_COUNT = RATIOS.length;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export interface AudioEngine {
  /** Drive the partial bank from the binned radial k-spectrum + presence 0..1. */
  setSpectrum(bands: Float32Array, presence: number): void;
  /** Ping a mallet on a wall strike (strength 0..1). */
  mallet(strength: number): void;
  stop(): void;
}

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(16, now);
  limiter.attack.setValueAtTime(0.003, now);
  limiter.release.setValueAtTime(0.3, now);
  limiter.connect(master);

  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.5 });
  reverb.output.connect(limiter);

  // A low bed so the field never sounds empty.
  const drone: DroneBank = startDroneBank(ctx, reverb.input, {
    root: ROOT_HZ / 2,
    ratios: [1, 1.5, 2],
    cutoffLow: 90,
    cutoffHigh: 1200,
    peakGain: 0.12,
  });
  drone.setDrive(0.05);

  // Master brightness filter for the partial bank (presence opens it).
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(500, now);
  tone.Q.setValueAtTime(0.6, now);
  tone.connect(reverb.input);
  tone.connect(limiter); // a little dry path for crisp onsets

  // ── Just-intonation partial bank ──
  const voices: Voice[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(ROOT_HZ * RATIOS[i], now);
    osc.detune.setValueAtTime(i % 2 === 0 ? -3 : 3, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    osc.connect(gain);
    gain.connect(tone);
    osc.start();
    voices.push({ osc, gain });
  }

  // ── Mallet pool (≤3 voices), round-robin ──
  const MALLET_VOICES = 3;
  const mallets: { osc: OscillatorNode; gain: GainNode }[] = [];
  for (let i = 0; i < MALLET_VOICES; i++) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(ROOT_HZ * 2, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    osc.connect(gain);
    gain.connect(limiter);
    osc.start();
    mallets.push({ osc, gain });
  }
  let malletIdx = 0;

  let stopped = false;

  return {
    setSpectrum(bands: Float32Array, presence: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      // Normalise the bands so the chord balance is about shape, not amplitude.
      let sum = 0;
      for (let i = 0; i < BAND_COUNT; i++) sum += bands[i];
      const inv = sum > 1e-9 ? 1 / sum : 0;
      const pres = Math.max(0, Math.min(1, presence));
      for (let i = 0; i < BAND_COUNT; i++) {
        const share = bands[i] * inv; // 0..1 relative weight
        const level = 0.16 * share * (0.35 + 0.65 * pres);
        voices[i].gain.gain.setTargetAtTime(Math.max(0.0001, level), t, 0.08);
      }
      const cutoff = 400 * Math.pow(6, pres); // 400 → ~2400 Hz
      tone.frequency.setTargetAtTime(cutoff, t, 0.12);
      reverb.setWet(0.55 - 0.2 * pres);
      drone.setDrive(0.05 + 0.35 * pres);
    },

    mallet(strength: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const s = Math.max(0, Math.min(1, strength));
      const m = mallets[malletIdx];
      malletIdx = (malletIdx + 1) % MALLET_VOICES;
      const f = ROOT_HZ * (2 + 2 * s);
      m.osc.frequency.setValueAtTime(f, t);
      m.osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.18);
      const peak = 0.04 + 0.12 * s;
      m.gain.gain.cancelScheduledValues(t);
      m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), t);
      m.gain.gain.linearRampToValueAtTime(peak, t + 0.006);
      m.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
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
      for (const m of mallets) {
        try {
          m.osc.stop(killAt);
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
