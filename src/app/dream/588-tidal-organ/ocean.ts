// Ocean data layer for the Tidal Organ.
// Fetches live marine swell from the Open-Meteo Marine API (no key, CORS-ok),
// with a synthetic "demo swell" generator as a robust fallback.

export type Coast = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

// Named coastline presets. Coordinates sit slightly offshore so the marine
// model returns real swell values.
export const COASTS: Coast[] = [
  { id: "monterey", name: "Monterey Bay", lat: 36.6, lon: -122.0 },
  { id: "bigsur", name: "Big Sur", lat: 36.0, lon: -121.7 },
  { id: "oahu", name: "Oahu North Shore", lat: 21.67, lon: -158.06 },
  { id: "nazare", name: "Nazaré / Lisbon", lat: 39.6, lon: -9.07 },
  { id: "biscay", name: "Bay of Biscay", lat: 45.5, lon: -4.5 },
  { id: "iceland", name: "Iceland S Coast", lat: 63.2, lon: -19.5 },
];

// The distilled ocean state that actually drives the music + visuals.
export type SwellState = {
  waveHeight: number; // metres
  wavePeriod: number; // seconds
  waveDir: number; // degrees (compass, where swell comes FROM)
  swellHeight: number; // metres
  swellPeriod: number; // seconds
  swellDir: number; // degrees
};

export type Source =
  | { kind: "live"; name: string }
  | { kind: "demo"; name: string };

type MarineResponse = {
  current?: {
    wave_height?: number;
    wave_period?: number;
    wave_direction?: number;
    swell_wave_height?: number;
    swell_wave_period?: number;
    swell_wave_direction?: number;
  };
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export async function fetchSwell(coast: Coast, signal?: AbortSignal): Promise<SwellState> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${coast.lat}` +
    `&longitude=${coast.lon}` +
    `&current=wave_height,wave_period,wave_direction,` +
    `swell_wave_height,swell_wave_period,swell_wave_direction`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`marine api ${res.status}`);
  const data = (await res.json()) as MarineResponse;
  const c = data.current;
  if (!c || c.wave_height == null) throw new Error("no current data");

  const waveHeight = num(c.wave_height, 1.2);
  const wavePeriod = num(c.wave_period, 9);
  return {
    waveHeight,
    wavePeriod,
    waveDir: num(c.wave_direction, 270),
    swellHeight: num(c.swell_wave_height, waveHeight * 0.7),
    swellPeriod: num(c.swell_wave_period, wavePeriod + 2),
    swellDir: num(c.swell_wave_direction, num(c.wave_direction, 270)),
  };
}

// Nearest preset to a geolocated point (great-circle-ish, plain enough).
export function nearestCoast(lat: number, lon: number): Coast {
  let best = COASTS[0];
  let bestD = Infinity;
  for (const c of COASTS) {
    const dLat = c.lat - lat;
    const dLon = (c.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const d = dLat * dLat + dLon * dLon;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// Synthetic swell that slowly drifts — used offline / on fetch failure so the
// piece always sounds and moves. Deterministic-ish drift via time.
export function makeDemoSwell(tSeconds: number): SwellState {
  const slow = tSeconds * 0.02;
  const waveHeight = 2.0 + 1.4 * Math.sin(slow) + 0.4 * Math.sin(slow * 2.3 + 1.1);
  const wavePeriod = 11 + 4.2 * Math.sin(slow * 0.6 + 2.0);
  const waveDir = (200 + 90 * Math.sin(slow * 0.4) + 360) % 360;
  return {
    waveHeight: Math.max(0.5, Math.min(4, waveHeight)),
    wavePeriod: Math.max(6, Math.min(16, wavePeriod)),
    waveDir,
    swellHeight: Math.max(0.4, waveHeight * 0.75),
    swellPeriod: Math.max(6, Math.min(16, wavePeriod + 1.5)),
    swellDir: (waveDir + 18) % 360,
  };
}
