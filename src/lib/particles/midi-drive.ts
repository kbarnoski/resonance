/**
 * MIDI DRIVE — the particle features hear the TRUTH when the Nord is plugged
 * in (2026-10-13). The living score, the two hands and the resonance trails
 * normally GUESS the notes from the mic (onset detection + spectrum); with
 * the Nord's USB MIDI (src/lib/audio/midi-input.ts) this bridge turns exact
 * note numbers, velocities, note-offs and the sustain pedal into the SAME
 * inputs those features already take:
 *
 *  - living score: every note-on → an Onset at its exact pitch (MIDI 21–108 →
 *    the score's 0..1 low→high stave, log-frequency like the detector's) with
 *    strength from velocity. A chord's notes are queued and offered one per
 *    MIN_SPAWN_GAP_SEC (the score's own spacing), stale after MAX_WAIT_SEC.
 *  - two hands: each register's activity target from the held notes split at
 *    SPLIT_NOTE (default 60, middle C) weighted by velocity, plus the note-on
 *    rate per register — fed to TwoHands as a target, so its attack / release
 *    / contrast / slew laws are untouched.
 *  - trails: a "sounding" energy (struck notes ring while held or pedalled,
 *    the dampers stop them on release) × calm (1 − busy note rate) — fed to
 *    SustainMeter as its raw reading, so its ≥ 1.8 s / ≥ 3.2 s EMA, dead zone
 *    and gain slew are untouched.
 *
 * AUDIO STAYS THE FALLBACK: the bridge's `mix` follows MIDI activity — a
 * connected keyboard with a note / pedal in the last ACTIVE_WINDOW_MS (10 s) —
 * and moves linearly over CROSSFADE_SEC (2.5 s, smoothstep-shaped) both ways,
 * so switching source is never a jump. At mix 0 every feature runs exactly as
 * before (the audio onset object is passed through untouched).
 *
 * Pure + deterministic given the clock (midi-drive.test.ts). Motion only —
 * nothing here has a brightness channel. A few dozen float ops per frame.
 */

import { getMidiState, type MidiState } from "@/lib/audio/midi-input";
import { SCORE_TUNING, smoothstep, type Onset } from "./living-score";
import { HANDS_TUNING } from "./two-hands";

export const MIDI_DRIVE = {
  /** MIDI counts as "playing" for this long after the last note / pedal (ms) */
  ACTIVE_WINDOW_MS: 10_000,
  /** audio ↔ MIDI crossfade (s; the law: ≥ 2 s, never a jump) */
  CROSSFADE_SEC: 2.5,
  /** piano range → the score's 0..1 stave */
  NOTE_LO: 21,
  NOTE_HI: 108,
  /** two hands: the split note (60 = middle C) and its soft half-width (semitones) */
  SPLIT_NOTE: 60,
  SPLIT_SOFT: 2,
  /** velocity → onset strength: FLOOR + (1 − FLOOR) · (v / 127) */
  STRENGTH_FLOOR: 0.3,
  /** a queued chord note older than this is dropped (s) */
  MAX_WAIT_SEC: 0.35,
  /** hands: weight of the held-notes cue, and the velocity sum reading ~63 % */
  HELD_W: 0.4,
  HELD_REF: 1.2,
  /** trails: a struck note's ring decays with this τ while sounding (held / pedal), s */
  RING_TAU_SEC: 5,
  /** …and with this τ once the dampers fall (released, no pedal), s */
  DAMP_TAU_SEC: 0.35,
  /** sounding energy reading ~63 % presence (velocity units) */
  RING_REF: 0.8,
  /** busyness: note-on rate memory (s) and the held … busy rates (notes / s) */
  BUSY_TAU_SEC: 0.8,
  BUSY_LO: 4,
  BUSY_HI: 12,
} as const;

const D = MIDI_DRIVE;
const clamp01 = (x: number) => (x > 1 ? 1 : x > 0 ? x : 0);

/** MIDI note → the living score's 0 (low) … 1 (high) stave. */
export function midiPitch(note: number): number {
  return clamp01((note - D.NOTE_LO) / (D.NOTE_HI - D.NOTE_LO));
}

/** MIDI velocity (1..127) → onset strength 0..1. */
export function velocityStrength(v: number): number {
  return D.STRENGTH_FLOOR + (1 - D.STRENGTH_FLOOR) * clamp01(v / 127);
}

/** A note's share of the RIGHT hand: 0 = left … 1 = right (soft at the split). */
export function midiRightShare(note: number, split: number = D.SPLIT_NOTE): number {
  return smoothstep(split - D.SPLIT_SOFT, split + D.SPLIT_SOFT, note);
}

/** What TwoHands mixes in: activity targets per register + the MIDI weight. */
export interface HandsExternal { low: number; high: number; weight: number }
/** What SustainMeter mixes in: a raw sustain reading + the MIDI weight. */
export interface TrailsExternal { raw: number; weight: number }

interface Pending { pitch: number; strength: number; at: number }

export class MidiDrive {
  /** linear crossfade position 0 (audio) … 1 (MIDI) */
  weight = 0;
  /** the shaped crossfade (smoothstep of weight) every feature uses */
  mix = 0;
  /** is MIDI currently "playing" (inside the active window)? */
  active = false;
  readonly hands: HandsExternal = { low: 0, high: 0, weight: 0 };
  readonly trails: TrailsExternal = { raw: 0, weight: 0 };
  /** diagnostics */
  energy = 0;
  busy = 0;
  emitted = 0;
  expired = 0;
  private rateL = 0;
  private rateH = 0;
  private rateAll = 0;
  private cursor: number;
  private lastNow = NaN;
  private t = 0;
  private lastEmit = -Infinity;
  private readonly queue: Pending[] = [];

  constructor(private readonly state: MidiState, readonly split: number = D.SPLIT_NOTE) {
    this.cursor = state.seq; // never replay notes played before this bridge existed
  }

  /** Advance to `nowMs` (the MidiState clock). Idempotent for the same now. */
  step(nowMs: number): this {
    if (!Number.isFinite(nowMs)) return this;
    const dt = Number.isFinite(this.lastNow) ? Math.max(0, Math.min(0.25, (nowMs - this.lastNow) / 1000)) : 0;
    if (dt === 0 && Number.isFinite(this.lastNow)) return this;
    this.lastNow = nowMs;
    this.t += dt;
    const st = this.state;

    // ── the crossfade ──
    this.active = st.devices.length > 0 && nowMs - st.lastActivityAt <= D.ACTIVE_WINDOW_MS;
    const dw = dt / D.CROSSFADE_SEC;
    this.weight = this.active ? Math.min(1, this.weight + dw) : Math.max(0, this.weight - dw);
    this.mix = smoothstep(0, 1, this.weight);

    // ── new note-ons: rates, ring energy, the score queue ──
    const rd = Math.exp(-dt / HANDS_TUNING.RATE_TAU);
    this.rateL *= rd;
    this.rateH *= rd;
    this.rateAll *= Math.exp(-dt / D.BUSY_TAU_SEC);
    const sounding = st.pedal || st.held.size > 0;
    this.energy *= Math.exp(-dt / (sounding ? D.RING_TAU_SEC : D.DAMP_TAU_SEC));
    const fresh = st.noteOnsSince(this.cursor);
    for (const e of fresh) {
      const v = clamp01(e.velocity / 127);
      const share = midiRightShare(e.note, this.split);
      this.rateL += (v * (1 - share)) / HANDS_TUNING.RATE_TAU;
      this.rateH += (v * share) / HANDS_TUNING.RATE_TAU;
      this.rateAll += 1 / D.BUSY_TAU_SEC;
      this.energy += v;
      this.queue.push({ pitch: midiPitch(e.note), strength: velocityStrength(e.velocity), at: this.t });
    }
    this.cursor = st.seq;
    // the queue only lives while MIDI is heard, and never holds stale notes
    while (this.queue.length && (this.mix <= 0 || this.t - this.queue[0].at > D.MAX_WAIT_SEC)) { this.queue.shift(); this.expired++; }

    // ── two hands: held notes (velocity-weighted) + note rate per register ──
    let heldL = 0, heldH = 0;
    for (const h of st.held.values()) {
      const v = clamp01(h.velocity / 127), share = midiRightShare(h.note, this.split);
      heldL += v * (1 - share);
      heldH += v * share;
    }
    const T = HANDS_TUNING;
    this.hands.low = clamp01(T.ONSET_W * (1 - Math.exp(-this.rateL / T.RATE_REF)) + D.HELD_W * (1 - Math.exp(-heldL / D.HELD_REF)));
    this.hands.high = clamp01(T.ONSET_W * (1 - Math.exp(-this.rateH / T.RATE_REF)) + D.HELD_W * (1 - Math.exp(-heldH / D.HELD_REF)));
    this.hands.weight = this.mix;

    // ── trails: sounding presence × calm ──
    this.busy = smoothstep(D.BUSY_LO, D.BUSY_HI, this.rateAll);
    const presence = sounding ? 1 - Math.exp(-this.energy / D.RING_REF) : 0;
    this.trails.raw = presence * (1 - this.busy);
    this.trails.weight = this.mix;
    return this;
  }

  /**
   * This frame's onset for the living score. Call once per frame after step().
   * MIDI notes (queued, one per score spacing) win, their strength × mix; the
   * audio onset fades in by (1 − mix). At mix 0 the audio onset is returned
   * untouched (the exact pre-MIDI behaviour).
   */
  scoreOnset(audio: Onset | null): Onset | null {
    if (this.mix <= 0) return audio;
    if (this.queue.length && this.t - this.lastEmit >= SCORE_TUNING.MIN_SPAWN_GAP_SEC) {
      const p = this.queue.shift()!;
      this.lastEmit = this.t;
      this.emitted++;
      return { pitch: p.pitch, strength: p.strength * this.mix };
    }
    if (!audio || this.mix >= 1) return null;
    const s = audio.strength * (1 - this.mix);
    return s > 0.02 ? { pitch: audio.pitch, strength: s } : null;
  }

  /** Queued chord notes still waiting for the score (probes). */
  pending(): number {
    return this.queue.length;
  }
}

let drive: MidiDrive | null = null;
let driveFor: MidiState | null = null;

/** The page's one MIDI bridge (null until MIDI was started — Live Theatre or
 *  `?midi=1`). Persistent across journeys so a world change never restarts
 *  the crossfade. */
export function liveMidiDrive(): MidiDrive | null {
  const st = getMidiState();
  if (!st) return null;
  if (!drive || driveFor !== st) { drive = new MidiDrive(st); driveFor = st; }
  return drive;
}
