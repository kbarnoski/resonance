// sim.ts — pure, testable Gray-Scott parameters + readback→sonification math.
//
// This module deliberately holds NO GPU/WebGL/Web-Audio state. It is the
// numerical heart of the piece: the reaction-diffusion tuning constants and
// the functions that turn a tiny CPU-side readback of the GPU field into
// musical control values (chord-bed gain, bell triggers, stereo pan, filter).
// Keeping it pure means the lab can unit-test the "instrument" logic without
// a browser.
//
// ── Gray-Scott reaction-diffusion (Turing morphogenesis) ──────────────────
// Two virtual chemicals A and B diffuse and react on a grid:
//   A' = A + (Da·∇²A − A·B² + f·(1 − A)) · dt
//   B' = B + (Db·∇²B + A·B² − (k + f)·B)  · dt
// A is "fed" everywhere at rate f; B is "killed" at rate (k+f). The B·A²
// term is the autocatalytic reaction (B eats A to make more B). Different
// (f, k) pairs settle into spots, stripes, or labyrinths — the Turing
// patterns Alan Turing predicted in 1952 and Pearson catalogued in 1993.
// Reference: Karl Sims' "Reaction-Diffusion Tutorial" (karlsims.com).

export interface GrayScottParams {
  /** Diffusion rate of chemical A (the substrate). */
  dA: number;
  /** Diffusion rate of chemical B (the activator). B spreads slower than A. */
  dB: number;
  /** Feed rate f — how fast A is replenished everywhere. */
  feed: number;
  /** Kill rate k — how fast B is removed (effective removal = k + f). */
  kill: number;
  /** Time step dt for the explicit Euler integration. */
  dt: number;
}

/** "Coral / bubbly spots that grow and split" — reads as a blooming garden
 *  of ink rather than rigid stripes. Classic Pearson-zoo soft-mitosis regime. */
export const INK_GARDEN_PARAMS: GrayScottParams = {
  dA: 1.0,
  dB: 0.5,
  feed: 0.0367,
  kill: 0.0649,
  dt: 1.0,
};

/** One explicit Euler step of Gray-Scott for a single cell, given the
 *  Laplacian of A and B at that cell. Exported purely so the update rule
 *  can be verified in isolation; the real sim runs this in GLSL on the GPU. */
export function stepCell(
  a: number,
  b: number,
  lapA: number,
  lapB: number,
  p: GrayScottParams,
): { a: number; b: number } {
  const reaction = a * b * b;
  const na = a + (p.dA * lapA - reaction + p.feed * (1 - a)) * p.dt;
  const nb = b + (p.dB * lapB + reaction - (p.kill + p.feed) * b) * p.dt;
  return {
    a: Math.min(1, Math.max(0, na)),
    b: Math.min(1, Math.max(0, nb)),
  };
}

// ── Readback → sonification ───────────────────────────────────────────────
// Once every ~100ms we downsample the GPU field to a tiny grid (e.g. 32×32)
// and read it back to the CPU. From those bytes we derive a few coarse,
// musical control values. readPixels stalls the pipeline, so we do it rarely
// and keep audio fully decoupled from the 60fps simulation.

export interface FieldSummary {
  /** Fraction of cells where the B chemical is "alive" (0..1). */
  coverage: number;
  /** How much coverage changed since the last summary (growth/decay rate). */
  activity: number;
  /** Horizontal centroid of the living ink, 0 (left) .. 1 (right). */
  centroidX: number;
  /** Per-region "new growth" deltas — used to fire localized bell notes. */
  regionGrowth: number[];
}

/** Threshold on the B channel (0..1) above which a cell counts as living ink. */
export const ALIVE_THRESHOLD = 0.22;

/** Number of horizontal regions used to localize bell triggers / panning. */
export const REGION_COUNT = 5;

/**
 * Summarize a downsampled readback. `bChannel` is a flat row-major array of
 * the B chemical in [0,1] (length = w*h). `prevCoverage` and `prevRegions`
 * carry state from the last summary so we can measure change. Pure: returns
 * the new summary; the caller stores it for next time.
 */
export function summarizeField(
  bChannel: Float32Array | number[],
  w: number,
  h: number,
  prevCoverage: number,
  prevRegions: number[],
): FieldSummary {
  let alive = 0;
  let sumX = 0;
  const regionAlive = new Array(REGION_COUNT).fill(0);
  const regionTotal = new Array(REGION_COUNT).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = bChannel[y * w + x];
      const region = Math.min(
        REGION_COUNT - 1,
        Math.floor((x / w) * REGION_COUNT),
      );
      regionTotal[region]++;
      if (v > ALIVE_THRESHOLD) {
        alive++;
        sumX += x;
        regionAlive[region]++;
      }
    }
  }

  const total = w * h;
  const coverage = total > 0 ? alive / total : 0;
  const centroidX = alive > 0 ? sumX / alive / Math.max(1, w - 1) : 0.5;

  const regions = regionAlive.map((a, i) =>
    regionTotal[i] > 0 ? a / regionTotal[i] : 0,
  );
  const safePrev =
    prevRegions.length === REGION_COUNT
      ? prevRegions
      : new Array(REGION_COUNT).fill(0);
  const regionGrowth = regions.map((r, i) => r - safePrev[i]);

  const activity = Math.max(0, coverage - prevCoverage);

  return { coverage, activity, centroidX, regionGrowth };
}

// ── Musical mapping ────────────────────────────────────────────────────────
// A warm, functional bed (NOT bare pentatonic). We pick a real diatonic key
// (C major / A minor feel) and use a slow chord progression underneath so
// thirds and fifths are always present. Bell notes are drawn from the same
// scale so nothing ever clashes, but the harmony is genuine, not "no-wrong-
// notes mush".

/** A slow I–vi–IV–V-ish loop in C, as MIDI chord tones (root, third, fifth,
 *  plus a high color tone). Each chord lasts a few seconds; the bed crossfades
 *  between them so there is always a moving harmony, never a static drone. */
export const CHORD_PROGRESSION: number[][] = [
  [48, 55, 64, 72], // C  major  (C2 G2 E4 C5)
  [45, 52, 60, 69], // Am         (A1 E2 C4 A4)
  [41, 48, 57, 65], // F  major  (F1 C2 A3 F4)
  [43, 50, 59, 67], // G  major  (G1 D2 B3 G4)
];

/** Seconds each chord in the bed is held before crossfading to the next. */
export const CHORD_HOLD_SEC = 7.5;

/** Bell pitches: C-major pentatonic spread across two octaves, but chosen so
 *  every one is a consonant tone over the whole progression above. */
export const BELL_SCALE_MIDI = [
  72, 74, 76, 79, 81, 84, 86, 88, 91,
];

/** MIDI → Hz (A4 = 440). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Map total coverage (0..1) to the gain of the warm chord bed. Soft floor so
 * the pad is always gently audible; gentle curve so a little ink already
 * sounds rich, and a full screen does not blast. Capped well under the master.
 */
export function coverageToBedGain(coverage: number): number {
  const c = Math.min(1, Math.max(0, coverage));
  const floor = 0.16; // always-on ambient pad floor
  const span = 0.62; // headroom that coverage opens up
  return floor + span * Math.pow(c, 0.55);
}

/**
 * Map coverage to how many chord voices are "open" (1..N). Sparse ink → just
 * root + fifth; a blooming garden → full four-note voicing. This is the
 * "fuller as it blooms" mechanic.
 */
export function coverageToVoiceCount(coverage: number, maxVoices: number): number {
  const c = Math.min(1, Math.max(0, coverage));
  return Math.max(2, Math.min(maxVoices, Math.round(2 + c * (maxVoices - 2))));
}

/**
 * Map the spread rate (activity) to a gentle lowpass cutoff in Hz. When the
 * pattern is actively growing the bed opens up and brightens; when it settles,
 * it mellows. Bounded so it never gets harsh (kids-safe ceiling).
 */
export function activityToCutoff(activity: number): number {
  const a = Math.min(1, Math.max(0, activity * 30)); // activity is small
  return 700 + a * 3200; // 700Hz (mellow) .. 3900Hz (open but never harsh)
}

/** Region centroid (0..1) → stereo pan (-1..1). */
export function centroidToPan(centroidX: number): number {
  return Math.min(1, Math.max(-1, (centroidX - 0.5) * 2));
}

/**
 * Decide which bell notes (if any) to fire this readback. A region that just
 * gained noticeable new ink triggers one soft bell, pitched higher for regions
 * that are further along (more coverage) and panned to that region. Returns a
 * list of {midi, pan, velocity} — possibly empty. We cap the count so a big
 * bloom does not machine-gun notes.
 */
export interface BellTrigger {
  midi: number;
  pan: number;
  velocity: number;
}

export function pickBellTriggers(summary: FieldSummary): BellTrigger[] {
  const GROWTH_TRIGGER = 0.012; // min new-ink fraction in a region to ring
  const out: BellTrigger[] = [];
  summary.regionGrowth.forEach((g, i) => {
    if (g > GROWTH_TRIGGER) {
      // higher regions of the scale for more active growth
      const intensity = Math.min(1, g / 0.06);
      const idx = Math.min(
        BELL_SCALE_MIDI.length - 1,
        Math.floor(intensity * (BELL_SCALE_MIDI.length - 1)),
      );
      const regionPan = (i / (REGION_COUNT - 1)) * 2 - 1;
      out.push({
        midi: BELL_SCALE_MIDI[idx],
        pan: regionPan,
        velocity: 0.4 + 0.4 * intensity,
      });
    }
  });
  // cap to 2 simultaneous bells to keep it gentle
  return out.slice(0, 2);
}
