/**
 * 7384 · Pulsegate — the tension-arc state engine.
 *
 * A hand-rolled real-time state machine that models a live EDM arrangement:
 *
 *   intro -> build -> riser -> drop -> breakdown -> back -> intro -> ...
 *
 * The performer (Web MIDI / keyboard / on-screen keys) drives two raw
 * signals — note-on velocity (accumulates "tension") and a mod-wheel value
 * (the riser / filter-sweep amount, "mod"). This engine smooths those
 * signals and walks the phase machine using tension/mod thresholds with
 * hysteresis and min/max phase durations, so the arc always keeps moving
 * even if the performer plays sparsely or leans on one control.
 *
 * When nobody has touched an input yet, a deterministic seeded "auto-DJ"
 * performer (mulberry32(0x7384)) feeds the SAME noteOn()/setMod() entry
 * points the engine exposes to a human — it is not a parallel state
 * machine, it is a scripted performance of the same instrument. That is
 * what lets a silent phone see the full 32-bar build -> riser -> DROP ->
 * breakdown arc from first paint with zero input.
 *
 * This is the deliberate non-ML analog of "explicit tension-curve
 * conditioning" work (see README) — there, a model follows a computed
 * tension trajectory. Here, a human (or the seeded stand-in) performs it.
 */

// ---- deterministic PRNG (the lab's one sanctioned RNG) --------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- tempo --------------------------------------------------------------

export const BPM = 128;
export const BEAT_SEC = 60 / BPM;
export const BAR_SEC = BEAT_SEC * 4;
export const LOOP_BARS = 32;
export const LOOP_SEC = BAR_SEC * LOOP_BARS;

export const ROOT_MIDI = 57; // A3 — lead/auto-dj home note
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // minor-pentatonic-ish, extended

export type Phase = "intro" | "build" | "riser" | "drop" | "breakdown" | "back";

export interface NoteEvent {
  midi: number;
  vel: number;
}

export interface EngineSnapshot {
  phase: Phase;
  bar: number; // 1-based, within the 32-bar auto-dj loop (display only)
  tension: number; // 0..1 smoothed
  mod: number; // 0..1 smoothed riser/filter-sweep amount
  pump: number; // 0..1 sidechain envelope, 1 = full, dips right after a kick
  dropImpulse: number; // 0..1 decaying burst envelope (fires once per drop)
  autoActive: boolean;
  justKicked: boolean;
  justDropped: boolean;
  autoNotes: NoteEvent[];
}

// min/max phase durations, expressed in bars for readability
const MIN_INTRO = 2 * BAR_SEC;
const MIN_BUILD = 2 * BAR_SEC;
const MAX_BUILD = 8 * BAR_SEC;
const MIN_RISER = 1 * BAR_SEC;
const MAX_RISER = 4 * BAR_SEC;
const MIN_DROP = 4 * BAR_SEC;
const MAX_DROP = 10 * BAR_SEC;
const MIN_BREAKDOWN = 2 * BAR_SEC;
const MAX_BREAKDOWN = 6 * BAR_SEC;
const BACK_SEC = 2 * BAR_SEC;

const TENSION_DECAY_TAU = 6.0; // seconds — how fast unplayed tension drains
const TABLE_LEN = 512; // 32 bars * 16 sixteenth-notes

/** The scripted auto-DJ "performance" as a pure function of bar position
 *  (0..32, wraps). Tuned to walk the real tension/mod state machine through
 *  a full arc across the 32-bar loop — it is a performance, not a cheat:
 *  the phase machine reacts to these exactly as it would to a human. */
function autoParamsAt(barPos: number): {
  density: number;
  velBase: number;
  velJitter: number;
  modTarget: number;
} {
  if (barPos < 2) return { density: 0, velBase: 0, velJitter: 0, modTarget: 0 };
  if (barPos < 8) {
    const t = (barPos - 2) / 6;
    return { density: 0.15 + t * 0.25, velBase: 0.35 + t * 0.2, velJitter: 0.2, modTarget: 0 };
  }
  if (barPos < 16) {
    const t = (barPos - 8) / 8;
    return { density: 0.4 + t * 0.35, velBase: 0.55 + t * 0.2, velJitter: 0.22, modTarget: 0 };
  }
  if (barPos < 20) {
    const t = (barPos - 16) / 4;
    return { density: 0.25, velBase: 0.6 + t * 0.25, velJitter: 0.18, modTarget: t };
  }
  if (barPos < 28) {
    const t = (barPos - 20) / 8;
    return { density: 0.8, velBase: 0.85 + t * 0.1, velJitter: 0.15, modTarget: 0 };
  }
  const t = (barPos - 28) / 4;
  return { density: 0.14, velBase: 0.4 - t * 0.1, velJitter: 0.2, modTarget: 0 };
}

function kickActiveForPhase(phase: Phase, beatIndex: number): boolean {
  switch (phase) {
    case "intro":
      return false;
    case "breakdown":
      return beatIndex % 2 === 0; // half-time
    default:
      return true; // build, riser, drop, back — four on the floor
  }
}

export class TensionEngine {
  phase: Phase = "intro";
  private phaseElapsed = 0;
  elapsed = 0;

  private tensionRaw = 0;
  tension = 0;
  private modRaw = 0;
  mod = 0;
  private riserPeakMod = 0;

  pump = 1;
  private nextKickAt = 0;
  private beatIndex = 0;

  dropImpulse = 0;
  autoActive = true;
  private reduced = false;

  private lastSixteenthIdx = -1;
  private gateTable: Float64Array;
  private pitchTable: Uint8Array;
  private velJitterTable: Float64Array;

  constructor(seed = 0x7384) {
    const rng = mulberry32(seed);
    this.gateTable = new Float64Array(TABLE_LEN);
    this.pitchTable = new Uint8Array(TABLE_LEN);
    this.velJitterTable = new Float64Array(TABLE_LEN);
    for (let i = 0; i < TABLE_LEN; i++) {
      this.gateTable[i] = rng();
      this.pitchTable[i] = Math.floor(rng() * SCALE.length);
      this.velJitterTable[i] = rng();
    }
  }

  setReducedMotion(reduced: boolean) {
    this.reduced = reduced;
  }

  /** A note sounded. Bumps tension. `human=true` retires the auto-DJ. */
  noteOn(vel: number, human = true) {
    if (human) this.autoActive = false;
    this.tensionRaw = clamp(this.tensionRaw + vel * 0.16, 0, 1.4);
  }

  /** Mod wheel / riser slider moved. `human=true` retires the auto-DJ. */
  setMod(value: number, human = true) {
    if (human) this.autoActive = false;
    this.modRaw = clamp01(value);
  }

  private enterPhase(p: Phase) {
    this.phase = p;
    this.phaseElapsed = 0;
    if (p === "riser") this.riserPeakMod = this.mod;
  }

  step(dtSec: number): EngineSnapshot {
    const dt = Math.min(0.05, Math.max(0, dtSec));
    this.elapsed += dt;
    this.phaseElapsed += dt;
    let justKicked = false;
    let justDropped = false;
    const autoNotes: NoteEvent[] = [];

    // --- auto-DJ scripted performance (sixteenth-note edge triggered) ---
    const sixteenthSec = BEAT_SEC / 4;
    const sixteenthIdx = Math.floor(this.elapsed / sixteenthSec);
    if (sixteenthIdx !== this.lastSixteenthIdx) {
      this.lastSixteenthIdx = sixteenthIdx;
      if (this.autoActive) {
        const barPos = (this.elapsed % LOOP_SEC) / BAR_SEC;
        const p = autoParamsAt(barPos);
        this.modRaw = p.modTarget;
        const ti = sixteenthIdx % TABLE_LEN;
        if (this.gateTable[ti] < p.density) {
          const deg = this.pitchTable[ti] % SCALE.length;
          const midi = ROOT_MIDI + SCALE[deg];
          const jitter = (this.velJitterTable[ti] - 0.5) * p.velJitter * 2;
          const vel = clamp01(p.velBase + jitter);
          this.noteOn(vel, false);
          autoNotes.push({ midi, vel });
        }
      }
    }

    // --- smoothing ---
    this.tensionRaw *= Math.exp(-dt / TENSION_DECAY_TAU);
    this.tension += (clamp01(this.tensionRaw) - this.tension) * Math.min(1, dt * 3);
    this.mod += (this.modRaw - this.mod) * Math.min(1, dt * 4);
    if (this.phase === "riser") this.riserPeakMod = Math.max(this.riserPeakMod, this.mod);

    // --- kick clock (steady 128bpm grid regardless of whether it sounds) ---
    if (this.elapsed >= this.nextKickAt) {
      if (this.nextKickAt === 0) this.nextKickAt = this.elapsed;
      this.nextKickAt += BEAT_SEC;
      this.beatIndex++;
      if (kickActiveForPhase(this.phase, this.beatIndex)) {
        justKicked = true;
        this.pump = this.reduced ? 0.55 : 0.16;
      }
    }
    this.pump += (1 - this.pump) * Math.min(1, dt * (this.reduced ? 2.6 : 3.6));

    // --- drop burst decay ---
    this.dropImpulse *= Math.exp(-dt / 0.55);

    // --- phase transitions ---
    switch (this.phase) {
      case "intro":
        if (this.phaseElapsed > MIN_INTRO && this.tension > 0.22) this.enterPhase("build");
        break;
      case "build":
        if (
          this.phaseElapsed > MIN_BUILD &&
          (this.mod > 0.5 || this.tension > 0.85 || this.phaseElapsed > MAX_BUILD)
        ) {
          this.enterPhase("riser");
        }
        break;
      case "riser": {
        const released = this.riserPeakMod > 0.55 && this.mod < 0.15;
        if (
          this.phaseElapsed > MIN_RISER &&
          (released || this.phaseElapsed > MAX_RISER)
        ) {
          this.enterPhase("drop");
          this.dropImpulse = 1;
          justDropped = true;
        }
        break;
      }
      case "drop":
        if (
          this.phaseElapsed > MIN_DROP &&
          (this.tension < 0.35 || this.phaseElapsed > MAX_DROP)
        ) {
          this.enterPhase("breakdown");
        }
        break;
      case "breakdown":
        if (
          this.phaseElapsed > MIN_BREAKDOWN &&
          (this.tension > 0.35 || this.phaseElapsed > MAX_BREAKDOWN)
        ) {
          this.enterPhase("back");
        }
        break;
      case "back":
        if (this.phaseElapsed > BACK_SEC) {
          this.enterPhase(this.tension > 0.3 ? "build" : "intro");
        }
        break;
    }

    const bar = 1 + Math.floor((this.elapsed % LOOP_SEC) / BAR_SEC);
    return {
      phase: this.phase,
      bar,
      tension: this.tension,
      mod: this.mod,
      pump: this.pump,
      dropImpulse: this.dropImpulse,
      autoActive: this.autoActive,
      justKicked,
      justDropped,
      autoNotes,
    };
  }
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
