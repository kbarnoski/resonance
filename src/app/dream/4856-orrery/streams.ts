// streams.ts — the THREE real-time data streams fused by this piece.
//
//   1. Earthquakes   — USGS GeoJSON            (localized impulses)
//   2. Solar wind     — NOAA SWPC plasma        (a sustained pressure carrier)
//   3. Geomagnetic Kp — NOAA planetary K-index  (a polar aurora bloom)
//
// Every feed is public, CORS-open, key-free, read-only GET. The build/review
// runs HEADLESS behind a proxy that may BLOCK these fetches, so EACH stream
// ships a deterministic seeded synthetic generator — the piece always plays and
// paints in ~1s with zero network and zero interaction. Live fetch upgrades in
// the background if it succeeds.
//
// No Math.random / Date.now / new Date anywhere: randomness is a seeded
// mulberry32; "now" is supplied by the caller (performance.timeOrigin +
// performance.now()); continuous evolution rides performance.now() phases.

export const DAY_MS = 24 * 60 * 60 * 1000;

// ── seeded PRNG (mulberry32) — the ONLY source of randomness in this piece ────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x4856;

// ════════════════════════════════════════════════════════════════════════════
// STREAM 1 — EARTHQUAKES (USGS)
// ════════════════════════════════════════════════════════════════════════════

export interface Quake {
  id: string;
  mag: number; // moment magnitude
  time: number; // ms epoch
  lon: number; // -180..180
  lat: number; // -90..90
  depthKm: number;
  place: string;
}

export interface QuakeCatalog {
  quakes: Quake[]; // sorted ascending by time
  source: "LIVE" | "SYNTH";
}

const USGS_HOUR =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const USGS_DAY =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

interface UsgsFeature {
  id?: string;
  properties?: { mag?: number | null; time?: number | null; place?: string | null } | null;
  geometry?: { coordinates?: number[] | null } | null;
}
interface UsgsCollection {
  features?: UsgsFeature[];
}

function parseQuakes(json: UsgsCollection): Quake[] {
  const feats = Array.isArray(json.features) ? json.features : [];
  const out: Quake[] = [];
  for (let i = 0; i < feats.length; i++) {
    const p = feats[i].properties;
    const c = feats[i].geometry?.coordinates;
    if (!p || !c || typeof p.mag !== "number" || typeof p.time !== "number") continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    const depthKm = Number(c[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push({
      id: feats[i].id ?? `usgs-${i}`,
      mag: p.mag,
      time: p.time,
      lon,
      lat,
      depthKm: Number.isFinite(depthKm) ? depthKm : 10,
      place: (p.place ?? "unknown region").trim(),
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

async function fetchQuakeUrl(url: string): Promise<Quake[] | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return parseQuakes((await res.json()) as UsgsCollection);
  } catch {
    return null;
  }
}

/** Try live quakes (all_day preferred for a full timeline; all_hour fallback). */
export async function fetchLiveQuakes(): Promise<QuakeCatalog | null> {
  const day = await fetchQuakeUrl(USGS_DAY);
  if (day && day.length >= 8) return { quakes: day, source: "LIVE" };
  const hour = await fetchQuakeUrl(USGS_HOUR);
  if (hour && hour.length >= 4) return { quakes: hour, source: "LIVE" };
  if (day && day.length > 0) return { quakes: day, source: "LIVE" };
  return null;
}

const REGIONS: Array<{ place: string; lon: number; lat: number; spread: number }> = [
  { place: "off the coast of Fiji", lon: 178, lat: -18, spread: 6 },
  { place: "the Aleutian Islands, Alaska", lon: -172, lat: 52, spread: 8 },
  { place: "Sumatra, Indonesia", lon: 99, lat: 0, spread: 7 },
  { place: "the Kermadec Islands", lon: -178, lat: -30, spread: 6 },
  { place: "central Chile", lon: -71, lat: -33, spread: 6 },
  { place: "the Kuril Islands", lon: 151, lat: 46, spread: 6 },
  { place: "Baja California, Mexico", lon: -114, lat: 30, spread: 5 },
  { place: "the Philippine Sea", lon: 126, lat: 12, spread: 7 },
  { place: "the Mid-Atlantic Ridge", lon: -30, lat: 0, spread: 10 },
  { place: "Hokkaido, Japan", lon: 143, lat: 42, spread: 5 },
  { place: "the Hindu Kush region", lon: 70, lat: 36, spread: 4 },
  { place: "the South Sandwich Islands", lon: -26, lat: -57, spread: 6 },
  { place: "Greece", lon: 23, lat: 38, spread: 4 },
  { place: "Vanuatu", lon: 168, lat: -16, spread: 5 },
];

/** Deterministic Gutenberg–Richter catalogue over the preceding 24h. */
export function makeSyntheticQuakes(nowMs: number): QuakeCatalog {
  const rand = mulberry32(SEED);
  const b = 1.0;
  const magMin = 2.5;
  const count = 210;
  const quakes: Quake[] = [];
  for (let i = 0; i < count; i++) {
    let mag = magMin - Math.log10(Math.max(1e-6, rand())) / b;
    mag = Math.min(mag, 7.5);
    const region = REGIONS[Math.floor(rand() * REGIONS.length) % REGIONS.length];
    const lon = wrapLon(region.lon + (rand() - 0.5) * 2 * region.spread);
    const lat = clampLat(region.lat + (rand() - 0.5) * 2 * region.spread);
    const deep = rand() < 0.18;
    const depthKm = deep ? 70 + rand() * 480 : 2 + rand() * 45;
    const time = nowMs - DAY_MS + rand() * DAY_MS;
    quakes.push({
      id: `synth-${i}`,
      mag: Math.round(mag * 10) / 10,
      time,
      lon,
      lat,
      depthKm: Math.round(depthKm),
      place: `${10 + Math.floor(rand() * 180)} km from ${region.place}`,
    });
  }
  quakes.sort((a, b2) => a.time - b2.time);
  return { quakes, source: "SYNTH" };
}

// ════════════════════════════════════════════════════════════════════════════
// STREAM 2 — SOLAR WIND (NOAA SWPC plasma) — a sustained carrier
// ════════════════════════════════════════════════════════════════════════════

export interface SolarWind {
  speed: number; // km/s (typ. 300–700)
  density: number; // protons/cm³ (typ. 1–20)
}

const SWPC_PLASMA =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";

/** Latest live plasma sample, or null. Feed is [header, ...[time,dens,speed,temp]]. */
export async function fetchLiveWind(): Promise<SolarWind | null> {
  try {
    const res = await fetch(SWPC_PLASMA, { cache: "no-store" });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length < 2) return null;
    // walk backwards to the newest row with finite density + speed
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const density = Number(r[1]);
      const speed = Number(r[2]);
      if (Number.isFinite(density) && Number.isFinite(speed) && speed > 0) {
        return { speed, density: Math.max(0, density) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Deterministic plasma walk: a couple of incommensurate sines + a seeded slow
// drift, so it evolves forever without ever repeating exactly. tSec is elapsed
// seconds from performance.now() (continuous), so the drone breathes on its own.
const windP = (() => {
  const r = mulberry32(SEED ^ 0x5157);
  return { a: r() * 6.28, b: r() * 6.28, c: r() * 6.28, d: r() * 6.28 };
})();

export function syntheticWind(tSec: number): SolarWind {
  const speed =
    430 +
    130 * Math.sin(tSec / 47 + windP.a) +
    70 * Math.sin(tSec / 13 + windP.b) +
    40 * Math.sin(tSec / 101 + windP.c);
  const density =
    6 + 4 * Math.sin(tSec / 29 + windP.c) + 2.5 * Math.sin(tSec / 7 + windP.d);
  return { speed: Math.max(260, speed), density: Math.max(0.5, density) };
}

// ════════════════════════════════════════════════════════════════════════════
// STREAM 3 — GEOMAGNETIC Kp (NOAA planetary K-index) — the aurora "sky" voice
// ════════════════════════════════════════════════════════════════════════════

const SWPC_KP = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";

interface KpRow {
  kp?: number | string | null;
  estimated_kp?: number | string | null;
  kp_index?: number | string | null;
}

/** Latest live Kp (0..9), or null. */
export async function fetchLiveKp(): Promise<number | null> {
  try {
    const res = await fetch(SWPC_KP, { cache: "no-store" });
    if (!res.ok) return null;
    const rows = (await res.json()) as KpRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const raw = rows[i].estimated_kp ?? rows[i].kp ?? rows[i].kp_index;
      const kp = Number(raw);
      if (Number.isFinite(kp)) return Math.max(0, Math.min(9, kp));
    }
    return null;
  } catch {
    return null;
  }
}

// Deterministic Kp random-walk, sampled smoothly by phase. Precompute a short
// seeded walk once, then Catmull–Rom-interpolate between knots so activity
// swells and subsides like a real magnetosphere without jitter.
const KP_KNOTS = (() => {
  const r = mulberry32(SEED ^ 0x4b70);
  const n = 16;
  const knots: number[] = [];
  let v = 2.5;
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5) * 2.4;
    v = Math.max(0.3, Math.min(8.5, v));
    knots.push(v);
  }
  return knots;
})();
const KP_PERIOD_SEC = 210; // a full sweep of the walk every ~3.5 min

export function syntheticKp(tSec: number): number {
  const n = KP_KNOTS.length;
  const pos = ((tSec / KP_PERIOD_SEC) % 1) * n;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = KP_KNOTS[(i - 1 + n) % n];
  const b = KP_KNOTS[i % n];
  const c = KP_KNOTS[(i + 1) % n];
  const d = KP_KNOTS[(i + 2) % n];
  // Catmull–Rom
  const kp =
    0.5 *
    (2 * b +
      (-a + c) * f +
      (2 * a - 5 * b + 4 * c - d) * f * f +
      (-a + 3 * b - 3 * c + d) * f * f * f);
  return Math.max(0, Math.min(9, kp));
}

// ── normalisers shared by field + audio ──────────────────────────────────────
export function speedNorm(speed: number): number {
  return Math.max(0, Math.min(1, (speed - 300) / 500)); // 300..800 km/s → 0..1
}
export function densityNorm(density: number): number {
  return Math.max(0, Math.min(1, density / 20)); // 0..20 /cm³ → 0..1
}
export function kpNorm(kp: number): number {
  return Math.max(0, Math.min(1, kp / 9));
}

// ── quake perceptual normalisers + field impulse ──────────────────────────────
export function magNorm(mag: number): number {
  return Math.max(0, Math.min(1, (mag - 2) / 6));
}
export function depthNorm(depthKm: number): number {
  return Math.max(0, Math.min(1, depthKm / 300));
}
export function quakeImpulse(mag: number): number {
  const raw = Math.pow(10, mag - 4.5);
  return Math.min(6, 0.15 + raw * 0.55);
}

// ── geometry helpers ──────────────────────────────────────────────────────────
export function wrapLon(lon: number): number {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}
export function clampLat(lat: number): number {
  return Math.max(-89.9, Math.min(89.9, lat));
}
export function lonLatToCell(
  lon: number,
  lat: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const fx = (wrapLon(lon) + 180) / 360;
  const fy = (90 - clampLat(lat)) / 180;
  let x = Math.floor(fx * w);
  let y = Math.floor(fy * h);
  x = ((x % w) + w) % w;
  y = Math.max(0, Math.min(h - 1, y));
  return { x, y };
}
