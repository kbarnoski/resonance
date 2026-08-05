// engine.ts — 7128-mimic
// Real-time evolutionary synthesizer inversion. NO ML.
// A population of synth-parameter vectors competes each generation; the ones
// whose rendered magnitude spectrum best matches a live target spectrum
// survive, breed via differential evolution, and mutate. The best vector
// drives an audible Web Audio voice, so you HEAR the synth chase the target.
//
// Determinism: all randomness comes from mulberry32(0x7128). No Math.random,
// no Date.now, no new Date anywhere.

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

/** Seeded PRNG — deterministic, replayable. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Parameter space
// ---------------------------------------------------------------------------

/** Human-readable names for the parameter vector (for the readout). */
export const PARAM_NAMES = [
  "f0 (Hz)",
  "ratio 2",
  "ratio 3",
  "amp 2",
  "amp 3",
  "tilt",
  "formant (Hz)",
  "noise",
] as const;

export const PARAM_COUNT = PARAM_NAMES.length;

/** [min, max] for each parameter — search stays clamped inside these. */
export const PARAM_RANGES: ReadonlyArray<readonly [number, number]> = [
  [70, 520], // f0 base frequency
  [1.5, 3.0], // partial-2 ratio
  [2.2, 6.0], // partial-3 ratio
  [0.0, 1.0], // partial-2 amplitude
  [0.0, 1.0], // partial-3 amplitude
  [-1.4, 1.4], // spectral tilt (dark → bright)
  [280, 2800], // formant centre frequency
  [0.0, 0.55], // noise mix
];

export type ParamVec = number[];

// ---------------------------------------------------------------------------
// Analysis bands — log-spaced centres shared by target & candidates
// ---------------------------------------------------------------------------

export const BAND_COUNT = 48;
const F_MIN = 80;
const F_MAX = 8000;

/** Log-spaced centre frequency (Hz) for each analysis band. */
export const BAND_FREQS: number[] = (() => {
  const out: number[] = [];
  const logMin = Math.log(F_MIN);
  const logMax = Math.log(F_MAX);
  for (let j = 0; j < BAND_COUNT; j++) {
    const t = j / (BAND_COUNT - 1);
    out.push(Math.exp(logMin + (logMax - logMin) * t));
  }
  return out;
})();

const EPS = 1e-4;

/** Normalize a spectrum to unit sum (compares shape, not loudness). */
function normalize(spec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < spec.length; i++) sum += spec[i];
  if (sum <= EPS) return spec;
  const inv = 1 / sum;
  for (let i = 0; i < spec.length; i++) spec[i] *= inv;
  return spec;
}

// ---------------------------------------------------------------------------
// Analytic synth spectrum renderer
// ---------------------------------------------------------------------------

const PARTIAL_BW = 0.13; // Gaussian half-width in octaves per partial
const FORMANT_BW = 0.42; // formant bump width in octaves

/**
 * Render the expected magnitude spectrum of a candidate analytically.
 * Fast (no audio graph) — this is what makes thousands of evaluations/sec
 * feasible in the browser. Result is normalized to unit sum.
 */
export function renderSpectrum(p: ParamVec, out?: Float32Array): Float32Array {
  const spec = out ?? new Float32Array(BAND_COUNT);
  const f0 = p[0];
  const partials: Array<[number, number]> = [
    [f0, 1.0],
    [f0 * p[1], p[3]],
    [f0 * p[2], p[4]],
  ];
  const tilt = p[5];
  const formant = p[6];
  const noise = p[7];

  for (let j = 0; j < BAND_COUNT; j++) {
    const fc = BAND_FREQS[j];
    let mag = 0;
    for (let k = 0; k < partials.length; k++) {
      const f = partials[k][0];
      const a = partials[k][1];
      if (f <= 0 || a <= 0) continue;
      const d = Math.log2(fc / f);
      mag += a * Math.exp(-(d * d) / (2 * PARTIAL_BW * PARTIAL_BW));
    }
    // Formant emphasis — a resonant band-pass hump.
    const df = Math.log2(fc / formant);
    const formantGain =
      0.35 + 0.65 * Math.exp(-(df * df) / (2 * FORMANT_BW * FORMANT_BW));
    mag *= formantGain;
    // Spectral tilt (dark ↔ bright).
    mag *= Math.pow(fc / 400, tilt);
    // Broadband noise floor.
    mag += noise * 0.04;
    spec[j] = mag;
  }
  return normalize(spec);
}

// ---------------------------------------------------------------------------
// Fitness — negative log-spectral distance
// ---------------------------------------------------------------------------

/** Higher is better. Negative sum of |Δlog| over bands. */
export function fitness(target: Float32Array, cand: Float32Array): number {
  let dist = 0;
  for (let j = 0; j < BAND_COUNT; j++) {
    dist += Math.abs(Math.log(target[j] + EPS) - Math.log(cand[j] + EPS));
  }
  return -dist;
}

// ---------------------------------------------------------------------------
// The hidden seeded target — a formant-ish chord the population chases on load
// ---------------------------------------------------------------------------

/** Fixed, reachable target so convergence is guaranteed & visible on mount. */
export const SEED_TARGET_PARAMS: ParamVec = [
  146.0, // f0 ~ D3
  2.01, // ratio → an octave-ish partial
  3.98, // ratio → two-octaves-ish partial
  0.62,
  0.34,
  0.25, // slightly bright
  1180, // vowel-ish formant
  0.12,
];

export function makeSeedTarget(): Float32Array {
  return renderSpectrum(SEED_TARGET_PARAMS);
}

// ---------------------------------------------------------------------------
// The evolutionary searcher
// ---------------------------------------------------------------------------

export interface Individual {
  params: ParamVec;
  spec: Float32Array;
  fit: number;
}

export interface SearchState {
  generation: number;
  best: Individual;
  population: Individual[];
  fitHistory: number[]; // best fitness per generation (for sparkline)
}

const F_DE = 0.6; // differential weight
const CR = 0.85; // crossover rate

function clampParams(p: ParamVec): ParamVec {
  for (let i = 0; i < PARAM_COUNT; i++) {
    const [lo, hi] = PARAM_RANGES[i];
    if (p[i] < lo) p[i] = lo;
    else if (p[i] > hi) p[i] = hi;
  }
  return p;
}

/** Evolutionary parameter-inversion engine. */
export class MimicSearch {
  private rand: () => number;
  private pop: Individual[] = [];
  private target: Float32Array;
  private gen = 0;
  private history: number[] = [];
  private popSize: number;

  constructor(target: Float32Array, popSize = 24) {
    this.rand = mulberry32(0x7128);
    this.popSize = popSize;
    this.target = target;
    for (let i = 0; i < popSize; i++) {
      const params = this.randomParams();
      const spec = renderSpectrum(params);
      this.pop.push({ params, spec, fit: fitness(target, spec) });
    }
    this.sort();
  }

  private randomParams(): ParamVec {
    const p: ParamVec = new Array(PARAM_COUNT);
    for (let i = 0; i < PARAM_COUNT; i++) {
      const [lo, hi] = PARAM_RANGES[i];
      p[i] = lo + this.rand() * (hi - lo);
    }
    return p;
  }

  /** Standard normal via Box–Muller, using only the seeded PRNG. */
  private gauss(): number {
    let u = 0;
    let v = 0;
    while (u <= 1e-7) u = this.rand();
    while (v <= 1e-7) v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private sort() {
    this.pop.sort((a, b) => b.fit - a.fit);
  }

  /** Swap in a new target (e.g. the live mic spectrum). Re-scores population. */
  setTarget(target: Float32Array) {
    this.target = target;
    for (const ind of this.pop) ind.fit = fitness(target, ind.spec);
    this.sort();
  }

  /** Advance one generation. Elitism + differential evolution + mutation. */
  step(): SearchState {
    const n = this.popSize;
    const next: Individual[] = [];
    // Elitism — keep the current best untouched.
    next.push(this.pop[0]);

    for (let i = 1; i < n; i++) {
      const base = this.pop[i];
      // Pick three distinct partners, biased toward the fitter half.
      const a = this.pick();
      const b = this.pick();
      const c = this.pick();
      const trial: ParamVec = new Array(PARAM_COUNT);
      const jRand = Math.floor(this.rand() * PARAM_COUNT);
      for (let d = 0; d < PARAM_COUNT; d++) {
        if (this.rand() < CR || d === jRand) {
          // DE/rand/1 mutation + a little Gaussian jitter.
          const [lo, hi] = PARAM_RANGES[d];
          const scale = (hi - lo) * 0.03;
          trial[d] =
            a.params[d] +
            F_DE * (b.params[d] - c.params[d]) +
            this.gauss() * scale;
        } else {
          trial[d] = base.params[d];
        }
      }
      clampParams(trial);
      const spec = renderSpectrum(trial);
      const fit = fitness(this.target, spec);
      // Greedy selection against the base slot.
      next.push(fit > base.fit ? { params: trial, spec, fit } : base);
    }

    this.pop = next;
    this.sort();
    this.gen += 1;
    this.history.push(this.pop[0].fit);
    if (this.history.length > 240) this.history.shift();

    return this.state();
  }

  /** Rank-biased partner selection (favours fitter individuals). */
  private pick(): Individual {
    const n = this.popSize;
    // Square the uniform → bias toward index 0 (the fittest).
    const r = this.rand() * this.rand();
    const idx = Math.min(n - 1, Math.floor(r * n));
    return this.pop[idx];
  }

  state(): SearchState {
    return {
      generation: this.gen,
      best: this.pop[0],
      population: this.pop,
      fitHistory: this.history,
    };
  }
}

// ---------------------------------------------------------------------------
// Audible synth voice — driven by the best candidate each generation
// ---------------------------------------------------------------------------

/**
 * A small, self-contained Web Audio voice: three oscillators (fundamental +
 * two partials) through a formant band-pass, plus a touch of filtered noise.
 * Parameters are eased toward the best candidate so you hear it converge.
 */
export class MimicVoice {
  private ctx: AudioContext;
  private osc: OscillatorNode[] = [];
  private oscGain: GainNode[] = [];
  private formant: BiquadFilterNode;
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;
  private master: GainNode;
  private started = false;

  constructor(ctx: AudioContext, rand: () => number) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;

    this.formant = ctx.createBiquadFilter();
    this.formant.type = "bandpass";
    this.formant.frequency.value = 1000;
    this.formant.Q.value = 2.5;
    this.formant.connect(this.master);

    // Blend a little dry signal so partials aren't fully swallowed.
    const dry = ctx.createGain();
    dry.gain.value = 0.5;
    dry.connect(this.master);

    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sawtooth" : "sine";
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.0;
      o.connect(g);
      g.connect(this.formant);
      g.connect(dry);
      this.osc.push(o);
      this.oscGain.push(g);
    }

    // Deterministic noise buffer (seeded — no Math.random).
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.noise = noise;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    noise.connect(this.noiseGain);
    this.noiseGain.connect(this.formant);

    this.master.connect(ctx.destination);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    for (const o of this.osc) o.start(t);
    this.noise?.start(t);
    // Gentle fade-in — no clicks, no sudden loudness.
    this.master.gain.setTargetAtTime(0.16, t, 0.4);
  }

  /** Push the best candidate's parameters into the live voice, smoothly. */
  update(p: ParamVec) {
    const t = this.ctx.currentTime;
    const tau = 0.08; // smoothing time constant
    const f0 = p[0];
    const freqs = [f0, f0 * p[1], f0 * p[2]];
    const gains = [0.5, p[3] * 0.5, p[4] * 0.4];
    for (let i = 0; i < 3; i++) {
      this.osc[i].frequency.setTargetAtTime(freqs[i], t, tau);
      this.oscGain[i].gain.setTargetAtTime(gains[i], t, tau);
    }
    this.formant.frequency.setTargetAtTime(p[6], t, tau);
    // Tilt → filter Q (brighter timbre = tighter resonance).
    this.formant.Q.setTargetAtTime(1.5 + Math.abs(p[5]) * 3, t, tau);
    this.noiseGain.gain.setTargetAtTime(p[7] * 0.12, t, tau);
  }

  setLevel(v: number) {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v, t, 0.3);
  }

  stop() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.2);
    try {
      for (const o of this.osc) o.stop(t + 0.5);
      this.noise?.stop(t + 0.5);
    } catch {
      // already stopped
    }
  }
}
