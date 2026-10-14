/**
 * CINEMATIC CURVES — Resonance's musical intelligence, baked offline into
 * per-frame curves for a pre-rendered piece (Unreal Engine 5, see
 * docs/unreal-pipeline.md and scripts/export-unreal-bundle.mjs).
 *
 * Every column reuses the kiosk's own code, so the film moves with the same
 * numbers the installation does:
 *  - BANDS: the shared analyser (offline-analyser.ts: fftSize 256, smoothing
 *    0.8, read at 60 Hz) folded into the shader drive's bins 0-5 / 6-30 /
 *    31-63 by the VJ bridge's BandSmoother (0.06 @ 60 fps, frozen in silence)
 *    — the same numbers as OSC /resonance/audio/*; the *Kinetic columns are
 *    the kinetic layers' faster drive (0.3 @ 60 fps) after the visible slew
 *    (shader-drive.ts UNIFORM_SLEW_PER_SEC);
 *  - ONSETS: living-score.ts OnsetDetector on the same byte spectrum;
 *  - PHRASE swell / HARMONIC currents (+ tide) / BREATH: the conducted
 *    timelines (phrase-conductor.ts, harmonic-currents.ts, breath.ts);
 *  - CLOCK: the VJ bridge's beatClock on the analysis tempo;
 *  - EMBLEM: image-follow.ts emblemEnvelope; FLIGHT: signature-flight.ts (the
 *    Yellow Bird songbird's flap-bounding flight, both flights).
 *
 * The analyser always runs at the kiosk's 60 Hz (its smoothing is per read);
 * rows are emitted at `rate` (30 or 60 per second). Pure + deterministic
 * (curves.test.ts). Motion laws are inherited: nothing here is a brightness
 * channel — map the columns to motion, scale, density, never to exposure.
 */

import { OfflineAnalyser, KIOSK_ANALYSER } from "./offline-analyser";
import { BandSmoother, beatClock } from "@/lib/vj-bridge/protocol";
import { frameAlpha, isSilentLevel, slewToward, UNIFORM_SLEW_PER_SEC } from "@/lib/journeys/shader-drive";
import { OnsetDetector, rippleEnvelope, SCORE_TUNING } from "@/lib/particles/living-score";
import { conductPhrases, swellAt, type PhraseTimeline } from "@/lib/particles/phrase-conductor";
import { conductCurrents, currentAt, createTide, tideStep, withTide, type CurrentTimeline } from "@/lib/particles/harmonic-currents";
import { conductBreath, breathAt, type BreathTimeline } from "@/lib/particles/breath";
import { emblemEnvelope } from "@/lib/particles/image-follow";
import {
  closingFlightStart, openingFlightStart, flightPose, wingPose, FLIGHT, type SignatureFlight,
} from "@/lib/particles/signature-flight";
import type { ParticleProfile } from "@/lib/journeys/particle-casting";

export const CURVE_RATES = [24, 25, 30, 48, 50, 60] as const;
export type CurveRate = (typeof CURVE_RATES)[number];

/** Column order of curves.csv (after the DataTable's Name column). Keep in
 *  step with docs/unreal-pipeline.md and the bundle README. */
export const CURVE_COLUMNS = [
  "Time",
  // audio — shader drive (= OSC /resonance/audio/*)
  "Bass", "Mid", "Treble", "Level",
  "BassRaw", "MidRaw", "TrebleRaw", "LevelRaw",
  "BassKinetic", "MidKinetic", "TrebleKinetic",
  "Silent",
  // living-score onsets
  "Onset", "OnsetPitch", "OnsetEnv",
  // clock
  "Bpm", "Beat", "BeatPhase", "Bar", "BarPhase",
  // analysis
  "Intensity", "SectionIndex", "SectionProgress",
  "PhaseIndex", "PhaseProgress", "Progress",
  // phrase conductor / harmonic currents / breath
  "SwellDensity", "SwellSize", "SwellReact",
  "CurrentAmount", "CurrentTension", "CurrentLayering",
  "BreathAmount", "BreathPhase", "BreathSettle",
  // emblem + signature flight
  "EmblemForm", "EmblemShow",
  "FlightActive", "FlightX", "FlightY", "FlightScale", "FlightPitch",
  "WingRoot", "WingTip", "WingFlex", "WingFold", "WingSweep", "WingBob", "TailSpread",
] as const;
export type CurveColumn = (typeof CURVE_COLUMNS)[number];

/** Declared range of every column (tests assert it; the README prints it). */
export const CURVE_RANGES: Readonly<Record<CurveColumn, readonly [number, number]>> = {
  Time: [0, Infinity],
  Bass: [0, 1], Mid: [0, 1], Treble: [0, 1], Level: [0, 1],
  BassRaw: [0, 1], MidRaw: [0, 1], TrebleRaw: [0, 1], LevelRaw: [0, 1],
  BassKinetic: [0, 1], MidKinetic: [0, 1], TrebleKinetic: [0, 1],
  Silent: [0, 1],
  Onset: [0, 1], OnsetPitch: [0, 1], OnsetEnv: [0, 1],
  Bpm: [0, 400], Beat: [0, Infinity], BeatPhase: [0, 1], Bar: [0, Infinity], BarPhase: [0, 1],
  Intensity: [0, 1], SectionIndex: [0, 64], SectionProgress: [0, 1],
  PhaseIndex: [0, 16], PhaseProgress: [0, 1], Progress: [0, 1],
  SwellDensity: [0.6, 1.4], SwellSize: [0.9, 1.2], SwellReact: [0.7, 1.35],
  CurrentAmount: [0, 1], CurrentTension: [0, 1], CurrentLayering: [0, 1],
  BreathAmount: [0, 1], BreathPhase: [-1, 1], BreathSettle: [0, 1],
  EmblemForm: [0, 1], EmblemShow: [0, 1],
  FlightActive: [0, 1], FlightX: [-2, 2], FlightY: [-2, 2], FlightScale: [0, 1], FlightPitch: [-1, 1],
  WingRoot: [-0.5, 2.5], WingTip: [-0.5, 2.5], WingFlex: [0, 1], WingFold: [0, 1], WingSweep: [0, 1], WingBob: [-0.2, 0.2], TailSpread: [0, 1],
};

export interface CurveInput {
  /** mono PCM at `sampleRate` */
  mono: Float32Array;
  sampleRate: number;
  journeyId: string;
  /** compact v2 deep-analysis profile (particle-profiles.generated.ts) */
  profile: ParticleProfile | null;
  /** journey phase boundaries, seconds (between phases; length = phases − 1) */
  phaseBounds: readonly number[];
  /** conducted-window form changes (particle cast windows' starts) */
  formChanges?: readonly number[];
  /** output rows per second (default 30) */
  rate?: CurveRate | number;
  /** the journey's signature flight (Yellow Bird) or null */
  flight?: SignatureFlight | null;
}

export interface OnsetEvent { t: number; strength: number; pitch: number }

export interface CurveResult {
  columns: readonly CurveColumn[];
  /** one row per 1/rate s, values in CURVE_COLUMNS order */
  rows: Float64Array[];
  rate: number;
  duration: number;
  onsets: OnsetEvent[];
  phrase: PhraseTimeline | null;
  currents: CurrentTimeline | null;
  breath: BreathTimeline | null;
  flights: { kind: "opening" | "closing"; start: number; sec: number }[];
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** Linear interpolation on a [t, v] curve (held at the ends). */
export function curveAt(curve: readonly (readonly [number, number])[], t: number): number {
  if (!curve.length) return 0;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i][0]) {
      const [t0, v0] = curve[i - 1], [t1, v1] = curve[i];
      return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Index + progress of the span containing t, for boundaries between spans. */
export function spanAt(bounds: readonly number[], t: number, D: number): { index: number; progress: number } {
  const edges = [0, ...bounds.filter((b) => b > 0 && b < D), D];
  for (let i = 0; i < edges.length - 1; i++) {
    if (t < edges[i + 1] || i === edges.length - 2) {
      const len = Math.max(1e-6, edges[i + 1] - edges[i]);
      return { index: i, progress: clamp((t - edges[i]) / len, 0, 1) };
    }
  }
  return { index: 0, progress: 0 };
}

/** Life of a living-score ripple for an onset's pitch (low notes ring longer). */
const rippleLife = (pitch: number) => SCORE_TUNING.LIFE_LOW_SEC + (SCORE_TUNING.LIFE_HIGH_SEC - SCORE_TUNING.LIFE_LOW_SEC) * clamp(pitch, 0, 1);

export function computeCurves(input: CurveInput): CurveResult {
  const sr = input.sampleRate;
  const mono = input.mono;
  const rate = Math.max(1, Math.round(input.rate ?? 30));
  const D = mono.length / sr;
  const p = input.profile;
  const id = input.journeyId;
  const bpm = p?.tempo?.bpm ?? 0;

  // ── conducted timelines (the film takes them for every journey, the
  //    mastered ones too — the kiosk's locks are the README's business) ──
  const prof = p ? { ...p, duration: p.duration || D } : null;
  const phrase = prof ? conductPhrases({ ...prof, phaseBounds: [...input.phaseBounds] }, { journeyId: id, allowLocked: true, formChanges: input.formChanges ?? [] }) : null;
  const currents = prof ? conductCurrents(prof, id, true) : null;
  const breath = prof ? conductBreath(prof, id) : null;
  const flights: CurveResult["flights"] = [];
  if (input.flight) {
    const o = openingFlightStart(D);
    if (o != null) flights.push({ kind: "opening", start: o, sec: FLIGHT.OPEN_SEC });
    const c = closingFlightStart(D, prof);
    if (c != null) flights.push({ kind: "closing", start: c, sec: FLIGHT.SEC });
  }
  const sections = [...(p?.sections ?? [])].sort((a, b) => a.start - b.start);
  const sectionBounds = sections.slice(1).map((s) => s.start);

  // ── the 60 Hz analyser loop ──
  const hz = KIOSK_ANALYSER.readHz;
  const dt = 1 / hz;
  const analyser = new OfflineAnalyser();
  const bytes = new Uint8Array(analyser.frequencyBinCount);
  const bands = new BandSmoother();
  const det = new OnsetDetector();
  const tide = createTide();
  const kin = { bass: 0, mid: 0, treble: 0 };
  const shown = { bass: 0, mid: 0, treble: 0 };
  const onsets: OnsetEvent[] = [];
  const live: OnsetEvent[] = [];
  let lastPitch = 0;
  let onsetSinceRow = 0;

  const rows: Float64Array[] = [];
  const nRows = Math.floor(D * rate) + 1;
  const nTicks = Math.ceil(D * hz) + 1;
  let nextRow = 0;
  let band = bands.step(null, dt);
  let tidev = 0;

  for (let tick = 0; tick < nTicks && nextRow < nRows; tick++) {
    const t = tick * dt;
    analyser.read(mono, Math.round(t * sr), bytes);
    band = bands.step(bytes, dt);
    // kinetic layers: 0.3 per 60 fps frame, frozen in silence, then the visible slew
    if (!isSilentLevel(band.rawLevel)) {
      const k = frameAlpha(0.3, dt);
      kin.bass += (band.rawBass - kin.bass) * k;
      kin.mid += (band.rawMid - kin.mid) * k;
      kin.treble += (band.rawTreble - kin.treble) * k;
    }
    shown.bass = slewToward(shown.bass, kin.bass, UNIFORM_SLEW_PER_SEC, dt);
    shown.mid = slewToward(shown.mid, kin.mid, UNIFORM_SLEW_PER_SEC, dt);
    shown.treble = slewToward(shown.treble, kin.treble, UNIFORM_SLEW_PER_SEC, dt);
    // onsets (one frame of latency, like the kiosk)
    const heard = det.push(bytes, dt);
    if (heard) {
      const ev = { t: Math.max(0, t - dt), strength: heard.strength, pitch: heard.pitch };
      onsets.push(ev);
      live.push(ev);
      lastPitch = heard.pitch;
      onsetSinceRow = Math.max(onsetSinceRow, heard.strength);
    }
    tidev = tideStep(tide, band.level, dt);

    // emit every row whose time has been reached
    while (nextRow < nRows && nextRow / rate <= t + 1e-9) {
      const rt = nextRow / rate;
      // ripple envelope sum (the living score's swirl strength), capped at 1
      let env = 0;
      for (let i = live.length - 1; i >= 0; i--) {
        const age = rt - live[i].t;
        const life = rippleLife(live[i].pitch);
        if (age >= life) { live.splice(i, 1); continue; }
        env += live[i].strength * rippleEnvelope(age, life);
      }
      const ck = beatClock(rt, bpm);
      const sec = spanAt(sectionBounds, rt, D);
      const ph = spanAt(input.phaseBounds, rt, D);
      const sw = swellAt(phrase, rt);
      const cur = currents ? withTide(currentAt(currents, rt), tidev) : { amount: 0, tension: 0, layering: 0 };
      const br = breathAt(breath, rt);
      const em = emblemEnvelope(rt, D);
      let fl = { active: 0, x: 0, y: 0, scale: 1, pitch: 0 };
      let wg = { root: 0, tip: 0, flex: 0, fold: 0, sweep: 0, bob: 0, tail: 0 };
      for (const f of flights) {
        const e = rt - f.start;
        if (e > 0 && input.flight) {
          const pose = flightPose(e, input.flight, f.sec);
          const done = e >= f.sec;
          fl = { active: done ? 0 : 1, x: pose.x, y: pose.y, scale: pose.scale, pitch: pose.pitch };
          if (!done) wg = wingPose(e, f.sec, bpm || undefined);
          // after the closing flight the bird stays gone; after the opening one
          // it rests until the closing flight (the kiosk respawns its motes)
          if (done && f.kind === "opening") fl = { active: 0, x: 0, y: 0, scale: 1, pitch: 0 };
        }
      }
      const row = new Float64Array(CURVE_COLUMNS.length);
      const v: Record<CurveColumn, number> = {
        Time: rt,
        Bass: band.bass, Mid: band.mid, Treble: band.treble, Level: band.level,
        BassRaw: band.rawBass, MidRaw: band.rawMid, TrebleRaw: band.rawTreble, LevelRaw: band.rawLevel,
        BassKinetic: shown.bass, MidKinetic: shown.mid, TrebleKinetic: shown.treble,
        Silent: band.silent ? 1 : 0,
        Onset: onsetSinceRow, OnsetPitch: lastPitch, OnsetEnv: Math.min(1, env),
        Bpm: ck.bpm, Beat: ck.beat, BeatPhase: ck.beatPhase, Bar: ck.bar, BarPhase: ck.barPhase,
        Intensity: p?.curve?.length ? clamp(curveAt(p.curve, rt), 0, 1) : band.level,
        SectionIndex: sec.index, SectionProgress: sec.progress,
        PhaseIndex: ph.index, PhaseProgress: ph.progress, Progress: D > 0 ? clamp(rt / D, 0, 1) : 0,
        SwellDensity: sw.density, SwellSize: sw.size, SwellReact: sw.react,
        CurrentAmount: cur.amount, CurrentTension: cur.tension, CurrentLayering: cur.layering,
        BreathAmount: br.amount, BreathPhase: br.breath, BreathSettle: br.settle,
        EmblemForm: em.form, EmblemShow: em.show,
        FlightActive: fl.active, FlightX: fl.x, FlightY: fl.y, FlightScale: fl.scale, FlightPitch: fl.pitch,
        WingRoot: wg.root, WingTip: wg.tip, WingFlex: wg.flex, WingFold: wg.fold, WingSweep: wg.sweep, WingBob: wg.bob, TailSpread: wg.tail,
      };
      CURVE_COLUMNS.forEach((c, i) => { row[i] = Number.isFinite(v[c]) ? v[c] : 0; });
      rows.push(row);
      onsetSinceRow = 0;
      nextRow++;
    }
  }
  return { columns: CURVE_COLUMNS, rows, rate, duration: D, onsets, phrase, currents, breath, flights };
}

/** 4-decimal fixed formatting (integers stay integers); deterministic text. */
export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return "0";
  if (Number.isInteger(x)) return String(x);
  const s = x.toFixed(4);
  const t = s.replace(/0+$/, "").replace(/\.$/, "");
  return t === "-0" ? "0" : t;
}

/** DataTable CSV (Unreal: one row per frame; first column = the row Name). */
export function toDataTableCsv(res: Pick<CurveResult, "columns" | "rows">): string {
  const lines = ["Name," + res.columns.join(",")];
  res.rows.forEach((r, i) => {
    lines.push(`F${String(i).padStart(6, "0")},` + Array.from(r, fmtNum).join(","));
  });
  return lines.join("\n") + "\n";
}

/** CurveTable CSV (Unreal: one row per CURVE, the header holds the key
 *  times) — imports with no struct at all. Time itself is not a curve. */
export function toCurveTableCsv(res: Pick<CurveResult, "columns" | "rows">): string {
  const ti = res.columns.indexOf("Time");
  const lines = ["Name," + res.rows.map((r) => fmtNum(r[ti])).join(",")];
  res.columns.forEach((c, ci) => {
    if (c === "Time") return;
    lines.push(c + "," + res.rows.map((r) => fmtNum(r[ci])).join(","));
  });
  return lines.join("\n") + "\n";
}
