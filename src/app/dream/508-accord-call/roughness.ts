/**
 * Plomp–Levelt / Sethares sensory roughness model.
 *
 * For each pair of partials (f1, a1), (f2, a2) the roughness contribution is:
 *   r = a1 * a2 * (exp(-b1 * s * df) - exp(-b2 * s * df))
 * where s = 0.24 / (0.0207 * fMin + 18.96) (critical bandwidth scaling)
 *
 * References:
 *   Plomp & Levelt (JASA 1965) — sensory dissonance curves
 *   Sethares, "Tuning, Timbre, Spectrum, Scale" (1998)
 */

const PL_B1 = 3.5;
const PL_B2 = 5.75;

export interface Partial {
  f: number; // Hz
  a: number; // amplitude 0..1
}

/**
 * Compute a 0..1 roughness scalar from two lists of partials.
 * Cross-pair comparisons between voice A and voice B dominate.
 */
export function computeRoughness(voiceA: Partial[], voiceB: Partial[]): number {
  const all = [...voiceA, ...voiceB];
  if (all.length < 2) return 0;

  let roughSum = 0;
  const n = all.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const f1 = all[i].f;
      const f2 = all[j].f;
      const a1 = all[i].a;
      const a2 = all[j].a;
      if (a1 < 0.001 || a2 < 0.001) continue;
      const fMin = Math.min(f1, f2);
      const df = Math.abs(f2 - f1);
      const s = 0.24 / (0.0207 * fMin + 18.96);
      const x = s * df;
      const r = a1 * a2 * (Math.exp(-PL_B1 * x) - Math.exp(-PL_B2 * x));
      roughSum += Math.max(0, r);
    }
  }

  // Normalise: half of n*(n-1) pairs, each max ≈ 0.04 a*b
  const norm = (n * (n - 1)) / 2;
  return Math.min(1, roughSum / (norm * 0.035 + 0.001));
}

/**
 * Build the harmonic partial series for a fundamental frequency.
 * nPartials should be small (4-6) for real-time use.
 */
export function makePartials(fundHz: number, nPartials = 5, baseAmp = 0.8): Partial[] {
  const partials: Partial[] = [];
  for (let k = 1; k <= nPartials; k++) {
    const f = fundHz * k;
    if (f > 20000) break;
    partials.push({ f, a: baseAmp / k });
  }
  return partials;
}
