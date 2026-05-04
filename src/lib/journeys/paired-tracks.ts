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
  // Constraints:
  //   - Avoid neural-link's 18:39 track (too long)
  //   - Avoid Welcome Home album tracks (play in the WH path):
  //     Playa, Welcome Home, The Knife, The Knife (Jam), Bath,
  //     Interplay, Stir Crazy, Rolling, Quarantine, All Together,
  //     2019, Isolation, Rebound
  "the-ascension":    "%Naive%",               // 3:36 mp3 — short, distinctive, not WH
  "mycelium-dream":   "%Folsom St 8%",         // 6:25 alac — organic, longest available
  "abyssal-dive":     "%17th St 62%",          // 4:41
  "dissolution":      "%champa%",              // 2:43 mp3
  "the-ascent":       "%Folsom St 5%",         // 4:41 alac
  "the-tempest":      "%17th St 63 spectre%",  // "spectre" → distinct from 17th St 63
  "the-bloom":        "%Folsom St 9%",         // 3:35 alac

  // ─── Unpaired (TODO — were WH conflicts) ─────────────────────────
  // These journeys aren't currently in INSTALLATION_SEQUENCE. Their
  // previous WH-conflicting pairs are commented for reference. When
  // adding any back to the sequence, pair them with non-WH tracks.
  // "sacred-resonance": "%2019%",          // 2019 is in WH
  // "the-maze":         "%Naive%",         // re-pair: Naive now used by Ascension
  // "the-crossing":     "%Rolling%",       // Rolling is in WH
  // "the-reading":      "%Grasshopper%",   // Grasshopper is OK (not in WH)
  // "the-solstice":     "%Stir Crazy%",    // Stir Crazy is in WH
  // "the-harvest":      "%All Together%",  // All Together is in WH
  // "the-wound":        "%Quarantine%",    // Quarantine is in WH
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
