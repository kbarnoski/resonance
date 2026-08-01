// quakes.ts — the data layer for Seismarium.
//
// INPUT: the USGS real-time earthquake GeoJSON feed (public, CORS-enabled, no
// key, read-only GET). If the network fails or is blocked, we synthesise a
// deterministic catalogue with a seeded PRNG so the piece ALWAYS plays.
//
// No Math.random / Date.now / new Date anywhere — randomness comes from a
// seeded mulberry32, and "now" is supplied by the caller (page.tsx derives it
// from performance.timeOrigin + performance.now()).

/** A single seismic event, normalised from the USGS feature shape. */
export interface Quake {
  id: string;
  mag: number; // moment magnitude
  time: number; // ms epoch (properties.time)
  lon: number; // degrees, -180..180
  lat: number; // degrees, -90..90
  depthKm: number; // geometry.coordinates[2]
  place: string; // human caption, e.g. "off the coast of Fiji"
}

export interface Catalog {
  quakes: Quake[]; // sorted ascending by time
  source: "LIVE" | "SYNTH";
}

export const DAY_MS = 24 * 60 * 60 * 1000;

const USGS_DAY =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const USGS_HOUR =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

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

// ── USGS GeoJSON typing (only the fields we read) ─────────────────────────────
interface UsgsFeature {
  id?: string;
  properties?: {
    mag?: number | null;
    time?: number | null;
    place?: string | null;
  } | null;
  geometry?: {
    coordinates?: [number, number, number] | number[] | null;
  } | null;
}
interface UsgsCollection {
  features?: UsgsFeature[];
}

function parseFeatures(json: UsgsCollection): Quake[] {
  const feats = Array.isArray(json.features) ? json.features : [];
  const out: Quake[] = [];
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p || !c || typeof p.mag !== "number" || typeof p.time !== "number") {
      continue;
    }
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    const depthKm = Number(c[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push({
      id: f.id ?? `usgs-${i}`,
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

async function fetchOne(url: string): Promise<Quake[] | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as UsgsCollection;
    return parseFeatures(json);
  } catch {
    return null;
  }
}

/**
 * Try the live feed. We prefer all_day (a full 24h for the timeline) but fall
 * back to all_hour if the day feed is thin. Returns null on any failure so the
 * caller can drop to the synthetic catalogue.
 */
export async function fetchLiveCatalog(): Promise<Catalog | null> {
  const day = await fetchOne(USGS_DAY);
  if (day && day.length >= 8) return { quakes: day, source: "LIVE" };
  const hour = await fetchOne(USGS_HOUR);
  if (hour && hour.length >= 4) return { quakes: hour, source: "LIVE" };
  if (day && day.length > 0) return { quakes: day, source: "LIVE" };
  return null;
}

// ── seeded synthetic catalogue (Gutenberg–Richter-ish) ────────────────────────
// The Gutenberg–Richter law says small quakes are exponentially more common
// than large ones: log10(N) = a − b·M. We invert it: draw a uniform u and map
// mag = magMin − log10(u)/b, which yields the exponential magnitude tail.
const SEED = 0x4520;

// A handful of real-ish region captions so the synthetic feed reads plausibly.
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
  { place: "the Hindu Kush region, Afghanistan", lon: 70, lat: 36, spread: 4 },
  { place: "the South Sandwich Islands", lon: -26, lat: -57, spread: 6 },
  { place: "Greece", lon: 23, lat: 38, spread: 4 },
  { place: "the Gulf of California", lon: -110, lat: 25, spread: 4 },
  { place: "Vanuatu", lon: 168, lat: -16, spread: 5 },
];

/**
 * Deterministic 24h catalogue. `nowMs` is the current epoch (from the caller);
 * events are spread across the preceding 24 hours. Identical every load.
 */
export function makeSyntheticCatalog(nowMs: number): Catalog {
  const rand = mulberry32(SEED);
  const b = 1.0; // Gutenberg–Richter b-value
  const magMin = 2.5;
  const count = 220; // a full, lively day
  const quakes: Quake[] = [];
  for (let i = 0; i < count; i++) {
    // exponential magnitude tail, clamped to a believable ceiling
    let mag = magMin - Math.log10(Math.max(1e-6, rand())) / b;
    mag = Math.min(mag, 7.6);
    const region = REGIONS[Math.floor(rand() * REGIONS.length) % REGIONS.length];
    const lon = wrapLon(region.lon + (rand() - 0.5) * 2 * region.spread);
    const lat = clampLat(region.lat + (rand() - 0.5) * 2 * region.spread);
    // shallow crustal quakes dominate; occasional deep-focus event
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
      place: `${distanceWord(rand())} of ${region.place}`,
    });
  }
  quakes.sort((a, b2) => a.time - b2.time);
  return { quakes, source: "SYNTH" };
}

function distanceWord(u: number): string {
  const km = 10 + Math.floor(u * 180);
  return `${km} km`;
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

/** Equirectangular projection → integer cell in a WxH field. Lon wraps. */
export function lonLatToCell(
  lon: number,
  lat: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const fx = (wrapLon(lon) + 180) / 360; // 0..1
  const fy = (90 - clampLat(lat)) / 180; // 0..1 (north at top)
  let x = Math.floor(fx * w);
  let y = Math.floor(fy * h);
  x = ((x % w) + w) % w;
  y = Math.max(0, Math.min(h - 1, y));
  return { x, y };
}

// ── shared perceptual normalisers (used by both audio and visuals) ────────────
/** 0 at M2, ~1 at M8 — a gentle magnitude scale for loudness/register. */
export function magNorm(mag: number): number {
  return Math.max(0, Math.min(1, (mag - 2) / 6));
}
/** 0 (surface) .. 1 (very deep, ~300km+). */
export function depthNorm(depthKm: number): number {
  return Math.max(0, Math.min(1, depthKm / 300));
}

/**
 * Impulse amplitude injected into the wave field, ∝ 10^mag (radiated energy),
 * then compressed so a great quake blooms without numerically exploding.
 */
export function quakeImpulse(mag: number): number {
  const raw = Math.pow(10, mag - 4.5); // M4.5 → 1
  return Math.min(6, 0.15 + raw * 0.55);
}
