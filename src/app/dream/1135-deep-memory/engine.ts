// engine.ts — SlowMachine: a long-form generative machine with MEMORY.
//
// A live Markov transition matrix over scale degrees that reinforces the
// paths it actually walks (Hebbian bump), forgets slowly (decay toward a
// baseline), and drifts under steered mutation. Reinforcement + mutation +
// live steering all feed back into the sampling distribution, so the exact
// matrix state provably never recurs: it is a drifting attractor, not a loop.
//
// Determinism: mulberry32 PRNG only. No Math.random / Date.now anywhere.

// ── Seedable PRNG ────────────────────────────────────────────────────────────

/** mulberry32 — tiny deterministic PRNG. Returns a function in [0, 1). */
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

// ── Scales ───────────────────────────────────────────────────────────────────

export type ScaleId = "dorian" | "pentatonic" | "phrygian";

export interface ScaleDef {
  id: ScaleId;
  label: string;
  /** Semitone offsets from the tonic, one per degree. */
  intervals: number[];
  /** Rough consonance weight per degree (higher = more restful). */
  restful: number[];
}

export const SCALES: Record<ScaleId, ScaleDef> = {
  dorian: {
    id: "dorian",
    label: "Dorian",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    restful: [1.0, 0.4, 0.6, 0.5, 0.9, 0.5, 0.3],
  },
  pentatonic: {
    id: "pentatonic",
    label: "Pentatonic",
    intervals: [0, 2, 4, 7, 9],
    restful: [1.0, 0.5, 0.7, 0.9, 0.5],
  },
  phrygian: {
    id: "phrygian",
    label: "Phrygian",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    restful: [1.0, 0.2, 0.6, 0.5, 0.9, 0.3, 0.4],
  },
};

// ── Steering ─────────────────────────────────────────────────────────────────

export interface Steering {
  /** 0..1 — event rate / how eager it is to move on. */
  density: number;
  /** 0..1 — pull toward dissonant / far leaps vs. restful degrees. */
  tension: number;
  /** 0..1 — octave register bias, low → high. */
  register: number;
  /** 0..1 — how fast memory forgets and drifts. */
  mutation: number;
}

export interface Snapshot {
  matrix: number[][];
  /** Row-normalised probabilities for the CURRENT degree (for the firing edge). */
  outgoing: number[];
  entropy: number; // 0..1 normalised Shannon entropy of the whole matrix
  consonance: number; // 0..1 running restfulness of recent notes
  density: number; // echoes steering, for the readout
  currentDegree: number;
  step: number;
  /** MIDI of the note just produced by step(). */
  midi: number;
  /** Which edge just fired: [from, to]. */
  firedEdge: [number, number];
}

// ── The machine ──────────────────────────────────────────────────────────────

export class SlowMachine {
  readonly n: number;
  readonly scale: ScaleDef;
  private rng: () => number;
  private M: number[][]; // transition weights (unnormalised, >= 0)
  private baseline: number[][]; // decay target
  private current = 0;
  private stepCount = 0;
  private consRun = 0.5;
  steering: Steering = {
    density: 0.5,
    tension: 0.4,
    register: 0.45,
    mutation: 0.35,
  };

  constructor(scaleId: ScaleId, seed: number) {
    this.scale = SCALES[scaleId];
    this.n = this.scale.intervals.length;
    this.rng = mulberry32(seed >>> 0);

    // Baseline: a mild diffusion favouring small steps + a pull toward the
    // tonic. This is what every row slowly leaks back toward (forgetting).
    this.baseline = [];
    this.M = [];
    for (let i = 0; i < this.n; i++) {
      const bRow: number[] = [];
      for (let j = 0; j < this.n; j++) {
        const dist = Math.min(Math.abs(i - j), this.n - Math.abs(i - j));
        const near = Math.exp(-dist * 0.9);
        const tonicPull = j === 0 ? 0.35 : 0;
        bRow.push(near + tonicPull + 0.05);
      }
      this.baseline.push(bRow);
      // Start the live matrix as a slightly randomised copy of the baseline.
      this.M.push(bRow.map((v) => v * (0.7 + this.rng() * 0.6)));
    }
  }

  /** Seed a short motif as initial reinforcement — the "first memories". */
  seedMotif(degrees: number[]): void {
    if (degrees.length < 2) return;
    for (let k = 0; k < degrees.length - 1; k++) {
      const a = ((degrees[k] % this.n) + this.n) % this.n;
      const b = ((degrees[k + 1] % this.n) + this.n) % this.n;
      this.M[a][b] += 2.2;
    }
    this.current = ((degrees[degrees.length - 1] % this.n) + this.n) % this.n;
  }

  /** A jolt of steered noise into every row — a passing thought. */
  perturb(): void {
    const amt = 0.6 + this.steering.mutation * 1.4;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        this.M[i][j] += (this.rng() - 0.35) * amt;
        if (this.M[i][j] < 0.01) this.M[i][j] = 0.01;
      }
    }
  }

  private rowProbs(i: number): number[] {
    const row = this.M[i];
    const { tension } = this.steering;
    // Tension re-weights the row: high tension boosts unrestful degrees and
    // large leaps; low tension favours restful degrees near the tonic.
    const weighted: number[] = [];
    let sum = 0;
    for (let j = 0; j < this.n; j++) {
      const rest = this.scale.restful[j];
      const dist = Math.min(Math.abs(i - j), this.n - Math.abs(i - j));
      const tensionBias =
        (1 - tension) * (0.4 + rest) + tension * (0.4 + dist / this.n + (1 - rest));
      const w = Math.max(0.0001, row[j]) * (0.35 + tensionBias);
      weighted.push(w);
      sum += w;
    }
    if (sum <= 0) return new Array(this.n).fill(1 / this.n);
    for (let j = 0; j < this.n; j++) weighted[j] /= sum;
    return weighted;
  }

  private sampleFrom(probs: number[]): number {
    const r = this.rng();
    let acc = 0;
    for (let j = 0; j < this.n; j++) {
      acc += probs[j];
      if (r <= acc) return j;
    }
    return this.n - 1;
  }

  /** Advance one note. Returns a full snapshot of the mind after the move. */
  step(): Snapshot {
    const from = this.current;
    const probs = this.rowProbs(from);
    const to = this.sampleFrom(probs);

    // ── Hebbian reinforcement: the path taken becomes a stronger memory.
    const reinforce = 0.55 + this.steering.density * 0.5;
    this.M[from][to] += reinforce;
    // Cap so no single synapse dominates forever.
    if (this.M[from][to] > 14) this.M[from][to] = 14;

    // ── Decay + steered mutation: every row leaks toward baseline, plus noise.
    const mut = this.steering.mutation;
    const decay = 0.006 + mut * 0.03; // forgetting rate
    const noise = 0.02 + mut * 0.09; // drift amplitude
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        const b = this.baseline[i][j];
        this.M[i][j] += (b - this.M[i][j]) * decay; // leak toward baseline
        this.M[i][j] += (this.rng() - 0.5) * noise; // steered mutation
        if (this.M[i][j] < 0.01) this.M[i][j] = 0.01;
      }
    }

    this.current = to;
    this.stepCount++;

    // Running consonance from restfulness of the chosen degree.
    this.consRun = this.consRun * 0.9 + this.scale.restful[to] * 0.1;

    // Register: choose an octave biased by steering.register with a little
    // deterministic wobble so it breathes.
    const reg = this.steering.register;
    const octWobble = this.rng();
    const octave = reg < 0.33 ? 3 : reg > 0.66 ? 5 : octWobble < 0.5 ? 4 : 5;
    const finalMidi = 24 + octave * 12 + this.scale.intervals[to];

    return {
      matrix: this.M.map((r) => r.slice()),
      outgoing: this.rowProbs(to),
      entropy: this.entropy(),
      consonance: this.consRun,
      density: this.steering.density,
      currentDegree: to,
      step: this.stepCount,
      midi: finalMidi,
      firedEdge: [from, to],
    };
  }

  /** Normalised Shannon entropy across the whole (row-normalised) matrix. */
  private entropy(): number {
    let total = 0;
    let count = 0;
    for (let i = 0; i < this.n; i++) {
      const row = this.M[i];
      let s = 0;
      for (let j = 0; j < this.n; j++) s += row[j];
      if (s <= 0) continue;
      let h = 0;
      for (let j = 0; j < this.n; j++) {
        const p = row[j] / s;
        if (p > 1e-9) h -= p * Math.log(p);
      }
      total += h / Math.log(this.n);
      count++;
    }
    return count ? total / count : 0;
  }

  /** Read-only view for first paint before any step. */
  snapshot(): Snapshot {
    return {
      matrix: this.M.map((r) => r.slice()),
      outgoing: this.rowProbs(this.current),
      entropy: this.entropy(),
      consonance: this.consRun,
      density: this.steering.density,
      currentDegree: this.current,
      step: this.stepCount,
      midi: 24 + 4 * 12 + this.scale.intervals[this.current],
      firedEdge: [this.current, this.current],
    };
  }
}
