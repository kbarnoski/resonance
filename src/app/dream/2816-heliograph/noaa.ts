// ─────────────────────────────────────────────────────────────────────────────
// 2816-heliograph — live space-weather data layer.
//
// Fetches NOAA SWPC real-time products directly from the browser (CORS-open),
// parses them defensively, and — critically — falls back to a fully
// DETERMINISTIC seeded "geomagnetic storm day" simulator when the network is
// unavailable or a feed returns an unexpected shape. Nothing here calls
// Math.random / Date.now / new Date; all randomness flows from mulberry32(0x2816).
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — the only source of randomness in this prototype. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The physical space-weather state that drives sound + visuals. */
export interface SolarState {
  speed: number; // solar-wind proton speed, km/s (~250–800)
  bt: number; // total interplanetary magnetic field, nT (~2–20)
  bz: number; // north–south IMF component, nT (negative = southward = stormy)
  kp: number; // planetary K-index, 0–9 (geomagnetic activity)
  live: boolean; // true = real NOAA telemetry, false = seeded simulator
}

const SPEED_URL =
  "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * Fetch all three feeds and merge into one SolarState. Any failure or shape
 * surprise throws → the caller swaps in the simulator. Parsing is defensive:
 * the two summary feeds are single-object arrays; the k-index feed is an array
 * of plain objects (most recent last).
 */
export async function fetchSolarState(signal?: AbortSignal): Promise<SolarState> {
  const [speedRes, magRes, kpRes] = await Promise.all([
    fetch(SPEED_URL, { signal, cache: "no-store" }),
    fetch(MAG_URL, { signal, cache: "no-store" }),
    fetch(KP_URL, { signal, cache: "no-store" }),
  ]);
  if (!speedRes.ok || !magRes.ok || !kpRes.ok) {
    throw new Error("NOAA feed returned non-OK status");
  }
  const [speedJson, magJson, kpJson] = (await Promise.all([
    speedRes.json(),
    magRes.json(),
    kpRes.json(),
  ])) as [unknown, unknown, unknown];

  // solar-wind-speed: [{ proton_speed, time_tag }]
  const speedRow = Array.isArray(speedJson) ? speedJson[0] : null;
  const speed = finiteOr(
    (speedRow as Record<string, unknown> | null)?.proton_speed,
    NaN,
  );

  // solar-wind-mag-field: [{ bt, bz_gsm, time_tag }]
  const magRow = Array.isArray(magJson) ? magJson[0] : null;
  const bt = finiteOr((magRow as Record<string, unknown> | null)?.bt, NaN);
  const bz = finiteOr((magRow as Record<string, unknown> | null)?.bz_gsm, NaN);

  // planetary K-index: [{ time_tag, Kp, ... }, ...] — take the last entry.
  const kpArr = Array.isArray(kpJson) ? kpJson : null;
  const kpRow = kpArr && kpArr.length ? kpArr[kpArr.length - 1] : null;
  const kp = finiteOr((kpRow as Record<string, unknown> | null)?.Kp, NaN);

  if (
    !Number.isFinite(speed) ||
    !Number.isFinite(bt) ||
    !Number.isFinite(bz) ||
    !Number.isFinite(kp)
  ) {
    throw new Error("NOAA feed shape unexpected");
  }

  return {
    speed: clamp(speed, 200, 1200),
    bt: clamp(bt, 0, 60),
    bz: clamp(bz, -60, 60),
    kp: clamp(kp, 0, 9),
    live: true,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Deterministic "geomagnetic storm day" simulator ──────────────────────────
// A slow storm arc that always breathes with zero network. Phase offsets are
// drawn once from mulberry32(0x2816); the state itself is a smooth function of
// elapsed seconds, so it evolves the moment the page mounts.
const simRng = mulberry32(0x2816);
const P = {
  a: simRng() * Math.PI * 2,
  b: simRng() * Math.PI * 2,
  c: simRng() * Math.PI * 2,
  d: simRng() * Math.PI * 2,
  e: simRng() * Math.PI * 2,
};

/** Smooth 0..1 storm-envelope: quiet, then a sudden southward turn, then recovery. */
function stormArc(t: number): number {
  // ~150 s master cycle with a sharp onset (a sudden-commencement feel).
  const phase = (t / 150) % 1;
  const onset = 1 / (1 + Math.exp(-14 * (phase - 0.28))); // rise
  const recover = 1 / (1 + Math.exp(14 * (phase - 0.72))); // fall
  return onset * recover;
}

/** Deterministic SolarState from elapsed seconds since mount. */
export function simulateSolarState(tSec: number): SolarState {
  const storm = stormArc(tSec);

  // Solar wind accelerates into and through the storm (a high-speed stream).
  const speed =
    360 +
    storm * 300 +
    38 * Math.sin(tSec * 0.11 + P.a) +
    18 * Math.sin(tSec * 0.037 + P.b);

  // Bz turns strongly southward at storm peak; gentle ripple otherwise.
  const bz =
    2.5 * Math.sin(tSec * 0.05 + P.c) -
    storm * 20 +
    3.0 * Math.sin(tSec * 0.23 + P.d);

  // Total field swells with the storm and tracks |Bz|.
  const bt =
    4 + storm * 14 + Math.abs(bz) * 0.35 + 1.5 * Math.sin(tSec * 0.09 + P.e);

  // Kp rises with sustained southward Bz and speed.
  const kp = clamp(1 + storm * 6.5 + Math.max(0, -bz) * 0.06, 0, 9);

  return {
    speed: clamp(speed, 250, 850),
    bt: clamp(bt, 1, 40),
    bz: clamp(bz, -40, 20),
    kp,
    live: false,
  };
}

// ── Derived, normalized parameters shared by audio + visuals ─────────────────
export interface DerivedParams {
  freq: number; // base drone frequency, Hz (continuous log map of speed)
  brightness: number; // 0..1 — harmonic richness from Bt
  tension: number; // 0..1 — roughness/dissonance from southward Bz
  intensity: number; // 0..1 — substorm activity from Kp
  bzSigned: number; // -1..1 — signed Bz for color (positive = northward = calm)
  speedNorm: number; // 0..1 — for aurora height
}

const LOG_LO = Math.log(70);
const LOG_HI = Math.log(140);

export function deriveParams(s: SolarState): DerivedParams {
  const speedNorm = clamp((s.speed - 250) / (800 - 250), 0, 1);
  // Continuous log-frequency map: 250 km/s → 70 Hz, 800 km/s → 140 Hz.
  const freq = Math.exp(LOG_LO + speedNorm * (LOG_HI - LOG_LO));
  const brightness = clamp(s.bt / 20, 0, 1);
  // Southward (negative) Bz drives roughness; northward stays near-harmonic.
  const tension = clamp(-s.bz / 15, 0, 1);
  const intensity = clamp(s.kp / 9, 0, 1);
  const bzSigned = clamp(s.bz / 15, -1, 1);
  return { freq, brightness, tension, intensity, bzSigned, speedNorm };
}
