/**
 * Installation-mode loop sequence.
 *
 * Explicit ordering of journey IDs for the kiosk loop. Lives separately
 * from `JOURNEYS` so changing the installation order doesn't affect the
 * /journeys browse page or other surfaces that depend on declaration order.
 *
 * Three-act arc (~10:39 audio + 26s intro/credits ≈ 11:05 cycle):
 *   1. Snowflake (KB_SFLAKE_TK5_MOOG, 2:58) — cooling / opening
 *   2. Realized  (KB_REALIZED,        4:02) — fire / intensity
 *   3. Ghost     (KB_GHOST_REF,       3:39) — spectral closure
 *
 * Tightened from the original five-journey cycle (2026-05-08) per Karel —
 * Ascension and Abyssal Dive removed for a sharper reviewer experience
 * on /demo. Both /demo and /installation share this list. To run a
 * variant later, add a `?sequence=X` URL param + a sequences map.
 */
export const INSTALLATION_SEQUENCE: string[] = [
  "first-snow",
  "inferno",
  "ghost",
];
