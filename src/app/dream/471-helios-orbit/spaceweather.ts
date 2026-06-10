// spaceweather.ts — NOAA SWPC live data fetch + synthetic fallback.
// Polls three public JSON endpoints every ~60s with AbortController + timeout.
// On any network failure, silently falls back to a random-walk generator
// with a scripted storm that triggers ~22s after session start.

export interface SpaceWeather {
  /** Solar wind speed km/s (~250–800 in real conditions) */
  windSpeed: number;
  /** Solar wind density particles/cm³ (~1–50) */
  windDensity: number;
  /** IMF Bz component nT (negative = southward = geoeffective) */
  bz: number;
  /** IMF Bt total magnitude nT */
  bt: number;
  /** Planetary K-index 0–9 (≥5 = minor storm, ≥7 = severe) */
  kp: number;
  /** True if values came from real NOAA fetch */
  isLive: boolean;
}

// ── NOAA endpoint URLs ─────────────────────────────────────────────────────
const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

type JsonRow = (string | number | null)[];

async function fetchJson(
  url: string,
  signal: AbortSignal
): Promise<JsonRow[] | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length < 2) return null;
    return data as JsonRow[];
  } catch {
    return null;
  }
}

/** Fetch all three NOAA feeds; returns null on any failure. */
export async function fetchNoaaSpaceWeather(
  signal: AbortSignal
): Promise<SpaceWeather | null> {
  const [plasma, mag, kpData] = await Promise.all([
    fetchJson(PLASMA_URL, signal),
    fetchJson(MAG_URL, signal),
    fetchJson(KP_URL, signal),
  ]);

  if (!plasma || !mag || !kpData) return null;

  // Row[0] is the header; last row is most recent.
  const plasmaRow = plasma[plasma.length - 1];
  const magRow = mag[mag.length - 1];
  // kp feed columns: [time, Kp, a_running, station_count]
  const kpRow = kpData[kpData.length - 1];

  const windSpeed = parseFloat(String(plasmaRow[1] ?? "400"));
  const windDensity = parseFloat(String(plasmaRow[2] ?? "5"));
  const bz = parseFloat(String(magRow[3] ?? "0"));
  const bt = parseFloat(String(magRow[6] ?? "5"));
  const kp = parseFloat(String(kpRow[1] ?? "1"));

  if (
    isNaN(windSpeed) ||
    isNaN(windDensity) ||
    isNaN(bz) ||
    isNaN(bt) ||
    isNaN(kp)
  )
    return null;

  return { windSpeed, windDensity, bz, bt, kp, isLive: true };
}

// ── Synthetic random-walk + scripted storm ─────────────────────────────────

export interface SyntheticState {
  windSpeed: number;
  windDensity: number;
  bz: number;
  bt: number;
  kp: number;
  elapsed: number;
  stormPhase: "quiet" | "building" | "drop" | "decay";
}

const STORM_TRIGGER_S = 22;
const BUILD_DURATION_S = 12;
const DROP_DURATION_S = 10;
const DECAY_DURATION_S = 22;

export function makeSyntheticState(): SyntheticState {
  return {
    windSpeed: 380 + Math.random() * 80,
    windDensity: 4 + Math.random() * 3,
    bz: -1 + Math.random() * 2,
    bt: 5 + Math.random() * 3,
    kp: 1 + Math.random() * 1.5,
    elapsed: 0,
    stormPhase: "quiet",
  };
}

/** Advance synthetic state by dt seconds (mutates in place). */
export function advanceSyntheticState(
  s: SyntheticState,
  dt: number
): SyntheticState {
  s.elapsed += dt;
  const t = s.elapsed;

  if (t < STORM_TRIGGER_S) {
    s.stormPhase = "quiet";
    s.windSpeed = clamp(s.windSpeed + gaussRand(0, 4), 300, 520);
    s.windDensity = clamp(s.windDensity + gaussRand(0, 0.3), 2, 12);
    s.bz = clamp(s.bz + gaussRand(0, 0.4), -4, 4);
    s.bt = clamp(s.bt + gaussRand(0, 0.3), 3, 10);
    s.kp = clamp(s.kp + gaussRand(0, 0.15), 0.5, 3);
  } else if (t < STORM_TRIGGER_S + BUILD_DURATION_S) {
    s.stormPhase = "building";
    const f = (t - STORM_TRIGGER_S) / BUILD_DURATION_S;
    s.windSpeed = approach(s.windSpeed, 560 + f * 240, dt * 30);
    s.windDensity = approach(s.windDensity, 6 + f * 18, dt * 4);
    s.bz = approach(s.bz, -f * 18, dt * 3);
    s.bt = clamp(s.bt + gaussRand(0, 0.5), 5, 28);
    s.kp = approach(s.kp, 3 + f * 3.5, dt * 0.5);
  } else if (t < STORM_TRIGGER_S + BUILD_DURATION_S + DROP_DURATION_S) {
    s.stormPhase = "drop";
    const f = (t - STORM_TRIGGER_S - BUILD_DURATION_S) / DROP_DURATION_S;
    s.windSpeed = approach(s.windSpeed, 760 + f * 40, dt * 20);
    s.windDensity = approach(
      s.windDensity,
      22 + Math.sin(f * Math.PI) * 5,
      dt * 2
    );
    s.bz = approach(s.bz, -20 + Math.sin(f * Math.PI) * 3, dt * 2);
    s.bt = clamp(s.bt + gaussRand(0, 1), 15, 32);
    s.kp = approach(s.kp, 6.5 + Math.random() * 0.8, dt * 0.3);
  } else {
    const decayStart = STORM_TRIGGER_S + BUILD_DURATION_S + DROP_DURATION_S;
    if (t < decayStart + DECAY_DURATION_S) {
      s.stormPhase = "decay";
      const f = (t - decayStart) / DECAY_DURATION_S;
      s.windSpeed = approach(s.windSpeed, 420 - f * 80, dt * 15);
      s.windDensity = approach(s.windDensity, 5 + (1 - f) * 6, dt * 1.5);
      s.bz = approach(s.bz, 1, dt * 1.5);
      s.bt = approach(s.bt, 6, dt * 1);
      s.kp = approach(s.kp, 1.5 + (1 - f) * 2, dt * 0.4);
    } else {
      s.stormPhase = "quiet";
      s.windSpeed = clamp(s.windSpeed + gaussRand(0, 3), 300, 500);
      s.windDensity = clamp(s.windDensity + gaussRand(0, 0.2), 2, 10);
      s.bz = clamp(s.bz + gaussRand(0, 0.3), -3, 3);
      s.bt = clamp(s.bt + gaussRand(0, 0.2), 3, 8);
      s.kp = clamp(s.kp + gaussRand(0, 0.12), 0.5, 2.5);
    }
  }
  return s;
}

/** Force an immediate storm trigger (for the "Simulate storm now" button). */
export function triggerSyntheticStorm(s: SyntheticState): void {
  s.elapsed = STORM_TRIGGER_S;
  s.stormPhase = "building";
}

// ── Exponential glide ──────────────────────────────────────────────────────

export interface GlidedWeather {
  windSpeed: number;
  windDensity: number;
  bz: number;
  bt: number;
  kp: number;
}

/** Smooth current toward target; rate is fraction closed per second. */
export function glideWeather(
  current: GlidedWeather,
  target: GlidedWeather,
  dt: number,
  rate = 0.92
): GlidedWeather {
  const f = 1 - Math.pow(1 - rate, dt);
  return {
    windSpeed: lerp(current.windSpeed, target.windSpeed, f),
    windDensity: lerp(current.windDensity, target.windDensity, f),
    bz: lerp(current.bz, target.bz, f),
    bt: lerp(current.bt, target.bt, f),
    kp: lerp(current.kp, target.kp, f),
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function approach(v: number, target: number, maxStep: number): number {
  const diff = target - v;
  if (Math.abs(diff) <= maxStep) return target;
  return v + Math.sign(diff) * maxStep;
}
function gaussRand(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z =
    Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}
