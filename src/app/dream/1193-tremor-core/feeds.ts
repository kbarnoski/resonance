// ════════════════════════════════════════════════════════════════════════════
// feeds.ts — the DATA layer for Tremor Core (1193)
//
// Pulls USGS's public, keyless, CORS-enabled "past 24 hours, all magnitudes"
// GeoJSON earthquake feed and normalizes it into a small, guarded shape the
// synth + renderer can consume. Every field is defended against
// null/NaN/undefined; malformed features are skipped; depth is clamped ≥ 0.
//
// If the fetch fails (offline, CORS, DNS, 5xx) we fall back to a hard-coded set
// of ~12 realistic quakes so the piece ALWAYS runs and sounds identical. The
// page reads `status` to render a live/sample badge.
// ════════════════════════════════════════════════════════════════════════════

export interface Quake {
  mag: number; // Richter-ish magnitude
  place: string; // human-readable location
  time: number; // ms epoch of the event
  lon: number; // -180..180
  lat: number; // -90..90
  depth: number; // km below surface, clamped ≥ 0
}

export type FeedSource = "live" | "sample";

export interface FeedResult {
  quakes: Quake[];
  source: FeedSource;
  count: number;
}

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

// ── USGS GeoJSON shape (only the bits we read) ──────────────────────────────
interface UsgsFeature {
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
  } | null;
  geometry?: {
    coordinates?: (number | null)[] | null;
  } | null;
}

interface UsgsFeed {
  features?: UsgsFeature[] | null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Normalize one raw feature → Quake, or null if unusable.
function normalizeFeature(f: UsgsFeature): Quake | null {
  if (!f || !f.properties || !f.geometry) return null;
  const coords = f.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return null;

  const lon = coords[0];
  const lat = coords[1];
  const rawDepth = coords[2];
  const mag = f.properties.mag;
  const time = f.properties.time;

  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) return null;
  if (!isFiniteNumber(mag)) return null; // USGS uses null mag for some micro events
  if (!isFiniteNumber(time)) return null;

  const depth = isFiniteNumber(rawDepth) ? Math.max(0, rawDepth) : 0;
  const place =
    typeof f.properties.place === "string" && f.properties.place.length > 0
      ? f.properties.place
      : "unknown region";

  // clamp obviously-bad values
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;

  return {
    mag: Math.max(0, mag),
    place,
    time,
    lon,
    lat,
    depth,
  };
}

// ── Mandatory embedded fallback: ~12 realistic quakes, depths 5–600 km ──────
// Times are relative to "now" at call time so the compressed loop stays sane.
function makeSampleQuakes(): Quake[] {
  const now = Date.now();
  const hour = 3600_000;
  const seed: Omit<Quake, "time">[] = [
    { mag: 1.6, place: "12km SW of Volcano, Hawaii", lon: -155.3, lat: 19.4, depth: 5 },
    { mag: 2.3, place: "20km E of Anchorage, Alaska", lon: -149.6, lat: 61.2, depth: 34 },
    { mag: 3.1, place: "Central California", lon: -118.8, lat: 35.6, depth: 8 },
    { mag: 4.2, place: "off the coast of Oregon", lon: -125.9, lat: 44.7, depth: 12 },
    { mag: 2.8, place: "Nevada Test Site region", lon: -116.4, lat: 37.1, depth: 3 },
    { mag: 5.1, place: "near the coast of Chile", lon: -71.4, lat: -33.1, depth: 55 },
    { mag: 4.7, place: "Kuril Islands", lon: 151.8, lat: 46.9, depth: 120 },
    { mag: 6.2, place: "Fiji region", lon: 178.9, lat: -18.3, depth: 560 },
    { mag: 3.6, place: "Aegean Sea", lon: 25.4, lat: 37.8, depth: 18 },
    { mag: 4.0, place: "Hindu Kush region, Afghanistan", lon: 70.6, lat: 36.5, depth: 210 },
    { mag: 1.9, place: "Yellowstone National Park", lon: -110.6, lat: 44.5, depth: 6 },
    { mag: 5.6, place: "south of the Mariana Islands", lon: 145.7, lat: 12.9, depth: 430 },
  ];
  // Spread them across the past ~20 hours in chronological order.
  return seed
    .map((q, i) => ({ ...q, time: now - (seed.length - i) * (hour * 1.6) }))
    .sort((a, b) => a.time - b.time);
}

// Fetch + normalize; throws on any network/parse failure so the caller can
// decide to fall back.
async function fetchLive(signal?: AbortSignal): Promise<Quake[]> {
  const res = await fetch(USGS_URL, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`USGS feed HTTP ${res.status}`);
  const json = (await res.json()) as UsgsFeed;
  const feats = Array.isArray(json.features) ? json.features : [];
  const quakes: Quake[] = [];
  for (const f of feats) {
    const q = normalizeFeature(f);
    if (q) quakes.push(q);
  }
  if (quakes.length === 0) throw new Error("USGS feed had no usable features");
  quakes.sort((a, b) => a.time - b.time);
  return quakes;
}

/**
 * Fetch the live USGS past-24h feed. On any failure returns the embedded sample
 * set with source: "sample". Never throws.
 */
export async function fetchQuakes(signal?: AbortSignal): Promise<FeedResult> {
  try {
    const quakes = await fetchLive(signal);
    return { quakes, source: "live", count: quakes.length };
  } catch {
    const quakes = makeSampleQuakes();
    return { quakes, source: "sample", count: quakes.length };
  }
}

/** Human-readable status string for the badge. */
export function statusLabel(r: FeedResult): string {
  return r.source === "live" ? `● live · ${r.count}` : "○ sample data";
}
