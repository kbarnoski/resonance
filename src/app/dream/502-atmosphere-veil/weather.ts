// weather.ts — live global weather ingestion + synthetic evolving fallback.
//
// We poll Open-Meteo for ~12 cities spanning the globe in ONE batched request.
// From each city we derive an *instability* scalar (high wind + low/falling
// surface pressure + high cloud cover). The aggregate is the GLOBAL TENSION
// that drives both the harmonic ambiguity in audio.ts and the particle
// turbulence in gpu.ts.
//
// Tension only relaxes toward consonance when the real atmosphere calms — there
// is no timer, no user tap. Before the first fetch resolves, and on any fetch
// failure, a synthetic evolving model (slow sinusoids + noise per city) keeps
// the piece alive and ever-changing with zero interaction.

export interface City {
  name: string;
  lat: number;
  lon: number;
}

// 12 cities spanning latitudes and longitudes (and therefore stereo field).
export const CITIES: City[] = [
  { name: "London", lat: 51.5, lon: -0.13 },
  { name: "New York", lat: 40.7, lon: -74.0 },
  { name: "Tokyo", lat: 35.7, lon: 139.7 },
  { name: "Sydney", lat: -33.9, lon: 151.2 },
  { name: "Moscow", lat: 55.8, lon: 37.6 },
  { name: "Singapore", lat: 1.35, lon: 103.8 },
  { name: "São Paulo", lat: -23.5, lon: -46.6 },
  { name: "Mexico City", lat: 19.4, lon: -99.1 },
  { name: "Delhi", lat: 28.6, lon: 77.2 },
  { name: "Nairobi", lat: -1.3, lon: 36.8 },
  { name: "Reykjavik", lat: 64.1, lon: -21.9 },
  { name: "Ushuaia", lat: -54.8, lon: -68.3 },
];

const N = CITIES.length;

// Per-city derived snapshot used by audio + visuals.
export interface CityState {
  name: string;
  lon: number; // for stereo panning by longitude
  temperature: number; // °C
  wind: number; // m/s
  pressure: number; // hPa
  cloud: number; // 0..100 %
  instability: number; // 0..1 derived scalar
  pressureFalling: number; // 0..1 — how fast pressure is dropping (storm building)
}

export interface WeatherFrame {
  cities: CityState[];
  // GLOBAL TENSION 0..1 — aggregate atmospheric instability across the planet.
  tension: number;
  // How fast tension is rising right now (0..1) — a building global storm.
  rising: number;
  // mean wind / mean cloud — handy display + visual params.
  meanWind: number;
  meanCloud: number;
}

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=" +
  CITIES.map((c) => c.lat).join(",") +
  "&longitude=" +
  CITIES.map((c) => c.lon).join(",") +
  "&current=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover" +
  // Request wind in m/s so the m/s-based instability mapping is correct
  // (Open-Meteo defaults to km/h).
  "&wind_speed_unit=ms" +
  "&timezone=GMT";

// ── instability mapping ──────────────────────────────────────────────────────
// High wind, low (and especially falling) surface pressure, and heavy cloud all
// raise instability. Pressure is the strongest signal of a building storm.
function deriveInstability(
  wind: number,
  pressure: number,
  cloud: number,
  pressureFalling: number
): number {
  // wind: 0 m/s → 0, ~20 m/s (gale) → 1
  const windT = clamp01(wind / 20);
  // pressure: 1015 hPa (fair) → 0, 985 hPa (deep low) → 1
  const pressT = clamp01((1015 - pressure) / 30);
  // cloud: 0% → 0, 100% → 1
  const cloudT = clamp01(cloud / 100);
  // weighted blend, with a falling-pressure bonus (a storm in the making)
  const base = 0.4 * windT + 0.35 * pressT + 0.25 * cloudT;
  return clamp01(base + pressureFalling * 0.25);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Raw open-meteo array item.
interface OMItem {
  longitude?: number;
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    surface_pressure?: number;
    cloud_cover?: number;
  };
}

// Memory of the previous poll's pressures so we can detect FALLING pressure.
export interface WeatherMemory {
  prevPressure: number[]; // per-city, hPa
  prevTension: number; // last global tension
}

export function makeMemory(): WeatherMemory {
  return { prevPressure: new Array(N).fill(1013), prevTension: 0 };
}

// ── live fetch ───────────────────────────────────────────────────────────────
export async function fetchWeather(
  mem: WeatherMemory,
  signal: AbortSignal
): Promise<WeatherFrame> {
  const res = await fetch(OPEN_METEO_URL, { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = (await res.json()) as OMItem | OMItem[];
  // Open-Meteo returns an ARRAY when multiple coords are requested.
  const arr: OMItem[] = Array.isArray(json) ? json : [json];
  if (arr.length === 0) throw new Error("Open-Meteo: empty response");

  const cities: CityState[] = CITIES.map((c, i) => {
    const cur = arr[i]?.current ?? {};
    const wind = num(cur.wind_speed_10m, 3);
    const pressure = num(cur.surface_pressure, 1013);
    const cloud = num(cur.cloud_cover, 30);
    const temperature = num(cur.temperature_2m, 12);
    const drop = mem.prevPressure[i] - pressure; // +ve = falling
    const pressureFalling = clamp01(drop / 4); // ~4 hPa drop = strong signal
    mem.prevPressure[i] = pressure;
    return {
      name: c.name,
      lon: c.lon,
      temperature,
      wind,
      pressure,
      cloud,
      instability: deriveInstability(wind, pressure, cloud, pressureFalling),
      pressureFalling,
    };
  });

  return finishFrame(cities, mem);
}

function num(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ── synthetic evolving model ───────────────────────────────────────────────────
// Per-city slow sinusoids + a wandering low-pressure "storm system" that drifts
// across cities, so the synthetic feed itself builds and releases tension
// organically. This is what plays before the first fetch and on any failure.
export interface SyntheticState {
  t: number; // seconds elapsed
  phase: number[]; // per-city phase offset
  freq: number[]; // per-city slow oscillation rate
  stormCenter: number; // index-space position of the drifting low (0..N)
  stormDrift: number; // how fast the low wanders
  noise: number[]; // per-city smoothed noise
}

export function makeSynthetic(): SyntheticState {
  return {
    t: 0,
    phase: CITIES.map((_, i) => i * 1.3),
    freq: CITIES.map(() => 0.02 + Math.random() * 0.05),
    stormCenter: Math.random() * N,
    stormDrift: 0.06 + Math.random() * 0.05,
    noise: new Array(N).fill(0),
  };
}

export function advanceSynthetic(
  s: SyntheticState,
  mem: WeatherMemory,
  dt: number
): WeatherFrame {
  s.t += dt;
  // The low-pressure system slowly drifts across the planet and wraps around.
  s.stormCenter = (s.stormCenter + s.stormDrift * dt + N) % N;

  const cities: CityState[] = CITIES.map((c, i) => {
    // smoothed per-city noise random walk
    s.noise[i] += (Math.random() - 0.5) * dt * 0.4;
    s.noise[i] = clamp(s.noise[i], -1, 1) * 0.985;

    // proximity to the drifting storm (circular distance in index space)
    let d = Math.abs(i - s.stormCenter);
    d = Math.min(d, N - d);
    const stormInfluence = Math.exp(-(d * d) / 6); // 0..1, peaks at the low

    const base = Math.sin(s.t * s.freq[i] + s.phase[i]); // -1..1 slow swell

    // wind rises near the storm; cloud likewise; pressure drops near the storm.
    const wind = clamp(4 + stormInfluence * 16 + base * 3 + s.noise[i] * 4, 0, 30);
    const cloud = clamp(
      30 + stormInfluence * 65 + base * 20 + s.noise[i] * 15,
      0,
      100
    );
    const pressure = 1013 - stormInfluence * 32 + base * 6 + s.noise[i] * 4;
    const temperature = 14 + Math.cos(s.t * s.freq[i] * 0.5 + s.phase[i]) * 10;

    const drop = mem.prevPressure[i] - pressure;
    const pressureFalling = clamp01(drop / 4);
    mem.prevPressure[i] = pressure;

    return {
      name: c.name,
      lon: c.lon,
      temperature,
      wind,
      pressure,
      cloud,
      instability: deriveInstability(wind, pressure, cloud, pressureFalling),
      pressureFalling,
    };
  });

  return finishFrame(cities, mem);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// ── aggregate a frame: global tension + rising rate + means ────────────────────
function finishFrame(cities: CityState[], mem: WeatherMemory): WeatherFrame {
  const mean = (sel: (c: CityState) => number) =>
    cities.reduce((a, c) => a + sel(c), 0) / cities.length;

  // Global tension: blend of MEAN instability and the PEAK (a single violent
  // storm should still create audible tension even if the rest is calm).
  const meanInst = mean((c) => c.instability);
  const peakInst = cities.reduce((m, c) => Math.max(m, c.instability), 0);
  const tension = clamp01(0.6 * meanInst + 0.4 * peakInst);

  const rising = clamp01((tension - mem.prevTension) * 12);
  mem.prevTension = tension;

  return {
    cities,
    tension,
    rising,
    meanWind: mean((c) => c.wind),
    meanCloud: mean((c) => c.cloud),
  };
}

export const FETCH_TIMEOUT_MS = 8000;
export const POLL_MS = 75_000;
export const CITY_COUNT = N;
