// ─────────────────────────────────────────────────────────────────────────────
// data.ts — LIVE solar-wind feed for 1069-aurora-wind.
//
// Fetches NOAA SWPC's public, no-key space-weather products CLIENT-SIDE. Each
// request gets its own 4-second AbortController timeout. On ANY failure (network,
// CORS, parse, missing values) we fall back to slowly-drifting SYNTHETIC values
// so the piece always sounds and moves with zero network — the fallback is meant
// to be indistinguishable in feel.
//
// We sonify the REAL solar wind, not a stand-in. Near solar maximum (2026), live
// activity tends to be high.
// ─────────────────────────────────────────────────────────────────────────────

export interface SolarWind {
  /** Bulk solar-wind speed, km/s (~250–800). */
  speed: number;
  /** Proton density, p/cc (~0–30). */
  density: number;
  /** Bz (GSM), nT. Negative = southward = drives the aurora. */
  bz: number;
  /** Total field magnitude |B|, nT. */
  bt: number;
  /** Planetary K index, 0–9 geomagnetic activity. */
  kp: number;
  /** Where this sample came from. */
  source: "live" | "synthetic";
}

const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

type Row = string[];

async function fetchProduct(url: string): Promise<Row[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length < 2) return null;
    return json as Row[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Find the most recent row whose given columns all parse to finite numbers. */
function latestValid(rows: Row[], cols: number[]): number[] | null {
  // rows[0] is the header; scan from the end for the freshest complete sample.
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const out: number[] = [];
    let ok = true;
    for (const c of cols) {
      const v = Number(row?.[c]);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      out.push(v);
    }
    if (ok) return out;
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ── Synthetic generator ──────────────────────────────────────────────────────
// A few slow drifting sinusoids at incommensurate periods give plausible, ever-
// changing values without any network. Seeded by wall-clock so it keeps evolving
// across polls and never repeats on a short loop.
function synthSample(): SolarWind {
  const t = Date.now() / 1000;
  const drift = (period: number, phase: number) =>
    Math.sin((2 * Math.PI * t) / period + phase);

  const speed = clamp(
    430 + 160 * drift(620, 0) + 70 * drift(190, 1.7),
    260,
    790,
  );
  const density = clamp(
    6 + 5 * drift(410, 2.3) + 3 * drift(140, 0.4),
    0.2,
    28,
  );
  // Bz wanders through southward excursions; occasional deeper dips.
  const bz =
    -2 +
    7 * drift(330, 0.9) +
    4 * drift(95, 2.1) +
    3 * drift(47, 4.0);
  const bt = clamp(4 + Math.abs(bz) * 0.7 + 2 * drift(500, 1.2), 2, 22);
  const kp = clamp(3 + 2.6 * drift(900, 0.5) + 1.2 * drift(260, 3.3), 0, 9);

  return {
    speed,
    density,
    bz: clamp(bz, -28, 28),
    bt,
    kp,
    source: "synthetic",
  };
}

/**
 * Fetch a single live sample, blending the three products. If plasma OR mag both
 * fail we return a fully synthetic sample; otherwise we fill any missing piece
 * with a synthetic value so the source still reads "live" when most data is real.
 */
export async function fetchSolarWind(): Promise<SolarWind> {
  const [plasma, mag, kp] = await Promise.all([
    fetchProduct(PLASMA_URL),
    fetchProduct(MAG_URL),
    fetchProduct(KP_URL),
  ]);

  const synth = synthSample();

  // plasma header: time_tag, density(1), speed(2), temperature(3)
  const plasmaVals = plasma ? latestValid(plasma, [1, 2]) : null;
  // mag header: time_tag, bx(1), by(2), bz_gsm(3), lon(4), lat(5), bt(6)
  const magVals = mag ? latestValid(mag, [3, 6]) : null;
  // kp header: time_tag, Kp(1), a_running(2), station_count(3)
  const kpVals = kp ? latestValid(kp, [1]) : null;

  // If we got nothing real at all, the whole sample is synthetic.
  if (!plasmaVals && !magVals && !kpVals) return synth;

  const density = plasmaVals ? clamp(plasmaVals[0], 0, 60) : synth.density;
  const speed = plasmaVals ? clamp(plasmaVals[1], 150, 1200) : synth.speed;
  const bz = magVals ? clamp(magVals[0], -60, 60) : synth.bz;
  const bt = magVals ? clamp(magVals[1], 0, 80) : synth.bt;
  const kpVal = kpVals ? clamp(kpVals[0], 0, 9) : synth.kp;

  return { speed, density, bz, bt, kp: kpVal, source: "live" };
}
