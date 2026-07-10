// ─────────────────────────────────────────────────────────────────────────────
// data.ts — LIVE NOAA space-weather feeds for 1374-sky-strata.
//
// The sky is the primary COMPOSER here. We fetch three public, keyless,
// CORS-open NOAA SWPC 1-day products CLIENT-SIDE (no API route). Each product is
// a JSON array where row[0] is a header of column names and rows[1..] are data,
// most-recent LAST. Values arrive as strings, so every field is coerced with
// Number and guarded for NaN. We walk from the newest row backward and take the
// first fully-valid sample.
//
// On ANY failure (network / CORS / parse / headless-with-no-network / 5s
// timeout) we fall back to a slowly-drifting simulateSky() labelled
// "simulated" so the piece is NEVER blank or silent.
// ─────────────────────────────────────────────────────────────────────────────

export interface SkyPoint {
  /** Milliseconds since epoch for this observation (best-effort). */
  t: number;
  /** Bulk solar-wind speed, km/s. */
  speed: number;
  /** Proton density, p/cm³. */
  density: number;
}

export interface Sky {
  /** Bulk solar-wind speed, km/s (~250–800). Authors TEMPO + drift. */
  speed: number;
  /** Proton density, p/cm³ (~0–30). Authors strata band count + thickness. */
  density: number;
  /** Bz (GSM), nT. Negative/southward → minor mode + aurora energy. */
  bz: number;
  /** Bt total interplanetary field, nT (~0..30). */
  bt: number;
  /** Planetary K index, 0–9. Authors overall energy + palette. */
  kp: number;
  /** True live sample, or the drifting simulated fallback? */
  live: boolean;
  /** Most-recent UTC time_tag observed, or "" for simulated. */
  timeTag: string;
  /** Recent plasma rows (oldest→newest) for the legible time-series ribbon. */
  history: SkyPoint[];
}

const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

const HISTORY_N = 60;
const FETCH_TIMEOUT_MS = 5000;

type Row = string[];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

async function fetchProduct(url: string): Promise<Row[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
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

/** Column index for a header name (case-insensitive), or -1. */
function colOf(header: Row, name: string): number {
  return header.findIndex((h) => String(h).toLowerCase() === name.toLowerCase());
}

function parseTag(tag: string): number {
  // NOAA tags look like "2026-07-10 18:31:00.000"; make them Date-parseable.
  const iso = tag.includes("T") ? tag : tag.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Walk rows from the newest backward (skipping the header). Return the first row
 * whose requested columns ALL parse to finite numbers, with its time_tag.
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

/** Build the recent plasma ribbon from the tail of the plasma product. */
function plasmaHistory(rows: Row[]): SkyPoint[] {
  const header = rows[0];
  const tCol = colOf(header, "time_tag");
  const dCol = colOf(header, "density");
  const sCol = colOf(header, "speed");
  if (dCol < 0 || sCol < 0) return [];
  const out: SkyPoint[] = [];
  for (let i = rows.length - 1; i >= 1 && out.length < HISTORY_N; i--) {
    const row = rows[i];
    const speed = Number(row?.[sCol]);
    const density = Number(row?.[dCol]);
    if (!Number.isFinite(speed) || !Number.isFinite(density)) continue;
    out.push({
      t: tCol >= 0 ? parseTag(String(row?.[tCol] ?? "")) : Date.now(),
      speed: clamp(speed, 100, 1200),
      density: clamp(density, 0, 100),
    });
  }
  return out.reverse(); // oldest → newest
}

/**
 * A slowly-drifting synthetic sky. Deterministic in the wall clock so two
 * glances a moment apart look continuous. Used whenever the live feeds fail.
 */
export function simulateSky(): Sky {
  const t = Date.now() / 1000;
  const speed = clamp(450 + 170 * Math.sin(t / 97), 250, 800);
  const density = clamp(6 + 5 * Math.sin(t / 71 + 1), 0.5, 22);
  const bz = 7 * Math.sin(t / 53 + 2);
  const bt = clamp(6 + 3 * Math.sin(t / 61), 2, 18);
  const kp = clamp(3 + 2.6 * Math.sin(t / 131), 0, 9);

  const history: SkyPoint[] = [];
  for (let i = HISTORY_N - 1; i >= 0; i--) {
    const tt = t - i * 60;
    history.push({
      t: (tt) * 1000,
      speed: clamp(450 + 170 * Math.sin(tt / 97), 250, 800),
      density: clamp(6 + 5 * Math.sin(tt / 71 + 1), 0.5, 22),
    });
  }

  return { speed, density, bz, bt, kp, live: false, timeTag: "", history };
}

/**
 * Fetch one combined LIVE sky from all three NOAA products in parallel. We
 * report live:true when at least the plasma product (speed/density — the primary
 * driver) is real. Any missing piece is filled from the current simulated sky so
 * the mapping engine always receives a complete, well-formed sample. If every
 * product fails we return the drifting simulated sky unchanged.
 */
export async function fetchSky(): Promise<Sky> {
  const [plasmaRows, magRows, kpRows] = await Promise.all([
    fetchProduct(PLASMA_URL),
    fetchProduct(MAG_URL),
    fetchProduct(KP_URL),
  ]);

  const sim = simulateSky();
  const out: Sky = { ...sim, live: false, timeTag: "" };
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
    const hist = plasmaHistory(plasmaRows);
    if (hist.length > 0) out.history = hist;
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

  if (!anyLive) return sim;

  out.live = true;
  out.timeTag = newestTag;
  return out;
}
