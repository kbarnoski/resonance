// 2304-seismic-choir — data layer.
//
// Fetches the USGS real-time earthquake feed CLIENT-SIDE. The feed is keyless
// and CORS-open (Access-Control-Allow-Origin: *), so no API route / guard is
// needed. If the last-hour feed is empty we widen to the last-day feed; if the
// network is unavailable we fall back to a small bundled snapshot so the piece
// ALWAYS sings, even fully offline / headless.

export interface Quake {
  id: string;
  mag: number; // moment magnitude
  place: string; // human place name
  lon: number; // degrees, -180..180
  lat: number; // degrees, -90..90
  depthKm: number; // km below surface
  time: number; // epoch ms
}

/** Where a given quake set came from — surfaced in the status line. */
export type QuakeSource = "hour" | "day" | "bundled";

export interface QuakeFetch {
  quakes: Quake[];
  source: QuakeSource;
}

const HOUR_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const DAY_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

// Minimal shape of the fields we read out of the USGS GeoJSON.
interface UsgsFeature {
  id?: string;
  properties?: { mag?: number | null; place?: string | null; time?: number | null };
  geometry?: { coordinates?: number[] | null } | null;
}
interface UsgsFeed {
  features?: UsgsFeature[];
}

function parseFeatures(feed: UsgsFeed): Quake[] {
  const out: Quake[] = [];
  for (const f of feed.features ?? []) {
    const coords = f.geometry?.coordinates;
    const mag = f.properties?.mag;
    if (!coords || coords.length < 3 || mag == null || !Number.isFinite(mag)) {
      continue;
    }
    const [lon, lat, depth] = coords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push({
      id: f.id ?? `${lon},${lat},${f.properties?.time ?? 0}`,
      mag: Math.max(mag, 0.1),
      place: f.properties?.place?.trim() || "Unknown region",
      lon,
      lat,
      depthKm: Number.isFinite(depth) ? Math.max(depth ?? 0, 0) : 10,
      time: f.properties?.time ?? Date.now(),
    });
  }
  return out;
}

async function fetchFeed(url: string): Promise<Quake[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const json = (await res.json()) as UsgsFeed;
  return parseFeatures(json);
}

/**
 * Resolve the current seismic state: last hour, else last day, else bundled.
 * Never throws — always returns a non-empty quake set with its provenance.
 */
export async function fetchQuakes(): Promise<QuakeFetch> {
  try {
    const hour = await fetchFeed(HOUR_FEED);
    if (hour.length > 0) return { quakes: hour, source: "hour" };
  } catch {
    /* fall through */
  }
  try {
    const day = await fetchFeed(DAY_FEED);
    if (day.length > 0) return { quakes: day, source: "day" };
  } catch {
    /* fall through */
  }
  return { quakes: BUNDLED_QUAKES, source: "bundled" };
}

/** Keep only the N loudest (largest magnitude) quakes — the voice cap. */
export function topByMagnitude(quakes: Quake[], n: number): Quake[] {
  return [...quakes].sort((a, b) => b.mag - a.mag).slice(0, n);
}

/**
 * Bundled snapshot — ~14 representative real-looking quakes spanning the
 * magnitude / depth / geographic range, so the choir plays with zero network.
 * Values are hand-authored to resemble a plausible last-day USGS slice.
 */
export const BUNDLED_QUAKES: Quake[] = [
  { id: "b-01", mag: 6.4, place: "off the coast of Kamchatka, Russia", lon: 160.3, lat: 54.1, depthKm: 42, time: 0 },
  { id: "b-02", mag: 5.8, place: "south of the Fiji Islands", lon: 178.9, lat: -22.7, depthKm: 540, time: 0 },
  { id: "b-03", mag: 5.1, place: "near the coast of central Chile", lon: -71.6, lat: -33.4, depthKm: 68, time: 0 },
  { id: "b-04", mag: 4.7, place: "Andreanof Islands, Aleutian Islands, Alaska", lon: -176.2, lat: 51.6, depthKm: 33, time: 0 },
  { id: "b-05", mag: 4.3, place: "Hindu Kush region, Afghanistan", lon: 70.5, lat: 36.4, depthKm: 210, time: 0 },
  { id: "b-06", mag: 3.9, place: "Molucca Sea", lon: 126.6, lat: 1.2, depthKm: 88, time: 0 },
  { id: "b-07", mag: 3.6, place: "Puerto Rico region", lon: -66.9, lat: 18.3, depthKm: 12, time: 0 },
  { id: "b-08", mag: 3.2, place: "central Alaska", lon: -150.1, lat: 63.4, depthKm: 96, time: 0 },
  { id: "b-09", mag: 2.9, place: "Island of Hawaii, Hawaii", lon: -155.3, lat: 19.4, depthKm: 5, time: 0 },
  { id: "b-10", mag: 2.6, place: "central California", lon: -121.5, lat: 36.6, depthKm: 8, time: 0 },
  { id: "b-11", mag: 2.3, place: "Nevada", lon: -117.9, lat: 38.2, depthKm: 6, time: 0 },
  { id: "b-12", mag: 4.9, place: "near the east coast of Honshu, Japan", lon: 142.1, lat: 38.3, depthKm: 45, time: 0 },
  { id: "b-13", mag: 5.4, place: "Sumatra, Indonesia", lon: 99.7, lat: 1.5, depthKm: 120, time: 0 },
  { id: "b-14", mag: 1.9, place: "Yellowstone National Park, Wyoming", lon: -110.6, lat: 44.5, depthKm: 4, time: 0 },
];
