// 1922-chladni-plate · plate modal model
//
// Frequencies and mode shapes for a thin rectangular plate, following the
// classical 2D modal formulation (cf. Chladni's plate figures; and the
// differentiable modal-synthesis reference, arxiv.org/abs/2407.05516).
//
// A membrane's modal frequencies scale as sqrt((m/a)^2 + (n/b)^2). A stiff
// PLATE's flexural modes scale as the SQUARE of that — i.e. proportional to
// (m/a)^2 + (n/b)^2 directly — which spreads the partials into a genuinely
// INHARMONIC series (NOT integer harmonics, NOT any tempered/pentatonic
// scale). That inharmonicity is the whole point: it is what makes a struck
// metal plate sound like metal and not like a string.

export interface PlateMode {
  m: number; // half-wave count along x (>=1)
  n: number; // half-wave count along y (>=1)
  freq: number; // Hz
  amp: number; // intrinsic excitation weight (higher modes quieter)
  tau: number; // 1/e energy decay time, seconds (higher modes decay faster)
}

export interface PlateSpec {
  a: number; // plate width (arbitrary units)
  b: number; // plate height
  f0: number; // frequency of the (1,1) fundamental, Hz
}

// Slightly non-square so degenerate (m,n)/(n,m) pairs split into distinct
// partials — a squarer plate would sound (and look) duller.
export const PLATE: PlateSpec = { a: 1.0, b: 0.82, f0: 116 };

export const MAX_MODES = 28;

/** Precompute the plate's modal bank: the lowest `max` modes below ~9 kHz,
 *  each with an intrinsic amplitude weight and a decay time. Pure — no audio. */
export function computeModes(spec: PlateSpec = PLATE, max = MAX_MODES): PlateMode[] {
  const { a, b, f0 } = spec;
  const base = 1 / (a * a) + 1 / (b * b); // value of the sum at (1,1)
  const raw: PlateMode[] = [];
  for (let m = 1; m <= 6; m++) {
    for (let n = 1; n <= 6; n++) {
      // k = 1 at the fundamental; grows as the SQUARE-sum → inharmonic.
      const k = (m * m) / (a * a) / base + (n * n) / (b * b) / base;
      const freq = f0 * k;
      if (freq > 9000) continue;
      const amp = 1 / (1 + 0.5 * (k - 1)); // gentle high-mode rolloff
      const tau = 2.6 / (1 + 0.85 * (k - 1)); // low modes ring longer
      raw.push({ m, n, freq, amp, tau });
    }
  }
  raw.sort((x, y) => x.freq - y.freq);
  return raw.slice(0, max);
}

/** Mode shape phi_mn(x,y) = sin(m·pi·x)·sin(n·pi·y), x,y in [0,1].
 *  Its value at the strike point sets how strongly that mode is excited:
 *  ~1 at an antinode (loud), ~0 on a nodal line (silent). */
export function modeShape(mode: PlateMode, x: number, y: number): number {
  return Math.sin(mode.m * Math.PI * x) * Math.sin(mode.n * Math.PI * y);
}
