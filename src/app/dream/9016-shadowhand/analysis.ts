// analysis.ts — the "ear" of the shadow hand.
//
// Score-following DSP that LISTENS to whatever audio is currently playing
// (Karel's real recording, or the procedural fallback) and, per frame, reports:
//   • an ONSET (spectral-flux rising edge — new notes/attacks),
//   • a 12-bin CHROMA (pitch-class energy → dominant pitch + rough key),
//   • ENERGY (broadband density — how "busy" the human hand is right now),
//   • a phase-locked BEAT clock (inter-onset-interval smoothing → bpm + phase).
// No ML, no libraries — just an FFT magnitude read from an AnalyserNode.
//
// It also owns the SEEDED muted-read demo: a deterministic synthetic stream so
// the two-hand field is already breathing at 06:30 with zero audio.

// ── seeded PRNG — the ONLY source of randomness in this prototype ─────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── shared state that both the accompanist and the visualization read ─────────
export interface VizState {
  onsetA: number; // Karel's hand — smoothed onset/excitation envelope 0..1
  onsetB: number; // the accompanist's hand — its own excitation envelope 0..1
  chroma: Float32Array; // 12 pitch-class energies (normalized)
  dominant: number; // argmax chroma (0..11)
  key: number; // slow-estimated tonic pitch class (0..11)
  energy: number; // broadband density 0..1
  bpm: number;
  beatPhase: number; // 0..1 across the current beat
}

export function makeVizState(): VizState {
  return {
    onsetA: 0,
    onsetB: 0,
    chroma: new Float32Array(12),
    dominant: 0,
    key: 0,
    energy: 0,
    bpm: 90,
    beatPhase: 0,
  };
}

// Major scale over the estimated tonic — the accompanist quantizes to this.
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

/** Snap a MIDI note to the nearest tone of `key`'s major scale. */
export function quantizeToKey(midi: number, key: number): number {
  const oct = Math.floor(midi / 12);
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  let best = pc;
  let bestD = 99;
  for (const s of MAJOR_SCALE) {
    const cand = ((key + s) % 12 + 12) % 12;
    const d = Math.min((pc - cand + 12) % 12, (cand - pc + 12) % 12);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return oct * 12 + best;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── the score follower ────────────────────────────────────────────────────────
export interface OnsetResult {
  onset: boolean; // rising-edge event this frame
  strength: number; // 0..1 flux strength at the event
}

export interface ScoreFollower {
  /** Read the analyser's magnitude spectrum and update all tracked features. */
  analyse(freq: Uint8Array, sampleRate: number, fftSize: number): OnsetResult;
  /** Advance the predicted beat clock by dt seconds (call every frame). */
  step(dt: number): void;
  readonly chroma: Float32Array;
  readonly dominant: number;
  readonly key: number;
  readonly energy: number;
  readonly bpm: number;
  readonly beatPhase: number;
}

export function createScoreFollower(): ScoreFollower {
  let prevMag: Float32Array | null = null;
  const chroma = new Float32Array(12);
  const chromaLong = new Float32Array(12); // slow key accumulator
  let dominant = 0;
  let key = 0;
  let energy = 0;

  // adaptive onset threshold (running mean of flux)
  let fluxMean = 0;
  let prevFlux = 0;
  let refractory = 0; // frames until we accept another onset

  // tempo tracking via inter-onset intervals
  let bpm = 90;
  let beatPhase = 0;
  let lastOnsetClock = 0;
  let clock = 0; // seconds accumulated across step()
  const iois: number[] = [];

  function analyse(
    freq: Uint8Array,
    sampleRate: number,
    fftSize: number,
  ): OnsetResult {
    const n = freq.length;
    const binHz = sampleRate / fftSize;
    // piano-relevant band ~ 50 Hz .. 2200 Hz
    const loBin = Math.max(1, Math.floor(50 / binHz));
    const hiBin = Math.min(n - 1, Math.ceil(2200 / binHz));

    // spectral flux (sum of positive magnitude increases) + chroma + energy
    let flux = 0;
    let esum = 0;
    const inst = new Float32Array(12);
    for (let k = loBin; k <= hiBin; k++) {
      const m = freq[k] / 255;
      esum += m;
      if (prevMag) {
        const d = m - prevMag[k];
        if (d > 0) flux += d;
      }
      if (m > 0.04) {
        const f = k * binHz;
        const midi = 69 + 12 * Math.log2(f / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        inst[pc] += m;
      }
    }
    if (!prevMag || prevMag.length !== n) prevMag = new Float32Array(n);
    for (let k = 0; k < n; k++) prevMag[k] = freq[k] / 255;

    const band = hiBin - loBin + 1;
    energy = energy * 0.8 + Math.min(1, esum / (band * 0.5)) * 0.2;

    // smooth + normalize chroma
    let cmax = 1e-6;
    for (let i = 0; i < 12; i++) {
      chroma[i] = chroma[i] * 0.7 + inst[i] * 0.3;
      chromaLong[i] = chromaLong[i] * 0.995 + inst[i] * 0.005;
      if (chroma[i] > cmax) cmax = chroma[i];
    }
    let dbest = 0;
    let dval = -1;
    for (let i = 0; i < 12; i++) {
      chroma[i] /= cmax;
      if (chroma[i] > dval) {
        dval = chroma[i];
        dbest = i;
      }
    }
    dominant = dbest;

    // slow key estimate = strongest long-term pitch class
    let kbest = 0;
    let kval = -1;
    for (let i = 0; i < 12; i++) {
      if (chromaLong[i] > kval) {
        kval = chromaLong[i];
        kbest = i;
      }
    }
    key = kbest;

    // normalize flux against a slow running mean to get an adaptive threshold
    fluxMean = fluxMean * 0.95 + flux * 0.05;
    const thresh = fluxMean * 1.6 + 0.4;
    let onset = false;
    let strength = 0;
    if (refractory > 0) refractory--;
    if (flux > thresh && flux > prevFlux && refractory === 0) {
      onset = true;
      strength = Math.min(1, (flux - thresh) / (thresh + 1));
      refractory = 4; // ~4 frames (~66ms) refractory — photosensitive-safe

      // tempo: record inter-onset interval, keep median-ish window
      const ioi = clock - lastOnsetClock;
      lastOnsetClock = clock;
      if (ioi > 0.14 && ioi < 1.6) {
        iois.push(ioi);
        if (iois.length > 8) iois.shift();
        const sorted = [...iois].sort((a, b) => a - b);
        const med = sorted[sorted.length >> 1];
        const targetBpm = Math.max(56, Math.min(168, 60 / med));
        bpm = bpm * 0.8 + targetBpm * 0.2;
      }
      // phase-lock: pull the beat clock toward the downbeat on an onset
      beatPhase *= 0.5;
    }
    prevFlux = flux;
    return { onset, strength };
  }

  function step(dt: number): void {
    clock += dt;
    beatPhase += dt * (bpm / 60);
    if (beatPhase >= 1) beatPhase -= Math.floor(beatPhase);
  }

  return {
    analyse,
    step,
    get chroma() {
      return chroma;
    },
    get dominant() {
      return dominant;
    },
    get key() {
      return key;
    },
    get energy() {
      return energy;
    },
    get bpm() {
      return bpm;
    },
    get beatPhase() {
      return beatPhase;
    },
  };
}

// ── seeded synthetic stream for the muted self-demo ───────────────────────────
// A deterministic two-hand phrase so the field breathes before any audio.
interface DemoEvent {
  t: number;
  pc: number;
  hand: 0 | 1;
}

export interface SyntheticStream {
  sample(t: number): void;
  readonly state: VizState;
}

export function createSyntheticStream(seed: number): SyntheticStream {
  const rnd = mulberry32(seed);
  const bpm = 76;
  const beat = 60 / bpm;
  const sub = beat / 2; // eighth notes
  const bars = 8;
  const steps = bars * 4; // eighth-note grid over 8 half-note bars
  const loopLen = steps * sub;

  // A gentle progression in C major: I – vi – IV – V, tonic pitch class 0.
  const chords = [
    [0, 4, 7],
    [9, 0, 4],
    [5, 9, 0],
    [7, 11, 2],
  ];
  const events: DemoEvent[] = [];
  for (let n = 0; n < steps; n++) {
    const t = n * sub;
    const chord = chords[Math.floor(n / (steps / 4)) % chords.length];
    // Karel's hand — melodic, denser on strong beats
    const strong = n % 2 === 0;
    if (rnd() < (strong ? 0.85 : 0.4)) {
      const pc = chord[Math.floor(rnd() * chord.length)];
      events.push({ t, pc, hand: 0 });
    }
    // The shadow hand — answers in the gaps (offbeats), sparser, below
    if (!strong && rnd() < 0.55) {
      const pc = (chord[0] + 7) % 12; // a fifth pedal-ish answer
      events.push({ t: t + sub * 0.4, pc, hand: 1 });
    }
  }

  const state = makeVizState();
  state.bpm = bpm;
  state.key = 0;

  function sample(t: number): void {
    const tl = ((t % loopLen) + loopLen) % loopLen;
    const chroma = state.chroma;
    for (let i = 0; i < 12; i++) chroma[i] *= 0.86;
    let onsetA = state.onsetA * 0.9;
    let onsetB = state.onsetB * 0.9;
    let density = 0;
    for (const e of events) {
      // wrap-aware age (handle the loop seam)
      let age = tl - e.t;
      if (age < 0) age += loopLen;
      if (age < 0.5) {
        const env = Math.exp(-age / 0.16);
        chroma[e.pc] = Math.min(1, chroma[e.pc] + env * 0.9);
        if (e.hand === 0) onsetA = Math.max(onsetA, env);
        else onsetB = Math.max(onsetB, env);
      }
      if (age < 1) density += e.hand === 0 ? 1 : 0.4;
    }
    // normalize chroma peak
    let cmax = 1e-6;
    for (let i = 0; i < 12; i++) if (chroma[i] > cmax) cmax = chroma[i];
    let dbest = 0;
    let dval = -1;
    for (let i = 0; i < 12; i++) {
      chroma[i] /= cmax;
      if (chroma[i] > dval) {
        dval = chroma[i];
        dbest = i;
      }
    }
    state.dominant = dbest;
    state.onsetA = onsetA;
    state.onsetB = onsetB;
    state.energy = Math.min(1, density / 5);
    state.beatPhase = (tl % beat) / beat;
  }

  return { sample, get state() { return state; } };
}
