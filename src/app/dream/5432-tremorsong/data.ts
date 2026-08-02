// ─────────────────────────────────────────────────────────────────────────────
// Tremorsong (5432) — data layer
//
// A USGS-shaped static snapshot of ~24h of global seismicity, used as the
// hands-free demo source and as the offline fallback when the live
// `all_day.geojson` fetch fails. Every field mirrors the real USGS GeoJSON so
// the parser is identical for live and sample data.
// ─────────────────────────────────────────────────────────────────────────────

export interface Quake {
  id: string;
  mag: number;
  /** origin time, epoch ms */
  time: number;
  place: string;
  lon: number;
  lat: number;
  /** depth below surface, km */
  depth: number;
}

export const DAY_MS = 86_400_000;

// Reference "now" for the snapshot: 2026-08-02T12:00:00Z as a hardcoded literal
// (NOT Date.now() — module top-level must stay deterministic / headless-safe).
// Playback derives its clock from the newest quake time, never from this value.
const NOW_MS = 1_785_672_000_000;

// offset helper keeps the literal table readable: hours-ago before the ref now.
const ago = (hours: number): number => NOW_MS - hours * 3_600_000;

// ~42 quakes across the real Ring of Fire + ridges + intraplate zones, spread
// over the last 24h, varied in magnitude (1.1–6.8) and depth (5–612 km).
export const SNAPSHOT: Quake[] = [
  { id: "s01", mag: 1.4, time: ago(23.7), place: "10km NE of Ridgecrest, CA", lon: -117.6, lat: 35.7, depth: 6 },
  { id: "s02", mag: 4.9, time: ago(23.1), place: "Kuril Islands", lon: 151.4, lat: 46.2, depth: 58 },
  { id: "s03", mag: 2.2, time: ago(22.6), place: "Southern Alaska", lon: -151.3, lat: 61.1, depth: 44 },
  { id: "s04", mag: 6.1, time: ago(22.0), place: "near the coast of Central Chile", lon: -71.6, lat: -33.2, depth: 41 },
  { id: "s05", mag: 3.1, time: ago(21.4), place: "Island of Hawaii", lon: -155.3, lat: 19.4, depth: 8 },
  { id: "s06", mag: 5.3, time: ago(20.8), place: "Vanuatu", lon: 168.3, lat: -17.5, depth: 133 },
  { id: "s07", mag: 2.7, time: ago(20.2), place: "Central California", lon: -120.6, lat: 36.1, depth: 11 },
  { id: "s08", mag: 4.4, time: ago(19.6), place: "Dodecanese Islands, Greece", lon: 27.3, lat: 36.4, depth: 24 },
  { id: "s09", mag: 5.8, time: ago(19.0), place: "Tonga", lon: -174.1, lat: -20.9, depth: 212 },
  { id: "s10", mag: 1.8, time: ago(18.5), place: "Yellowstone Nat'l Park, WY", lon: -110.7, lat: 44.5, depth: 5 },
  { id: "s11", mag: 4.1, time: ago(18.0), place: "off the coast of Oregon", lon: -126.9, lat: 43.4, depth: 10 },
  { id: "s12", mag: 6.8, time: ago(17.3), place: "near the east coast of Honshu, Japan", lon: 142.6, lat: 38.3, depth: 29 },
  { id: "s13", mag: 3.4, time: ago(16.7), place: "Puerto Rico region", lon: -66.9, lat: 18.6, depth: 18 },
  { id: "s14", mag: 5.0, time: ago(16.1), place: "Mindanao, Philippines", lon: 126.4, lat: 6.8, depth: 96 },
  { id: "s15", mag: 2.0, time: ago(15.6), place: "Nevada", lon: -117.9, lat: 38.4, depth: 7 },
  { id: "s16", mag: 4.6, time: ago(15.0), place: "central Mid-Atlantic Ridge", lon: -33.8, lat: 1.2, depth: 10 },
  { id: "s17", mag: 5.5, time: ago(14.4), place: "Fiji region", lon: 179.2, lat: -18.1, depth: 528 },
  { id: "s18", mag: 3.0, time: ago(13.9), place: "Oklahoma", lon: -97.6, lat: 35.9, depth: 6 },
  { id: "s19", mag: 4.8, time: ago(13.3), place: "Sumatra, Indonesia", lon: 99.5, lat: -0.9, depth: 62 },
  { id: "s20", mag: 6.3, time: ago(12.6), place: "near the coast of southern Peru", lon: -70.9, lat: -18.4, depth: 108 },
  { id: "s21", mag: 1.6, time: ago(12.1), place: "Long Valley Caldera, CA", lon: -118.9, lat: 37.6, depth: 8 },
  { id: "s22", mag: 4.3, time: ago(11.5), place: "eastern Turkey", lon: 39.4, lat: 38.6, depth: 12 },
  { id: "s23", mag: 5.1, time: ago(10.9), place: "Kermadec Islands, New Zealand", lon: -177.9, lat: -30.3, depth: 34 },
  { id: "s24", mag: 2.9, time: ago(10.3), place: "Alaska Peninsula", lon: -159.2, lat: 55.4, depth: 26 },
  { id: "s25", mag: 5.9, time: ago(9.7), place: "Banda Sea", lon: 126.7, lat: -6.4, depth: 468 },
  { id: "s26", mag: 3.6, time: ago(9.1), place: "near coast of Nicaragua", lon: -87.1, lat: 11.6, depth: 45 },
  { id: "s27", mag: 4.0, time: ago(8.5), place: "Iceland region", lon: -18.1, lat: 64.9, depth: 9 },
  { id: "s28", mag: 5.4, time: ago(7.9), place: "Hindu Kush region, Afghanistan", lon: 70.6, lat: 36.5, depth: 191 },
  { id: "s29", mag: 2.4, time: ago(7.3), place: "Puget Sound, Washington", lon: -122.5, lat: 47.6, depth: 22 },
  { id: "s30", mag: 4.7, time: ago(6.8), place: "south of the Fiji Islands", lon: -178.3, lat: -24.6, depth: 552 },
  { id: "s31", mag: 6.0, time: ago(6.2), place: "off the coast of Chiapas, Mexico", lon: -94.2, lat: 14.9, depth: 47 },
  { id: "s32", mag: 3.3, time: ago(5.6), place: "central Italy", lon: 13.2, lat: 42.7, depth: 11 },
  { id: "s33", mag: 5.2, time: ago(5.0), place: "New Britain region, P.N.G.", lon: 151.9, lat: -5.6, depth: 72 },
  { id: "s34", mag: 1.9, time: ago(4.4), place: "The Geysers, California", lon: -122.8, lat: 38.8, depth: 4 },
  { id: "s35", mag: 4.5, time: ago(3.9), place: "Taiwan region", lon: 121.6, lat: 23.8, depth: 18 },
  { id: "s36", mag: 5.7, time: ago(3.3), place: "Solomon Islands", lon: 161.7, lat: -9.9, depth: 84 },
  { id: "s37", mag: 2.6, time: ago(2.7), place: "western Texas", lon: -103.9, lat: 31.6, depth: 7 },
  { id: "s38", mag: 4.2, time: ago(2.1), place: "Molucca Sea", lon: 126.1, lat: 1.4, depth: 55 },
  { id: "s39", mag: 6.5, time: ago(1.6), place: "near the coast of Ecuador", lon: -80.4, lat: -0.9, depth: 33 },
  { id: "s40", mag: 3.7, time: ago(1.0), place: "Andreanof Islands, Aleutians", lon: -176.4, lat: 51.3, depth: 39 },
  { id: "s41", mag: 5.6, time: ago(0.5), place: "Izu Islands, Japan region", lon: 140.3, lat: 31.7, depth: 145 },
  { id: "s42", mag: 1.1, time: ago(0.1), place: "3km SW of Volcano, Hawaii", lon: -155.2, lat: 19.4, depth: 5 },
];

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; time: number; place: string | null };
  geometry: { coordinates: [number, number, number] };
}
interface UsgsFeed {
  features: UsgsFeature[];
}

export interface QuakeLoad {
  quakes: Quake[];
  live: boolean;
}

/**
 * Fetch the live USGS all_day feed and parse it into `Quake[]`, sorted by time.
 * Any failure (network, CORS, empty, malformed) falls back to the snapshot so
 * the piece is never blank or silent.
 */
export async function loadQuakes(): Promise<QuakeLoad> {
  try {
    const res = await fetch(USGS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const feed = (await res.json()) as UsgsFeed;
    const parsed: Quake[] = [];
    for (const f of feed.features ?? []) {
      const c = f.geometry?.coordinates;
      const mag = f.properties?.mag;
      if (!c || mag == null || !Number.isFinite(mag)) continue;
      parsed.push({
        id: f.id,
        mag,
        time: f.properties.time,
        place: f.properties.place ?? "unknown region",
        lon: c[0],
        lat: c[1],
        depth: Number.isFinite(c[2]) ? Math.max(0, c[2]) : 10,
      });
    }
    if (parsed.length < 4) throw new Error("too few events");
    parsed.sort((a, b) => a.time - b.time);
    return { quakes: parsed, live: true };
  } catch {
    return { quakes: [...SNAPSHOT].sort((a, b) => a.time - b.time), live: false };
  }
}
