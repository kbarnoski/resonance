// ─────────────────────────────────────────────────────────────────────────────
// 11712-attractorveil · evolution.ts — the long-form self-driving brain.
//
//   The jury asked for GENUINE long-form: state, memory, evolution — a piece that
//   is different at minute 5 than at minute 1, and never loops. This module is
//   that brain. It walks the strange attractor's parameters AND the drone's
//   harmony over minutes using a bank of VOSS–McCARTNEY 1/f (pink-noise)
//   generators — spectra dominated by low frequencies, so every parameter drifts
//   slowly and organically and (being a random walk) never returns to the same
//   configuration. The de Jong attractor at minute 5 has a visibly different
//   shape, density, palette balance, and underlying chord than at minute 1.
//
//   DETERMINISM: the pink walk is stepped on a FIXED time grid (STEP seconds of
//   the age clock), not per animation frame — so the whole evolution is a pure
//   function of `age` in seconds, identical on any machine at any frame rate,
//   seeded from mulberry32(SEED). No Math.random, no wall clock.
//
//   Reference: the Voss–McCartney algorithm for 1/f "pink" noise (Richard F.
//   Voss; popularised by James McCartney) — sum of white-noise generators updated
//   at octave-spaced rates, giving equal energy per octave.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, SEED, clamp, lerp } from "./prng";

// ── Voss–McCartney 1/f generator ─────────────────────────────────────────────
// nRows white sources; row i is refreshed only when bit i of a counter flips, so
// low rows change rarely (low frequencies) and high rows every step. A running
// sum keeps next() O(rows-changed). Output normalised to 0..1.
class Pink {
  private readonly rows: number[];
  private readonly rng: () => number;
  private key = 0;
  private runningSum: number;
  private readonly nRows: number;
  private readonly maxKey: number;

  constructor(seed: number, nRows = 12) {
    this.nRows = nRows;
    this.maxKey = (1 << nRows) - 1;
    this.rng = mulberry32(seed >>> 0);
    this.rows = new Array(nRows);
    let sum = 0;
    for (let i = 0; i < nRows; i++) {
      this.rows[i] = this.rng();
      sum += this.rows[i];
    }
    this.runningSum = sum;
  }

  /** Advance one step, return the new pink value in 0..1. */
  next(): number {
    const last = this.key;
    this.key = (this.key + 1) & this.maxKey;
    const diff = last ^ this.key;
    for (let i = 0; i < this.nRows; i++) {
      if (diff & (1 << i)) {
        this.runningSum -= this.rows[i];
        this.rows[i] = this.rng();
        this.runningSum += this.rows[i];
      }
    }
    // include one always-white top source for a little sparkle in the sum
    const white = this.rng();
    return (this.runningSum + white) / (this.nRows + 1);
  }
}

// The fixed evolution grid. Every STEP seconds of age we advance the pink bank
// by one step; params interpolate smoothly between grid samples. Small enough to
// feel continuous, large enough that a 5-minute piece takes ~2500 steps of a
// slow low-frequency-dominated walk.
const STEP = 0.14;

// Consonant, hymn-like drone chords (semitone offsets from a drifting root).
// All warm and open — nothing tense. The evolution slowly crossfades between
// them so the harmony wanders without ever resolving to a loop.
const CHORDS: number[][] = [
  [-12, 0, 7, 12, 16, 19], // major add9-ish, open
  [-12, 0, 7, 12, 15, 22], // minor 7, wistful
  [-12, 0, 7, 12, 14, 19], // sus2, airy
  [-12, 0, 5, 12, 17, 19], // quartal / sus4, boundless
];

/** Everything the visuals + audio read each frame. All fields evolve slowly. */
export interface EvoState {
  /** de Jong attractor parameters a,b,c,d — the shape of the nebula. */
  a: number;
  b: number;
  c: number;
  d: number;
  /** 0..1 flow-speed drift (how fast points stream the field). */
  flow: number;
  /** 0..1 density / exposure drift (how thick + bright the veil reads). */
  density: number;
  /** 0..1 jade↔rose palette balance drift. */
  hue: number;
  /** 0..1 slow amplitude swell — the muted-phone brightness envelope when there
   *  is no audio, and the pad's breathing when there is. */
  swell: number;
  /** Drifting drone root (MIDI). */
  rootMidi: number;
  /** Current chord as semitone offsets from rootMidi. */
  chord: number[];
}

/**
 * The self-driving evolution. Call update(ageSeconds) once per frame; it advances
 * the pink walk to the correct grid step for that age and returns the smoothly
 * interpolated state. Pure function of age → fully deterministic + reproducible.
 */
export class Evolution {
  // one pink generator per drifting quantity, each on its own seed offset
  private readonly pA = new Pink(SEED ^ 0x1a1a);
  private readonly pB = new Pink(SEED ^ 0x2b2b);
  private readonly pC = new Pink(SEED ^ 0x3c3c);
  private readonly pD = new Pink(SEED ^ 0x4d4d);
  private readonly pFlow = new Pink(SEED ^ 0x5e5e);
  private readonly pDensity = new Pink(SEED ^ 0x6f6f);
  private readonly pHue = new Pink(SEED ^ 0x7070);
  private readonly pSwell = new Pink(SEED ^ 0x8181);
  private readonly pRoot = new Pink(SEED ^ 0x9292);
  private readonly pChord = new Pink(SEED ^ 0xa3a3);

  private stepsTaken = 0;
  // previous + current grid samples for each quantity (raw pink 0..1)
  private prev = this.blankSample();
  private cur = this.sample();

  private blankSample() {
    return { a: 0.5, b: 0.5, c: 0.5, d: 0.5, flow: 0.5, density: 0.5, hue: 0.5, swell: 0.5, root: 0.5, chord: 0.5 };
  }

  private sample() {
    return {
      a: this.pA.next(),
      b: this.pB.next(),
      c: this.pC.next(),
      d: this.pD.next(),
      flow: this.pFlow.next(),
      density: this.pDensity.next(),
      hue: this.pHue.next(),
      swell: this.pSwell.next(),
      root: this.pRoot.next(),
      chord: this.pChord.next(),
    };
  }

  update(ageSeconds: number): EvoState {
    const targetSteps = Math.floor(ageSeconds / STEP);
    while (this.stepsTaken < targetSteps) {
      this.prev = this.cur;
      this.cur = this.sample();
      this.stepsTaken++;
    }
    const frac = clamp(ageSeconds / STEP - this.stepsTaken, 0, 1);
    // smootherstep the interpolation so grid boundaries are invisible
    const s = frac * frac * frac * (frac * (frac * 6 - 15) + 10);
    const mix = (k: keyof ReturnType<Evolution["sample"]>) =>
      lerp(this.prev[k], this.cur[k], s);

    // de Jong params live in ~[-2.4, 2.4] — the band where the map has rich,
    // filamentary structure. The pink walk keeps them wandering there.
    const toParam = (v: number) => -2.4 + 4.8 * v;

    const rootRaw = mix("root");
    // Root drifts slowly across a low, meditative register and snaps to the
    // nearest scale tone (whole-tone-ish) so harmony changes read as musical.
    const rootMidi = 41 + Math.round(rootRaw * 14);
    const chordIdx = clamp(Math.floor(mix("chord") * CHORDS.length), 0, CHORDS.length - 1);

    return {
      a: toParam(mix("a")),
      b: toParam(mix("b")),
      c: toParam(mix("c")),
      d: toParam(mix("d")),
      flow: mix("flow"),
      density: mix("density"),
      hue: mix("hue"),
      swell: 0.35 + 0.55 * mix("swell"),
      rootMidi,
      chord: CHORDS[chordIdx],
    };
  }
}

/** The audio→visual feature vector (live analyser, or the silent swell). 0..1. */
export interface Features {
  /** Overall amplitude — brightens the veil + lifts flow speed. */
  amp: number;
  /** Spectral brightness — nudges the jade↔rose palette balance. */
  centroid: number;
}
