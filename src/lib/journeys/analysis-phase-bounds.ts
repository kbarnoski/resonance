/**
 * Analysis-derived phase boundaries for built-in journeys whose tracks
 * have studio analyses (Karel 2026-09-20: "use the musical analysis as
 * inspiration for all"). Computed from each recording's note-density ×
 * velocity envelope (scripts/align-phases-to-analysis.mjs's method):
 * the transcendence window sits on the track's TRUE energy peak, so
 * shader arcs, ambient layers, peak-forward image allocation, and the
 * phase-aware offline player all climax with the music.
 *
 * Applied to JOURNEYS at module load (journeys.ts) — one source of
 * truth for the app, the engine, the harvest, and the kiosk.
 *
 * Ghost is deliberately ABSENT: its boundaries choreograph hand-placed
 * flash cues and must never be auto-shifted.
 *
 * Album (DB) journeys get the same treatment directly in their rows.
 */
export const ANALYSIS_PHASE_BOUNDS: Record<string, readonly number[]> = {
  "first-snow": [0, 0.05, 0.221, 0.387, 0.84, 0.92, 1],
  "inferno": [0, 0.05, 0.55, 0.67, 0.73, 0.879, 1],
  "the-ascent": [0, 0.158, 0.465, 0.569, 0.673, 0.886, 1],
  "the-ascension": [0, 0.12, 0.299, 0.494, 0.614, 0.873, 1],
  "the-bloom": [0, 0.107, 0.339, 0.617, 0.785, 0.896, 1],
  "cosmic-drift": [0, 0.167, 0.252, 0.348, 0.748, 0.848, 1],
  "mycelium-dream": [0, 0.101, 0.197, 0.265, 0.423, 0.896, 1],
};

import { BUILTIN_ANALYSIS_RETHEME } from "./analysis-retheme.generated";

/** Overlay analysis bounds (and, for journeys re-themed from their v2
 *  deep analysis, the measured per-phase intensity + beats) onto a
 *  journey's phases in place. */
export function applyAnalysisBounds<T extends { id: string; phases: Array<{ start?: number; end?: number }> }>(
  journey: T,
): T {
  const bounds = ANALYSIS_PHASE_BOUNDS[journey.id];
  if (!bounds || journey.phases.length !== bounds.length - 1) return journey;
  const over = BUILTIN_ANALYSIS_RETHEME[journey.id];
  // Re-themed built-ins carry their own framing in every beat: skip the
  // random POV decoration (its "archway, silhouetted" / "toward the
  // horizon" options summoned figures and sun discs — 2026-10-05 QA).
  if (over) (journey as unknown as { strictCameraPrompt?: boolean }).strictCameraPrompt = true;
  journey.phases.forEach((p, i) => {
    p.start = bounds[i];
    p.end = bounds[i + 1];
    if (over?.[i]) Object.assign(p, over[i]);
  });
  return journey;
}
