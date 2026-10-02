/**
 * Ghost ARC LAW (Karel 2026-10-01) — docs/ghost-journey-spec.md §0.
 *
 * Eight stages, in order. Every Ghost beat (phases.*.aiPromptSequence)
 * belongs to exactly one stage, declared here beat-for-beat. The arc
 * test (ghost-arc.test.ts) asserts the map matches the beats, never
 * runs backwards, and that the beat text honors each stage (entrance
 * before inside, light ABOVE, no stone room after stage 1, the ending
 * is the angel unifying with light amidst the cosmos).
 *
 * If you add/remove/reorder a Ghost beat, update this map in the same
 * commit — the test fails otherwise.
 */

import { allocateByPhase, TRAMOKYO_PHASE_WEIGHT, type PhaseSpan } from "./pack-image-allocation";

export const GHOST_ARC_STAGES = [
  "stone room with window",                         // 1
  "entrance to the tunnel into the depths of earth", // 2
  "deeper and deeper in the tunnel",                // 3
  "pool with infinite floating flowers",            // 4
  "light at the end of the tunnel above; emerging", // 5
  "flight through infinite space; flowers grow",    // 6
  "spiritual union with the tree; full bloom",      // 7
  "the angel unifying with light amidst the cosmos",// 8
] as const;

export type GhostArcStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Stage of each beat, per phase, in beat order. */
export const GHOST_BEAT_STAGES: Record<string, GhostArcStage[]> = {
  threshold:     [1, 1, 1, 1, 1, 1],
  expansion:     [2, 2, 3, 3, 3, 3, 3],
  transcendence: [4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5],
  illumination:  [5, 6, 6, 6, 6],
  return:        [7, 7, 7, 7],
  integration:   [8, 8, 8, 8, 8, 8],
};

/** Bass-flash cue progress for the Ghost recording (98.3s / 160.1s of
 *  219.4s). Karel 2026-10-01: "both flashes happen while underground" —
 *  they must land inside stages 2–5. */
export const GHOST_FLASH_PROGRESS = [0.448, 0.73] as const;

/** Phase order the stage map assumes. */
export const GHOST_PHASE_ORDER = ["threshold", "expansion", "transcendence", "illumination", "return", "integration"] as const;

/**
 * Stage of every harvested pack slot — mirrors the harvest's slot→beat
 * rule (scripts/harvest-journey-images.mjs: phase counts by
 * allocateByPhase, beat = floor(i / phaseCount * seq.length)).
 */
export function ghostSlotStages(
  phases: readonly (PhaseSpan & { aiPromptSequence?: readonly string[] })[],
  n: number,
  phaseWeight: Record<string, number> | null = TRAMOKYO_PHASE_WEIGHT,
): GhostArcStage[] {
  const counts = allocateByPhase(phases, n, phaseWeight);
  const out: GhostArcStage[] = [];
  phases.forEach((phase, pi) => {
    const stages = GHOST_BEAT_STAGES[phase.id] ?? [];
    const len = phase.aiPromptSequence?.length ?? stages.length;
    for (let i = 0; i < counts[pi]; i++) {
      const beat = Math.min(len - 1, Math.floor((i / counts[pi]) * len));
      out.push(stages[beat]);
    }
  });
  return out;
}
