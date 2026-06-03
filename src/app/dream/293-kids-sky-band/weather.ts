// weather.ts — live weather acquisition for the kids sky band.
// Client-side only: navigator.geolocation + a keyless, CORS-open Open-Meteo
// GET. Every step degrades gracefully so the band ALWAYS plays.

export interface Weather {
  temperature: number; // °C  (temperature_2m)
  cloudCover: number; // 0..100 (%)
  windSpeed: number; // km/h (wind_speed_10m)
  isDay: boolean; // is_day == 1
  precipitation: number; // mm (precipitation)
  weatherCode: number; // WMO weather_code
  latitude: number;
  longitude: number;
}

// How the weather was obtained — drives the small on-screen notices.
export type WeatherSource =
  | "live" // geolocation + network ok
  | "fallback-location" // network ok, but a fixed location was used
  | "sample"; // network/offline failed → bundled sample

export interface WeatherResult {
  weather: Weather;
  source: WeatherSource;
  /** True when we couldn't reach the network and fell back to SAMPLE_WEATHER. */
  offline: boolean;
  /** True when geolocation was denied / timed out / unavailable. */
  geoDenied: boolean;
}

// Fixed fallback location (San Francisco) used when geolocation is
// unavailable but the network still works.
const FALLBACK_LAT = 37.77;
const FALLBACK_LON = -122.42;

// Bundled offline sample — a calm, partly-cloudy daytime sky. The full band
// must be enjoyable with ZERO network.
export const SAMPLE_WEATHER: Weather = {
  temperature: 18,
  cloudCover: 45,
  windSpeed: 11,
  isDay: true,
  precipitation: 0,
  weatherCode: 2, // partly cloudy
  latitude: FALLBACK_LAT,
  longitude: FALLBACK_LON,
};

// Resolve a position with a hard 3-second timeout. Never rejects — resolves
// with null on denial / timeout / no-geo so the caller can fall back.
function resolvePosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (v: { lat: number; lon: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    // Our own 3s guard in case the browser ignores the option timeout.
    const timer = setTimeout(() => done(null), 3000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { timeout: 3000, maximumAge: 600000, enableHighAccuracy: false },
    );
  });
}

function buildUrl(lat: number, lon: number): string {
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,cloud_cover,wind_speed_10m,is_day,precipitation,weather_code"
  );
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// Acquire the current weather. Order of operations matches the brief:
//  1. geolocation (3s timeout) → lat/lon, else fixed fallback location.
//  2. fetch Open-Meteo current weather.
//  3. on any failure → bundled SAMPLE_WEATHER + offline notice.
export async function getWeather(): Promise<WeatherResult> {
  const pos = await resolvePosition();
  const geoDenied = pos === null;
  const lat = pos?.lat ?? FALLBACK_LAT;
  const lon = pos?.lon ?? FALLBACK_LON;

  try {
    const ctrl = new AbortController();
    const fetchTimer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(buildUrl(lat, lon), {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(fetchTimer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { current?: Record<string, unknown> };
    const c = json.current ?? {};
    const weather: Weather = {
      temperature: num(c.temperature_2m, SAMPLE_WEATHER.temperature),
      cloudCover: num(c.cloud_cover, SAMPLE_WEATHER.cloudCover),
      windSpeed: num(c.wind_speed_10m, SAMPLE_WEATHER.windSpeed),
      isDay: num(c.is_day, 1) >= 1,
      precipitation: num(c.precipitation, 0),
      weatherCode: num(c.weather_code, 0),
      latitude: lat,
      longitude: lon,
    };
    return {
      weather,
      source: geoDenied ? "fallback-location" : "live",
      offline: false,
      geoDenied,
    };
  } catch {
    return {
      weather: SAMPLE_WEATHER,
      source: "sample",
      offline: true,
      geoDenied,
    };
  }
}

// ── Human-readable summary ────────────────────────────────────────────────

// WMO weather_code → short kid-friendly word.
function codeWord(code: number, cloudCover: number): string {
  if (code >= 95) return "stormy";
  if (code >= 80) return "rain showers";
  if (code >= 71) return "snowy";
  if (code >= 61) return "rainy";
  if (code >= 51) return "drizzly";
  if (code >= 45) return "foggy";
  if (code === 3 || cloudCover >= 80) return "cloudy";
  if (code === 2 || cloudCover >= 40) return "partly cloudy";
  if (code === 1 || cloudCover >= 15) return "mostly clear";
  return "clear";
}

function windWord(kmh: number): string {
  if (kmh < 6) return "calm air";
  if (kmh < 16) return "a light breeze";
  if (kmh < 30) return "a fresh breeze";
  if (kmh < 50) return "strong wind";
  return "a gale";
}

function skyEmoji(w: Weather): string {
  if (w.precipitation > 0 || w.weatherCode >= 51) return "🌧️";
  if (w.weatherCode >= 45) return "🌫️";
  if (!w.isDay) return w.cloudCover >= 50 ? "☁️" : "🌙";
  if (w.cloudCover >= 70) return "☁️";
  if (w.cloudCover >= 30) return "⛅";
  return "☀️";
}

// Best-effort place label. Open-Meteo's current endpoint has no city name, so
// for the demo we name the known fallback and otherwise show coordinates.
function placeLabel(w: Weather, source: WeatherSource): string {
  if (
    source !== "live" &&
    Math.abs(w.latitude - FALLBACK_LAT) < 0.01 &&
    Math.abs(w.longitude + 122.42) < 0.01
  ) {
    return "San Francisco";
  }
  const ns = w.latitude >= 0 ? "N" : "S";
  const ew = w.longitude >= 0 ? "E" : "W";
  return `${Math.abs(w.latitude).toFixed(1)}°${ns} ${Math.abs(
    w.longitude,
  ).toFixed(1)}°${ew}`;
}

// e.g. "⛅ 18°C · partly cloudy · a light breeze · San Francisco"
export function describeWeather(w: Weather, source: WeatherSource): string {
  const parts = [
    `${skyEmoji(w)} ${Math.round(w.temperature)}°C`,
    codeWord(w.weatherCode, w.cloudCover),
    windWord(w.windSpeed),
    `${w.isDay ? "daytime" : "nighttime"} · ${placeLabel(w, source)}`,
  ];
  return parts.join(" · ");
}
