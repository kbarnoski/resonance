// ─────────────────────────────────────────────────────────────────────────────
// space-weather.ts — live NOAA SWPC fetch + parse + synthetic-storm fallback.
//
// Three public, keyless, CORS-open (access-control-allow-origin: *) GET feeds:
//   Kp     : array-of-objects  {time_tag, Kp, a_running, station_count}
//   mag    : array-of-arrays   [time_tag, bx,by,bz_gsm, lon,lat, bt]  (row0 = header)
//   plasma : array-of-arrays   [time_tag, density, speed, temperature] (row0 = header)
//
// If ANY feed fails / aborts, we synthesize a plausible 24h geomagnetic storm so
// the organ always plays over a living aurora. Every value is guarded against NaN.
// ─────────────────────────────────────────────────────────────────────────────

export const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
export const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
export const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";

// One resampled time-step of the last ~24h. All fields normalized into numbers.
export interface StormFrame {
  t: number; // epoch ms (UTC)
  kp: number; // 0–9 geomagnetic storm level
  bz: number; // nT, southward = negative (the aurora trigger)
  bt: number; // nT total field magnitude
  speed: number; // km/s solar-wind speed
  density: number; // p/cm^3
}

export interface StormSeries {
  frames: StormFrame[];
  synthetic: boolean; // true → "using sample data" notice
  note: string; // human-readable provenance
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

const toMs = (tag: unknown): number => {
  // NOAA tags look like "2026-06-15 04:00:00.000" (UTC, space-separated).
  const s = String(tag).trim().replace(" ", "T");
  const ms = Date.parse(s.endsWith("Z") || s.includes("+") ? s : s + "Z");
  return Number.isFinite(ms) ? ms : NaN;
};

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// Build a unified 24h series by resampling each source onto N evenly-spaced bins
// and carrying the last-known value forward (the feeds have different cadences).
function makeSeries(
  kpRows: { t: number; kp: number }[],
  magRows: { t: number; bz: number; bt: number }[],
  plasmaRows: { t: number; speed: number; density: number }[],
): StormFrame[] {
  const all = [
    ...kpRows.map((r) => r.t),
    ...magRows.map((r) => r.t),
    ...plasmaRows.map((r) => r.t),
  ].filter(Number.isFinite);
  if (all.length === 0) return [];
  const tEnd = Math.max(...all);
  const tStart = Math.min(tEnd - 24 * 3600 * 1000, Math.min(...all));
  const N = 240; // ~6 min bins over 24h
  const span = Math.max(1, tEnd - tStart);

  const sortByT = <T extends { t: number }>(a: T[]) =>
    a.filter((r) => Number.isFinite(r.t)).sort((x, y) => x.t - y.t);
  const kp = sortByT(kpRows);
  const mag = sortByT(magRows);
  const pl = sortByT(plasmaRows);

  // last value at-or-before time t (linear scan with cursor; arrays are small)
  const sampleAt = <T extends { t: number }>(
    arr: T[],
    t: number,
    pick: (r: T) => number,
    fallback: number,
  ): number => {
    let val = fallback;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].t <= t) {
        const v = pick(arr[i]);
        if (Number.isFinite(v)) val = v;
      } else break;
    }
    return val;
  };

  const out: StormFrame[] = [];
  for (let i = 0; i < N; i++) {
    const t = tStart + (span * i) / (N - 1);
    out.push({
      t,
      kp: clamp(sampleAt(kp, t, (r) => r.kp, 1), 0, 9),
      bz: sampleAt(mag, t, (r) => r.bz, 0),
      bt: Math.max(0, sampleAt(mag, t, (r) => r.bt, 3)),
      speed: Math.max(200, sampleAt(pl, t, (r) => r.speed, 400)),
      density: Math.max(0, sampleAt(pl, t, (r) => r.density, 3)),
    });
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// ── live fetch ───────────────────────────────────────────────────────────────

export async function loadSpaceWeather(): Promise<StormSeries> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const [kpRaw, magRaw, plasmaRaw] = await Promise.all([
      fetchJson(KP_URL, ctrl.signal),
      fetchJson(MAG_URL, ctrl.signal),
      fetchJson(PLASMA_URL, ctrl.signal),
    ]);

    // Kp — array of objects.
    const kpRows: { t: number; kp: number }[] = Array.isArray(kpRaw)
      ? (kpRaw as Record<string, unknown>[])
          .map((r) => ({ t: toMs(r.time_tag), kp: toNum(r.Kp) }))
          .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.kp))
      : [];

    // mag — array of arrays, drop header row 0. cols: [time,bx,by,bz,lon,lat,bt]
    const magArr = Array.isArray(magRaw) ? (magRaw as unknown[][]).slice(1) : [];
    const magRows = magArr
      .map((r) => ({ t: toMs(r[0]), bz: toNum(r[3]), bt: toNum(r[6]) }))
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.bz));

    // plasma — array of arrays, drop header. cols: [time,density,speed,temp]
    const plArr = Array.isArray(plasmaRaw)
      ? (plasmaRaw as unknown[][]).slice(1)
      : [];
    const plasmaRows = plArr
      .map((r) => ({ t: toMs(r[0]), density: toNum(r[1]), speed: toNum(r[2]) }))
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.speed));

    const frames = makeSeries(kpRows, magRows, plasmaRows);
    if (frames.length < 8) throw new Error("too few usable rows");
    clearTimeout(timer);
    return {
      frames,
      synthetic: false,
      note: "live NOAA SWPC · last ~24h",
    };
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error ? err.message : "fetch failed";
    return {
      frames: makeSyntheticStorm(),
      synthetic: true,
      note: `sample storm (live feed unavailable: ${reason})`,
    };
  }
}

// ── synthetic geomagnetic storm — a plausible 24h curve with a substorm spike ──
// Quiet morning → solar-wind speed ramps → a sharp southward-Bz reconnection
// event ~65% through (the substorm) → Kp climbs to storm level → slow recovery.
export function makeSyntheticStorm(): StormFrame[] {
  const N = 240;
  const tEnd = Date.now();
  const span = 24 * 3600 * 1000;
  const out: StormFrame[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1); // 0..1 across 24h
    const t = tEnd - span + span * u;

    // wind speed: slow stream front arrives, ramps 360 → 620 km/s.
    const speed =
      360 +
      240 * smoothstep(0.35, 0.8, u) +
      18 * Math.sin(u * 40) * smoothstep(0.4, 0.9, u);

    // the substorm: Bz plunges south around u≈0.62, with secondary dips.
    const burst = (c: number, w: number) =>
      Math.exp(-((u - c) * (u - c)) / (2 * w * w));
    const bz =
      2.5 * Math.sin(u * 9) - // background wobble (mostly northward/quiet)
      16 * burst(0.62, 0.05) - // main reconnection plunge
      9 * burst(0.72, 0.04) - // substorm injection
      5 * burst(0.8, 0.06);
    const bt = 3 + Math.abs(bz) * 0.7 + 2 * Math.abs(Math.sin(u * 6));

    // Kp follows the southward Bz with lag; peaks ~Kp7 (strong storm).
    const drive = clamp(-bz, 0, 18) / 18;
    const kp = clamp(
      1.2 + 6.2 * smoothstep(0.0, 0.9, drive) * smoothstep(0.55, 0.95, u),
      0,
      9,
    );

    // density: a compression pile-up just ahead of the storm.
    const density =
      2 + 14 * burst(0.58, 0.05) + 3 * Math.abs(Math.sin(u * 22));

    out.push({ t, kp, bz, bt, speed, density });
  }
  return out;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
