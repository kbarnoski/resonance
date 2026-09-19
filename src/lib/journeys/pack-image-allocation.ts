/**
 * Phase-slice allocation for pre-harvested (Tramokyo pack) journey
 * imagery — the ONE place the image-per-phase math lives.
 *
 * The harvest script distributes each journey's N images across its
 * phases (largest-remainder over phase length × optional weighting) and
 * generates them in phase order, so slot position encodes story
 * position. The offline player must therefore select images by the
 * CURRENT phase + progress, not by blind cycling: with the 2026-09-16
 * peak-forward weighting, a fixed-cadence cycle runs ahead of the music
 * and the journey's storyline plays out of order (Karel, 2026-09-19:
 * Ghost's arc appeared "almost backwards").
 *
 * Harvest and playback MUST use the same weights or slices misalign —
 * both sides import from here.
 */

import { TRAMOKYO_PHASE_WEIGHT } from "./prompt-decoration";

export { TRAMOKYO_PHASE_WEIGHT };

export interface PhaseSpan {
  id: string;
  start?: number;
  end?: number;
}

/**
 * Largest-remainder allocation of n images across phases by length,
 * optionally multiplied by per-phase weights (null → uniform).
 */
export function allocateByPhase(
  phases: readonly PhaseSpan[],
  n: number,
  phaseWeight: Record<string, number> | null,
): number[] {
  const weights = phases.map((p) => {
    const len = Math.max(0, (p.end ?? 1) - (p.start ?? 0));
    const mult = phaseWeight ? (phaseWeight[p.id] ?? 1) : 1;
    return len * mult;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / total) * n);
  const counts = raw.map(Math.floor);
  let rem = n - counts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i): [number, number] => [r - counts[i], i])
    .sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && rem > 0; k++, rem--) counts[order[k][1]]++;
  return counts;
}

/**
 * Map playback progress (0..1) to the packed-image index whose phase
 * slice contains that moment, stepping through the slice in order as
 * the phase advances. Returns -1 when the inputs can't be mapped
 * (caller falls back to sequential cycling).
 */
export function packImageIndexForProgress(
  phases: readonly PhaseSpan[] | undefined | null,
  n: number,
  progress: number,
  phaseWeight: Record<string, number> | null = TRAMOKYO_PHASE_WEIGHT,
): number {
  if (!phases || phases.length === 0 || n <= 0 || !(progress >= 0)) return -1;
  const counts = allocateByPhase(phases, n, phaseWeight);
  let offset = 0;
  for (let i = 0; i < phases.length; i++) {
    const start = phases[i].start ?? 0;
    const end = phases[i].end ?? 1;
    const isLast = i === phases.length - 1;
    if (progress < end || isLast) {
      if (counts[i] <= 0) return Math.min(offset, n - 1);
      const span = Math.max(1e-6, end - start);
      const inPhase = Math.min(1, Math.max(0, (progress - start) / span));
      const step = Math.min(counts[i] - 1, Math.floor(inPhase * counts[i]));
      return Math.min(offset + step, n - 1);
    }
    offset += counts[i];
  }
  return -1;
}
