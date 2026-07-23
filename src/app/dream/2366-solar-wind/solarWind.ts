// ─────────────────────────────────────────────────────────────────────────────
// 2366-solar-wind / solarWind.ts
//
// Client-side access to NOAA SWPC real-time solar-wind + geomagnetic feeds, plus
// the pure mapping from a physical snapshot to the INDEPENDENT drive channels the
// piece uses. There is deliberately NO single 0→1 "calm→peak" scalar here: speed,
// density, Bz, Bt and Kp are each normalised on their own axis so the sky can be
// (say) bright-but-tense or dim-but-calm. See README for the anti-single-knob note.
//
// Endpoints (all serve Access-Control-Allow-Origin: *, no auth) — verified live
// 2026-07-23. Primary = the RTSW 1-minute JSON feeds, which carry a rolling ~24h
// window (newest-first) with an `active` flag marking the currently-authoritative
// spacecraft. Summary endpoints are lighter "now" fallbacks; Ovation is optional.
// ─────────────────────────────────────────────────────────────────────────────

/** A single physical moment of the Sun→Earth connection. */
export interface SolarSnapshot {
  /** ISO source timestamp (UTC) derived from the data's own time_tag. */
  timeTag: string;
  /** Epoch ms parsed from timeTag (NaN-safe: falls back to 0). */
  timeMs: number;
  /** Solar-wind bulk speed, km/s (~250 slow … ~800 fast stream). */
  speed: number;
  /** Proton density, particles/cc (thin ~1 … thick ~20+). */
  density: number;
  /** Plasma temperature, K (readout only). */
  temperature: number;
  /** IMF north–south component Bz (GSM), nT. NEGATIVE = southward = storm-coupling. */
  bz: number;
  /** IMF total field strength Bt, nT. */
  bt: number;
  /** Planetary K-index, 0–9 geomagnetic activity (fractional where available). */
  kp: number;
  /** Optional Ovation auroral-oval vigor 0–1 (peak model probability). */
  auroraProb?: number;
}

/**
 * Hardcoded, physically-plausible quiet-to-moderate snapshot. The piece renders
 * and SOUNDS complete from this alone, so zero network still yields a beautiful,
 * meditative sky. Live values upgrade it when a fetch succeeds.
 */
export const FALLBACK_SNAPSHOT: SolarSnapshot = {
  timeTag: "recent snapshot",
  timeMs: 0,
  speed: 450,
  density: 5,
  temperature: 120000,
  bz: -2,
  bt: 6,
  kp: 3,
};

const BASE = "https://services.swpc.noaa.gov";
const EP = {
  windRtsw: `${BASE}/json/rtsw/rtsw_wind_1m.json`,
  magRtsw: `${BASE}/json/rtsw/rtsw_mag_1m.json`,
  kp: `${BASE}/json/planetary_k_index_1m.json`,
  windSummary: `${BASE}/products/summary/solar-wind-speed.json`,
  magSummary: `${BASE}/products/summary/solar-wind-mag-field.json`,
  ovation: `${BASE}/json/ovation_aurora_latest.json`,
} as const;

// ── parsing helpers ─────────────────────────────────────────────────────────

/** Parse a NOAA UTC time_tag ("2026-07-23T10:10:00" or "...Z") → epoch ms. */
export function parseNoaaTime(t: string): number {
  if (!t) return NaN;
  const iso = t.includes("T") ? t : t.replace(" ", "T");
  const withZ = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.parse(withZ);
  return Number.isFinite(ms) ? ms : NaN;
}

/** Parse a possibly-null/string numeric; NaN when unusable. */
function num(v: unknown): number {
  if (v == null) return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

interface TimeSample {
  t: number;
  a: number; // primary value
  b: number; // secondary value
  c: number; // tertiary value
}

interface RtswRow {
  time_tag?: string;
  active?: boolean;
  proton_speed?: number | null;
  proton_density?: number | null;
  proton_temperature?: number | null;
  bz_gsm?: number | null;
  bt?: number | null;
}

/** RTSW wind rows (active only) → {t, a=density, b=speed, c=temp}, ascending. */
function readRtswWind(json: unknown): TimeSample[] {
  if (!Array.isArray(json)) return [];
  const out: TimeSample[] = [];
  for (const r of json as RtswRow[]) {
    if (!r?.active) continue;
    const t = parseNoaaTime(r.time_tag ?? "");
    const speed = num(r.proton_speed);
    const density = num(r.proton_density);
    if (Number.isFinite(t) && Number.isFinite(speed) && Number.isFinite(density)) {
      const temp = num(r.proton_temperature);
      out.push({ t, a: density, b: speed, c: Number.isFinite(temp) ? temp : 100000 });
    }
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

/** RTSW mag rows (active only) → {t, a=bz, b=bt}, ascending. */
function readRtswMag(json: unknown): TimeSample[] {
  if (!Array.isArray(json)) return [];
  const out: TimeSample[] = [];
  for (const r of json as RtswRow[]) {
    if (!r?.active) continue;
    const t = parseNoaaTime(r.time_tag ?? "");
    const bz = num(r.bz_gsm);
    const bt = num(r.bt);
    if (Number.isFinite(t) && Number.isFinite(bz) && Number.isFinite(bt)) {
      out.push({ t, a: bz, b: bt, c: 0 });
    }
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

interface KpObj {
  time_tag?: string;
  kp_index?: number | string;
  estimated_kp?: number | string;
}

/** planetary_k_index_1m → {t, a=kp}, ascending (prefers fractional estimated_kp). */
function readKp(json: unknown): TimeSample[] {
  if (!Array.isArray(json)) return [];
  const out: TimeSample[] = [];
  for (const o of json as KpObj[]) {
    const t = parseNoaaTime(o?.time_tag ?? "");
    const kp = num(o?.estimated_kp ?? o?.kp_index);
    if (Number.isFinite(t) && Number.isFinite(kp)) out.push({ t, a: kp, b: 0, c: 0 });
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

interface SummaryObj {
  time_tag?: string;
  proton_speed?: number | string;
  bz_gsm?: number | string;
  bt?: number | string;
}

/** Ovation grid → peak model probability 0–1 (auroral vigor). */
function readOvationVigor(json: unknown): number | undefined {
  const coords = (json as { coordinates?: unknown })?.coordinates;
  if (!Array.isArray(coords)) return undefined;
  let max = 0;
  for (const c of coords as number[][]) {
    const p = num(c?.[2]);
    if (Number.isFinite(p) && p > max) max = p;
  }
  return max > 0 ? Math.min(1, max / 100) : undefined;
}

/** Nearest sample to time `ms` in an ascending-sorted array (binary search). */
function nearest(arr: TimeSample[], ms: number): TimeSample | null {
  if (arr.length === 0) return null;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < ms) lo = mid + 1;
    else hi = mid;
  }
  const cand = arr[lo];
  const prev = arr[lo - 1];
  if (prev && Math.abs(prev.t - ms) < Math.abs(cand.t - ms)) return prev;
  return cand;
}

// ── public fetch ────────────────────────────────────────────────────────────

export interface SolarFetchResult {
  /** Freshest "now" snapshot, or null if nothing usable came back. */
  now: SolarSnapshot | null;
  /** ~24h of merged snapshots (ascending) for the time-scrub, or null. */
  timeline: SolarSnapshot[] | null;
}

/**
 * Fetch every feed in parallel and degrade gracefully. Any subset that returns
 * still produces a best-effort snapshot; a total failure yields {now:null}.
 */
export async function fetchSolar(): Promise<SolarFetchResult> {
  const [windR, magR, kpR, windSumR, magSumR, ovationR] = await Promise.allSettled([
    fetchJson(EP.windRtsw),
    fetchJson(EP.magRtsw),
    fetchJson(EP.kp),
    fetchJson(EP.windSummary),
    fetchJson(EP.magSummary),
    fetchJson(EP.ovation),
  ]);

  const wind = windR.status === "fulfilled" ? readRtswWind(windR.value) : [];
  const mag = magR.status === "fulfilled" ? readRtswMag(magR.value) : [];
  const kp = kpR.status === "fulfilled" ? readKp(kpR.value) : [];
  const vigor = ovationR.status === "fulfilled" ? readOvationVigor(ovationR.value) : undefined;

  // Lighter summary fallbacks for "now" if the RTSW feeds hiccuped.
  const windSum =
    windSumR.status === "fulfilled" && Array.isArray(windSumR.value)
      ? (windSumR.value[0] as SummaryObj | undefined)
      : undefined;
  const magSum =
    magSumR.status === "fulfilled" && Array.isArray(magSumR.value)
      ? (magSumR.value[0] as SummaryObj | undefined)
      : undefined;

  const wNow = wind.length ? wind[wind.length - 1] : null;
  const mNow = mag.length ? mag[mag.length - 1] : null;
  const kNow = kp.length ? kp[kp.length - 1] : null;

  const speed = wNow?.b ?? num(windSum?.proton_speed);
  const density = wNow?.a ?? NaN; // summary speed feed carries no density
  const bz = mNow?.a ?? num(magSum?.bz_gsm);
  const bt = mNow?.b ?? num(magSum?.bt);
  const kpNow = kNow?.a ?? NaN;

  let now: SolarSnapshot | null = null;
  if (Number.isFinite(speed) || Number.isFinite(bz) || Number.isFinite(kpNow)) {
    const t =
      wNow?.t ??
      mNow?.t ??
      parseNoaaTime(windSum?.time_tag ?? magSum?.time_tag ?? "") ??
      Date.now();
    const tMs = Number.isFinite(t) ? t : Date.now();
    now = {
      timeTag: new Date(tMs).toISOString(),
      timeMs: tMs,
      speed: Number.isFinite(speed) ? speed : FALLBACK_SNAPSHOT.speed,
      density: Number.isFinite(density) ? density : FALLBACK_SNAPSHOT.density,
      temperature: wNow?.c ?? FALLBACK_SNAPSHOT.temperature,
      bz: Number.isFinite(bz) ? bz : FALLBACK_SNAPSHOT.bz,
      bt: Number.isFinite(bt) ? bt : FALLBACK_SNAPSHOT.bt,
      kp: Number.isFinite(kpNow) ? kpNow : FALLBACK_SNAPSHOT.kp,
      auroraProb: vigor,
    };
  }

  // Merge the RTSW windows into one timeline, aligned on the wind cadence.
  let timeline: SolarSnapshot[] | null = null;
  if (wind.length) {
    timeline = wind.map((p): SolarSnapshot => {
      const m = nearest(mag, p.t);
      const k = nearest(kp, p.t);
      return {
        timeTag: new Date(p.t).toISOString(),
        timeMs: p.t,
        speed: p.b,
        density: p.a,
        temperature: p.c,
        bz: m?.a ?? FALLBACK_SNAPSHOT.bz,
        bt: m?.b ?? FALLBACK_SNAPSHOT.bt,
        kp: k?.a ?? FALLBACK_SNAPSHOT.kp,
      };
    });
  }

  return { now, timeline };
}

// ── mapping to independent channels ──────────────────────────────────────────

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function invLerp(a: number, b: number, x: number): number {
  return clamp01((x - a) / (b - a));
}

/**
 * The five INDEPENDENT live channels. None is a master; they can conflict —
 * that conflict is the whole point (bright-but-tense, dim-but-calm, …).
 */
export interface Channels {
  /** Solar-wind speed 250→800 km/s → drone brightness / base pitch. */
  speedNorm: number;
  /** Proton density 0→20 p/cc → harmonic richness / active partial count. */
  densityNorm: number;
  /** Southward-Bz magnitude 0→1 → CONSONANCE↔TENSION morph (the crux). */
  bzTension: number;
  /** Signed Bz −1(south)…+1(north) — readout / colour bias. */
  bzSigned: number;
  /** Total field Bt 0→25 nT → drone weight / sub-bass presence. */
  btNorm: number;
  /** Kp 0→9 → aurora agitation + top-voice shimmer rate + red/magenta shift. */
  kpNorm: number;
  /** Curtain vigor 0→1: Ovation oval probability if present, else from Kp. */
  auroraNorm: number;
}

export function deriveChannels(s: SolarSnapshot): Channels {
  const kpNorm = invLerp(0, 9, s.kp);
  return {
    speedNorm: invLerp(250, 800, s.speed),
    densityNorm: invLerp(0, 20, s.density),
    bzTension: clamp01(-s.bz / 12), // only southward Bz builds tension
    bzSigned: Math.max(-1, Math.min(1, s.bz / 12)),
    btNorm: invLerp(0, 25, s.bt),
    kpNorm,
    auroraNorm: s.auroraProb != null ? Math.max(kpNorm * 0.6, s.auroraProb) : kpNorm,
  };
}

/** A short human phrase for the current sky — proves the axes are independent. */
export function describeSky(c: Channels): string {
  const bright = c.speedNorm > 0.62 ? "bright" : c.speedNorm < 0.35 ? "dim" : "soft";
  const tense = c.bzTension > 0.5 ? "tense" : c.bzTension > 0.2 ? "unsettled" : "calm";
  const restless = c.kpNorm > 0.55 ? "restless" : c.kpNorm > 0.3 ? "stirring" : "still";
  return `${bright} · ${tense} · ${restless}`;
}

// ── shared audio interval tables (used by the synth) ──────────────────────────
//
// Each voice morphs from an OPEN, consonant ratio (northward/quiet Bz) toward a
// TENSE ratio (southward/storm Bz) as bzTension → 1. Voice 0 (root) and the
// octave stay fixed; the fifth slides toward a tritone, upper partials detune
// into beating minor-second shimmer. Independent of speed and Kp by construction.

export const VOICE_CONSONANT = [1.0, 2.0, 1.5, 3.0, 4.0, 2.5, 6.0];
export const VOICE_TENSE = [1.0, 2.0, 1.414, 2.966, 4.0, 2.647, 6.35];
