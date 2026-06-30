// ─────────────────────────────────────────────────────────────────────────────
// data.ts — live seismic feed for Deep Tremor.
//
//   Fetches the planet's recent earthquakes from the USGS GeoJSON feeds
//   (no key, CORS-enabled) and normalises each feature into a small Quake
//   record. ALWAYS resolves: any network/timeout/empty failure falls back to a
//   synthetic "Ring of Fire" generator so the piece plays and moves with zero
//   network. A 5s AbortController guards each fetch.
//
//   USGS feeds:
//     all_hour: …/summary/all_hour.geojson  (last 60 min — the primary)
//     all_day:  …/summary/all_day.geojson   (last 24 h — fallback if hour is thin)
// ─────────────────────────────────────────────────────────────────────────────

export interface Quake {
  id: string;
  lon: number; // degrees, -180..180
  lat: number; // degrees, -90..90
  depthKm: number; // >= 0
  mag: number; // moment magnitude
  place: string;
  time: number; // ms epoch
}

export type QuakeSource = "live" | "synthetic";

export interface QuakeResult {
  quakes: Quake[];
  source: QuakeSource;
}

const HOUR_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const DAY_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

// Minimal shape of the USGS GeoJSON we actually read.
interface UsgsFeature {
  id?: unknown;
  geometry?: { coordinates?: unknown } | null;
  properties?: { mag?: unknown; place?: unknown; time?: unknown } | null;
}
interface UsgsFeed {
  features?: unknown;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Parse a USGS feed object into Quakes, skipping malformed features. */
function parseFeed(feed: UsgsFeed): Quake[] {
  const features = Array.isArray(feed.features)
    ? (feed.features as UsgsFeature[])
    : [];
  const out: Quake[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = num(coords[0], NaN);
    const lat = num(coords[1], NaN);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const depthKm = Math.max(0, num(coords[2], 10));
    const mag = num(f.properties?.mag, 1.5);
    const id =
      typeof f.id === "string" && f.id.length
        ? f.id
        : `${lon},${lat},${f.properties?.time ?? Math.random()}`;
    const place =
      typeof f.properties?.place === "string"
        ? (f.properties.place as string)
        : "unknown region";
    const time = num(f.properties?.time, Date.now());
    out.push({ id, lon, lat, depthKm, mag, place, time });
  }
  return out;
}

/** Fetch one feed with a 5s timeout. Throws on any failure. */
async function fetchFeed(url: string): Promise<Quake[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as UsgsFeed;
    return parseFeed(json);
  } finally {
    clearTimeout(timer);
  }
}

// Pacific "Ring of Fire" seed boxes (lon,lat ranges) for the synthetic fallback.
const RING_BOXES: Array<[number, number, number, number]> = [
  [-150, -120, 55, 62], // Aleutians / Alaska
  [-127, -120, 38, 50], // Cascadia
  [-118, -105, 14, 35], // Mexico / Central America
  [-78, -70, -38, 5], // Andes
  [120, 150, 25, 45], // Japan / Kuril
  [120, 130, -10, 20], // Philippines
  [95, 135, -10, 8], // Indonesia / Sunda
  [165, 180, -45, -15], // New Zealand / Tonga
];

/** Deterministic-ish synthetic quakes clustered along the Pacific rim. The
 *  piece must move and sound with zero network — this is the mandatory floor. */
export function makeSyntheticQuakes(count = 60): Quake[] {
  const now = Date.now();
  const out: Quake[] = [];
  for (let i = 0; i < count; i++) {
    const box = RING_BOXES[Math.floor(Math.random() * RING_BOXES.length)];
    const lon = box[0] + Math.random() * (box[1] - box[0]);
    const lat = box[2] + Math.random() * (box[3] - box[2]);
    // Skew magnitudes low (lots of small quakes, few big ones).
    const mag = 2.5 + Math.pow(Math.random(), 2.2) * 3.5; // 2.5..6
    const depthKm = 5 + Math.pow(Math.random(), 1.8) * 595; // 5..600
    // Spread arrival times across the last hour so the replay unfolds.
    const time = now - Math.random() * 60 * 60 * 1000;
    out.push({
      id: `synthetic-${i}-${Math.floor(time)}`,
      lon,
      lat,
      depthKm,
      mag,
      place: "Pacific Ring of Fire (synthetic)",
      time,
    });
  }
  return out;
}

/** Primary loader for first paint: try all_hour, widen to all_day if thin,
 *  fall back to synthetic on any failure. ALWAYS resolves. */
export async function loadQuakes(): Promise<QuakeResult> {
  try {
    let quakes = await fetchFeed(HOUR_URL);
    if (quakes.length < 4) {
      try {
        const day = await fetchFeed(DAY_URL);
        if (day.length > quakes.length) quakes = day;
      } catch {
        /* keep the hour result if the day feed fails */
      }
    }
    if (quakes.length === 0) throw new Error("empty feed");
    quakes.sort((a, b) => a.time - b.time);
    return { quakes, source: "live" };
  } catch {
    const quakes = makeSyntheticQuakes();
    quakes.sort((a, b) => a.time - b.time);
    return { quakes, source: "synthetic" };
  }
}

/** Poll loader for the 60s loop: just the last hour. Throws on failure so the
 *  caller can decide whether to keep the live badge or skip this tick. */
export async function pollQuakes(): Promise<Quake[]> {
  const quakes = await fetchFeed(HOUR_URL);
  quakes.sort((a, b) => a.time - b.time);
  return quakes;
}
