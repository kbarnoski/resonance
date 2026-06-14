// quakes.ts — fetch + parse the live USGS earthquake feed, with a bundled
// synthetic fallback so the piece is fully demoable with zero network.

export type Quake = {
  mag: number; // Richter-ish magnitude
  place: string; // human-readable location
  time: number; // epoch ms
  lon: number; // degrees, -180..180
  lat: number; // degrees, -90..90
  depthKm: number; // 0..~700
};

export type QuakeFeed = {
  quakes: Quake[];
  source: "LIVE" | "SAMPLE";
};

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

type UsgsFeature = {
  properties?: { mag?: number | null; place?: string | null; time?: number | null };
  geometry?: { coordinates?: [number, number, number] | null } | null;
};

type UsgsResponse = { features?: UsgsFeature[] };

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseFeatures(json: UsgsResponse): Quake[] {
  const out: Quake[] = [];
  const features = Array.isArray(json.features) ? json.features : [];
  for (const f of features) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!c || c.length < 3) continue;
    const [lon, lat, depth] = c;
    const mag = p.mag;
    if (!isFiniteNum(lon) || !isFiniteNum(lat)) continue;
    if (!isFiniteNum(mag)) continue;
    out.push({
      mag,
      place: typeof p.place === "string" && p.place ? p.place : "unknown region",
      time: isFiniteNum(p.time) ? p.time : Date.now(),
      lon,
      lat,
      depthKm: isFiniteNum(depth) ? Math.max(0, depth) : 10,
    });
  }
  // chronological order so the compressed replay reads as the day's rhythm
  out.sort((a, b) => a.time - b.time);
  return out;
}

// Fetch the live feed; reject on any failure (caller falls back to sample).
export async function fetchQuakes(signal?: AbortSignal): Promise<Quake[]> {
  const res = await fetch(USGS_URL, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`USGS feed HTTP ${res.status}`);
  const json = (await res.json()) as UsgsResponse;
  const quakes = parseFeatures(json);
  if (quakes.length === 0) throw new Error("USGS feed empty");
  return quakes;
}

// ~40 plausible quakes scattered across the great fault systems
// (Pacific Ring of Fire, Mid-Atlantic, Himalayan front, San Andreas, etc.).
// Depths span the shallow crust to deep Benioff-zone events (0..600 km).
function buildSample(): Quake[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  type Seed = [lon: number, lat: number, mag: number, depth: number, place: string];
  const seeds: Seed[] = [
    [-122.8, 38.8, 2.1, 6, "Northern California"],
    [-116.4, 33.4, 3.4, 9, "Southern California"],
    [-118.1, 35.6, 1.4, 4, "Ridgecrest, CA"],
    [-150.0, 61.2, 4.7, 55, "Southern Alaska"],
    [-153.4, 59.0, 2.9, 110, "Alaska Peninsula"],
    [142.3, 38.1, 5.6, 30, "off the coast of Honshu, Japan"],
    [140.7, 35.4, 4.2, 60, "near Tokyo, Japan"],
    [131.0, 32.4, 3.1, 40, "Kyushu, Japan"],
    [122.5, 24.0, 4.9, 25, "Taiwan region"],
    [125.6, 6.9, 5.2, 90, "Mindanao, Philippines"],
    [120.4, -8.6, 4.4, 150, "Flores Sea"],
    [129.7, -6.0, 5.9, 540, "Banda Sea (deep)"],
    [166.5, -14.8, 5.1, 200, "Vanuatu"],
    [178.9, -18.1, 4.6, 580, "Fiji region (deep)"],
    [-72.5, -33.6, 5.4, 35, "offshore Valparaiso, Chile"],
    [-70.8, -23.5, 4.1, 70, "Antofagasta, Chile"],
    [-77.0, -12.2, 3.8, 60, "near Lima, Peru"],
    [-90.3, 13.9, 4.3, 45, "offshore Guatemala"],
    [-104.2, 18.4, 3.6, 20, "Michoacan, Mexico"],
    [-66.9, 17.9, 2.7, 12, "Puerto Rico region"],
    [-27.2, 0.4, 5.0, 10, "Central Mid-Atlantic Ridge"],
    [-37.0, 53.0, 4.5, 10, "Reykjanes Ridge"],
    [-18.0, 64.0, 3.2, 5, "Iceland"],
    [25.7, 37.5, 4.0, 30, "Aegean Sea"],
    [29.0, 40.8, 4.8, 12, "near Istanbul, Turkey"],
    [44.3, 38.4, 3.9, 18, "Iran-Turkey border"],
    [69.3, 34.5, 5.3, 210, "Hindu Kush (deep)"],
    [85.3, 28.2, 4.7, 15, "Nepal"],
    [95.9, 27.4, 4.1, 90, "Myanmar-India border"],
    [121.0, 23.7, 3.3, 28, "eastern Taiwan"],
    [-178.4, -20.6, 6.1, 600, "south of Fiji (very deep)"],
    [160.0, -10.5, 4.9, 45, "Solomon Islands"],
    [148.2, -5.5, 5.0, 130, "New Britain region, PNG"],
    [-86.7, 11.9, 3.7, 80, "offshore Nicaragua"],
    [-176.0, 52.0, 4.4, 30, "Andreanof Islands, Aleutians"],
    [-127.5, 49.5, 2.6, 8, "Vancouver Island region"],
    [-115.5, 32.3, 3.0, 7, "Baja California"],
    [13.4, 42.4, 3.5, 9, "central Italy"],
    [22.9, 38.2, 4.2, 22, "Gulf of Corinth, Greece"],
    [60.6, 29.8, 5.5, 25, "southeastern Iran"],
  ];
  // spread events through the past 24h, clustered to suggest swarms
  return seeds
    .map((s, i): Quake => {
      const cluster = Math.floor(i / 5);
      const jitter = (i % 5) * 0.03 + cluster * 0.16;
      return {
        lon: s[0],
        lat: s[1],
        mag: s[2],
        depthKm: s[3],
        place: s[4],
        time: now - day + Math.min(0.98, jitter) * day,
      };
    })
    .sort((a, b) => a.time - b.time);
}

export const SAMPLE_QUAKES: Quake[] = buildSample();

// Try live; on any error or in a no-network sandbox, return the sample set.
export async function loadFeed(signal?: AbortSignal): Promise<QuakeFeed> {
  try {
    const quakes = await fetchQuakes(signal);
    return { quakes, source: "LIVE" };
  } catch {
    return { quakes: SAMPLE_QUAKES, source: "SAMPLE" };
  }
}
