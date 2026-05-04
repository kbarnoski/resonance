/** Journeys paired with specific tracks. Each value is one of:
 *
 *    "%pattern%"  — SQL ILIKE pattern; first matching title wins
 *    "=Exact"     — exact title match (for cases where ILIKE patterns
 *                   collide, e.g., "17th St 63" vs "17th St 63 spectre")
 *
 *  When a journey is in this map AND in INSTALLATION_SEQUENCE, the
 *  installation loop plays the matching track for that journey. The
 *  page always restricts pairings to the current user's recordings —
 *  no cross-user track selection.
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
  // All Karel's tracks; none in Welcome Home album.
  "the-ascension":    "=17th St 63",           // 3:20 — exact match (avoids "spectre" collision)
  "mycelium-dream":   "%Folsom St 8%",         // 6:25 alac
  "abyssal-dive":     "%17th St 62%",          // 4:41
  "the-ascent":       "%Folsom St 5%",         // 4:41 alac
  "the-tempest":      "=17th St 63 spectre",   // exact match (counterpart to ascension's exact)
  "the-bloom":        "%Folsom St 9%",         // 3:35 alac

  // ─── Unpaired (TODO) ────────────────────────────────────────────
  // Not currently in INSTALLATION_SEQUENCE. Previous WH-conflicting
  // pairs are commented for reference; if adding any back, pair with
  // non-WH tracks from Karel's library.
  // "sacred-resonance": "%2019%",           // WH
  // "the-maze":         "%Naive%",          // not Karel's
  // "the-crossing":     "%Rolling%",        // WH
  // "the-reading":      "%Grasshopper%",    // not Karel's
  // "the-solstice":     "%Stir Crazy%",     // WH
  // "the-harvest":      "%All Together%",   // WH
  // "the-wound":        "%Quarantine%",     // WH
  // "dissolution":      "%champa%",         // not Karel's
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
