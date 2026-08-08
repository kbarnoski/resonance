// ── Just-intonation lattice + sympathetic-coupling model ──────────────────────
// The soul of the piece: strings are quantized to a fixed just-intonation set
// over a drone tonic, and any two strings couple in proportion to how many low
// harmonics they share. That shared-harmonic weight is exactly the physical
// mechanism behind a tanpura's jawari sympathetic ring and a sitar's tarab
// strings — a JI-consonant partial coincides, so a driven string radiates into
// the sympathetic one at that partial and it starts to hum on its own.

/** Drone tonic in Hz (~ D3). Every string is measured against this. */
export const TONIC = 146.83;

export interface JiRatio {
  num: number;
  den: number;
  ratio: number;
  /** Sargam-ish degree name for the readout. */
  name: string;
}

/** The 12-tone just set: 1/1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5,
 *  5/3, 16/9, 15/8 (octaves handled separately). */
export const JI_RATIOS: readonly JiRatio[] = [
  { num: 1, den: 1, ratio: 1 / 1, name: "Sa" },
  { num: 16, den: 15, ratio: 16 / 15, name: "re♭" },
  { num: 9, den: 8, ratio: 9 / 8, name: "Re" },
  { num: 6, den: 5, ratio: 6 / 5, name: "ga♭" },
  { num: 5, den: 4, ratio: 5 / 4, name: "Ga" },
  { num: 4, den: 3, ratio: 4 / 3, name: "Ma" },
  { num: 45, den: 32, ratio: 45 / 32, name: "Ma♯" },
  { num: 3, den: 2, ratio: 3 / 2, name: "Pa" },
  { num: 8, den: 5, ratio: 8 / 5, name: "dha♭" },
  { num: 5, den: 3, ratio: 5 / 3, name: "Dha" },
  { num: 16, den: 9, ratio: 16 / 9, name: "ni♭" },
  { num: 15, den: 8, ratio: 15 / 8, name: "Ni" },
];

/** Octaves the lattice spans relative to the tonic. */
export const OCTAVES = [-1, 0, 1, 2] as const;

export interface Quantized {
  /** Exact JI frequency (Hz). */
  freq: number;
  /** Degree index 0..11 within the octave. */
  degree: number;
  /** Octave offset relative to the tonic. */
  octave: number;
  name: string;
  num: number;
  den: number;
  /** Cents the raw sung pitch sat away from this JI target. */
  centsOff: number;
  /** Normalized pitch height 0..1 across the lattice (log-frequency). */
  height: number;
}

const LOW_HZ = TONIC * Math.pow(2, OCTAVES[0] - 0.2);
const HIGH_HZ = TONIC * Math.pow(2, OCTAVES[OCTAVES.length - 1] + 0.2);

/** Normalized 0..1 log-frequency position across the lattice span. */
export function pitchHeight(hz: number): number {
  const t =
    (Math.log2(hz) - Math.log2(LOW_HZ)) /
    (Math.log2(HIGH_HZ) - Math.log2(LOW_HZ));
  return Math.max(0, Math.min(1, t));
}

/** Cents between two frequencies (signed: a relative to b). */
export function cents(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

/** Quantize an arbitrary sung frequency to the nearest lattice frequency. */
export function quantizeToJI(hz: number): Quantized {
  let best: Quantized | null = null;
  let bestDist = Infinity;
  for (const oct of OCTAVES) {
    for (let d = 0; d < JI_RATIOS.length; d++) {
      const r = JI_RATIOS[d];
      const f = TONIC * r.ratio * Math.pow(2, oct);
      const dist = Math.abs(cents(hz, f));
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          freq: f,
          degree: d,
          octave: oct,
          name: r.name,
          num: r.num,
          den: r.den,
          centsOff: cents(hz, f),
          height: pitchHeight(f),
        };
      }
    }
  }
  // OCTAVES is non-empty, so best is always assigned.
  return best as Quantized;
}

/**
 * Sympathetic coupling weight 0..1 between two frequencies: how strongly a
 * loud string at `fa` will excite a resting string at `fb`. Computed from the
 * number (and lowness) of shared harmonics — low, coincident partials couple
 * most, exactly as JI consonance predicts. Unison ≈ 1, octave/fifth strong,
 * dissonant intervals ≈ 0.
 */
export function couplingWeight(fa: number, fb: number): number {
  if (fa <= 0 || fb <= 0) return 0;
  const H = 12; // harmonics considered
  const tolCents = 14; // a partial "coincides" within ~14 cents
  let sum = 0;
  for (let k = 1; k <= H; k++) {
    const hk = k * fa;
    for (let l = 1; l <= H; l++) {
      const c = Math.abs(cents(l * fb, hk));
      if (c < tolCents) {
        // Lower shared harmonics couple far more strongly.
        sum += 1 / (k + l);
      }
    }
  }
  // Normalize so a perfect unison (~1.55 by this sum) maps to ~1.
  return Math.max(0, Math.min(1, sum / 1.55));
}

/** Warm→cool hue (degrees) from normalized pitch height, for the WebGL art. */
export function pitchHue(height: number): number {
  // Low = warm amber (35°), high = cool cyan-blue (205°).
  return 35 + (205 - 35) * height;
}

/** Deterministic PRNG — mulberry32. Seeded so the self-demo is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short human label for a raw detected frequency (nearest equal-tempered). */
export function noteLabel(hz: number): string {
  if (hz <= 0) return "—";
  const names = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = names[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  const refHz = 440 * Math.pow(2, (midi - 69) / 12);
  const off = Math.round(cents(hz, refHz));
  const sign = off > 0 ? "+" : "";
  return `${name}${oct} ${sign}${off}¢`;
}
