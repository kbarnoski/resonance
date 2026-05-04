/**
 * Installation-mode loop sequence.
 *
 * Explicit ordering of journey IDs for the kiosk loop. Lives separately
 * from `JOURNEYS` so changing the installation order doesn't affect the
 * /journeys browse page or other surfaces that depend on declaration order.
 *
 * Curation rules per Karel (2026-05-03):
 *   - 5 journeys, target ~15 min, "15ish" tolerance
 *   - Ghost slot 5; Inferno slots 2-4; Snowflake not slot 4
 *   - Ascension paired with a shorter track than original
 *   - All tracks must be Karel's own (no other users' recordings)
 *   - No tracks from the Welcome Home path
 *
 * Five-act arc (~18:47 audio + 26s intro/credits ≈ 19:13 cycle):
 *   1. Ascension     (17th St 63,     3:20) — sacred invocation
 *   2. Inferno       (KB_REALIZED,    4:02) — fire / intensity
 *   3. Snowflake     (KB_SFLAKE_TK1,  3:05) — cooling / recovery
 *   4. Abyssal Dive  (17th St 62,     4:41) — descent, bridge to spectral
 *   5. Ghost         (KB_GHOST_REF,   3:39) — spectral closure
 *
 * Cycle is closer to 19 min than 15 — Karel-only + non-WH constraints
 * narrow the available short tracks dramatically. If 15 is hard target,
 * consider dropping Abyssal Dive or shortening Ascension further.
 */
export const INSTALLATION_SEQUENCE: string[] = [
  "the-ascension",
  "inferno",
  "first-snow",
  "abyssal-dive",
  "ghost",
];
