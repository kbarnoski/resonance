// noaa.ts — live space-weather intake from NOAA SWPC + an embedded snapshot and
// a scripted "storm" so the piece is always alive. Pure client-side fetch; the
// SWPC JSON endpoints are CORS-open. All numbers are the raw physical values;
// normalisation into art parameters happens in mapping.ts.

export interface SpaceWeather {
  /** Solar-wind bulk speed, km/s (~300–800). */
  speed: number;
  /** Solar-wind proton density, p/cc (~1–20). */
  density: number;
  /** Interplanetary field magnitude, nT. */
  bt: number;
  /** North–south field component, nT — NEGATIVE is southward (geo-effective). */
  bz: number;
  /** Planetary K index, 0–9. */
  kp: number;
  /** GOES 0.1–0.8 nm X-ray flux, W/m² (1e-8 → 1e-4). */
  xrayFlux: number;
}

/** Embedded fallback: a real, representative quiet-Sun snapshot. */
export const QUIET: SpaceWeather = {
  speed: 406,
  density: 1.9,
  bt: 6.9,
  bz: -2.1,
  kp: 1.0,
  xrayFlux: 5e-7,
};

const BASE = "https://services.swpc.noaa.gov/json";

/** GOES flux → flare letter class + magnitude, e.g. 5e-5 → "M5.0". */
export function makeFlareClass(flux: number): string {
  const f = Math.max(flux, 1e-9);
  const e = Math.floor(Math.log10(f)); // -8=A .. -4=X
  const letters: Record<number, string> = {
    [-8]: "A",
    [-7]: "B",
    [-6]: "C",
    [-5]: "M",
    [-4]: "X",
  };
  const letter = e <= -8 ? "A" : e >= -4 ? "X" : letters[e] ?? "A";
  const decade = e >= -4 ? -4 : e <= -8 ? -8 : e;
  const mant = f / Math.pow(10, decade);
  return `${letter}${mant.toFixed(1)}`;
}

function lastNonNull<T>(rows: T[], key: keyof T): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i]?.[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(+v)) {
      return +v;
    }
  }
  return null;
}

async function grab<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T[];
}

export interface LiveResult {
  data: SpaceWeather;
  /** UTC timestamp string of the freshest reading, if resolvable. */
  stampZ: string | null;
}

/**
 * Fetch all four feeds with a shared ~6s timeout. Any feed that fails leaves
 * its field at the QUIET baseline rather than throwing the whole intake.
 * Returns null only if the timeout/abort fired before anything resolved.
 */
export async function runLiveFetch(): Promise<LiveResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const sig = ctrl.signal;

  try {
    const [windR, magR, kpR, xrR] = await Promise.allSettled([
      grab<Record<string, unknown>>(`${BASE}/rtsw/rtsw_wind_1m.json`, sig),
      grab<Record<string, unknown>>(`${BASE}/rtsw/rtsw_mag_1m.json`, sig),
      grab<Record<string, unknown>>(`${BASE}/planetary_k_index_1m.json`, sig),
      grab<Record<string, unknown>>(
        `${BASE}/goes/primary/xrays-1-day.json`,
        sig,
      ),
    ]);

    const out: SpaceWeather = { ...QUIET };
    let any = false;
    let stampZ: string | null = null;

    if (windR.status === "fulfilled") {
      const rows = windR.value as Array<Record<string, number>>;
      const sp = lastNonNull(rows, "proton_speed");
      const de = lastNonNull(rows, "proton_density");
      if (sp !== null) {
        out.speed = sp;
        any = true;
      }
      if (de !== null) out.density = de;
      const t = rows[rows.length - 1]?.["time_tag"];
      if (typeof t === "string") stampZ = t;
    }

    if (magR.status === "fulfilled") {
      const rows = magR.value as Array<Record<string, number>>;
      const bt = lastNonNull(rows, "bt");
      const bz = lastNonNull(rows, "bz_gse");
      if (bt !== null) {
        out.bt = bt;
        any = true;
      }
      if (bz !== null) out.bz = bz;
    }

    if (kpR.status === "fulfilled") {
      const rows = kpR.value as Array<Record<string, number>>;
      const kp = lastNonNull(rows, "estimated_kp");
      if (kp !== null) {
        out.kp = kp;
        any = true;
      }
    }

    if (xrR.status === "fulfilled") {
      const rows = (xrR.value as Array<Record<string, unknown>>).filter(
        (r) => r["energy"] === "0.1-0.8nm",
      );
      const fx = lastNonNull(
        rows as Array<Record<string, number>>,
        "flux" as never,
      );
      if (fx !== null && fx > 0) {
        out.xrayFlux = fx;
        any = true;
      }
    }

    return any ? { data: out, stampZ } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Scripted storm ─────────────────────────────────────────────────────
 * A ~110s escalation QUIET → G3 with a mid-sequence M5 flare, then an ease
 * back. Written as smoothstep segments so the *build* is slow enough that the
 * accumulating field has time to grow structure — this is a long-form piece.
 */

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Peak G3 conditions the script climbs toward. */
const PEAK: SpaceWeather = {
  speed: 780,
  density: 14,
  bt: 22,
  bz: -18,
  kp: 7.2,
  xrayFlux: 5e-7,
};

export const STORM_DURATION = 112; // seconds

/**
 * Value of the scripted storm at elapsed time `t` seconds. Deterministic, so
 * the felt arc is repeatable. The flare is a separate additive bump on flux.
 */
export function stormValueAt(t: number): SpaceWeather {
  // Overall build/hold/release envelope 0..1 shaping the bulk parameters.
  const build = smoothstep(8, 62, t); // slow climb
  const release = smoothstep(84, STORM_DURATION, t); // ease down
  const env = build * (1 - release);

  const d: SpaceWeather = {
    speed: lerp(QUIET.speed, PEAK.speed, env),
    density: lerp(QUIET.density, PEAK.density, env),
    bt: lerp(QUIET.bt, PEAK.bt, env),
    bz: lerp(QUIET.bz, PEAK.bz, env),
    kp: lerp(QUIET.kp, PEAK.kp, env),
    xrayFlux: QUIET.xrayFlux,
  };

  // Mid-sequence M5 flare: fast rise ~2s, exp decay ~14s, centred at t≈50s.
  const fc = 50;
  let flare = 0;
  if (t > fc - 3) {
    const rise = smoothstep(fc - 3, fc, t);
    const fall = Math.exp(-Math.max(0, t - fc) / 14);
    flare = rise * fall;
  }
  d.xrayFlux = Math.max(d.xrayFlux, lerp(QUIET.xrayFlux, 5e-5, flare));

  return d;
}
