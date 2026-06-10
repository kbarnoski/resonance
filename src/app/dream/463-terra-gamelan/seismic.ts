// seismic.ts — quake data model, USGS fetch, and synthetic fallback generator.

export interface Quake {
  id: string;
  mag: number; // magnitude (clamped >= 0 for our purposes; raw can be negative)
  rawMag: number; // original magnitude (may be null->0 / negative)
  place: string;
  time: number; // ms epoch
  lon: number;
  lat: number;
  depthKm: number;
}

interface UsgsFeature {
  id?: string;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
  } | null;
  geometry?: {
    coordinates?: [number, number, number] | number[] | null;
  } | null;
}

interface UsgsFeatureCollection {
  features?: UsgsFeature[];
}

export const USGS_ALL_DAY_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

/** Parse a USGS GeoJSON FeatureCollection into our Quake model. */
export function parseUsgs(data: unknown): Quake[] {
  const fc = data as UsgsFeatureCollection;
  if (!fc || !Array.isArray(fc.features)) return [];
  const out: Quake[] = [];
  for (const f of fc.features) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    const depthKm = Number(coords[2] ?? 0);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const id = f.id ?? `${lon},${lat},${f.properties?.time ?? ""}`;
    const rawMag = typeof f.properties?.mag === "number" ? f.properties.mag : 0;
    out.push({
      id,
      rawMag,
      mag: Math.max(0, rawMag),
      place: f.properties?.place ?? "Unknown location",
      time: typeof f.properties?.time === "number" ? f.properties.time : Date.now(),
      lon,
      lat,
      depthKm: Number.isFinite(depthKm) ? depthKm : 0,
    });
  }
  // Oldest-first so newest end up at the tail.
  out.sort((a, b) => a.time - b.time);
  return out;
}

/**
 * Fetch the live USGS all-day feed. Resolves to a Quake[] on success, or
 * null on any failure (network, CORS, timeout, parse). Times out at `timeoutMs`.
 */
export async function fetchUsgs(timeoutMs = 9000): Promise<Quake[] | null> {
  if (typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(USGS_ALL_DAY_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const quakes = parseUsgs(json);
    return quakes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Synthetic seismicity generator ──────────────────────────────────────────
// Poisson arrivals + Gutenberg-Richter magnitudes so the piece is a complete,
// evolving instrument with no network at all.

const SEA_PLACES = [
  "off the coast of",
  "south of",
  "near",
  "northeast of",
  "western",
  "central",
  "southern",
];
const SEA_REGIONS = [
  "the Aleutian Islands",
  "Honshu, Japan",
  "the Kermadec Islands",
  "Sumatra, Indonesia",
  "Chile",
  "the Mid-Atlantic Ridge",
  "Alaska",
  "the Philippines",
  "California",
  "Vanuatu",
  "Iceland",
  "the South Sandwich Islands",
  "Papua New Guinea",
  "Greece",
  "Mexico",
];

let synthSeq = 0;

/** One Gutenberg-Richter distributed magnitude. Many small, rare large. */
function grMagnitude(): number {
  // P(M >= m) ∝ 10^(-b*m). Inverse-transform sampling for M in [minM, maxM].
  const b = 1.0;
  const minM = 0.5;
  const maxM = 7.4;
  const u = Math.random();
  // cumulative for truncated exponential in base-10
  const lo = Math.pow(10, -b * minM);
  const hi = Math.pow(10, -b * maxM);
  const val = lo - u * (lo - hi);
  const m = -Math.log10(val) / b;
  return Math.min(maxM, Math.max(minM, m));
}

function randomPlace(): string {
  const pre = SEA_PLACES[(Math.random() * SEA_PLACES.length) | 0];
  const reg = SEA_REGIONS[(Math.random() * SEA_REGIONS.length) | 0];
  const km = (5 + Math.random() * 180) | 0;
  return `${km}km ${pre} ${reg}`;
}

/** Make one synthetic quake "now". */
export function makeSyntheticQuake(now = Date.now()): Quake {
  const mag = grMagnitude();
  // Depth: most quakes shallow, a long tail to ~660km (subduction zones).
  const depthKm =
    Math.random() < 0.78
      ? Math.random() * 70
      : 70 + Math.random() * Math.random() * 590;
  const lat = (Math.random() * 2 - 1) * 80;
  const lon = Math.random() * 360 - 180;
  synthSeq += 1;
  return {
    id: `synth-${now}-${synthSeq}`,
    rawMag: mag,
    mag,
    place: randomPlace(),
    time: now,
    lon,
    lat,
    depthKm,
  };
}

/**
 * Seed a plausible "past 24h" backlog of synthetic quakes (oldest first).
 * Global real rate is very roughly a few hundred M1.5+ per day; we keep it
 * lighter so the open isn't a wall of points.
 */
export function seedSyntheticBacklog(count = 140, now = Date.now()): Quake[] {
  const out: Quake[] = [];
  const span = 24 * 60 * 60 * 1000;
  for (let i = 0; i < count; i++) {
    const t = now - Math.random() * span;
    out.push(makeSyntheticQuake(t));
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/**
 * Poisson-style gate: given a mean arrival rate (quakes/sec) and a dt in
 * seconds, return how many synthetic quakes arrived in this tick.
 */
export function poissonArrivals(ratePerSec: number, dtSec: number): number {
  const lambda = Math.max(0, ratePerSec * dtSec);
  // Knuth's algorithm for small lambda.
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}
