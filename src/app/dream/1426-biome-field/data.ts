// ─────────────────────────────────────────────────────────────────────────────
// data.ts — the live planetary dataset that composes Biome Field.
//
//   Fetches the last ~24 h of global earthquakes from the USGS GeoJSON summary
//   feed (public, no key, read-only GET, CORS-enabled) at RUNTIME in the
//   visitor's browser. Each feature carries lon/lat, depth (km), magnitude,
//   place and time — the raw material the field is grown from.
//
//     all_day: …/summary/all_day.geojson   (the composer — last 24 h)
//
//   ALWAYS resolves. Any network / timeout / empty / blocked failure falls back
//   to a small BUNDLED snapshot (~30 representative real-world quakes) so the
//   field is always alive, even fully offline. A 6 s AbortController guards the
//   fetch. No secrets, no env vars, no API route — a plain client GET.
// ─────────────────────────────────────────────────────────────────────────────

export interface Quake {
  id: string;
  lon: number; // degrees, -180..180
  lat: number; // degrees, -90..90
  depthKm: number; // >= 0
  mag: number; // magnitude
  place: string;
  time: number; // ms epoch
}

export type QuakeSource = "live" | "fallback";

export interface QuakeResult {
  quakes: Quake[];
  source: QuakeSource;
}

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
    const mag = num(f.properties?.mag, 1.2);
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

/** Fetch the feed with a timeout. Throws on any failure. */
async function fetchFeed(url: string): Promise<Quake[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as UsgsFeed;
    return parseFeed(json);
  } finally {
    clearTimeout(timer);
  }
}

// ── Bundled fallback snapshot ────────────────────────────────────────────────
// ~30 representative real-world quakes across the Ring of Fire, mid-ocean
// ridges and continental interiors, spanning shallow→deep and small→large. The
// `agoHrs` field is turned into an absolute `time` at load, so recency still
// reads correctly offline. This is the mandatory "always alive" floor.
interface Seed {
  lon: number;
  lat: number;
  depthKm: number;
  mag: number;
  place: string;
  agoHrs: number;
}

const FALLBACK_SEED: Seed[] = [
  { lon: -155.28, lat: 19.41, depthKm: 3.2, mag: 2.1, place: "Island of Hawaii", agoHrs: 0.3 },
  { lon: 142.37, lat: 38.11, depthKm: 41.0, mag: 5.4, place: "off Honshu, Japan", agoHrs: 0.8 },
  { lon: -70.12, lat: -22.9, depthKm: 108.0, mag: 4.8, place: "Antofagasta, Chile", agoHrs: 1.4 },
  { lon: 125.9, lat: 6.2, depthKm: 612.0, mag: 5.9, place: "Mindanao, Philippines", agoHrs: 2.1 },
  { lon: -117.6, lat: 35.7, depthKm: 6.5, mag: 3.0, place: "Ridgecrest, California", agoHrs: 2.6 },
  { lon: 168.9, lat: -17.4, depthKm: 189.0, mag: 5.1, place: "Vanuatu", agoHrs: 3.0 },
  { lon: -178.2, lat: -20.6, depthKm: 555.0, mag: 6.0, place: "south of Fiji", agoHrs: 3.7 },
  { lon: 94.1, lat: 3.5, depthKm: 24.0, mag: 4.6, place: "off Sumatra, Indonesia", agoHrs: 4.2 },
  { lon: -151.5, lat: 61.2, depthKm: 72.0, mag: 3.8, place: "Cook Inlet, Alaska", agoHrs: 4.9 },
  { lon: 26.3, lat: 39.1, depthKm: 9.0, mag: 4.1, place: "Aegean Sea", agoHrs: 5.5 },
  { lon: -104.0, lat: 18.2, depthKm: 33.0, mag: 4.4, place: "off Michoacan, Mexico", agoHrs: 6.1 },
  { lon: 121.6, lat: 24.0, depthKm: 18.0, mag: 4.9, place: "Taiwan", agoHrs: 6.8 },
  { lon: -66.9, lat: 17.9, depthKm: 11.0, mag: 3.3, place: "Puerto Rico region", agoHrs: 7.4 },
  { lon: 145.7, lat: 43.2, depthKm: 132.0, mag: 4.7, place: "Hokkaido, Japan", agoHrs: 8.0 },
  { lon: -73.0, lat: -36.1, depthKm: 28.0, mag: 5.2, place: "Bio-Bio, Chile", agoHrs: 8.9 },
  { lon: 69.4, lat: 33.8, depthKm: 210.0, mag: 4.3, place: "Hindu Kush region", agoHrs: 9.6 },
  { lon: -122.8, lat: 40.3, depthKm: 5.0, mag: 2.7, place: "Northern California", agoHrs: 10.2 },
  { lon: 153.1, lat: -5.9, depthKm: 47.0, mag: 5.5, place: "New Ireland, PNG", agoHrs: 11.0 },
  { lon: -16.2, lat: 66.1, depthKm: 8.0, mag: 3.6, place: "Iceland region", agoHrs: 11.8 },
  { lon: 100.6, lat: -3.1, depthKm: 35.0, mag: 4.9, place: "Sumatra, Indonesia", agoHrs: 12.5 },
  { lon: -179.4, lat: 51.5, depthKm: 26.0, mag: 4.5, place: "Andreanof Islands, Aleutians", agoHrs: 13.4 },
  { lon: 21.7, lat: 38.4, depthKm: 14.0, mag: 3.9, place: "western Greece", agoHrs: 14.1 },
  { lon: -87.5, lat: 12.4, depthKm: 63.0, mag: 4.6, place: "off Nicaragua", agoHrs: 15.0 },
  { lon: 143.9, lat: 27.8, depthKm: 480.0, mag: 5.7, place: "Bonin Islands, Japan", agoHrs: 16.2 },
  { lon: -68.1, lat: -19.8, depthKm: 95.0, mag: 4.2, place: "Tarapaca, Chile", agoHrs: 17.3 },
  { lon: 130.4, lat: 32.1, depthKm: 12.0, mag: 4.0, place: "Kyushu, Japan", agoHrs: 18.6 },
  { lon: -155.9, lat: 18.9, depthKm: 39.0, mag: 3.4, place: "south of Hawaii", agoHrs: 19.9 },
  { lon: 60.1, lat: 29.2, depthKm: 22.0, mag: 4.8, place: "southeastern Iran", agoHrs: 21.0 },
  { lon: -177.0, lat: -30.2, depthKm: 33.0, mag: 5.3, place: "Kermadec Islands", agoHrs: 22.4 },
  { lon: 122.1, lat: -8.4, depthKm: 155.0, mag: 5.0, place: "Flores Sea", agoHrs: 23.5 },
];

/** Build the bundled fallback snapshot with fresh, correctly-ordered times. */
export function makeFallbackQuakes(): Quake[] {
  const now = Date.now();
  return FALLBACK_SEED.map((s, i) => ({
    id: `fallback-${i}`,
    lon: s.lon,
    lat: s.lat,
    depthKm: s.depthKm,
    mag: s.mag,
    place: s.place,
    time: now - s.agoHrs * 3_600_000,
  })).sort((a, b) => a.time - b.time);
}

/** Load the live field. Fetch all_day; fall back to the bundled snapshot on any
 *  failure. ALWAYS resolves. */
export async function loadQuakes(): Promise<QuakeResult> {
  try {
    const quakes = await fetchFeed(DAY_URL);
    if (quakes.length === 0) throw new Error("empty feed");
    quakes.sort((a, b) => a.time - b.time);
    return { quakes, source: "live" };
  } catch {
    return { quakes: makeFallbackQuakes(), source: "fallback" };
  }
}

/** Re-fetch the live field (for the slow refresh loop). Throws on failure so the
 *  caller can keep the current field if a tick fails. */
export async function refreshQuakes(): Promise<Quake[]> {
  const quakes = await fetchFeed(DAY_URL);
  if (quakes.length === 0) throw new Error("empty feed");
  quakes.sort((a, b) => a.time - b.time);
  return quakes;
}
