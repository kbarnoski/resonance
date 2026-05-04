/** Journeys paired with specific tracks — title search patterns (SQL ILIKE).
 *  When a journey is in this map, the installation loop ALWAYS plays the
 *  matching track for that journey instead of falling back to a random
 *  pick from the user's library.
 *
 *  To pair a new journey: add an entry like `"the-ascension": "%title%"`
 *  where the value is a SQL ILIKE pattern that matches the recording's
 *  title. `%foo%` matches any title containing "foo".
 *
 *  Pairings as of 2026-05-03:
 *    Defined: first-snow, inferno, cosmic-drift, neural-link, ghost
 *    TODO: rest of the installation sequence (see comments below)
 */
export const PAIRED_TRACKS: Record<string, string> = {
  // ─── Already paired ────────────────────────────────────────────
  "first-snow": "%KB_SFLAKE%",
  "inferno": "%KB_REALIZED%",
  "cosmic-drift": "%17th St 61%",
  "neural-link": "%17th St 64%",
  "ghost": "%KB_GHOST_REF%",

  // ─── Installation pairings (2026-05-03) ───
  // Picked to avoid neural-link's 18:39 track and the Welcome Home
  // album tracks (those play in the WH path). Patterns are unique
  // enough to not collide on substring match — e.g., "17th St 63
  // spectre" includes "spectre" so it doesn't match "17th St 63".
  "the-ascension":    "%Rebound%",              // 2:51 — short, name evokes upward motion
  "mycelium-dream":   "%Folsom St 8%",         // 6:25 — organic, longest available
  "abyssal-dive":     "%17th St 62%",          // 4:41
  "dissolution":      "%champa%",              // 2:43
  "sacred-resonance": "%2019%",                // 3:41
  "the-maze":         "%Naive%",               // 3:36
  "the-ascent":       "%Folsom St 5%",         // 4:41
  "the-crossing":     "%Rolling%",             // 4:35
  "the-reading":      "%Grasshopper%",         // 3:18
  "the-tempest":      "%17th St 63 spectre%",  // "spectre" → distinct from 17th St 63
  "the-bloom":        "%Folsom St 9%",         // 3:35
  "the-solstice":     "%Stir Crazy%",          // 2:51
  "the-harvest":      "%All Together%",        // 3:39
  "the-wound":        "%Quarantine%",          // 2:56
};

/** Storage file search patterns — fallback when track isn't in recordings table */
export const PAIRED_STORAGE: Record<string, string> = {};

/**
 * Resolve the recording IDs for all journey-paired tracks.
 * Used by the library to show these tracks as read-only for non-owner users.
 */
export async function resolvePairedTrackIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string[]> {
  const patterns = Object.values(PAIRED_TRACKS);
  if (patterns.length === 0) return [];

  // Build an OR filter of ILIKE patterns
  const orFilter = patterns.map((p) => `title.ilike.${p}`).join(",");
  const { data, error } = await supabase
    .from("recordings")
    .select("id")
    .or(orFilter);

  if (error || !data) return [];

  // Deduplicate
  return [...new Set((data as { id: string }[]).map((r) => r.id))];
}
