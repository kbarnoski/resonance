// optimize.ts — the differentiable spectral-loss gradient chase.
//
// A tiny optimizer that, each frame, takes a few gradient-descent steps on the
// synth's five continuous parameters, sliding them downhill on a per-frame
// spectral loss L(params) = distance(synth spectrum, live target spectrum).
// Gradients are estimated by CHEAP FINITE DIFFERENCES — perturb each param,
// measure ΔL — which is honest and needs no hand-derived analytic gradient.
// Stability comes from ADAC-style macro-controls (DAFx26): momentum, a clamp
// on the per-step move, and gradient normalization. As the target drifts the
// minimum moves and the params keep chasing it.
//
// The same machinery evaluates a whole 2-D slice of the loss (the landscape
// you watch) and generates the synthetic-singer target for Auto mode.

import { fmBins, normDb, spectralLoss, N_BINS } from "./features";
import {
  DIM,
  AXIS_X,
  AXIS_Y,
  clamp01,
  denorm,
  type SynthParams,
} from "./synth";
import { mulberry32 } from "./prng";

/** Descent steps per animation frame — a few, so the slide is audible and
 *  legible rather than instantaneous. */
export const STEPS_PER_FRAME = 3;
/** Resolution of the loss landscape grid (square). */
export const FIELD_RES = 44;

const EPS = 0.012; // finite-difference perturbation
const LR = 0.045; // learning rate
const BETA = 0.82; // momentum
const MAX_STEP = 0.06; // clamp on |Δparam| per step (stability macro-control)
const KICK = 0.006; // tiny seeded exploration when the gradient goes flat

export interface Descent {
  /** Current normalized parameters in [0,1]^DIM. */
  params: Float32Array;
  /** Take STEPS_PER_FRAME descent steps against `targetDb`; returns the loss
   *  and gradient magnitude at the start of the frame (for the viz). */
  run(targetDb: Float32Array): { loss: number; gradMag: number };
  /** Real synth parameters for the current point (for audio). */
  current(): SynthParams;
  /** Normalized synth spectrum for the current point, into `out`. */
  spectrum(out: Float32Array): Float32Array;
  /** Fill `field` (FIELD_RES²) with the normalized loss over the (AXIS_X,
   *  AXIS_Y) plane holding the other params fixed; returns the basin (argmin)
   *  location in [0,1]² and the raw minimum loss. */
  field(
    targetDb: Float32Array,
    field: Float32Array,
  ): { basinX: number; basinY: number; min: number };
}

export function createDescent(seed: number): Descent {
  const rng = mulberry32(seed);
  const params = new Float32Array(DIM);
  const vel = new Float32Array(DIM);
  const grad = new Float32Array(DIM);
  // start somewhere generic — a mid, slightly-bright patch
  for (let i = 0; i < DIM; i++) params[i] = 0.35 + 0.3 * rng();

  const binScratch = new Float32Array(N_BINS);
  const dbScratch = new Float32Array(N_BINS);
  const probe = new Float32Array(DIM);

  function lossOf(vec: Float32Array, targetDb: Float32Array): number {
    fmBins(denorm(vec), binScratch);
    normDb(binScratch, dbScratch);
    return spectralLoss(dbScratch, targetDb);
  }

  function run(targetDb: Float32Array) {
    const base0 = lossOf(params, targetDb);
    let gradMag0 = 0;

    for (let s = 0; s < STEPS_PER_FRAME; s++) {
      const base = lossOf(params, targetDb);
      // finite-difference gradient
      probe.set(params);
      let gm = 0;
      for (let i = 0; i < DIM; i++) {
        const save = probe[i];
        probe[i] = clamp01(save + EPS);
        const lp = lossOf(probe, targetDb);
        probe[i] = save;
        const g = (lp - base) / EPS;
        grad[i] = g;
        gm += g * g;
      }
      gm = Math.sqrt(gm);
      if (s === 0) gradMag0 = gm;

      // normalize gradient direction (keeps steps well-scaled across the
      // landscape's steep and flat regions), then momentum + clamp
      const inv = gm > 1e-6 ? 1 / gm : 0;
      for (let i = 0; i < DIM; i++) {
        let step = -LR * grad[i] * inv;
        if (gm < 1e-4) step += (rng() - 0.5) * 2 * KICK; // flat → explore
        vel[i] = BETA * vel[i] + step;
        if (vel[i] > MAX_STEP) vel[i] = MAX_STEP;
        else if (vel[i] < -MAX_STEP) vel[i] = -MAX_STEP;
        params[i] = clamp01(params[i] + vel[i]);
      }
    }
    return { loss: base0, gradMag: gradMag0 };
  }

  function current(): SynthParams {
    return denorm(params);
  }

  function spectrum(out: Float32Array): Float32Array {
    fmBins(denorm(params), binScratch);
    return normDb(binScratch, out);
  }

  function field(targetDb: Float32Array, out: Float32Array) {
    probe.set(params);
    let min = Infinity;
    let max = -Infinity;
    let bx = 0;
    let by = 0;
    for (let iy = 0; iy < FIELD_RES; iy++) {
      probe[AXIS_Y] = iy / (FIELD_RES - 1);
      for (let ix = 0; ix < FIELD_RES; ix++) {
        probe[AXIS_X] = ix / (FIELD_RES - 1);
        const l = lossOf(probe, targetDb);
        out[iy * FIELD_RES + ix] = l;
        if (l < min) {
          min = l;
          bx = ix;
          by = iy;
        }
        if (l > max) max = l;
      }
    }
    const span = max - min > 1e-9 ? max - min : 1;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / span;
    probe.set(params);
    return {
      basinX: bx / (FIELD_RES - 1),
      basinY: by / (FIELD_RES - 1),
      min,
    };
  }

  return { params, run, current, spectrum, field };
}

/* ── synthetic singer: the drifting target for Auto (no-mic) mode ─────────── */

/** A seeded "singer" whose timbre slowly evolves — pitch steps through a
 *  pentatonic phrase, while brightness / inharmonicity / formant drift on slow
 *  sines. Its normalized params are written into `out`; the descent chases the
 *  moving minimum this induces. Fully deterministic from the seed. */
export interface Singer {
  /** Write the singer's normalized params at time `t` (seconds) into `out`. */
  at(t: number, out: Float32Array): void;
}

export function createSinger(seed: number): Singer {
  const rng = mulberry32(seed ^ 0x1234abcd);
  // pentatonic degrees over the f0 range, as normalized [0,1] coords
  const degrees = [0.06, 0.24, 0.4, 0.62, 0.78, 0.95];
  const seq = Array.from({ length: 8 }, () => degrees[(rng() * degrees.length) | 0]);
  const stepS = 2.4; // seconds per note
  // slow drift coefficients for ratio / index / cutoff / q
  const drift = Array.from({ length: 4 }, () => ({
    a: 0.18 + 0.22 * rng(),
    w: 0.05 + 0.11 * rng(),
    p: rng() * Math.PI * 2,
    c: 0.35 + 0.4 * rng(),
  }));

  function osc(d: { a: number; w: number; p: number; c: number }, t: number) {
    return clamp01(d.c + d.a * Math.sin(t * d.w + d.p));
  }

  function at(t: number, out: Float32Array): void {
    const i = Math.floor(t / stepS) % seq.length;
    const frac = (t % stepS) / stepS;
    const next = seq[(i + 1) % seq.length];
    // glide the last 25% of each note toward the next pitch — portamento
    const g = frac > 0.75 ? (frac - 0.75) / 0.25 : 0;
    out[0] = seq[i] + (next - seq[i]) * g * g; // f0
    out[1] = osc(drift[0], t); // ratio
    out[2] = osc(drift[1], t); // index
    out[3] = osc(drift[2], t); // cutoff
    out[4] = osc(drift[3], t); // q
  }

  return { at };
}
