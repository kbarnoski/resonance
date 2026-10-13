/**
 * PARTICLE FEATURES ON THE MASTERED JOURNEYS (Karel 2026-10-13: "we want the
 * features in snowflake and ghost as well. when all is said and done ghost is
 * only one unique because it doesnt have morphs yet").
 *
 * The living score, the bridge, harmonic currents, the phrase conductor, the
 * cinematic look and scene dust were gated out of Snowflake ("first-snow") and
 * Ghost ("ghost"). This switch lets them in. Their CONTENT (take, stills,
 * shader script) stays locked — only the particle field changes.
 *
 * Lab switch until Karel sees it on film: `?masters=1` on (remembered in
 * sessionStorage), `?masters=0` off.
 */

export const MASTERS_FEATURES_DEFAULT = true; // Karel kept Snowflake + Ghost with every feature (2026-10-13)
export const MASTERS_SESSION_KEY = "resonance-masters";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined;

let memo: boolean | null = null;

/** No arguments = the page's own switch, read once per page load (the layer asks per frame). */
export function mastersFeaturesEnabled(search?: string, store?: Store): boolean {
  if (search === undefined && store === undefined) {
    if (memo === null) memo = readSwitch(undefined, undefined);
    return memo;
  }
  return readSwitch(search, store);
}

function readSwitch(search: string | undefined, store: Store): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("masters");
  } catch { q = null; }
  let st: Store = store;
  if (st === undefined) { try { st = typeof window !== "undefined" ? window.sessionStorage : null; } catch { st = null; } }
  try { if (q === "1" || q === "0") st?.setItem(MASTERS_SESSION_KEY, q); } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = st?.getItem(MASTERS_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return MASTERS_FEATURES_DEFAULT;
}
