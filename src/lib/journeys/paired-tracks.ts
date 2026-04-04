/** Journeys paired with specific tracks — title search patterns (SQL ILIKE) */
export const PAIRED_TRACKS: Record<string, string> = {
  "first-snow": "%KB_SFLAKE%",
  "inferno": "%KB_REALIZED%",
  "cosmic-drift": "%17th St 61%",
};

/** Storage file search patterns — fallback when track isn't in recordings table */
export const PAIRED_STORAGE: Record<string, string> = {};
