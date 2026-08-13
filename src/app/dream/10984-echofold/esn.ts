// ─────────────────────────────────────────────────────────────────────────────
// Echo-State Network / reservoir computer — the living memory of Echofold.
//
//   A genuine ESN (Jaeger 2001). State x ∈ R^N evolves under a fixed sparse
//   random recurrent matrix W (rescaled to a target SPECTRAL RADIUS ρ), driven
//   by your gesture through Win. The defining property is the ECHO-STATE /
//   fading-memory property: x holds a decaying, nonlinearly-mixed trace of
//   recent input. Fixed random linear readouts Wout·x are the "sung-back"
//   voices — no training, just the reservoir dreaming your phrase back.
//
//   Frontier: 2026 edge-of-chaos reservoir design (arXiv:2605.26848) exposes
//   three control axes — reservoir dynamics (ρ), input–reservoir coupling
//   (input gain), and interconnectivity/integration (leak). Those are the
//   three sliders. A light output-feedback term (a classic Jaeger ESN variant)
//   lets the reservoir keep dreaming after the phrase, so the echo drifts.
// ─────────────────────────────────────────────────────────────────────────────

// Deterministic PRNG (mulberry32) — never Math.random, so the reservoir is a
// fixed, reproducible "mind" for a given seed.
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

export type ReadoutEvent = {
  channel: number; // which onset voice fired (0 = A, 1 = B)
  pitch: number; // reservoir pitch channel, ~[-1, 1]
  vel: number; // 0..1
};

export type ReservoirConfig = {
  N: number;
  density: number; // fraction of nonzero recurrent weights
  nReadouts: number;
  seed: number;
};

// The two onset "voices": each pairs a trigger readout with a pitch readout.
const ONSET_CHANNELS = [
  { trig: 0, pitch: 1 },
  { trig: 2, pitch: 3 },
];
const ON_THRESHOLD = 0.14; // upward crossing arms an onset
const OFF_THRESHOLD = 0.05; // must fall below this to re-arm (hysteresis)
const REFRACTORY = 5; // min reservoir steps between onsets per channel

export class Reservoir {
  readonly N: number;
  readonly nReadouts: number;

  // Sparse recurrent matrix in CSR-ish form, normalized to unit spectral radius.
  private rowStart: Int32Array;
  private colIdx: Int32Array;
  private baseVals: Float32Array;

  private Win: Float32Array; // N (single scalar pitch input channel)
  private WinImpulse: Float32Array; // N (onset impulse channel)
  private Wfb: Float32Array; // N * nReadouts (output feedback)
  private Wout: Float32Array; // nReadouts * N
  private bias: Float32Array; // N

  private x: Float32Array;
  private xTmp: Float32Array;
  private z: Float32Array; // last readouts

  // Live control knobs.
  rho = 0.97; // spectral radius scale (base W is unit radius)
  leak = 0.32; // leak / integration rate a
  inputGain = 1.0;
  feedback = 0.28;

  // Onset gating state.
  private armed: boolean[];
  private cooldown: number[];

  constructor(cfg: ReservoirConfig) {
    this.N = cfg.N;
    this.nReadouts = cfg.nReadouts;
    const rng = mulberry32(cfg.seed);

    // Build sparse W: each row gets ~density*N random entries in uniform[-1,1].
    const perRow = Math.max(1, Math.round(cfg.density * cfg.N));
    const rowStart = new Int32Array(cfg.N + 1);
    const cols: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < cfg.N; i++) {
      rowStart[i] = cols.length;
      const used = new Set<number>();
      for (let k = 0; k < perRow; k++) {
        let j = (rng() * cfg.N) | 0;
        // avoid duplicate columns in a row
        let guard = 0;
        while (used.has(j) && guard++ < 8) j = (rng() * cfg.N) | 0;
        used.add(j);
        cols.push(j);
        vals.push(rng() * 2 - 1);
      }
    }
    rowStart[cfg.N] = cols.length;
    this.rowStart = rowStart;
    this.colIdx = Int32Array.from(cols);
    this.baseVals = Float32Array.from(vals);

    // Normalize base W to spectral radius 1 via power iteration, so the ρ
    // slider is just a cheap scalar multiply at step time.
    this.normalizeSpectralRadius();

    // Input weights (dense, small). Pitch and impulse each get their own map.
    this.Win = new Float32Array(cfg.N);
    this.WinImpulse = new Float32Array(cfg.N);
    for (let i = 0; i < cfg.N; i++) {
      this.Win[i] = (rng() * 2 - 1) * 0.9;
      this.WinImpulse[i] = (rng() * 2 - 1) * 1.1;
    }

    // Output feedback weights — small, let the reservoir self-drive and drift.
    this.Wfb = new Float32Array(cfg.N * cfg.nReadouts);
    for (let i = 0; i < this.Wfb.length; i++) this.Wfb[i] = (rng() * 2 - 1) * 0.6;

    // Fixed random readouts — NO training. These are the sung-back voices.
    this.Wout = new Float32Array(cfg.nReadouts * cfg.N);
    for (let i = 0; i < this.Wout.length; i++) this.Wout[i] = rng() * 2 - 1;

    this.bias = new Float32Array(cfg.N);
    for (let i = 0; i < cfg.N; i++) this.bias[i] = (rng() * 2 - 1) * 0.08;

    this.x = new Float32Array(cfg.N);
    this.xTmp = new Float32Array(cfg.N);
    this.z = new Float32Array(cfg.nReadouts);
    // seed a whisper of state so the reservoir is alive before any input
    for (let i = 0; i < cfg.N; i++) this.x[i] = (rng() * 2 - 1) * 0.05;

    this.armed = ONSET_CHANNELS.map(() => true);
    this.cooldown = ONSET_CHANNELS.map(() => 0);
  }

  private matVec(v: Float32Array, out: Float32Array): void {
    const { rowStart, colIdx, baseVals, N } = this;
    for (let i = 0; i < N; i++) {
      let acc = 0;
      const end = rowStart[i + 1];
      for (let k = rowStart[i]; k < end; k++) acc += baseVals[k] * v[colIdx[k]];
      out[i] = acc;
    }
  }

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
      lambda = norm; // dominant |eigenvalue| estimate (||Wv|| for unit v)
      for (let i = 0; i < N; i++) w[i] /= norm;
      const t = v;
      v = w;
      w = t;
    }
    if (lambda > 1e-6) {
      for (let k = 0; k < this.baseVals.length; k++) this.baseVals[k] /= lambda;
    }
  }

  // One reservoir step. impulse = onset kick (decaying), pitch ~[-1,1].
  step(impulse: number, pitch: number): ReadoutEvent[] {
    const { rowStart, colIdx, baseVals, N, x, xTmp, bias, Win, WinImpulse, Wfb, z } = this;
    const rho = this.rho;
    const a = this.leak;
    const g = this.inputGain;
    const fb = this.feedback;
    const nR = this.nReadouts;

    for (let i = 0; i < N; i++) {
      let acc = bias[i];
      const end = rowStart[i + 1];
      for (let k = rowStart[i]; k < end; k++) acc += rho * baseVals[k] * x[colIdx[k]];
      acc += (Win[i] * pitch + WinImpulse[i] * impulse) * g;
      const base = i * nR;
      for (let r = 0; r < nR; r++) acc += Wfb[base + r] * fb * z[r];
      xTmp[i] = (1 - a) * x[i] + a * Math.tanh(acc);
    }
    x.set(xTmp);

    // Fixed random linear readouts, scaled to O(1).
    const scale = 1 / Math.sqrt(N);
    for (let r = 0; r < nR; r++) {
      let acc = 0;
      const base = r * N;
      for (let i = 0; i < N; i++) acc += this.Wout[base + i] * x[i];
      z[r] = acc * scale;
    }

    // Onset gating by upward threshold-crossing with hysteresis + refractory.
    const events: ReadoutEvent[] = [];
    for (let c = 0; c < ONSET_CHANNELS.length; c++) {
      if (this.cooldown[c] > 0) this.cooldown[c]--;
      const { trig, pitch: pch } = ONSET_CHANNELS[c];
      const v = z[trig];
      if (this.armed[c] && v > ON_THRESHOLD && this.cooldown[c] === 0) {
        this.armed[c] = false;
        this.cooldown[c] = REFRACTORY;
        const vel = Math.min(1, (v - ON_THRESHOLD) * 3 + 0.25);
        events.push({ channel: c, pitch: Math.max(-1, Math.min(1, z[pch] * 2.2)), vel });
      } else if (!this.armed[c] && v < OFF_THRESHOLD) {
        this.armed[c] = true;
      }
    }
    return events;
  }

  // Mean square of the state — a proxy for reservoir "energy" / activation.
  energy(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.x[i] * this.x[i];
    return s / this.N;
  }

  // Effective fading-memory time constant, in seconds, for a given step dt.
  // Linearized decay rate near the origin is (1-a) + a·ρ per step.
  memorySeconds(dt: number): number {
    const eff = (1 - this.leak) + this.leak * this.rho;
    if (eff >= 0.999) return 999;
    const tauSteps = -1 / Math.log(eff);
    return Math.min(999, tauSteps * dt);
  }

  reset(): void {
    this.x.fill(0);
    this.z.fill(0);
    const rng = mulberry32(4242);
    for (let i = 0; i < this.N; i++) this.x[i] = (rng() * 2 - 1) * 0.05;
    for (let c = 0; c < this.armed.length; c++) {
      this.armed[c] = true;
      this.cooldown[c] = 0;
    }
  }
}
