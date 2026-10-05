/**
 * Recordings whose analyses rows are FROZEN (Karel 2026-10-05: "nothing
 * you do may change how they play"). The Room reads analyses.tempo /
 * key_signature / summary at runtime (analysis HUD, poetry mood via
 * detectVibe, poetry overlay), so for these recordings no automated
 * pipeline may write ANY analyses column — deep-analysis v2 for them is
 * kept in a sidecar (scripts/deep-analysis-protected.json) until Karel
 * explicitly releases a track from this list.
 */
export const ANALYSIS_FROZEN_RECORDINGS: Readonly<Record<string, string>> = {
  // Final mastering — Snowflake EP
  "549fc519-f7fc-4c38-a771-adaad2edbc81": "Ghost (KB_GHOST_REF_2.0) — journey ghost, LOCKED",
  "734a09ce-84df-4f1f-93c1-11b08d303681": "Snowflake (KB_SFLAKE_TK5_MOOG_REF_2.0) — journey first-snow",
  // Mastered Kinetic Lab journeys
  "3a3e196f-2abf-49de-8c91-e743f15d5bd1": "Chemiluminescence 1 — Kinetic Lab",
  "f6a70f3b-65fb-45a0-a380-4d2e2ff0ae7d": "Rolling 2 — Kinetic Lab",
  "874855cb-2dc7-48f2-ae50-b9f91f8b9140": "Stand 10 — Kinetic Lab",
  "785d0927-f278-4cc5-a472-e2a30856a28b": "Cabin Soul 8 — Kinetic Lab",
  "f88c2d3b-d93d-4e8d-9bce-7a4bb6db207e": "Cabin Soul 5 — Kinetic Lab",
};

export function isAnalysisFrozen(recordingId: string | null | undefined): boolean {
  return !!recordingId && recordingId in ANALYSIS_FROZEN_RECORDINGS;
}
