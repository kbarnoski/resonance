// VJ BRIDGE — the frame the kiosk page sends to scripts/osc-relay.mjs.
//
// Resonance stays the brain; TouchDesigner / Resolume / Notch / Max render
// extra surfaces from its musical intelligence. The page packs one compact
// JSON frame 10–30× a second (off the render path, setInterval) and the relay
// turns it into OSC/UDP (osc-map.mjs). Everything here is PURE — no DOM, no
// store — so it is unit-tested byte-for-byte.
//
// docs/touchdesigner-bridge.md has the OSC address map.

import { frameAlpha, isSilentLevel } from "@/lib/journeys/shader-drive";

export const VJ_PROTOCOL_VERSION = 1;
export const VJ_SESSION_KEY = "resonance-osc";
export const VJ_URL_SESSION_KEY = "resonance-osc-ws";
export const VJ_HZ_SESSION_KEY = "resonance-osc-hz";
export const VJ_DEFAULT_URL = "ws://127.0.0.1:9100";
export const VJ_DEFAULT_HZ = 20;
export const VJ_MAX_EVENTS_PER_FRAME = 64;
export const VJ_EVENT_QUEUE_CAP = 256;

// ── events ───────────────────────────────────────────────────────────────
// Tuples keep the wire small. `ms` = page clock (performance.now()).
export type VjEvent =
  | ["onset", number, number, number] //            strength 0..1, pitch 0..1 (low→high register), ms
  | ["note", number, number, number] //             MIDI note 0..127, velocity 1..127, ms (Nord / any MIDI in)
  | ["noteoff", number, number] //                  note, ms
  | ["pedal", 0 | 1, number] //                     sustain down/up, ms
  | ["phrase", string, string, number, string] //   kind (section|phrase|crest|breath), action (form|refigure|swell|thin|morph), strength, label
  | ["cadence", number] //                          breath phrase landing on a section boundary; its peak 0..1
  | ["phase", string, number] //                    journey phase id, index
  | ["journey", string, string] //                  journey id, name (a new journey began)
  | ["morph", 0 | 1, number] //                     travel morph clip start (1, duration s) / end (0, 0)
  | ["beat", number] //                             beat number since track start
  | ["bar", number]; //                             bar number (4/4 assumed)

// ── the frame ────────────────────────────────────────────────────────────
export interface VjFrame {
  v: 1;
  seq: number;
  ms: number;
  /** audio drives: b/m/t/l smoothed exactly like the shaders' FFT drive
   *  (0.06 @60 fps, frozen in silence); rb/rm/rt/rl the raw band levels */
  au: { b: number; m: number; t: number; l: number; rb: number; rm: number; rt: number; rl: number; sil: 0 | 1 };
  /** tempo / beat clock from the track analysis (beat 0 = track start) */
  ck: { bpm: number; beat: number; bph: number; bar: number; barph: number };
  /** presenter: playing, holding the statement/title card, track time, label */
  pr: { play: 0 | 1; hold: 0 | 1; time: number; dur: number; vol: number; label: string };
  /** journey: id/name/phase/progress, theme + image palettes (hex), image worn */
  jn: { id: string; name: string; phase: string; pi: number; pn: number; pp: number; prog: number; theme: string[]; pal: string[]; img: string; emb: 0 | 1 };
  /** shader in use (+ the dual layer under it) and the journey's shader opacity */
  sh: { mode: string; dual: string; op: number };
  /** particles: soul (form), present, phrase swell [density,size,react],
   *  harmonic current [amount,tension,layering], breath [amount,breath,settle] */
  pt: { soul: string; on: 0 | 1; sw: [number, number, number]; cur: [number, number, number]; br: [number, number, number] };
  /** travel morph playing + its progress */
  mo: { on: 0 | 1; prog: number };
  ev: VjEvent[];
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** 3-decimal rounding; NaN / Infinity → 0 */
export const q3 = (x: number | null | undefined): number => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
};
const str = (s: unknown, max = 96): string => (typeof s === "string" ? s.slice(0, max) : "");
const HEX = /^#[0-9a-f]{6}$/i;
const hexList = (a: unknown, max = 6): string[] =>
  Array.isArray(a) ? a.filter((c): c is string => typeof c === "string" && HEX.test(c)).slice(0, max).map((c) => c.toLowerCase()) : [];
const b01 = (x: unknown): 0 | 1 => (x ? 1 : 0);
const triple = (a: ArrayLike<number> | null | undefined, neutral: [number, number, number]): [number, number, number] =>
  a ? [q3(a[0]), q3(a[1]), q3(a[2])] : neutral;

/** Raw values the client gathers each send tick (any may be missing). */
export interface VjSnapshot {
  seq: number;
  ms: number;
  bands?: BandDrive | null;
  clock?: BeatClock | null;
  playing?: boolean;
  holding?: boolean;
  time?: number;
  duration?: number;
  volume?: number;
  label?: string | null;
  journeyId?: string | null;
  journeyName?: string | null;
  phase?: string | null;
  phaseIndex?: number;
  phaseCount?: number;
  phaseProgress?: number;
  progress?: number;
  themePalette?: string[] | null;
  imagePalette?: string[] | null;
  image?: string | null;
  emblem?: boolean;
  shader?: string | null;
  dualShader?: string | null;
  shaderOpacity?: number;
  soul?: string | null;
  particlesOn?: boolean;
  swell?: { density: number; size: number; react: number } | null;
  current?: { amount: number; tension: number; layering: number } | null;
  breath?: { amount: number; breath: number; settle: number } | null;
  morphOn?: boolean;
  morphProgress?: number;
  events?: VjEvent[];
}

/** Snapshot → wire frame: rounded, clamped, strings capped, palettes validated. */
export function packFrame(s: VjSnapshot): VjFrame {
  const b = s.bands;
  const c = s.clock;
  return {
    v: VJ_PROTOCOL_VERSION,
    seq: s.seq | 0,
    ms: Math.round(s.ms),
    au: b
      ? { b: q3(b.bass), m: q3(b.mid), t: q3(b.treble), l: q3(b.level), rb: q3(b.rawBass), rm: q3(b.rawMid), rt: q3(b.rawTreble), rl: q3(b.rawLevel), sil: b01(b.silent) }
      : { b: 0, m: 0, t: 0, l: 0, rb: 0, rm: 0, rt: 0, rl: 0, sil: 1 },
    ck: c ? { bpm: q3(c.bpm), beat: q3(c.beat), bph: q3(c.beatPhase), bar: c.bar | 0, barph: q3(c.barPhase) } : { bpm: 0, beat: 0, bph: 0, bar: 0, barph: 0 },
    pr: {
      play: b01(s.playing),
      hold: b01(s.holding),
      time: q3(s.time),
      dur: q3(s.duration),
      vol: q3(clamp(Number(s.volume ?? 0), 0, 1)),
      label: str(s.label),
    },
    jn: {
      id: str(s.journeyId),
      name: str(s.journeyName),
      phase: str(s.phase, 32),
      pi: Math.max(0, (s.phaseIndex ?? 0) | 0),
      pn: Math.max(0, (s.phaseCount ?? 0) | 0),
      pp: q3(clamp(Number(s.phaseProgress ?? 0), 0, 1)),
      prog: q3(clamp(Number(s.progress ?? 0), 0, 1)),
      theme: hexList(s.themePalette, 4),
      pal: hexList(s.imagePalette, 6),
      img: str(s.image, 16),
      emb: b01(s.emblem),
    },
    sh: { mode: str(s.shader, 48), dual: str(s.dualShader, 48), op: q3(clamp(Number(s.shaderOpacity ?? 0), 0, 1)) },
    pt: {
      soul: str(s.soul, 32),
      on: b01(s.particlesOn),
      sw: s.swell ? [q3(s.swell.density), q3(s.swell.size), q3(s.swell.react)] : [1, 1, 1],
      cur: s.current ? triple([s.current.amount, s.current.tension, s.current.layering], [0, 0, 0]) : [0, 0, 0],
      br: s.breath ? triple([s.breath.amount, s.breath.breath, s.breath.settle], [0, 0, 0]) : [0, 0, 0],
    },
    mo: { on: b01(s.morphOn), prog: q3(clamp(Number(s.morphProgress ?? 0), 0, 1)) },
    ev: (s.events ?? []).slice(0, VJ_MAX_EVENTS_PER_FRAME).map(roundEvent),
  };
}

function roundEvent(e: VjEvent): VjEvent {
  return e.map((x) => (typeof x === "number" ? (Number.isInteger(x) ? x : q3(x)) : typeof x === "string" ? x.slice(0, 64) : x)) as VjEvent;
}

// ── event queue (bounded; never grows when nobody drains it) ─────────────
export class VjEventQueue {
  private q: VjEvent[] = [];
  dropped = 0;
  constructor(private readonly cap = VJ_EVENT_QUEUE_CAP) {}
  push(e: VjEvent): void {
    this.q.push(e);
    if (this.q.length > this.cap) {
      this.dropped += this.q.length - this.cap;
      this.q.splice(0, this.q.length - this.cap); // oldest go first
    }
  }
  /** take up to n events (oldest first) */
  drain(n = VJ_MAX_EVENTS_PER_FRAME): VjEvent[] {
    return this.q.splice(0, n);
  }
  get size(): number {
    return this.q.length;
  }
  clear(): void {
    this.q.length = 0;
  }
}

// ── audio bands: the shaders' FFT drive, recomputed at the send rate ─────
export interface BandDrive {
  bass: number; mid: number; treble: number; level: number;
  rawBass: number; rawMid: number; rawTreble: number; rawLevel: number;
  silent: boolean;
}

/** visualizer.tsx SMOOTHING (per-frame @60 fps) */
export const VJ_BAND_SMOOTHING = 0.06;

/** Same bins and smoothing as the shader drive (visualizer.tsx): bass 0-5,
 *  mid 6-30, treble 31-63, level = mean of every bin; the running values
 *  FREEZE in silence (glitch RCA 2026-10-06). frameAlpha makes it rate-free,
 *  so 20 Hz here has the shaders' 60 fps time constant. */
export class BandSmoother {
  private sm = { bass: 0, mid: 0, treble: 0, level: 0 };
  step(bytes: ArrayLike<number> | null, dtSec: number): BandDrive {
    let bassSum = 0, midSum = 0, trebleSum = 0, total = 0;
    const len = bytes ? bytes.length : 0;
    for (let i = 0; i < len; i++) {
      const v = bytes![i];
      total += v;
      if (i <= 5) bassSum += v;
      else if (i <= 30) midSum += v;
      else if (i <= 63) trebleSum += v;
    }
    const rawBass = bassSum / (6 * 255);
    const rawMid = midSum / (25 * 255);
    const rawTreble = trebleSum / (33 * 255);
    const rawLevel = len ? total / (len * 255) : 0;
    const silent = isSilentLevel(rawLevel);
    if (!silent) {
      const k = frameAlpha(VJ_BAND_SMOOTHING, Math.max(0, Math.min(1, dtSec)));
      this.sm.bass += (rawBass - this.sm.bass) * k;
      this.sm.mid += (rawMid - this.sm.mid) * k;
      this.sm.treble += (rawTreble - this.sm.treble) * k;
      this.sm.level += (rawLevel - this.sm.level) * k;
    }
    return { ...this.sm, rawBass, rawMid, rawTreble, rawLevel, silent };
  }
}

// ── beat clock ──────────────────────────────────────────────────────────
export interface BeatClock { bpm: number; beat: number; beatPhase: number; bar: number; barPhase: number }

/** Beats from the analysis tempo, beat 0 at track start (no downbeat
 *  analysis exists — a steady grid, not a beat tracker). 4/4 bars. */
export function beatClock(timeSec: number, bpm: number | null | undefined, beatsPerBar = 4): BeatClock {
  const b = Number(bpm);
  if (!Number.isFinite(b) || b < 20 || b > 400 || !Number.isFinite(timeSec) || timeSec < 0) {
    return { bpm: 0, beat: 0, beatPhase: 0, bar: 0, barPhase: 0 };
  }
  const beat = (timeSec * b) / 60;
  const bars = beat / beatsPerBar;
  return { bpm: b, beat, beatPhase: beat - Math.floor(beat), bar: Math.floor(bars), barPhase: bars - Math.floor(bars) };
}

/** A continuous playback step from→to (no seek, no restart, no stall jump). */
export function isContinuousStep(from: number, to: number, maxStepSec = 2.5): boolean {
  return Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from <= maxStepSec;
}

/** Beat / bar events crossed between two clock readings (continuous steps only). */
export function beatCrossings(prev: BeatClock, next: BeatClock, prevTime: number, nextTime: number): VjEvent[] {
  if (!next.bpm || !isContinuousStep(prevTime, nextTime)) return [];
  const out: VjEvent[] = [];
  const b0 = Math.floor(prev.beat), b1 = Math.floor(next.beat);
  for (let k = b0 + 1; k <= b1 && out.length < 16; k++) {
    out.push(["beat", k]);
    if (k % 4 === 0) out.push(["bar", k / 4]);
  }
  return out;
}

/** Timeline events with from < t <= to (continuous steps only). */
export function timelineCrossings<T extends { t: number }>(events: readonly T[] | null | undefined, from: number, to: number): T[] {
  if (!events || !isContinuousStep(from, to) || to === from) return [];
  const out: T[] = [];
  for (const e of events) if (e.t > from && e.t <= to) out.push(e);
  return out;
}

// ── enabling ────────────────────────────────────────────────────────────
type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface VjConfig { on: boolean; url: string; hz: number }

/** Only loopback ws URLs: the relay runs ON the kiosk (it is the relay's
 *  --osc-host that may point at a TouchDesigner machine on the LAN), the
 *  kiosk is a no-network box, and the page CSP allows only loopback ws. */
export function safeRelayUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "ws:") return null;
    const h = url.hostname;
    const local = h === "localhost" || h === "127.0.0.1";
    return local ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

/**
 * `?osc=1` turns the bridge on for this tab (kept in sessionStorage across the
 * kiosk loop's navigations, like ?currents=1); `?osc=always` keeps it on in
 * localStorage (the kiosk setting); `?osc=0` clears both. `?oscws=ws://…`
 * picks the relay port (loopback only), `?oschz=10..30` the send rate.
 * Default: OFF — no socket, no timer, no work.
 */
export function vjBridgeConfig(search: string, session: KV | null, local: KV | null): VjConfig {
  let p: URLSearchParams;
  try { p = new URLSearchParams(search); } catch { p = new URLSearchParams(); }
  const q = p.get("osc");
  try {
    if (q === "1") session?.setItem(VJ_SESSION_KEY, "1");
    else if (q === "always") { local?.setItem(VJ_SESSION_KEY, "1"); session?.setItem(VJ_SESSION_KEY, "1"); }
    else if (q === "0") { session?.setItem(VJ_SESSION_KEY, "0"); local?.removeItem(VJ_SESSION_KEY); }
    const ws = safeRelayUrl(p.get("oscws"));
    if (ws) session?.setItem(VJ_URL_SESSION_KEY, ws);
    const hzQ = p.get("oschz");
    if (hzQ && Number.isFinite(Number(hzQ))) session?.setItem(VJ_HZ_SESSION_KEY, String(Number(hzQ)));
  } catch { /* storage blocked */ }

  let on = false;
  if (q === "1" || q === "always") on = true;
  else if (q === "0") on = false;
  else {
    try {
      const s = session?.getItem(VJ_SESSION_KEY);
      if (s === "1") on = true;
      else if (s === "0") on = false;
      else on = local?.getItem(VJ_SESSION_KEY) === "1";
    } catch { on = false; }
  }
  let url = VJ_DEFAULT_URL;
  let hz = VJ_DEFAULT_HZ;
  try {
    url = safeRelayUrl(session?.getItem(VJ_URL_SESSION_KEY)) ?? VJ_DEFAULT_URL;
    const h = Number(session?.getItem(VJ_HZ_SESSION_KEY));
    if (Number.isFinite(h) && h > 0) hz = h;
  } catch { /* storage blocked */ }
  return { on, url, hz: Math.round(clamp(hz, 10, 30)) };
}
