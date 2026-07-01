// ─────────────────────────────────────────────────────────────────────────────
// data.ts — fetch + parse the LIVE NOAA SWPC real-time-solar-wind (RTSW) feeds
// and reduce them to the small set of "drivers" that steer the aurora instrument.
//
// The three public, CORS-open, key-less GET endpoints (DSCOVR/ACE + IMAP I-ALiRT
// as of 2026):
//   plasma : https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json
//   mag    : https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json
//   kp     : https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
//
// If any fetch fails (offline / CORS / review environment) the caller falls back
// to the bundled modeled-storm sample in fallback.ts — the piece still runs.
// ─────────────────────────────────────────────────────────────────────────────

export const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
export const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
export const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

/** The reduced space-weather state that drives both sight and sound. */
export interface Drivers {
  /** Solar-wind bulk speed, km/s (~300–800). */
  speed: number;
  /** Proton density, particles/cm³. */
  density: number;
  /** Plasma temperature, K. */
  temperature: number;
  /** Bz in GSM coordinates, nT. Negative = southward = geoeffective. */
  bz: number;
  /** Total field magnitude |B|, nT. */
  bt: number;
  /** Planetary K-index, 0–9. */
  kp: number;
  /** ISO-ish timestamp of the newest plasma sample. */
  timestamp: string;
}

/** Clamp helper. */
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Parse a possibly-null string cell to a finite number, else `fallback`. */
function num(cell: string | number | null | undefined, fallback: number): number {
  if (cell == null) return fallback;
  const n = typeof cell === "number" ? cell : Number(cell);
  return Number.isFinite(n) ? n : fallback;
}

/** Newest non-degenerate row of a SWPC product array (header is row 0). */
function newestRow(rows: unknown): string[] | null {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  // Walk backward past any trailing all-null rows.
  for (let i = rows.length - 1; i >= 1; i--) {
    const r = rows[i];
    if (Array.isArray(r) && r.some((c) => c != null && c !== "")) {
      return r as string[];
    }
  }
  return null;
}

/**
 * Fetch all three feeds and reduce to a single Drivers snapshot.
 * Throws if any feed is unreachable or unparseable — caller uses fallback.
 */
export async function fetchDrivers(signal?: AbortSignal): Promise<Drivers> {
  const [plasmaRes, magRes, kpRes] = await Promise.all([
    fetch(PLASMA_URL, { signal, cache: "no-store" }),
    fetch(MAG_URL, { signal, cache: "no-store" }),
    fetch(KP_URL, { signal, cache: "no-store" }),
  ]);
  if (!plasmaRes.ok || !magRes.ok || !kpRes.ok) {
    throw new Error("NOAA SWPC feed returned a non-OK status");
  }

  const [plasma, mag, kp] = await Promise.all([
    plasmaRes.json(),
    magRes.json(),
    kpRes.json(),
  ]);

  const pRow = newestRow(plasma);
  const mRow = newestRow(mag);
  if (!pRow || !mRow) throw new Error("NOAA SWPC feed was empty");

  // plasma: [time_tag, density, speed, temperature]
  const density = num(pRow[1], 5);
  const speed = num(pRow[2], 400);
  const temperature = num(pRow[3], 100000);
  const timestamp = String(pRow[0] ?? "");

  // mag: [time_tag, bx_gsm, by_gsm, bz_gsm, lon_gsm, lat_gsm, bt]
  const bz = num(mRow[3], 0);
  const bt = num(mRow[6], Math.abs(bz) || 5);

  // kp: array of objects, newest last
  let kpVal = 2;
  if (Array.isArray(kp) && kp.length > 0) {
    const last = kp[kp.length - 1] as { Kp?: number };
    kpVal = num(last?.Kp, 2);
  }

  return {
    speed: clamp(speed, 200, 1200),
    density: clamp(density, 0, 100),
    temperature: Math.max(0, temperature),
    bz: clamp(bz, -60, 60),
    bt: clamp(bt, 0, 100),
    kp: clamp(kpVal, 0, 9),
    timestamp,
  };
}

// ── Normalised 0..1 parameters shared by the visual + audio engines ──────────

export interface Params {
  /** Overall energy from bulk speed (0..1). */
  energy: number;
  /** Southward-Bz coupling (0 quiet .. 1 strong storm onset). */
  coupling: number;
  /** Curtain thickness / particle presence from density (0..1). */
  thickness: number;
  /** Field turbulence from |B| (0..1). */
  turbulence: number;
  /** Global storm intensity from Kp (0..1). */
  intensity: number;
}

/** Map raw drivers into normalised 0..1 parameters. */
export function paramsFromDrivers(d: Drivers): Params {
  const energy = clamp((d.speed - 300) / 500, 0, 1); // 300→0, 800→1
  // Only NEGATIVE (southward) Bz couples: 0 at Bz≥0, saturating near −20 nT.
  const coupling = clamp(-d.bz / 20, 0, 1);
  const thickness = clamp(d.density / 20, 0, 1);
  const turbulence = clamp(d.bt / 30, 0, 1);
  const intensity = clamp(d.kp / 9, 0, 1);
  return { energy, coupling, thickness, turbulence, intensity };
}
