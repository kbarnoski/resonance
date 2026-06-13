// marine.ts — live marine data fetch + fallback
// All fetches are client-side, keyless, CORS-open via Open-Meteo Marine API.

export interface MarineData {
  wave_height: number;       // metres
  wave_period: number;       // seconds
  swell_wave_height: number; // metres
  swell_wave_period: number; // seconds
  sea_surface_temperature: number; // °C
}

export interface MarineResult {
  data: MarineData;
  status: "live" | "sample";
  place: string;
}

// Baked fallback — typical Northern California open coast
const SAMPLE_DATA: MarineData = {
  wave_height: 1.4,
  wave_period: 13.0,
  swell_wave_height: 1.2,
  swell_wave_period: 11.0,
  sea_surface_temperature: 14.0,
};

// Monterey Bay default coastal coordinate
const DEFAULT_LAT = 36.95;
const DEFAULT_LON = -122.02;
const DEFAULT_PLACE = "Monterey Bay (default)";

async function fetchMarine(lat: number, lon: number): Promise<MarineData> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=wave_height,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature` +
    `&forecast_days=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as {
      current: {
        wave_height: number;
        wave_period: number;
        swell_wave_height: number;
        swell_wave_period: number;
        sea_surface_temperature: number;
      };
    };
    const c = json.current;
    return {
      wave_height: c.wave_height ?? 1.4,
      wave_period: c.wave_period ?? 13.0,
      swell_wave_height: c.swell_wave_height ?? 1.2,
      swell_wave_period: c.swell_wave_period ?? 11.0,
      sea_surface_temperature: c.sea_surface_temperature ?? 14.0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getGeolocation(): Promise<{ lat: number; lon: number; place: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, place: DEFAULT_PLACE });
      return;
    }
    const timer = setTimeout(() => {
      resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, place: DEFAULT_PLACE });
    }, 3000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          place: "your coast",
        });
      },
      () => {
        clearTimeout(timer);
        resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, place: DEFAULT_PLACE });
      },
      { timeout: 3000, maximumAge: 300_000 }
    );
  });
}

export async function loadMarine(): Promise<MarineResult> {
  const geo = await getGeolocation();
  try {
    const data = await fetchMarine(geo.lat, geo.lon);
    return { data, status: "live", place: geo.place };
  } catch {
    return { data: SAMPLE_DATA, status: "sample", place: geo.place };
  }
}
