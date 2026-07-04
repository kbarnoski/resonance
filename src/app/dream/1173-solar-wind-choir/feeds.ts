// ─────────────────────────────────────────────────────────────────────────────
// feeds.ts — LIVE solar-wind feeds for 1173-solar-wind-choir.
//
// We fetch THREE public, keyless, CORS-open NOAA SWPC products CLIENT-SIDE (no
// API route). Each product is a JSON array where row[0] is a header of column
// names and rows[1..] are data, most-recent LAST. Values arrive as strings, so
// every field is coerced with Number and guarded for NaN.
//
// On ANY failure (network, CORS, parse, headless-with-no-network) we return an
// embedded SNAPSHOT of plausible values so the piece ALWAYS sounds and renders.
// The badge then reads "using sample data" instead of "live".
// ─────────────────────────────────────────────────────────────────────────────

export interface SolarWind {
  /** Bulk solar-wind speed, km/s (~250–800). */
  speed: number;
  /** Proton density, p/cm³ (~0–30). */
  density: number;
  /** Bz (GSM), nT. Negative/southward drives geomagnetic storms (~-20..+20). */
  bz: number;
  /** Bt total interplanetary field, nT (~0..30). */
  bt: number;
  /** Planetary K index, 0–9. */
  kp: number;
  /** Was this a real live sample, or the embedded fallback? */
  live: boolean;
  /** Most-recent UTC time_tag observed (ISO-ish string), or "" for fallback. */
  timeTag: string;
}

const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

// Mandatory embedded snapshot — plausible quiet-day values.
export const FALLBACK: SolarWind = {
  speed: 420,
  density: 5,
  bz: -3,
  bt: 6,
  kp: 3,
  live: false,
  timeTag: "",
};

type Row = string[];

async function fetchProduct(url: string): Promise<Row[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length < 2) return null;
    return json as Row[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Column index for a header name, or -1. */
function colOf(header: Row, name: string): number {
  return header.findIndex((h) => String(h).toLowerCase() === name.toLowerCase());
}

/**
 * Walk rows from the end (skipping the header). Return the first row whose
 * requested columns ALL parse to finite numbers, along with that row's
 * time_tag. Returns null if the product is unusable.
 */
function latestValid(
  rows: Row[],
  names: string[],
): { values: number[]; timeTag: string } | null {
  const header = rows[0];
  const cols = names.map((n) => colOf(header, n));
  if (cols.some((c) => c < 0)) return null;
  const timeCol = colOf(header, "time_tag");

  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const values: number[] = [];
    let ok = true;
    for (const c of cols) {
      const v = Number(row?.[c]);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      values.push(v);
    }
    if (ok) {
      const timeTag = timeCol >= 0 ? String(row?.[timeCol] ?? "") : "";
      return { values, timeTag };
    }
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Fetch one combined live sample from all three NOAA products in parallel.
 * We report live:true when at least the plasma product (speed/density — the
 * primary sonic driver) is real; any missing piece is filled from FALLBACK so
 * the mapping engine always receives a complete, well-formed sample. If every
 * product fails we return the embedded FALLBACK snapshot unchanged.
 */
export async function fetchSolarWind(): Promise<SolarWind> {
  const [plasmaRows, magRows, kpRows] = await Promise.all([
    fetchProduct(PLASMA_URL),
    fetchProduct(MAG_URL),
    fetchProduct(KP_URL),
  ]);

  const out: SolarWind = { ...FALLBACK };
  let anyLive = false;
  let newestTag = "";

  if (plasmaRows) {
    const p = latestValid(plasmaRows, ["density", "speed"]);
    if (p) {
      out.density = clamp(p.values[0], 0, 100);
      out.speed = clamp(p.values[1], 100, 1200);
      anyLive = true;
      if (p.timeTag > newestTag) newestTag = p.timeTag;
    }
  }

  if (magRows) {
    const m = latestValid(magRows, ["bz_gsm", "bt"]);
    if (m) {
      out.bz = clamp(m.values[0], -60, 60);
      out.bt = clamp(m.values[1], 0, 80);
      anyLive = true;
      if (m.timeTag > newestTag) newestTag = m.timeTag;
    }
  }

  if (kpRows) {
    const k = latestValid(kpRows, ["kp"]);
    if (k) {
      out.kp = clamp(k.values[0], 0, 9);
      anyLive = true;
      if (k.timeTag > newestTag) newestTag = k.timeTag;
    }
  }

  if (!anyLive) return { ...FALLBACK };

  out.live = true;
  out.timeTag = newestTag;
  return out;
}
