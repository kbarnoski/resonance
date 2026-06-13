// weather.ts — fetch TODAY'S REAL current weather from Open-Meteo (no key, CORS-ok)
// and distill it into a "Sky" object that the generative song engine reads.
//
// The real weather is the COMPOSER: it picks key/mode, tempo, instrument palette,
// pattern density, register/warmth and an overlaid precipitation voice.

export interface Sky {
  // raw-ish fields (for the readout / debugging)
  tempC: number;
  humidity: number;
  isDay: boolean;
  precipitation: number;
  weatherCode: number;
  cloudCover: number; // 0..100
  windSpeed: number; // km/h
  windDirection: number; // deg
  // derived label + whether this is real or a baked example
  condition: Condition;
  label: string;
  real: boolean;
}

export type Condition =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "rain"
  | "snow"
  | "showers"
  | "thunder";

const DEFAULT_LAT = 40.71;
const DEFAULT_LON = -74.01;

// A lively baked sky so the piece ALWAYS plays + shows if the network is down.
export const BAKED_SKY: Sky = {
  tempC: 14,
  humidity: 62,
  isDay: true,
  precipitation: 0.2,
  weatherCode: 3, // overcast-ish → soft suspended pads, gentle
  cloudCover: 70,
  windSpeed: 11,
  windDirection: 220,
  condition: "overcast",
  label: "a soft grey sky",
  real: false,
};

function classify(code: number, isDay: boolean): { condition: Condition; label: string } {
  // WMO weather interpretation codes → our condition palette.
  if (code === 0) return { condition: "clear", label: isDay ? "a bright clear day" : "a clear starry night" };
  if (code >= 1 && code <= 2) return { condition: "partly", label: "a partly cloudy sky" };
  if (code === 3) return { condition: "overcast", label: "a soft grey sky" };
  if (code === 45 || code === 48) return { condition: "fog", label: "a quiet foggy sky" };
  if (code >= 51 && code <= 67) return { condition: "rain", label: "a gentle rainy sky" };
  if (code >= 71 && code <= 77) return { condition: "snow", label: "a glassy snowy sky" };
  if (code >= 80 && code <= 82) return { condition: "showers", label: "passing showers" };
  if (code >= 95 && code <= 99) return { condition: "thunder", label: "a rumbling thunder sky" };
  // 85/86 snow showers, anything else → lean snowy/cloudy
  if (code === 85 || code === 86) return { condition: "snow", label: "a glassy snowy sky" };
  return { condition: "partly", label: "a changing sky" };
}

function makeSky(raw: {
  tempC: number;
  humidity: number;
  isDay: boolean;
  precipitation: number;
  weatherCode: number;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
}): Sky {
  const { condition, label } = classify(raw.weatherCode, raw.isDay);
  return { ...raw, condition, label, real: true };
}

async function getCoords(): Promise<{ lat: number; lon: number }> {
  // NEVER block — short timeout, big maximumAge, silent fallback to default.
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (lat: number, lon: number) => {
      if (settled) return;
      settled = true;
      resolve({ lat, lon });
    };
    const timer = setTimeout(() => done(DEFAULT_LAT, DEFAULT_LON), 3000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        clearTimeout(timer);
        done(DEFAULT_LAT, DEFAULT_LON);
      },
      { timeout: 3000, maximumAge: 1000 * 60 * 60 * 6, enableHighAccuracy: false }
    );
  });
}

// Fetch the live current weather. Resolves to a real Sky, or BAKED_SKY on failure.
export async function fetchSky(): Promise<Sky> {
  try {
    const { lat, lon } = await getCoords();
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,is_day,precipitation,weather_code,` +
      `cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto&temperature_unit=celsius`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const json = await res.json();
    const c = json.current;
    if (!c || typeof c.temperature_2m !== "number") throw new Error("no current block");
    return makeSky({
      tempC: c.temperature_2m,
      humidity: c.relative_humidity_2m ?? 50,
      isDay: c.is_day === 1 || c.is_day === true,
      precipitation: c.precipitation ?? 0,
      weatherCode: c.weather_code ?? 1,
      cloudCover: c.cloud_cover ?? 0,
      windSpeed: c.wind_speed_10m ?? 0,
      windDirection: c.wind_direction_10m ?? 0,
    });
  } catch {
    return BAKED_SKY;
  }
}
