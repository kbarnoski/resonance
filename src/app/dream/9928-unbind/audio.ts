// ─────────────────────────────────────────────────────────────────────────────
// 9928-unbind · audio.ts — a never-silent, long-tailed ambient void.
//
//   • an INHARMONIC / spectral drone (droneBank with irrational, non-JI,
//     non-pentatonic ratios) sits underneath forever — the piece is never
//     silent once started.
//   • a "void swell" voice (a small stack of inharmonic partials) blooms in and
//     out with an envelope handed in from the page each frame.
//   • everything routes through a long convolution reverb for vastness, then the
//     ear-safety master bus.
//
//   The swell envelope is the desync signal: the page computes it at (t + offset)
//   while the VISUAL swell is computed at (t). This module just plays whatever
//   envelope it is given — it never sees the offset. That is the whole trick:
//   the two streams are driven by the SAME shape, sampled at DIFFERENT times.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb } from "../_shared/visionary/convolutionVoid";
import { startDroneBank } from "../_shared/visionary/droneBank";

export interface VoidAudio {
  /** Feed the (already time-shifted) swell envelope 0..1 each frame. */
  setEnvelope(env: number): void;
  stop(): void;
}

// Irrational, inharmonic / spectral ratios — deliberately NOT pentatonic and NOT
// just-intonation. Roots of small integers give a metallic, bell-like spread.
const DRONE_RATIOS = [1, Math.SQRT2, Math.sqrt(5), Math.sqrt(7), 3];
// The swell partials, likewise inharmonic (bar-mode-ish stretch).
const SWELL_RATIOS = [1, 2.094, 3.416];

export function makeVoidAudio(ctx: AudioContext): VoidAudio {
  const master = createSafeMaster(ctx, { gain: 0.18 });

  // long, cavernous tail — the void
  const reverb = createVoidReverb(ctx, { seconds: 6.5, decay: 2.3, wet: 0.78 });
  reverb.output.connect(master.input);

  // ── the ever-present inharmonic drone bed ──────────────────────────────
  const drone = startDroneBank(ctx, reverb.input, {
    root: 46,
    ratios: DRONE_RATIOS,
    cutoffLow: 170,
    cutoffHigh: 780,
    peakGain: 0.2,
  });
  drone.setDrive(0.12);

  // ── the void swell voice: inharmonic partials that bloom with the envelope ─
  const swellGain = ctx.createGain();
  swellGain.gain.value = 0.0001;
  swellGain.connect(reverb.input);

  const swellBase = 138; // sits above the sub so the bloom is audible
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < SWELL_RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = swellBase * SWELL_RATIOS[i];
    osc.detune.value = i === 0 ? 0 : (i % 2 === 0 ? 5 : -5);
    const g = ctx.createGain();
    g.gain.value = 0.5 / (i + 1); // higher partials quieter
    osc.connect(g);
    g.connect(swellGain);
    osc.start();
    oscs.push(osc);
  }

  let stopped = false;

  return {
    setEnvelope(env: number) {
      if (stopped) return;
      const e = Math.min(1, Math.max(0, env));
      const now = ctx.currentTime;
      // the audible bloom
      swellGain.gain.setTargetAtTime(0.0001 + e * 0.16, now, 0.03);
      // give the drone a little extra body under a swell too
      drone.setDrive(0.12 + 0.16 * e);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        swellGain.gain.cancelScheduledValues(now);
        swellGain.gain.setValueAtTime(
          Math.max(0.0001, swellGain.gain.value),
          now,
        );
        swellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx closing */
      }
      for (const osc of oscs) {
        try {
          osc.stop(now + 0.7);
        } catch {
          /* already stopped */
        }
      }
      drone.stop();
      master.disconnect();
    },
  };
}
