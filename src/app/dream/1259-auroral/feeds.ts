// ════════════════════════════════════════════════════════════════════════════
// feeds.ts — the DATA layer for Auroral (1259)
//
// Pulls TWO live, keyless, CORS-open NOAA SWPC feeds and folds them into one
// small guarded AuroraState the renderer + synth can consume:
//
//   1. OVATION Aurora (the star input) — a ~1°×1° global grid, each entry
//      [lon (0..359), lat (-90..90), auroraProbability (0..100)]: the live
//      probability of visible aurora at every point on Earth this minute.
//        https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
//   2. Planetary Kp index (0..9) — the headline geomagnetic-activity number.
//        https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
//
// Everything is defended against null/NaN/undefined. If EITHER fetch fails
// (offline, timeout, CORS, 5xx, malformed) we fall back to a deterministic,
// seeded, plausible Kp≈3 quiet-aurora state so the piece is always beautiful and
// demoable with no network. The page reads `source` to render a live/offline
// notice, and shows the real Observation Time + Kp.
// ════════════════════════════════════════════════════════════════════════════

export type FeedSource = "live" | "sample";

/** Number of longitude buckets the northern oval is folded into. */
export const BAND_BUCKETS = 96;

export interface Hotspot {
  lon: number; // 0..359
  lat: number; // degrees
  prob: number; // 0..100
}

export interface AuroraState {
  source: FeedSource;
  /** ISO string from OVATION "Observation Time". */
  observationTime: string;
  /** Most-recent observed planetary Kp, 0..9. */
  kp: number;
  /** ISO time-tag of that Kp reading, if known. */
  kpTime: string;
  /** Overall 0..1 drive for audio + visuals (Kp-weighted + oval activity). */
  intensity: number;
  /** Peak aurora probability anywhere on the grid, 0..100. */
  peakProb: number;
  /** Northern-oval brightness folded across longitude, each 0..1. */
  band: number[];
  /** Brightest cells, for sparse bell "pings". */
  hotspots: Hotspot[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ── OVATION shape (only the bits we read) ───────────────────────────────────
interface OvationJson {
  ["Observation Time"]?: string | null;
  ["Forecast Time"]?: string | null;
  coordinates?: unknown;
}

// SWPC has served this Kp product in two shapes over time:
//   (a) a raw table: a header row then array rows ["time","kp","observed",...]
//   (b) an array of objects { time_tag, kp, observed, noaa_scale }
// We defend against BOTH so live Kp never silently degrades to the fallback.
type KpRowArray = [string, string | number, string, string | null];
interface KpRowObject {
  time_tag?: string;
  kp?: number | string;
  observed?: string;
}

// Fold the raw OVATION grid → { band, peakProb, hotspots, oval activity }.
function reduceGrid(coords: unknown): {
  band: number[];
  peakProb: number;
  hotspots: Hotspot[];
  ovalActivity: number;
} {
  const band = new Array<number>(BAND_BUCKETS).fill(0);
  let peakProb = 0;
  let bandSum = 0;
  let bandCount = 0;
  const hotspots: Hotspot[] = [];

  if (Array.isArray(coords)) {
    for (const entry of coords) {
      if (!Array.isArray(entry) || entry.length < 3) continue;
      const lon = entry[0];
      const lat = entry[1];
      const prob = entry[2];
      if (!isFiniteNumber(lon) || !isFiniteNumber(lat) || !isFiniteNumber(prob)) {
        continue;
      }
      if (prob > peakProb) peakProb = prob;

      // Collect candidate hotspots (either hemisphere, oval latitudes) for the
      // chimes. A low bar so even a quiet aurora still gives sparse cells to
      // ring; we keep only the brightest handful below.
      if (prob >= 5 && Math.abs(lat) >= 45) {
        hotspots.push({ lon: ((lon % 360) + 360) % 360, lat, prob });
      }

      // The visual band tracks the NORTHERN auroral oval (lat 55..80).
      if (lat >= 55 && lat <= 80) {
        const b = Math.min(
          BAND_BUCKETS - 1,
          Math.floor((((lon % 360) + 360) % 360) / (360 / BAND_BUCKETS)),
        );
        const v = prob / 100;
        if (v > band[b]) band[b] = v; // max within the bucket = the oval crest
        bandSum += v;
        bandCount++;
      }
    }
  }

  const ovalActivity = bandCount > 0 ? clamp01(bandSum / bandCount) : 0;
  // Keep only the brightest handful of hotspots.
  hotspots.sort((a, b) => b.prob - a.prob);
  hotspots.length = Math.min(hotspots.length, 12);

  // Guarantee some gentle chimes even in a very quiet aurora: if no grid cell
  // cleared the bar, seed hotspots from the brightest longitude buckets.
  if (hotspots.length === 0) {
    const idx = band.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    for (let k = 0; k < Math.min(4, idx.length) && idx[k].v > 0; k++) {
      hotspots.push({
        lon: (idx[k].i / BAND_BUCKETS) * 360,
        lat: 65,
        prob: idx[k].v * 100,
      });
    }
  }

  return { band, peakProb, hotspots, ovalActivity };
}

// Read a Kp value + time from either an array row or an object row.
function readKpRow(r: unknown): { kp: number; kpTime: string; observed: boolean } | null {
  if (Array.isArray(r)) {
    const a = r as KpRowArray;
    if (a.length < 2) return null;
    const kp = Number(a[1]);
    if (!Number.isFinite(kp)) return null; // skips the string header row
    return {
      kp: Math.min(9, Math.max(0, kp)),
      kpTime: typeof a[0] === "string" ? a[0] : "",
      observed: typeof a[2] === "string" && a[2].toLowerCase() === "observed",
    };
  }
  if (r && typeof r === "object") {
    const o = r as KpRowObject;
    const kp = Number(o.kp);
    if (!Number.isFinite(kp)) return null;
    return {
      kp: Math.min(9, Math.max(0, kp)),
      kpTime: typeof o.time_tag === "string" ? o.time_tag : "",
      observed:
        typeof o.observed === "string" && o.observed.toLowerCase() === "observed",
    };
  }
  return null;
}

// Parse the Kp product → most-recent observed Kp (falls back to any row).
function reduceKp(rows: unknown): { kp: number; kpTime: string } {
  if (!Array.isArray(rows) || rows.length < 1) return { kp: 3, kpTime: "" };
  let best: { kp: number; kpTime: string } | null = null;
  let anyRow: { kp: number; kpTime: string } | null = null;
  for (const r of rows) {
    const rec = readKpRow(r);
    if (!rec) continue;
    anyRow = { kp: rec.kp, kpTime: rec.kpTime };
    if (rec.observed) best = { kp: rec.kp, kpTime: rec.kpTime };
  }
  return best ?? anyRow ?? { kp: 3, kpTime: "" };
}

// Combine Kp (headline activity) with oval activity + peak into one 0..1 drive.
function deriveIntensity(kp: number, ovalActivity: number, peakProb: number): number {
  const kpNorm = clamp01(kp / 9);
  const peakNorm = clamp01(peakProb / 100);
  // Kp dominates (it's the cleanest planet-scale activity signal); the oval and
  // its brightest crest push it further so a real storm feels overwhelming.
  return clamp01(0.08 + 0.62 * kpNorm + 0.18 * ovalActivity + 0.12 * peakNorm);
}

const OVATION_URL =
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch both live NOAA feeds and fold them into one AuroraState. On ANY failure
 * (offline, timeout, CORS, parse) returns the deterministic sample state with
 * source: "sample". Never throws. ~5s AbortController timeout.
 */
export async function fetchAuroraState(): Promise<AuroraState> {
  if (typeof window === "undefined") return makeSampleState();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const [ovRaw, kpRaw] = await Promise.all([
      fetchJson(OVATION_URL, controller.signal),
      fetchJson(KP_URL, controller.signal),
    ]);
    const ov = ovRaw as OvationJson;
    const grid = reduceGrid(ov?.coordinates);
    const { kp, kpTime } = reduceKp(kpRaw);
    const obs =
      typeof ov?.["Observation Time"] === "string"
        ? (ov["Observation Time"] as string)
        : new Date().toISOString();
    if (grid.peakProb <= 0 && grid.band.every((b) => b === 0)) {
      // Grid parsed but had nothing usable — treat as a failure.
      throw new Error("OVATION grid empty");
    }
    return {
      source: "live",
      observationTime: obs,
      kp,
      kpTime,
      intensity: deriveIntensity(kp, grid.ovalActivity, grid.peakProb),
      peakProb: grid.peakProb,
      band: grid.band,
      hotspots: grid.hotspots,
    };
  } catch {
    return makeSampleState();
  } finally {
    window.clearTimeout(timer);
  }
}

// ── Deterministic offline fallback: a plausible quiet Kp≈3 aurora ───────────
// A seeded LCG (never Math.random) builds a smooth northern oval with a couple
// of brighter arcs, so the offline state is beautiful AND identical every run.
function makeSampleState(): AuroraState {
  let seed = 0x1259a; // fixed → deterministic
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const kp = 3;
  const band = new Array<number>(BAND_BUCKETS).fill(0);
  // Two soft Gaussian arcs of aurora around the northern oval.
  const arcs = [
    { center: 0.28, width: 0.16, amp: 0.72 },
    { center: 0.66, width: 0.22, amp: 0.55 },
    { center: 0.9, width: 0.1, amp: 0.4 },
  ];
  let peakProb = 0;
  const hotspots: Hotspot[] = [];
  for (let i = 0; i < BAND_BUCKETS; i++) {
    const u = i / BAND_BUCKETS;
    let v = 0.06 + 0.05 * rnd(); // faint quiet glow everywhere
    for (const a of arcs) {
      let d = Math.abs(u - a.center);
      d = Math.min(d, 1 - d); // wrap-around distance
      v += a.amp * Math.exp(-(d * d) / (2 * a.width * a.width));
    }
    v = clamp01(v);
    band[i] = v;
    const prob = v * 100;
    if (prob > peakProb) peakProb = prob;
    if (prob >= 55) {
      hotspots.push({ lon: u * 360, lat: 62 + (rnd() - 0.5) * 10, prob });
    }
  }
  hotspots.sort((a, b) => b.prob - a.prob);
  hotspots.length = Math.min(hotspots.length, 8);

  const ovalActivity =
    band.reduce((s, b) => s + b, 0) / Math.max(1, band.length);

  return {
    source: "sample",
    observationTime: "2026-07-07T00:00:00Z",
    kp,
    kpTime: "2026-07-07T00:00:00Z",
    intensity: deriveIntensity(kp, ovalActivity, peakProb),
    peakProb,
    band,
    hotspots,
  };
}

/** Format an ISO time-tag as a short readable UTC clock, defended. */
export function formatObs(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Date(t).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

/** A short human descriptor of the current geomagnetic state, by Kp. */
export function kpLabel(kp: number): string {
  if (kp >= 7) return "severe storm";
  if (kp >= 6) return "major storm";
  if (kp >= 5) return "geomagnetic storm";
  if (kp >= 4) return "active";
  if (kp >= 3) return "unsettled";
  return "quiet";
}
