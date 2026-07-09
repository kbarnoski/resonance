// ─────────────────────────────────────────────────────────────────────────────
// 1344-light-tunnel/audio.ts — the cosmic-ambient sound of the approach.
//
//   A slow Shepard–Risset ASCENT (the endless-rising illusion — octave-spaced
//   sine partials under a fixed Gaussian window, gliding forever) layered over a
//   warm just-intonation drone bed, both poured into a code-synthesised
//   convolution-void reverb. Approach speed (device tilt / pointer) is the single
//   `drive`: it speeds the glide, opens a master low-pass, and lifts the wet tail
//   toward the "being of light" moment. A breath-paced ~0.1 Hz macro swell
//   breathes over the whole thing. Never a beat, never a step, never a struck bell.
//
//   Master ≤0.2 behind a DynamicsCompressor limiter, exponential fade-in, and a
//   full teardown that fades out and stops every oscillator.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb } from "../_shared/psych/convolutionVoid";

export interface TunnelAudio {
  /** Feed the 0..1 approach drive + dt seconds once per animation frame. */
  update(drive: number, dt: number): void;
  /** Fade out and stop everything. */
  stop(): void;
}

export function makeTunnelAudio(
  ctx: AudioContext,
  masterLevel = 0.2,
): TunnelAudio {
  const level = Math.min(0.24, Math.max(0, masterLevel));

  // ── master bus: lowpass → gain → limiter → out ──────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(level, ctx.currentTime + 3.0);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;

  // The master low-pass OPENS with drive — brightness lifting toward the light.
  const masterLP = ctx.createBiquadFilter();
  masterLP.type = "lowpass";
  masterLP.frequency.value = 480;
  masterLP.Q.value = 0.5;

  masterLP.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── the vast void tail everything sits inside ───────────────────────────────
  const verb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.4 });
  verb.output.connect(masterLP);

  // ── endless ascent + warm drone bed, both routed through the void ───────────
  const shepard: ShepardEngine = startShepard(ctx, verb.input, {
    dir: 1, // endless RISE — floating up toward the being of light
    partials: 9,
    fLow: 27.5,
    centerOct: 4.2,
    sigmaOct: 1.7,
    baseRate: 0.014,
    driveRate: 0.14,
    peakGain: 0.34,
  });

  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: 41.2, // E1 — a warm sub floor
    ratios: [1, 3 / 2, 2, 5 / 2, 3, 4],
    cutoffLow: 180,
    cutoffHigh: 3200,
    peakGain: 0.26,
  });

  let breathT = 0;
  let stopped = false;

  return {
    update(drive: number, dt: number) {
      if (stopped) return;
      const d = Math.min(1, Math.max(0, drive));
      const cdt = Math.min(0.1, Math.max(0, dt));
      breathT += cdt;

      // breath-paced ~0.1 Hz macro swell
      const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * breathT);
      const shaped = Math.min(1, d * (0.82 + 0.18 * breath));

      shepard.setDrive(shaped);
      shepard.step(cdt);
      drone.setDrive(shaped);
      verb.setWet(0.34 + 0.28 * d);

      const now = ctx.currentTime;
      const cutoff = 440 * Math.pow(9000 / 440, 0.32 + 0.68 * shaped);
      masterLP.frequency.setTargetAtTime(cutoff, now, 0.2);

      // Once the fade-in has settled, let the breath gently swell the master.
      if (breathT > 3.4) {
        master.gain.setTargetAtTime(level * (0.9 + 0.1 * breath), now, 0.3);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      } catch {
        /* ctx may be closing */
      }
      shepard.stop();
      drone.stop();
    },
  };
}
