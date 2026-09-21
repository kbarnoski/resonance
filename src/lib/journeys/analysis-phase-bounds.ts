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
  "the-ascent": [0, 0.05, 0.534, 0.656, 0.716, 0.872, 1],
  "the-ascension": [0, 0.05, 0.16, 0.624, 0.84, 0.92, 1],
  "the-bloom": [0, 0.05, 0.55, 0.72, 0.84, 0.92, 1],
  "cosmic-drift": [0, 0.05, 0.513, 0.699, 0.763, 0.893, 1],
  "mycelium-dream": [0, 0.05, 0.485, 0.605, 0.84, 0.92, 1],
};

/** Overlay analysis bounds onto a journey's phases in place. */
export function applyAnalysisBounds<T extends { id: string; phases: Array<{ start?: number; end?: number }> }>(
  journey: T,
): T {
  const bounds = ANALYSIS_PHASE_BOUNDS[journey.id];
  if (!bounds || journey.phases.length !== bounds.length - 1) return journey;
  journey.phases.forEach((p, i) => {
    p.start = bounds[i];
    p.end = bounds[i + 1];
  });
  return journey;
}
