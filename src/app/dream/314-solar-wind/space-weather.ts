// ─────────────────────────────────────────────────────────────────────────────
// space-weather.ts — live NOAA SWPC fetch + defensive parsing.
//
// Three keyless, CORS-open feeds, refreshed ~every minute by NOAA's Space
// Weather Prediction Center. We never hardcode column positions: each array
// feed ships a header row of strings and we look up the index of the channel
// we want by name. Bad samples ("-9999.9", null, "", non-finite) are filtered;
// we keep a window of the last valid samples so a momentary dropout never
// blanks the piece.
// ─────────────────────────────────────────────────────────────────────────────

export const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
export const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
export const KP_URL =
  "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";

/** One merged moment of solar wind, the unit the audio + visuals consume. */
export interface WindSample {
  t: number; // epoch ms
  speed: number; // km/s, ~300..800
  density: number; // p/cm^3, ~0..30
  bz: number; // nT, southward (negative) = storm coupling
  bt: number; // nT total field, ~0..30
  kp: number; // 0..9, >=5 = geomagnetic storm
}

export type WindSource = "live" | "sample";

export interface WindHistory {
  samples: WindSample[]; // chronological, oldest -> newest
  source: WindSource;
  note: string; // human-readable provenance / error
}

// A neutral, quiet baseline used to fill any channel that never reported.
const BASELINE = { speed: 400, density: 4, bz: 0, bt: 5, kp: 1.5 };

// ── parsing helpers ──────────────────────────────────────────────────────────

function badNum(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return !Number.isFinite(n) || n <= -9999;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v));
}

function parseTime(s: string): number {
  // NOAA times are UTC but often lack a "Z"; normalise so Date parses as UTC.
  const trimmed = s.trim().replace(" ", "T");
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(trimmed) ? trimmed : trimmed + "Z";
  const t = Date.parse(withZone);
  return Number.isFinite(t) ? t : Date.now();
}

/** Build a name->index map from a header row of strings. */
function headerIndex(rows: unknown[][]): Map<string, number> {
  const map = new Map<string, number>();
  const header = rows[0];
  if (Array.isArray(header)) {
    header.forEach((h, i) => map.set(String(h).trim().toLowerCase(), i));
  }
  return map;
}

async function fetchArrayRows(url: string): Promise<unknown[][]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) throw new Error("unexpected shape");
  return json as unknown[][];
}

// ── per-feed extraction (chronological time series) ──────────────────────────

interface PlasmaPoint {
  t: number;
  speed: number;
  density: number;
}
interface MagPoint {
  t: number;
  bz: number;
  bt: number;
}
interface KpPoint {
  t: number;
  kp: number;
}

function parsePlasma(rows: unknown[][]): PlasmaPoint[] {
  const h = headerIndex(rows);
  const ti = h.get("time_tag") ?? 0;
  const si = h.get("speed");
  const di = h.get("density");
  if (si === undefined || di === undefined) return [];
  const out: PlasmaPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (badNum(r[si]) || badNum(r[di])) continue;
    out.push({ t: parseTime(String(r[ti])), speed: num(r[si]), density: num(r[di]) });
  }
  return out;
}

function parseMag(rows: unknown[][]): MagPoint[] {
  const h = headerIndex(rows);
  const ti = h.get("time_tag") ?? 0;
  const bzi = h.get("bz_gsm");
  const bti = h.get("bt");
  if (bzi === undefined) return [];
  const out: MagPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (badNum(r[bzi])) continue;
    const bt = bti !== undefined && !badNum(r[bti]) ? num(r[bti]) : BASELINE.bt;
    out.push({ t: parseTime(String(r[ti])), bz: num(r[bzi]), bt });
  }
  return out;
}

function parseKp(json: unknown): KpPoint[] {
  if (!Array.isArray(json)) return [];
  const out: KpPoint[] = [];
  for (const o of json) {
    if (!o || typeof o !== "object") continue;
    const rec = o as Record<string, unknown>;
    const raw = rec.estimated_kp ?? rec.kp_index ?? rec.kp;
    if (badNum(raw)) continue;
    const t = parseTime(String(rec.time_tag ?? ""));
    out.push({ t, kp: num(raw) });
  }
  return out;
}

// nearest-sample lookup (Kp updates slowly; we sample-and-hold by time).
function nearestBefore<T extends { t: number }>(arr: T[], t: number): T | null {
  let best: T | null = null;
  for (const p of arr) {
    if (p.t <= t + 60_000) best = p;
    else break;
  }
  return best ?? (arr.length ? arr[0] : null);
}

/** Merge the three time series onto the plasma timeline (the densest one). */
function mergeSeries(
  plasma: PlasmaPoint[],
  mag: MagPoint[],
  kp: KpPoint[],
): WindSample[] {
  const base = plasma.length ? plasma : mag.length ? mag.map((m) => ({ t: m.t, speed: BASELINE.speed, density: BASELINE.density })) : [];
  if (!base.length) return [];
  // thin to at most ~480 points (a day at 3-min cadence) to keep things light
  const stride = Math.max(1, Math.floor(base.length / 480));
  const out: WindSample[] = [];
  for (let i = 0; i < base.length; i += stride) {
    const p = base[i];
    const m = nearestBefore(mag, p.t);
    const k = nearestBefore(kp, p.t);
    out.push({
      t: p.t,
      speed: "speed" in p ? p.speed : BASELINE.speed,
      density: "density" in p ? p.density : BASELINE.density,
      bz: m ? m.bz : BASELINE.bz,
      bt: m ? m.bt : BASELINE.bt,
      kp: k ? k.kp : BASELINE.kp,
    });
  }
  return out;
}

/** Fetch all three feeds; succeed if at least one returns usable data. */
export async function runFetchWindHistory(): Promise<WindHistory> {
  try {
    const [plasmaR, magR, kpR] = await Promise.allSettled([
      fetchArrayRows(PLASMA_URL),
      fetchArrayRows(MAG_URL),
      fetch(KP_URL, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`kp ${r.status}`);
        return r.json();
      }),
    ]);

    const plasma = plasmaR.status === "fulfilled" ? parsePlasma(plasmaR.value) : [];
    const mag = magR.status === "fulfilled" ? parseMag(magR.value) : [];
    const kp = kpR.status === "fulfilled" ? parseKp(kpR.value) : [];

    const samples = mergeSeries(plasma, mag, kp);
    if (samples.length >= 2) {
      const channels = [
        plasma.length ? "plasma" : null,
        mag.length ? "mag" : null,
        kp.length ? "Kp" : null,
      ].filter(Boolean);
      return {
        samples,
        source: "live",
        note: `Live · NOAA SWPC (${channels.join(", ")})`,
      };
    }
  } catch {
    // fall through to sample data
  }
  return buildSampleHistory();
}

// ── bundled fallback ─────────────────────────────────────────────────────────
//
// ~54 synthetic-but-plausible rows spanning 24h, with a geomagnetic storm in
// the middle third: speed climbs 380 -> 650 km/s, density spikes, Bz swings
// sharply southward (a real coupling signature), and Kp rises to ~6 before
// recovering. Lets the piece play + animate a believable aurora fully offline.

export function buildSampleHistory(): WindHistory {
  const N = 54;
  const now = Date.now();
  const span = 24 * 3600 * 1000;
  const samples: WindSample[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1); // 0..1 across the day
    // storm bump centred at f=0.55, width ~0.18
    const storm = Math.exp(-Math.pow((f - 0.55) / 0.18, 2));
    const wob = Math.sin(f * 38) * 0.5 + Math.sin(f * 11 + 1.3) * 0.5;
    const speed = 360 + storm * 290 + wob * 18;
    const density = 2.2 + storm * 16 + Math.max(0, wob) * 1.5;
    // Bz drifts gently positive, then plunges south during the storm onset
    const bz = 2.5 * Math.sin(f * 7) - storm * 17 * Math.exp(-Math.pow((f - 0.5) / 0.1, 2)) + wob * 1.2;
    const bt = 4 + storm * 14 + Math.abs(wob) * 2;
    const kp = 0.8 + storm * 5.4 + Math.max(0, wob) * 0.4;
    samples.push({
      t: now - (1 - f) * span,
      speed,
      density,
      bz,
      bt,
      kp: Math.min(9, kp),
    });
  }
  return {
    samples,
    source: "sample",
    note: "Sample data (NOAA feed offline)",
  };
}
