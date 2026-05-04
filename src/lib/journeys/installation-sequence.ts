/**
 * Installation-mode loop sequence.
 *
 * Explicit ordering of journey IDs for the kiosk loop. Lives separately
 * from `JOURNEYS` so changing the installation order doesn't affect the
 * /journeys browse page or other surfaces that depend on declaration order.
 *
 * Curation rules per Karel (2026-05-03):
 *   - Skip neural-link for now — its paired track (17th St 64) is too long
 *   - Save Ghost and First Snow for the end (most narrative + iconic)
 */
export const INSTALLATION_SEQUENCE: string[] = [
  // Opening — atmospheric entry
  "the-ascension",
  "inferno",
  "mycelium-dream",
  "abyssal-dive",
  "dissolution",

  // Middle — deeper journeys
  "sacred-resonance",
  "cosmic-drift",
  "the-maze",
  "the-ascent",
  "the-crossing",
  "the-reading",
  "the-tempest",
  "the-bloom",
  "the-solstice",
  "the-harvest",
  "the-wound",

  // Closers — held for last
  "first-snow",
  "ghost",
];
