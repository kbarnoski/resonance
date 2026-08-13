// ─────────────────────────────────────────────────────────────────────────────
// 11376 · Recall Orbit — a trained-readout Echo-State Network.
//
//   A genuine Echo-State Network (Jaeger 2001): state x ∈ R^N evolves under a
//   fixed sparse random recurrent matrix W (rescaled to spectral radius ρ),
//   driven ONLY by a phase clock u = [sin 2πφ, cos 2πφ]. The reservoir's
//   fading-memory dynamics turn that clock into a rich, high-dimensional limit
//   cycle — one loop of state that repeats every `stepsPerLoop` steps.
//
//   DEEPENING over 10984-echofold: echofold read the reservoir with FIXED RANDOM
//   projections, so it could only DRIFT — never reproduce a phrase exactly. Here
//   the readout is genuinely TRAINED by ridge / Tikhonov regression
//   (Lukoševičius & Jaeger 2009): Wout = (XᵀX + λI)⁻¹ XᵀY, solved by Cholesky.
//   Because the reservoir state is a deterministic periodic function of the clock
//   phase, a trained linear readout reproduces the taught phrase EXACTLY, forever.
//
//   The DREAM knob d∈[0,1] morphs recall into reverie: it blends the trained
//   readout toward a random one, injects state noise, and nudges ρ up past the
//   edge of chaos — so the clean closed orbit unwinds into a wandering,
//   never-repeating attractor.
//
//   No ML libraries. Deterministic (mulberry32) — a fixed, reproducible "mind".
// ─────────────────────────────────────────────────────────────────────────────

// Deterministic PRNG (mulberry32) — never Math.random.
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

export type TargetStep = { pitch: number; gate: number };

export type StepResult = {
  phase: number; // clock phase 0..1
  pitch: number; // read-out pitch, ~[-1, 1]
  gate: number; // read-out gate, ~[0, 1]
  noteOn: boolean; // true on the step an onset fires
};

// Onset gating on the trained gate channel.
const GATE_ON = 0.35; // upward crossing arms a note
const GATE_OFF = 0.15; // must fall below this to re-arm (hysteresis)
const REFRACTORY = 4; // min steps between notes

export class RecallReservoir {
  readonly N: number;
  readonly stepsPerLoop: number;

  // Sparse recurrent matrix (CSR), normalized to unit spectral radius.
  private rowStart: Int32Array;
  private colIdx: Int32Array;
  private baseVals: Float32Array;

  private Win: Float32Array; // N * nIn (clock harmonic channels)
  private nIn: number; // number of input channels (2 * nHarm)
  private nHarm: number; // clock harmonics feeding the reservoir
  private uBuf: Float32Array; // scratch input vector
  private bias: Float32Array; // N

  private x: Float32Array;
  private xTmp: Float32Array;

  // Readouts, row-major [r*N + i]. r=0 pitch, r=1 gate.
  private Wtrained: Float32Array; // N*2, from ridge regression
  private Wrandom: Float32Array; // N*2, scaled to ||Wtrained||
  private Weff: Float32Array; // N*2, blended by dream

  // Target phrase (one loop) the readout is trained to reproduce.
  private targetArr: TargetStep[];

  // Fixed random 3×N projection for the phase-portrait viz (own seed).
  private Pproj: Float32Array; // 3*N
  private p3: Float32Array; // smoothed 3-D point
  private p3raw: Float32Array;

  // Live state.
  private phase = 0;
  private dream = 0;
  private rhoBase = 0.95;
  private leak = 0.3;
  private noiseRng: () => number;

  private lastPitch = 0;
  private lastGate = 0;
  private armed = true;
  private cooldown = 0;
  private seed: number;

  constructor(seed: number, N = 180, stepsPerLoop = 96, density = 0.12) {
    this.N = N;
    this.stepsPerLoop = stepsPerLoop;
    this.seed = seed;
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
    this.baseVals = Float32Array.from(vals);
    this.normalizeSpectralRadius();

    // Dense input weights for the clock harmonic channels + small bias. The base
    // channel is u=[sin 2πφ, cos 2πφ]; a few higher harmonics give the trained
    // readout a sharp-enough basis to reproduce note onsets exactly (still pure
    // clock/phase features — never the melody itself).
    this.nHarm = 8;
    this.nIn = this.nHarm * 2;
    this.uBuf = new Float32Array(this.nIn);
    this.Win = new Float32Array(N * this.nIn);
    for (let i = 0; i < N * this.nIn; i++) this.Win[i] = (rng() * 2 - 1) * 0.9;
    this.bias = new Float32Array(N);
    for (let i = 0; i < N; i++) this.bias[i] = (rng() * 2 - 1) * 0.08;

    this.x = new Float32Array(N);
    this.xTmp = new Float32Array(N);
    for (let i = 0; i < N; i++) this.x[i] = (rng() * 2 - 1) * 0.05;

    this.Wtrained = new Float32Array(N * 2);
    this.Wrandom = new Float32Array(N * 2);
    this.Weff = new Float32Array(N * 2);

    // Fixed random projection to 3-D (separate seed stream).
    const prng = mulberry32(seed ^ 0x9e3779b9);
    this.Pproj = new Float32Array(3 * N);
    for (let i = 0; i < 3 * N; i++) this.Pproj[i] = prng() * 2 - 1;
    this.p3 = new Float32Array(3);
    this.p3raw = new Float32Array(3);

    this.noiseRng = mulberry32(seed ^ 0x51ed270b);

    // A neutral seeded target so the engine is valid before any training.
    this.targetArr = defaultTarget(stepsPerLoop, seed);
  }

  // ── Sparse mat-vec: out = W · v ──────────────────────────────────────────────
  private matVec(v: Float32Array, out: Float32Array): void {
    const { rowStart, colIdx, baseVals, N } = this;
    for (let i = 0; i < N; i++) {
      let acc = 0;
      const end = rowStart[i + 1];
      for (let k = rowStart[i]; k < end; k++) acc += baseVals[k] * v[colIdx[k]];
      out[i] = acc;
    }
  }

  // Power iteration → scale base W to spectral radius 1 (ρ is a step-time scalar).
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
      for (let k = 0; k < this.baseVals.length; k++) this.baseVals[k] /= lambda;
    }
  }

  // One reservoir update at a given phase. dreamOn adds edge-of-chaos noise + ρ.
  private update(phase: number, dreamOn: boolean): void {
    const { rowStart, colIdx, baseVals, N, x, xTmp, bias, Win, nIn, nHarm, uBuf } = this;
    const d = dreamOn ? this.dream : 0;
    // As memory loosens toward dream: push ρ past the edge of chaos AND fade the
    // clock's grip, so the reservoir stops being slaved to the metronome and
    // runs freely on its own now-supercritical recurrence — the orbit unwinds.
    const rho = this.rhoBase + 0.3 * d;
    const inScale = 1 - 0.75 * d;
    const a = this.leak;
    const twoPi = 2 * Math.PI * phase;
    for (let h = 0; h < nHarm; h++) {
      uBuf[h * 2] = Math.sin(twoPi * (h + 1)) * inScale;
      uBuf[h * 2 + 1] = Math.cos(twoPi * (h + 1)) * inScale;
    }
    for (let i = 0; i < N; i++) {
      let acc = bias[i];
      const end = rowStart[i + 1];
      for (let k = rowStart[i]; k < end; k++) acc += rho * baseVals[k] * x[colIdx[k]];
      const wb = i * nIn;
      for (let c = 0; c < nIn; c++) acc += Win[wb + c] * uBuf[c];
      xTmp[i] = (1 - a) * x[i] + a * Math.tanh(acc);
    }
    x.set(xTmp);
    if (d > 0) {
      // Injected state noise ∝ dream — breaks the exact periodicity. With ρ
      // pushed past the edge of chaos above, the recurrence amplifies these
      // perturbations so the closed orbit unwinds into a wandering attractor.
      const amp = 0.08 * d;
      for (let i = 0; i < N; i++) x[i] += (this.noiseRng() * 2 - 1) * amp;
    }
  }

  private readout(W: Float32Array, out: [number, number]): void {
    const { N, x } = this;
    let p = 0;
    let g = 0;
    for (let i = 0; i < N; i++) {
      const xi = x[i];
      p += W[i] * xi;
      g += W[N + i] * xi;
    }
    out[0] = p;
    out[1] = g;
  }

  // ── TRAIN: ridge regression on clock-driven states (Lukoševičius–Jaeger 09) ──
  // Drives the reservoir with the clock for `washout` loops (discarded, so the
  // state has fully settled onto its limit cycle) then collects state rows X and
  // targets Y over `collect` loops; solves Wout via Cholesky. Training on the
  // CONVERGED cycle is what makes generation reproduce the phrase exactly.
  train(washout = 4, collect = 2): void {
    const { N, stepsPerLoop } = this;
    this.resetState();

    // Normal-equation accumulators in double precision.
    const M = new Float64Array(N * N); // XᵀX + λI
    const B0 = new Float64Array(N); // Xᵀ·pitch
    const B1 = new Float64Array(N); // Xᵀ·gate

    const loops = washout + collect;
    for (let loop = 0; loop < loops; loop++) {
      for (let s = 0; s < stepsPerLoop; s++) {
        const phase = s / stepsPerLoop;
        this.update(phase, false);
        if (loop >= washout) {
          const tgt = this.targetArr[s];
          const x = this.x;
          // Accumulate XᵀX (upper triangle) and XᵀY.
          for (let i = 0; i < N; i++) {
            const xi = x[i];
            B0[i] += xi * tgt.pitch;
            B1[i] += xi * tgt.gate;
            const base = i * N;
            for (let j = i; j < N; j++) M[base + j] += xi * x[j];
          }
        }
      }
    }

    // Mirror upper→lower and add ridge λ on the diagonal.
    const lambda = 1e-3;
    for (let i = 0; i < N; i++) {
      M[i * N + i] += lambda;
      for (let j = i + 1; j < N; j++) M[j * N + i] = M[i * N + j];
    }

    // Solve M · w = B for each output column via Cholesky (M is SPD).
    const L = choleskyFactor(M, N);
    const w0 = choleskySolve(L, B0, N);
    const w1 = choleskySolve(L, B1, N);
    for (let i = 0; i < N; i++) {
      this.Wtrained[i] = w0[i];
      this.Wtrained[N + i] = w1[i];
    }

    // Build the random comparison readout, scaled per-column to ||Wtrained||.
    const rng = mulberry32(this.seed ^ 0x2545f491);
    let n0 = 0;
    let n1 = 0;
    for (let i = 0; i < N; i++) {
      n0 += this.Wtrained[i] * this.Wtrained[i];
      n1 += this.Wtrained[N + i] * this.Wtrained[N + i];
    }
    n0 = Math.sqrt(n0) || 1;
    n1 = Math.sqrt(n1) || 1;
    const r0 = new Float64Array(N);
    const r1 = new Float64Array(N);
    let rn0 = 0;
    let rn1 = 0;
    for (let i = 0; i < N; i++) {
      r0[i] = rng() * 2 - 1;
      r1[i] = rng() * 2 - 1;
      rn0 += r0[i] * r0[i];
      rn1 += r1[i] * r1[i];
    }
    rn0 = Math.sqrt(rn0) || 1;
    rn1 = Math.sqrt(rn1) || 1;
    for (let i = 0; i < N; i++) {
      this.Wrandom[i] = (r0[i] / rn0) * n0;
      this.Wrandom[N + i] = (r1[i] / rn1) * n1;
    }

    this.applyDreamBlend();
    // Leave the reservoir on the loop it just trained on so recall is seamless.
    this.phase = 0;
    this.armed = true;
    this.cooldown = 0;
  }

  private applyDreamBlend(): void {
    const d = this.dream;
    const L = this.Wtrained.length;
    for (let i = 0; i < L; i++) {
      this.Weff[i] = (1 - d) * this.Wtrained[i] + d * this.Wrandom[i];
    }
  }

  setDream(d: number): void {
    this.dream = Math.max(0, Math.min(1, d));
    this.applyDreamBlend();
  }

  setTarget(target: TargetStep[]): void {
    // Copy / clamp to exactly one loop.
    const t: TargetStep[] = [];
    for (let s = 0; s < this.stepsPerLoop; s++) {
      const src = target[s] ?? { pitch: 0, gate: 0 };
      t.push({
        pitch: Math.max(-1, Math.min(1, src.pitch)),
        gate: Math.max(0, Math.min(1, src.gate)),
      });
    }
    this.targetArr = t;
  }

  get target(): ReadonlyArray<TargetStep> {
    return this.targetArr;
  }

  // ── GENERATE: advance clock, step, read out, emit note on gate onset ─────────
  stepGenerate(): StepResult {
    this.update(this.phase, true);
    const out: [number, number] = [0, 0];
    this.readout(this.Weff, out);
    const pitch = out[0];
    const gate = out[1];
    this.lastPitch = pitch;
    this.lastGate = gate;

    let noteOn = false;
    if (this.cooldown > 0) this.cooldown--;
    if (this.armed && gate > GATE_ON && this.cooldown === 0) {
      this.armed = false;
      this.cooldown = REFRACTORY;
      noteOn = true;
    } else if (!this.armed && gate < GATE_OFF) {
      this.armed = true;
    }

    const phase = this.phase;
    this.phase += 1 / this.stepsPerLoop;
    if (this.phase >= 1) this.phase -= 1;
    return { phase, pitch, gate, noteOn };
  }

  // ── VIZ: project state → smoothed 3-D point via fixed random 3×N matrix ──────
  project3(out: Float32Array): void {
    const { N, x, Pproj } = this;
    const s = 1 / Math.sqrt(N);
    let a = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < N; i++) {
      const xi = x[i];
      a += Pproj[i] * xi;
      b += Pproj[N + i] * xi;
      c += Pproj[2 * N + i] * xi;
    }
    this.p3raw[0] = a * s;
    this.p3raw[1] = b * s;
    this.p3raw[2] = c * s;
    // Light easing so the ribbon is smooth, not jittery.
    const e = 0.35;
    for (let k = 0; k < 3; k++) {
      this.p3[k] += (this.p3raw[k] - this.p3[k]) * e;
      out[k] = this.p3[k];
    }
  }

  // Per-unit activation for the point cloud lighting.
  get state(): Float32Array {
    return this.x;
  }

  energy(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.x[i] * this.x[i];
    return s / this.N;
  }

  get pitchOut(): number {
    return this.lastPitch;
  }
  get gateOut(): number {
    return this.lastGate;
  }
  get dreamLevel(): number {
    return this.dream;
  }

  private resetState(): void {
    this.x.fill(0);
    const rng = mulberry32(this.seed ^ 0x68e31da4);
    for (let i = 0; i < this.N; i++) this.x[i] = (rng() * 2 - 1) * 0.05;
    this.p3.fill(0);
    this.p3raw.fill(0);
  }

  reset(): void {
    this.resetState();
    this.phase = 0;
    this.armed = true;
    this.cooldown = 0;
  }
}

// A seeded 8–12 note modal contour (~1.5 octaves) as a training target. Pitch is
// the melody contour in [-1,1]; gate is 1 on the onset step with a short 1→0
// envelope over the next 2 steps for smooth, trainable edges.
export function makeSeedTarget(stepsPerLoop: number, seed: number): TargetStep[] {
  const rng = mulberry32(seed);
  // Dorian-ish degrees over ~1.5 octaves (semitone offsets from a center).
  const scale = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];
  const nNotes = 8 + Math.floor(rng() * 5); // 8..12
  const target: TargetStep[] = Array.from({ length: stepsPerLoop }, () => ({
    pitch: 0,
    gate: 0,
  }));
  const span = 18; // semitone span for normalization (~1.5 octaves)
  // A short raised-cosine bump per onset — smooth enough for the readout to
  // reproduce, sharp enough to threshold-detect. Rises over `pre` steps to 1 at
  // the onset step, falls over `post` steps.
  const pre = 2;
  const post = 3;
  const onsetSteps: number[] = [];
  for (let n = 0; n < nNotes; n++) {
    const stepIdx = Math.floor((n / nNotes) * stepsPerLoop);
    onsetSteps.push(stepIdx);
    const deg = scale[Math.floor(rng() * scale.length)];
    const semi = deg - 8; // center it
    const pitch = Math.max(-1, Math.min(1, semi / (span / 2)));
    for (let o = -pre; o <= post; o++) {
      const s = stepIdx + o;
      if (s < 0 || s >= stepsPerLoop) continue;
      const w = o <= 0 ? 1 + o / (pre + 1) : 1 - o / (post + 1);
      const bump = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, w)) * 2);
      // Half-raised-cosine centered on the onset step.
      const env = 0.5 + 0.5 * Math.cos((Math.PI * o) / (o <= 0 ? pre + 1 : post + 1));
      void bump;
      if (env > target[s].gate) target[s].gate = env;
    }
    target[stepIdx].pitch = pitch;
  }
  // Hold pitch as a piecewise-constant contour between onsets (smooth, fittable).
  let held = target[onsetSteps[0]].pitch;
  let oi = 0;
  for (let s = 0; s < stepsPerLoop; s++) {
    if (oi < onsetSteps.length && s === onsetSteps[oi]) {
      held = target[s].pitch;
      oi++;
    }
    target[s].pitch = held;
  }
  return target;
}

// A neutral fallback target used before training.
function defaultTarget(stepsPerLoop: number, seed: number): TargetStep[] {
  return makeSeedTarget(stepsPerLoop, seed);
}

// ── Cholesky of an SPD matrix M (row-major N×N) → lower L with M = L·Lᵀ ────────
function choleskyFactor(M: Float64Array, N: number): Float64Array {
  const L = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = M[i * N + j];
      const li = i * N;
      const lj = j * N;
      for (let k = 0; k < j; k++) sum -= L[li + k] * L[lj + k];
      if (i === j) {
        // Guard against tiny negative round-off on the diagonal.
        L[li + j] = Math.sqrt(Math.max(sum, 1e-12));
      } else {
        L[li + j] = sum / L[lj + j];
      }
    }
  }
  return L;
}

// Solve L·Lᵀ·x = b given lower L (row-major N×N). Double-precision throughout.
function choleskySolve(L: Float64Array, b: Float64Array, N: number): Float64Array {
  const y = new Float64Array(N);
  // Forward solve L·y = b.
  for (let i = 0; i < N; i++) {
    let sum = b[i];
    const li = i * N;
    for (let k = 0; k < i; k++) sum -= L[li + k] * y[k];
    y[i] = sum / L[li + i];
  }
  // Back solve Lᵀ·x = y.
  const x = new Float64Array(N);
  for (let i = N - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < N; k++) sum -= L[k * N + i] * x[k];
    x[i] = sum / L[i * N + i];
  }
  return x;
}
