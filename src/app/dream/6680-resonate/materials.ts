// materials.ts — the "singing materials" roster.
//
// Each material is a bank of resonant modes. A single physical strike excites
// every mode at once; what makes copper sound unlike wood is (a) the set of
// mode-frequency *ratios* to the fundamental, (b) how those ratios are stretched
// by stiffness (inharmonicity), and (c) how long each mode rings (decay).
//
// Ratios are chosen from the physics of real vibrating bodies:
//   - free–free bar modes (1, 2.756, 5.404, 8.933, …) for stiff crystals,
//   - church-bell partials (hum/prime/tierce/quint/nominal) for copper,
//   - tuned marimba-bar ratios (1, 3.9, 7.8) for wood,
//   - glass-harmonica / wine-glass partials for quartz & ice.
// See README.md for the arXiv:2603.29037 ("Singing Materials") reference.

export type LatticeKind = "cubic" | "hex" | "fcc" | "amorphous";

export type Material = {
  id: string;
  name: string;
  blurb: string; // one short clause for the HUD
  key: string; // "1".."6"
  fundamental: number; // Hz of mode 0
  ratios: number[]; // freq ratios of each mode to the fundamental
  gains: number[]; // relative excitation energy per mode (0..1)
  inharmonicity: number; // B: f_n = f0*r_n*sqrt(1 + B*n^2)
  baseTau: number; // seconds — decay time of the fundamental
  hiFalloff: number; // how much faster high modes decay (freq-dependent damping)
  brightness: number; // 0..1 — how much a hard strike favours high modes
  noise: number; // 0..1 — grit in the strike transient (ice cracks, wood thud)
  lattice: LatticeKind;
  hue: number; // base hue for the Canvas art (kept in the violet family)
};

// Bar/plate mode ratios reused by the stiff crystals.
const BAR = [1, 2.756, 5.404, 8.933, 13.34, 18.64];

export const MATERIALS: Material[] = [
  {
    id: "diamond",
    name: "Diamond",
    blurb: "stiffest lattice — long, brilliant ring",
    key: "1",
    fundamental: 880,
    ratios: BAR,
    gains: [1, 0.62, 0.42, 0.3, 0.2, 0.12],
    inharmonicity: 0.0009,
    baseTau: 3.6,
    hiFalloff: 0.6,
    brightness: 0.95,
    noise: 0.05,
    lattice: "fcc",
    hue: 268,
  },
  {
    id: "quartz",
    name: "Quartz / Glass",
    blurb: "glassy, clear partials, singing decay",
    key: "2",
    fundamental: 680,
    ratios: [1, 2.32, 4.25, 6.63, 9.38, 12.6],
    gains: [1, 0.7, 0.46, 0.3, 0.18, 0.1],
    inharmonicity: 0.0006,
    baseTau: 2.4,
    hiFalloff: 0.9,
    brightness: 0.8,
    noise: 0.06,
    lattice: "hex",
    hue: 276,
  },
  {
    id: "copper",
    name: "Copper",
    blurb: "bell-like, warm metal, slow fade",
    key: "3",
    fundamental: 392,
    ratios: [0.5, 1, 1.19, 1.5, 2, 2.5, 2.66, 3],
    gains: [0.4, 1, 0.55, 0.7, 0.5, 0.32, 0.22, 0.18],
    inharmonicity: 0.0003,
    baseTau: 2.9,
    hiFalloff: 0.55,
    brightness: 0.6,
    noise: 0.04,
    lattice: "fcc",
    hue: 284,
  },
  {
    id: "wood",
    name: "Wood",
    blurb: "warm, quick thud, few partials",
    key: "4",
    fundamental: 300,
    ratios: [1, 3.9, 7.8, 10.4],
    gains: [1, 0.34, 0.16, 0.08],
    inharmonicity: 0.0,
    baseTau: 0.42,
    hiFalloff: 2.2,
    brightness: 0.28,
    noise: 0.35,
    lattice: "amorphous",
    hue: 292,
  },
  {
    id: "ice",
    name: "Ice",
    blurb: "high, glassy shimmer that cracks away",
    key: "5",
    fundamental: 1180,
    ratios: [1, 2.11, 3.53, 5.2, 7.94, 10.6],
    gains: [1, 0.66, 0.44, 0.3, 0.2, 0.12],
    inharmonicity: 0.0016,
    baseTau: 1.1,
    hiFalloff: 1.6,
    brightness: 0.72,
    noise: 0.28,
    lattice: "hex",
    hue: 260,
  },
  {
    id: "bone",
    name: "Bone",
    blurb: "dry, hollow, xylophone knock",
    key: "6",
    fundamental: 520,
    ratios: [1, 2.65, 4.8, 7.0, 9.6],
    gains: [1, 0.42, 0.24, 0.14, 0.08],
    inharmonicity: 0.0002,
    baseTau: 0.55,
    hiFalloff: 1.8,
    brightness: 0.4,
    noise: 0.22,
    lattice: "cubic",
    hue: 300,
  },
];

// Analytic mode frequency with stiffness stretch.
export function modeFreq(m: Material, n: number): number {
  const r = m.ratios[n];
  return m.fundamental * r * Math.sqrt(1 + m.inharmonicity * n * n);
}

// Per-mode decay time (seconds). High modes shed energy faster.
export function modeTau(m: Material, n: number): number {
  return m.baseTau / (1 + m.hiFalloff * (n / m.ratios.length));
}
