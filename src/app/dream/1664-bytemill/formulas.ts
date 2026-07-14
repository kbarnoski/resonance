// A curated library of classic "bytebeat" formulas.
//
// Each formula is an integer expression of a running sample counter `t`.
// One arithmetic constant in each has been replaced by the token `k` so the
// visitor can live-substitute it and mutate the sound. `kDefault` reproduces
// the canonical version; `kMin`/`kMax` bound the bend to a musically useful
// range for that particular expression.
//
// Provenance: bytebeat was discovered and named by Viznut (Ville-Matias
// Heikkilä) in 2011. These expressions are drawn from that lineage and the
// wider one-line-music tradition (bytebeat.cloud, ByteBeats.art / dadabots).

export type Formula = {
  /** Short human name shown on screen. */
  name: string;
  /** Integer expression in `t` and `k`. Output is masked to 0..255 downstream. */
  expr: string;
  kDefault: number;
  kMin: number;
  kMax: number;
  /** What the constant does, for the on-screen hint. */
  kHint: string;
};

export const FORMULAS: Formula[] = [
  {
    name: "sierpinski",
    expr: "t*((t>>12|t>>8)&k&t>>4)",
    kDefault: 63,
    kMin: 15,
    kMax: 127,
    kHint: "bit-mask density",
  },
  {
    name: "hard glitch",
    expr: "(t*(t>>k|t>>8))>>(t>>16&31)",
    kDefault: 5,
    kMin: 3,
    kMax: 12,
    kHint: "shift → pitch",
  },
  {
    name: "the 42",
    expr: "((t>>10)&k)*t",
    kDefault: 42,
    kMin: 1,
    kMax: 127,
    kHint: "harmonic mask",
  },
  {
    name: "forty-four",
    expr: "(t>>6|t|t>>(t>>16))*10+((t>>11)&k)",
    kDefault: 7,
    kMin: 1,
    kMax: 31,
    kHint: "grit overtone",
  },
  {
    name: "twin melody",
    expr: "t*5&(t>>7)|t*3&(t>>k)",
    kDefault: 10,
    kMin: 5,
    kMax: 15,
    kHint: "counter-voice",
  },
  {
    name: "lattice",
    expr: "t*(t>>11&t>>8&k&t>>3)",
    kDefault: 123,
    kMin: 31,
    kMax: 200,
    kHint: "chord mask",
  },
  {
    name: "cathedral",
    expr: "t*((t>>9|t>>13)&k&t>>6)",
    kDefault: 25,
    kMin: 8,
    kMax: 63,
    kHint: "resonance mask",
  },
  {
    name: "weave",
    expr: "(t&t>>k)*(t>>4|t>>8)",
    kDefault: 12,
    kMin: 6,
    kMax: 16,
    kHint: "fold depth",
  },
];

export const T_RATE_MIN = 2000;
export const T_RATE_MAX = 16000;
export const T_RATE_DEFAULT = 8000;
export const T_RATE_STEP = 500;
