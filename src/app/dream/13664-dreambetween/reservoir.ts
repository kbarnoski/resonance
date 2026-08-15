// ─────────────────────────────────────────────────────────────────────────────
// 13664 · Dream Between — the reservoir as a DREAMING NAVIGATOR.
//
//   LINEAGE (cycle 4 of the reservoir line)
//     10984-echofold → 11376-recallorbit → 12976-dreammedley → 13664-dreambetween
//
//   recallorbit taught ONE sung phrase to a genuine Echo-State Network (Jaeger
//   2001) and reproduced it EXACTLY with a ridge-trained readout. dreammedley
//   held several phrases at once and wandered the space between them — BUT it
//   re-synthesized the result through an FM voice, so the output was no longer
//   Karel's real piano. That is a "rule-10" violation (audio must be his real
//   catalog). This engine fixes it: the reservoir here does NOT resynthesize any
//   pitch contour. It is purely a NAVIGATOR — a fixed sparse random recurrent
//   state x∈R^N driven by a phase clock, whose 2-D projection wanders a "memory
//   field" whose anchors are Karel's real recordings. The SOUND is his real audio
//   granulated live; the reservoir only decides WHERE in the field we are, and
//   therefore the attention weights over the recordings (grain density per
//   source). See page.tsx for the multi-source granular cloud.
//
//   Still a GENUINE Echo-State Network: fixed sparse random W rescaled to a
//   target spectral radius by power iteration; leaky-integrator tanh update;
//   fading memory; edge-of-chaos control via the "dream" parameter (ρ pushed
//   past 1 + injected state noise). Not a random walk — a real dynamical system.
//
//   ARCHITECTURE ANCHOR — Echo State Transformer (arXiv:2507.02917): the anchors
//   are memory slots and the softmax over cursor→anchor distance is attention
//   over them. Framing as an action-conditioned world model — Music-JEPA
//   (arXiv:2607.22000): the visitor's hand (pointer) overrides the navigator, so
//   steering the cursor IS an action the sonic world responds to.
//
//   No ML libraries. Deterministic (mulberry32) — a fixed, reproducible mind.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG (mulberry32) — never Math.random. Exported & reused. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Vec2 = { x: number; y: number };

/**
 * Softmax attention over anchors from the cursor position. `temp` controls the
 * spread: small temp → sharp (one recording dominates, faithful recall); large
 * temp → spread (overlapping grains from 2+ recordings, the hybrid between-space).
 * This is the Echo-State-Transformer read: attention over memory slots.
 */
export function attentionFrom(
  cursor: Vec2,
  anchors: readonly Vec2[],
  temp: number,
): number[] {
  const t = Math.max(0.02, temp);
  const logits: number[] = [];
  let max = -Infinity;
  for (const a of anchors) {
    const dx = cursor.x - a.x;
    const dy = cursor.y - a.y;
    const d2 = dx * dx + dy * dy;
    const l = -d2 / t;
    logits.push(l);
    if (l > max) max = l;
  }
  let sum = 0;
  const out: number[] = [];
  for (const l of logits) {
    const e = Math.exp(l - max);
    out.push(e);
    sum += e;
  }
  if (sum <= 1e-9) return anchors.map(() => 1 / anchors.length);
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

export interface NavigatorOptions {
  N?: number; // reservoir size (kept small: ~80–150)
  nHarm?: number; // clock harmonics feeding the reservoir
  loopSteps?: number; // steps per clock loop (orbit period, in microsteps)
  density?: number; // sparsity of W
  rhoBase?: number; // base spectral radius at recall (dream = 0)
  leak?: number; // leaky-integrator rate
  projGain?: number; // scales the 2-D projection into the memory field
}

/**
 * The dreaming navigator. A real Echo-State Network whose 2-D projection roams
 * the memory field. It emits NO audio — it only produces a cursor position.
 */
export class NavigatorReservoir {
  readonly N: number;
  readonly loopSteps: number;

  // Sparse recurrent matrix (CSR), rescaled to unit spectral radius.
  private rowStart: Int32Array;
  private colIdx: Int32Array;
  private vals: Float32Array;

  private Win: Float32Array; // N * nIn
  private nIn: number;
  private nHarm: number;
  private uBuf: Float32Array;
  private bias: Float32Array;

  private x: Float32Array;
  private xTmp: Float32Array;

  // Fixed random 2×N projection → the roving cursor (own seed stream).
  private Pproj: Float32Array; // 2*N
  private p2: Float32Array; // smoothed field point
  private p2raw: Float32Array;

  private phase = 0;
  private phaseInc: number;
  private dream = 0;
  private rhoBase: number;
  private leak: number;
  private projGain: number;
  private noiseRng: () => number;

  constructor(seed: number, opts: NavigatorOptions = {}) {
    const N = opts.N ?? 120;
    this.N = N;
    this.nHarm = opts.nHarm ?? 6;
    this.loopSteps = opts.loopSteps ?? 256;
    this.phaseInc = 1 / this.loopSteps;
    this.rhoBase = opts.rhoBase ?? 0.9;
    this.leak = opts.leak ?? 0.28;
    this.projGain = opts.projGain ?? 1.7;
    const density = opts.density ?? 0.12;

    const rng = mulberry32(seed);

    // Build sparse W: each row ~density*N entries in uniform[-1,1].
    const perRow = Math.max(1, Math.round(density * N));
    const rowStart = new Int32Array(N + 1);
    const cols: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < N; i++) {
      rowStart[i] = cols.length;
      const used = new Set<number>();
      for (let k = 0; k < perRow; k++) {
        let j = (rng() * N) | 0;
        let guard = 0;
        while (used.has(j) && guard++ < 8) j = (rng() * N) | 0;
        used.add(j);
        cols.push(j);
        vals.push(rng() * 2 - 1);
      }
    }
    rowStart[N] = cols.length;
    this.rowStart = rowStart;
    this.colIdx = Int32Array.from(cols);
    this.vals = Float32Array.from(vals);
    this.normalizeSpectralRadius();

    // Dense input weights for clock harmonics + tiny bias. Input is purely the
    // phase clock u = [sin 2πφk, cos 2πφk] over k harmonics — never a melody.
    this.nIn = this.nHarm * 2;
    this.uBuf = new Float32Array(this.nIn);
    this.Win = new Float32Array(N * this.nIn);
    for (let i = 0; i < N * this.nIn; i++) this.Win[i] = (rng() * 2 - 1) * 0.8;
    this.bias = new Float32Array(N);
    for (let i = 0; i < N; i++) this.bias[i] = (rng() * 2 - 1) * 0.06;

    this.x = new Float32Array(N);
    this.xTmp = new Float32Array(N);
    for (let i = 0; i < N; i++) this.x[i] = (rng() * 2 - 1) * 0.05;

    // Fixed random projection to 2-D (separate seed stream).
    const prng = mulberry32(seed ^ 0x9e3779b9);
    this.Pproj = new Float32Array(2 * N);
    for (let i = 0; i < 2 * N; i++) this.Pproj[i] = prng() * 2 - 1;
    this.p2 = new Float32Array(2);
    this.p2raw = new Float32Array(2);

    this.noiseRng = mulberry32(seed ^ 0x51ed270b);

    // Warm the reservoir onto its clock-driven limit cycle so frame 1 already
    // shows a settled, wandering orbit (auto-demo on mount).
    for (let s = 0; s < this.loopSteps; s++) this.step();
  }

  private matVec(v: Float32Array, out: Float32Array): void {
    const { rowStart, colIdx, vals, N } = this;
    for (let i = 0; i < N; i++) {
      let acc = 0;
      const end = rowStart[i + 1];
      for (let k = rowStart[i]; k < end; k++) acc += vals[k] * v[colIdx[k]];
      out[i] = acc;
    }
  }

  // Power iteration → scale W to spectral radius 1 (ρ becomes a runtime scalar).
  private normalizeSpectralRadius(): void {
    const N = this.N;
    const rng = mulberry32(9001);
    let v = new Float32Array(N);
    let w = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = rng() * 2 - 1;
    let lambda = 1;
    for (let it = 0; it < 60; it++) {
      this.matVec(v, w);
      let norm = 0;
      for (let i = 0; i < N; i++) norm += w[i] * w[i];
      norm = Math.sqrt(norm) || 1;
      lambda = norm;
      for (let i = 0; i < N; i++) w[i] /= norm;
      const t = v;
      v = w;
      w = t;
    }
    if (lambda > 1e-6) {
      for (let k = 0; k < this.vals.length; k++) this.vals[k] /= lambda;
    }
  }

  /** One reservoir microstep. `dream` pushes ρ past the edge of chaos + noise. */
  step(): void {
    const {
      rowStart, colIdx, vals, N, x, xTmp, bias, Win, nIn, nHarm, uBuf,
    } = this;
    const d = this.dream;
    // Toward dream: ρ past 1 (supercritical) AND the clock's grip fades, so the
    // reservoir stops being slaved to the metronome and wanders the between-space.
    const rho = this.rhoBase + 0.35 * d;
    const inScale = 1 - 0.7 * d;
    const a = this.leak;
    const twoPi = 2 * Math.PI * this.phase;
    for (let h = 0; h < nHarm; h++) {
      uBuf[h * 2] = Math.sin(twoPi * (h + 1)) * inScale;
      uBuf[h * 2 + 1] = Math.cos(twoPi * (h + 1)) * inScale;
    }
    for (let i = 0; i < N; i++) {
      let acc = bias[i];
      const end = rowStart[i + 1];
      for (let k = rowStart[i]; k < end; k++)
        acc += rho * vals[k] * x[colIdx[k]];
      const wb = i * nIn;
      for (let c = 0; c < nIn; c++) acc += Win[wb + c] * uBuf[c];
      xTmp[i] = (1 - a) * x[i] + a * Math.tanh(acc);
    }
    x.set(xTmp);
    if (d > 0) {
      // Injected state noise ∝ dream — with ρ supercritical the recurrence
      // amplifies it, so the closed orbit unwinds into a path-dependent wander.
      const amp = 0.06 * d;
      for (let i = 0; i < N; i++) x[i] += (this.noiseRng() * 2 - 1) * amp;
    }
    this.phase += this.phaseInc;
    if (this.phase >= 1) this.phase -= 1;
  }

  /** Project state → smoothed 2-D cursor in ~[-1,1] (the field position). */
  cursor(): Vec2 {
    const { N, x, Pproj, projGain } = this;
    const s = projGain / Math.sqrt(N);
    let a = 0;
    let b = 0;
    for (let i = 0; i < N; i++) {
      const xi = x[i];
      a += Pproj[i] * xi;
      b += Pproj[N + i] * xi;
    }
    this.p2raw[0] = a * s;
    this.p2raw[1] = b * s;
    const e = 0.25;
    for (let k = 0; k < 2; k++) this.p2[k] += (this.p2raw[k] - this.p2[k]) * e;
    return {
      x: Math.max(-1, Math.min(1, this.p2[0])),
      y: Math.max(-1, Math.min(1, this.p2[1])),
    };
  }

  setDream(d: number): void {
    this.dream = Math.max(0, Math.min(1, d));
  }
  get dreamLevel(): number {
    return this.dream;
  }
  get phaseNow(): number {
    return this.phase;
  }

  /** Mean reservoir energy — drives global brightness in the viz. */
  energy(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.x[i] * this.x[i];
    return s / this.N;
  }

  get state(): Float32Array {
    return this.x;
  }
}
