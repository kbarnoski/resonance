// sky.ts — the live-sky data source.
//
// Fetches real-time space-weather from NOAA SWPC public JSON (no auth,
// CORS-open), parses defensively, and normalizes to a small Sky reading.
// If ANYTHING fails (network, timeout, CORS, malformed rows) it falls back to a
// seeded synthetic-sky generator that slowly wanders through plausible values,
// so the piece is never silent and never blank.
//
// NOAA products return arrays-of-arrays with a HEADER row first, newest data at
// the end. We take the last row whose mapped fields are finite.

import { mulberry32, type Rng } from "./rng";

export interface Sky {
  /** Planetary K-index, 0..9 (geomagnetic storm level). */
  kp: number;
  /** Interplanetary magnetic field Bz component (nT). Negative = southward. */
  bz: number;
  /** Total IMF magnitude Bt (nT). */
  bt: number;
  /** Solar wind bulk speed (km/s). */
  speed: number;
  /** Solar wind proton density (particles/cm^3). */
  density: number;
  /** True when at least one live NOAA product was read successfully. */
  live: boolean;
}

const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

const FETCH_TIMEOUT_MS = 4000;

/** Plausible calm-to-active baselines used both as clamps and as fallback centers. */
const BASE = {
  kp: 2,
  bz: -1,
  bt: 4,
  speed: 400,
  density: 4,
};

function finite(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n) : (n as number);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Fetch one NOAA product with an AbortController timeout; return rows or null. */
async function fetchProduct(url: string): Promise<unknown[][] | null> {
  if (typeof fetch === "undefined") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json) || json.length < 2) return null;
    return json as unknown[][];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Header-aware column lookup (case-insensitive, substring match). */
function colIndex(header: unknown[], name: string): number {
  const target = name.toLowerCase();
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").toLowerCase();
    if (h === target || h.includes(target)) return i;
  }
  return -1;
}

/** Last data row (skipping the header) whose column `ci` is finite. */
function lastFinite(rows: unknown[][], ci: number): number | null {
  if (ci < 0) return null;
  for (let i = rows.length - 1; i >= 1; i--) {
    const v = finite(rows[i]?.[ci]);
    if (v !== null) return v;
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Attempt a live reading. Any product that fails leaves its fields at the
 * calm baseline. `live` is true if at least one product parsed.
 */
export async function fetchSky(): Promise<Sky> {
  const [plasma, mag, kp] = await Promise.all([
    fetchProduct(PLASMA_URL),
    fetchProduct(MAG_URL),
    fetchProduct(KP_URL),
  ]);

  let live = false;
  const sky: Sky = { ...BASE, live: false };

  if (plasma) {
    const h = plasma[0];
    const speed = lastFinite(plasma, colIndex(h, "speed"));
    const density = lastFinite(plasma, colIndex(h, "density"));
    if (speed !== null) {
      sky.speed = clamp(speed, 200, 1200);
      live = true;
    }
    if (density !== null) {
      sky.density = clamp(density, 0, 60);
      live = true;
    }
  }

  if (mag) {
    const h = mag[0];
    const bz = lastFinite(mag, colIndex(h, "bz"));
    const bt = lastFinite(mag, colIndex(h, "bt"));
    if (bz !== null) {
      sky.bz = clamp(bz, -50, 50);
      live = true;
    }
    if (bt !== null) {
      sky.bt = clamp(bt, 0, 60);
      live = true;
    }
  }

  if (kp) {
    // KP product columns: time_tag, Kp, a_running, station_count (+header).
    const h = kp[0];
    let ci = colIndex(h, "kp");
    if (ci < 0) ci = 1; // fallback to conventional position
    const k = lastFinite(kp, ci);
    if (k !== null) {
      sky.kp = clamp(k, 0, 9);
      live = true;
    }
  }

  sky.live = live;
  return sky;
}

// ── Seeded synthetic sky ────────────────────────────────────────────────────
// A slow wandering generator that keeps the piece alive when NOAA is
// unreachable. Deterministic: same seed → same walk. Each `step()` nudges the
// values along smooth random-walks within plausible physical bounds.

export interface SyntheticSky {
  step(): Sky;
}

export function createSyntheticSky(seed: number): SyntheticSky {
  const rng: Rng = mulberry32(seed >>> 0);
  // phase accumulators for smooth low-frequency wander
  let pKp = rng() * 6.28318;
  let pBz = rng() * 6.28318;
  let pSpd = rng() * 6.28318;
  let pDen = rng() * 6.28318;

  // per-instance drift rates (tiny), so the walk never repeats on a short loop
  const rKp = 0.006 + rng() * 0.01;
  const rBz = 0.008 + rng() * 0.012;
  const rSpd = 0.005 + rng() * 0.009;
  const rDen = 0.009 + rng() * 0.013;

  return {
    step(): Sky {
      pKp += rKp + (rng() - 0.5) * 0.01;
      pBz += rBz + (rng() - 0.5) * 0.01;
      pSpd += rSpd + (rng() - 0.5) * 0.008;
      pDen += rDen + (rng() - 0.5) * 0.01;

      // Kp: mostly calm (1–3) with occasional swells toward storm.
      const kp = clamp(2.2 + 2.0 * Math.sin(pKp) + 1.4 * Math.sin(pKp * 0.37), 0, 9);
      // Bz: wanders across zero, dipping south (negative) during "active" spells.
      const bz = clamp(-2 + 6 * Math.sin(pBz) + 3 * Math.sin(pBz * 0.53), -30, 30);
      const bt = clamp(4 + Math.abs(bz) * 0.5 + 2 * Math.sin(pBz * 0.7), 0, 40);
      // Wind speed: slow swells 320–620 km/s.
      const speed = clamp(430 + 140 * Math.sin(pSpd) + 60 * Math.sin(pSpd * 0.41), 250, 900);
      // Density: 2–14 with bursts.
      const density = clamp(6 + 4 * Math.sin(pDen) + 2 * Math.sin(pDen * 0.61), 0.5, 40);

      return { kp, bz, bt, speed, density, live: false };
    },
  };
}

// ── Normalized 0..1 drivers for both audio and light ────────────────────────
// A single place that turns raw physical units into musical/visual amounts, so
// audio.ts and page.tsx stay in agreement.

export interface SkyDrivers {
  /** Storm drive: event density & roughness. 0 calm .. 1 severe. */
  storm: number;
  /** Southward tension: 0 (northward/neutral) .. 1 (strong south → dark/minor). */
  south: number;
  /** Shimmer/tempo: mapped from wind speed. 0 slow .. 1 fast. */
  flow: number;
  /** Body/cutoff: mapped from plasma density. 0 thin .. 1 full. */
  body: number;
  /** Field magnitude (Bt) 0..1 — overall aurora intensity. */
  field: number;
}

function norm(v: number, lo: number, hi: number): number {
  return clamp((v - lo) / (hi - lo), 0, 1);
}

export function driversFromSky(s: Sky): SkyDrivers {
  return {
    storm: norm(s.kp, 0, 9),
    south: norm(-s.bz, 0, 20), // only southward (negative Bz) creates tension
    flow: norm(s.speed, 300, 750),
    body: norm(s.density, 1, 20),
    field: norm(s.bt, 2, 25),
  };
}
