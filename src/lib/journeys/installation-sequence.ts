/**
 * Installation-mode loop sequence.
 *
 * Explicit ordering of journey IDs for the kiosk loop. Lives separately
 * from `JOURNEYS` so changing the installation order doesn't affect the
 * /journeys browse page or other surfaces that depend on declaration order.
 *
 * Curation rules per Karel (2026-05-03):
 *   - 5 journeys in a ~15 min cycle
 *   - Ghost is always slot 5
 *   - Inferno in slots 2-4
 *   - First Snow somewhere but NOT right before Ghost (no slot 4)
 *   - Ascension paired with a shorter track (Rebound 2:51, see paired-tracks)
 *
 * Five-act arc (16:20 audio + ~26s intro/credits ≈ 16:45 cycle):
 *   1. Ascension  (Rebound,        2:51) — sacred invocation
 *   2. Inferno    (KB_REALIZED,    4:02) — fire / intensity
 *   3. First Snow (KB_SFLAKE,      3:05) — cooling / recovery
 *   4. Dissolution (champa,        2:43) — release, the bridge
 *   5. Ghost      (KB_GHOST_REF,   3:39) — spectral closure
 *
 * Full library available in journeys.ts; pull from there to swap or
 * extend the sequence. Pairings live in paired-tracks.ts.
 */
export const INSTALLATION_SEQUENCE: string[] = [
  "the-ascension",
  "inferno",
  "first-snow",
  "dissolution",
  "ghost",
];
