// ─────────────────────────────────────────────────────────────────────────────
// _shared/psych/shepard.ts — a real Shepard–Risset endless-glissando engine.
//
//   Roger Shepard (1964) built the auditory barber-pole: sine partials spaced
//   exactly one octave apart, each weighted by a fixed Gaussian envelope over
//   log-frequency. As the whole stack glides, partials fade IN at the bottom of
//   the envelope and OUT at the top — so there is never an audible edge and the
//   pitch seems to rise (or fall) forever. Jean-Claude Risset turned Shepard's
//   discrete steps into a continuous glide.
//
//   EXTRACTED 2026-06-30 (cycle 611) from 1067-boundless-breath/shepard.ts, which
//   had itself re-derived the engine twice (1062, 1067). This is the canonical
//   copy — generalised from "breath" to a unit `drive` so any altered-states
//   piece (breath, body-motion, pointer energy, field activity) can play it.
//
//   The drive scales BOTH the ascent rate and the overall brightness/level, and
//   `dir` lets a piece glide down (NDE plunge) instead of up (DMT ascent).
//   When `phase` crosses an octave each partial's base frequency wraps by one
//   octave, so the comb is identical and the glide is genuinely endless.
// ─────────────────────────────────────────────────────────────────────────────

export interface ShepardOptions {
  /** Number of octave-spaced partials. Default 9. */
  partials?: number;
  /** Bottom of the comb, Hz. Default 27.5 (A0). */
  fLow?: number;
  /** Envelope centre, in octaves above fLow. Default 4. */
  centerOct?: number;
  /** Envelope width, in octaves. Default 1.6 (~3-octave audible span). */
  sigmaOct?: number;
  /** Octaves/sec at drive 0 (the always-present floor drift). Default 0.018. */
  baseRate?: number;
  /** Extra octaves/sec at drive 1. Default 0.16. */
  driveRate?: number;
  /** +1 endless rise, -1 endless fall. Default +1. */
  dir?: 1 | -1;
  /** Peak output gain after fade-in. Default 0.5. */
  peakGain?: number;
}

export interface ShepardEngine {
  /** Set the 0..1 drive (clamped). Higher = faster glide + brighter. */
  setDrive(d: number): void;
  /** Advance the glissando. Call once per animation frame with dt seconds. */
  step(dt: number): void;
  /** Fade out and stop the oscillators. */
  stop(): void;
  /** The node to route into the rest of the graph. */
  output: GainNode;
}

export function startShepard(
  ctx: AudioContext,
  destination: AudioNode,
  opts: ShepardOptions = {},
): ShepardEngine {
  const N = opts.partials ?? 9;
  const fLow = opts.fLow ?? 27.5;
  const centerOct = opts.centerOct ?? 4.0;
  const sigmaOct = opts.sigmaOct ?? 1.6;
  const baseRate = opts.baseRate ?? 0.018;
  const driveRate = opts.driveRate ?? 0.16;
  const dir = opts.dir ?? 1;
  const peakGain = opts.peakGain ?? 0.5;

  const envWeight = (oct: number): number => {
    const d = (oct - centerOct) / sigmaOct;
    return Math.exp(-0.5 * d * d);
  };

  const output = ctx.createGain();
  output.gain.value = 0;
  output.gain.setValueAtTime(0.0001, ctx.currentTime);
  output.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + 2.0);
  output.connect(destination);

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let i = 0; i < N; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(output);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  let phase = 0; // transpose in octaves (fractional, wraps at 1)
  let drive = 0;
  let brightness = 0; // smoothed toward drive

  const setDrive = (d: number) => {
    drive = Math.min(1, Math.max(0, d));
  };

  const step = (dt: number) => {
    const now = ctx.currentTime;
    const cdt = Math.min(0.1, Math.max(0, dt));

    const rate = baseRate + driveRate * drive;
    phase += dir * rate * cdt;
    phase -= Math.floor(phase); // wrap into [0,1); comb is octave-periodic

    const ba = 1 - Math.exp(-cdt / 0.5);
    brightness += (drive - brightness) * ba;

    const level = 0.32 + 0.4 * brightness;

    for (let i = 0; i < N; i++) {
      const oct = i + phase;
      const freq = fLow * Math.pow(2, oct);
      oscs[i].frequency.setTargetAtTime(freq, now, 0.02);
      const w = envWeight(oct) * level;
      gains[i].gain.setTargetAtTime(Math.max(0, Math.min(1, w)), now, 0.03);
    }
  };

  let stopped = false;
  return {
    setDrive,
    step,
    output,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now);
        output.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx may be closing */
      }
      const killAt = now + 0.7;
      for (const osc of oscs) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
