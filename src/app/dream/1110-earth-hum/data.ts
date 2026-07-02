// ─────────────────────────────────────────────────────────────────────────────
// data.ts — LIVE space-weather feed for 1110-earth-hum.
//
// The Schumann Resonance is excited by global lightning, and its strength is
// modulated by the state of the ionosphere — which geomagnetic storms disturb.
// So we tune the piece to REAL geomagnetic activity, fetched CLIENT-SIDE from
// NOAA SWPC's public, no-key, CORS-open products:
//   • Planetary K index (0–9 geomagnetic activity)
//   • Solar-wind plasma (bulk speed & proton density)
//
// Each request gets its own 4-second AbortController timeout. On ANY failure
// (network, CORS, parse, headless with no network) we fall back to a slowly
// drifting DETERMINISTIC model so the piece always sounds and moves — the badge
// then reads "simulated" instead of "live". The fallback never uses Math.random.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpaceWeather {
  /** Planetary K index, 0–9 geomagnetic activity. */
  kp: number;
  /** Bulk solar-wind speed, km/s (~250–800). */
  windSpeed: number;
  /** Proton density, p/cc (~0–30). */
  density: number;
  /** Where this sample came from. */
  source: "live" | "simulated";
}

const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";

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

/** Most recent row (scanning from the end, skipping the header) whose given
 * columns all parse to finite numbers. */
function latestValid(rows: Row[], cols: number[]): number[] | null {
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

// ── Deterministic fallback model ─────────────────────────────────────────────
// A slow sinusoidal Kp walk between ~1 and ~6 with a plausible wind speed that
// loosely tracks it. Driven by wall-clock so it keeps evolving across polls, but
// fully deterministic (no Math.random) so headless runs are reproducible.
function simulatedSample(): SpaceWeather {
  const t = Date.now() / 1000;
  const wave = (period: number, phase: number) =>
    Math.sin((2 * Math.PI * t) / period + phase);

  const kp = clamp(3.3 + 2.4 * wave(680, 0.4) + 0.6 * wave(190, 2.1), 0.4, 6.2);
  const windSpeed = clamp(
    440 + 120 * wave(540, 1.2) + 40 * wave(150, 0.3),
    330,
    620,
  );
  const density = clamp(5 + 4 * wave(410, 2.6) + 2 * wave(120, 0.9), 0.5, 22);

  return { kp, windSpeed, density, source: "simulated" };
}

/**
 * Fetch one live sample. If BOTH products fail we return a fully simulated
 * sample; otherwise we fill any missing piece from the simulated model but still
 * report "live" when the geomagnetic Kp — the primary driver — is real.
 */
export async function fetchSpaceWeather(): Promise<SpaceWeather> {
  const [kp, plasma] = await Promise.all([
    fetchProduct(KP_URL),
    fetchProduct(PLASMA_URL),
  ]);

  const sim = simulatedSample();

  // kp header: time_tag, Kp(1), a_running(2), station_count(3)
  const kpVals = kp ? latestValid(kp, [1]) : null;
  // plasma header: time_tag, density(1), speed(2), temperature(3)
  const plasmaVals = plasma ? latestValid(plasma, [1, 2]) : null;

  if (!kpVals && !plasmaVals) return sim;

  const kpVal = kpVals ? clamp(kpVals[0], 0, 9) : sim.kp;
  const density = plasmaVals ? clamp(plasmaVals[0], 0, 60) : sim.density;
  const windSpeed = plasmaVals ? clamp(plasmaVals[1], 150, 1200) : sim.windSpeed;

  // We call it "live" whenever the geomagnetic driver (Kp) is a real reading.
  const source: SpaceWeather["source"] = kpVals ? "live" : "simulated";

  return { kp: kpVal, windSpeed, density, source };
}
