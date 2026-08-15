// ─────────────────────────────────────────────────────────────────────────────
// 13360-handreader / kinematics.ts
//
// A note-roll → two-hand keyboard-choreography solver. Given Karel's real
// recorded note-roll (MIDI pitch / onset / duration / velocity) and a playback
// clock, it reconstructs a plausible pose for two hands gliding across an 88-key
// keyboard, plus per-key press depths — all note-for-note from his recording.
//
// Deliberately NOT a research-grade IK solver: a causal L/R split around a
// moving pitch boundary, palm easing toward the centroid of its active keys, and
// a lightweight nearest-key fingertip spread. Simple, robust, framerate-free.
//
// Determinism: the only "randomness" is a seeded mulberry32 used for a tiny idle
// finger breathing offset. No Math.random / Date.now / performance.now here.
// ─────────────────────────────────────────────────────────────────────────────

import type { TrackNote } from "../_shared/trackAnalysis";

export const MIDI_LOW = 21; // A0
export const MIDI_HIGH = 108; // C8
export const KEY_COUNT = MIDI_HIGH - MIDI_LOW + 1; // 88

/** World-space width of the whole keyboard (x spans -W/2 .. +W/2). */
export const KEYBOARD_WIDTH = 24;
/** Depth (z) of a white key; black keys are shorter. */
export const WHITE_DEPTH = 3.4;
export const BLACK_DEPTH = 2.2;
/** Front dip (world units) of a fully-struck key (velocity 127). */
export const MAX_KEY_DIP = 0.32;

// White-key units per pitch-class within an octave. Black keys sit at the .5
// boundary between their neighbouring whites, matching real key geometry.
const PC_WHITE_OFFSET = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const IS_BLACK_PC = [
  false, true, false, true, false, false, true, false, true, false, true, false,
];

// The keyboard, measured in white-key units, runs from A0 (unit 12) to C8
// (unit 63) — 51 spans across 52 white keys.
const WHITE_UNIT_LOW = whiteUnit(MIDI_LOW);
const WHITE_UNIT_SPAN = whiteUnit(MIDI_HIGH) - WHITE_UNIT_LOW;

function whiteUnit(midi: number): number {
  return 7 * Math.floor(midi / 12) + PC_WHITE_OFFSET[((midi % 12) + 12) % 12];
}

/** Is this MIDI pitch a black key? */
export function isBlackKey(midi: number): boolean {
  return IS_BLACK_PC[((midi % 12) + 12) % 12];
}

/** Map a MIDI pitch to its centre x-position along the keyboard (world units). */
export function pitchToX(midi: number): number {
  const u = (whiteUnit(midi) - WHITE_UNIT_LOW) / WHITE_UNIT_SPAN; // 0..1
  return (u - 0.5) * KEYBOARD_WIDTH;
}

export interface KeyGeom {
  midi: number;
  index: number; // 0..87
  x: number;
  isBlack: boolean;
}

/** Full static geometry for all 88 keys, in keyboard order. */
export function keyLayout(): KeyGeom[] {
  const out: KeyGeom[] = [];
  for (let i = 0; i < KEY_COUNT; i++) {
    const midi = MIDI_LOW + i;
    out.push({ midi, index: i, x: pitchToX(midi), isBlack: isBlackKey(midi) });
  }
  return out;
}

// ── seeded PRNG (for idle finger breathing only) ─────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// Framerate-independent exponential ease: fraction of the way to target per dt.
function easeTo(cur: number, target: number, dt: number, tau: number): number {
  const k = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return cur + (target - cur) * k;
}

export interface FingerPose {
  x: number;
  y: number;
  z: number;
  press: number; // 0..1 how far this finger is pressing down
  onKey: boolean; // true when reaching a real active key (vs resting)
}

export interface HandPose {
  palmX: number;
  palmY: number;
  palmZ: number;
  fingers: FingerPose[]; // exactly 5, low-x → high-x
  energy: number; // 0..1 glow driver
  side: "left" | "right";
}

export interface Choreography {
  left: HandPose;
  right: HandPose;
  /** Per-key press depth 0..1, index 0..87. */
  keyPress: Float32Array;
  /** How many notes are sounding right now (for HUD / debug). */
  activeCount: number;
}

const FINGERS = 5;
const FINGER_REST_SPREAD = 0.85; // world-x between resting fingers
const PALM_Y = 1.5;
const FINGER_HOVER_Y = 0.62;
const FINGER_PRESS_Y = 0.12;
const HAND_Z = -0.4; // hands sit toward the front lip of the keys
const REST_Z = 0.1;
// Idle "home" positions the hands drift back toward when a hand falls silent.
const LEFT_HOME_X = pitchToX(48); // ~C3
const RIGHT_HOME_X = pitchToX(72); // ~C5
// Fingertips reach toward notes this many seconds before their onset, so the
// choreography anticipates rather than snapping.
const ANTICIPATION = 0.11;

interface ActiveNote {
  midi: number;
  x: number;
  velocity: number;
  pressedNow: boolean; // within [time, time+dur]
}

/**
 * Stateful choreography solver. Construct once per mounted scene, call `step`
 * each frame with the current playback time and elapsed dt. All easing is
 * dt-based so it behaves identically at any framerate (demo clock or real audio).
 */
export class HandChoreographer {
  private notes: TrackNote[] = [];
  private keyPress = new Float32Array(KEY_COUNT);
  private splitPitch = 60; // moving L/R boundary (middle C to start)
  private cursor = 0; // lower-bound index hint into the sorted note list
  private rng = mulberry32(0x9e3779b1);
  private phase = 0; // breathing phase for idle fingers

  private left: HandPose = makeHand("left", LEFT_HOME_X);
  private right: HandPose = makeHand("right", RIGHT_HOME_X);

  setNotes(notes: TrackNote[]) {
    // keep a time-sorted copy so the windowed scan is monotone
    this.notes = notes.slice().sort((a, b) => a.time - b.time);
    this.cursor = 0;
    this.keyPress.fill(0);
    this.splitPitch = 60;
  }

  /** Seek the internal cursor for a new playback position (track change / restart). */
  reset(now: number) {
    // binary search for first note that could still be sounding
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].time < now - 8) lo = mid + 1;
      else hi = mid;
    }
    this.cursor = lo;
  }

  step(now: number, dt: number): Choreography {
    const active = this.collectActive(now);

    // ── moving L/R split: ease the boundary toward the pitch centroid ────────
    if (active.length > 0) {
      let sum = 0;
      for (const n of active) sum += n.midi;
      const centroid = sum / active.length;
      this.splitPitch = easeTo(this.splitPitch, centroid, dt, 0.5);
    }

    const leftKeys: ActiveNote[] = [];
    const rightKeys: ActiveNote[] = [];
    for (const n of active) {
      if (n.midi < this.splitPitch - 0.5) leftKeys.push(n);
      else rightKeys.push(n);
    }
    // If everything landed on one side but there is a wide spread, hand the
    // lowest note to the left hand so both hands stay expressive on big chords.
    if (leftKeys.length === 0 && rightKeys.length >= 4) {
      rightKeys.sort((a, b) => a.midi - b.midi);
      const span = rightKeys[rightKeys.length - 1].midi - rightKeys[0].midi;
      if (span > 14) {
        const half = Math.floor(rightKeys.length / 2);
        leftKeys.push(...rightKeys.splice(0, half));
      }
    }

    this.phase += dt;
    this.solveHand(this.left, leftKeys, LEFT_HOME_X, dt);
    this.solveHand(this.right, rightKeys, RIGHT_HOME_X, dt);

    // ── per-key press depths: fast attack, slower release ────────────────────
    const target = new Float32Array(KEY_COUNT);
    for (const n of active) {
      if (!n.pressedNow) continue;
      const idx = n.midi - MIDI_LOW;
      if (idx < 0 || idx >= KEY_COUNT) continue;
      const v = clamp(n.velocity / 127, 0.18, 1);
      if (v > target[idx]) target[idx] = v;
    }
    for (let i = 0; i < KEY_COUNT; i++) {
      const t = target[i];
      const tau = t > this.keyPress[i] ? 0.02 : 0.12; // snap down, lift slower
      this.keyPress[i] = easeTo(this.keyPress[i], t, dt, tau);
    }

    return {
      left: this.left,
      right: this.right,
      keyPress: this.keyPress,
      activeCount: active.filter((n) => n.pressedNow).length,
    };
  }

  // ── windowed active-note collection (binary search + short forward scan) ────
  private collectActive(now: number): ActiveNote[] {
    const notes = this.notes;
    const out: ActiveNote[] = [];
    if (notes.length === 0) return out;

    // advance / rewind the cursor to the first note that could be relevant
    while (this.cursor > 0 && notes[this.cursor - 1].time > now - 6)
      this.cursor--;
    while (
      this.cursor < notes.length &&
      notes[this.cursor].time + notes[this.cursor].duration < now
    )
      this.cursor++;

    for (let i = this.cursor; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > now + ANTICIPATION) break; // sorted → nothing further reaches
      const end = n.time + n.duration;
      const pressedNow = now >= n.time && now < end;
      const reaching = now >= n.time - ANTICIPATION && now < end;
      if (!reaching) continue;
      out.push({
        midi: n.midi,
        x: pitchToX(n.midi),
        velocity: n.velocity,
        pressedNow,
      });
    }
    return out;
  }

  // ── one hand: palm eases to centroid; 5 fingertips spread over active keys ──
  private solveHand(
    hand: HandPose,
    keys: ActiveNote[],
    homeX: number,
    dt: number,
  ) {
    keys.sort((a, b) => a.x - b.x);

    // palm target = centroid of active key x's, or drift home when idle
    let palmTargetX = homeX;
    let energyTarget = 0;
    if (keys.length > 0) {
      let sx = 0;
      let sv = 0;
      for (const k of keys) {
        sx += k.x;
        sv += k.velocity / 127;
      }
      palmTargetX = sx / keys.length;
      energyTarget = clamp(sv / keys.length + (keys.length - 1) * 0.12, 0, 1);
    }
    hand.palmX = easeTo(hand.palmX, palmTargetX, dt, keys.length > 0 ? 0.14 : 0.5);
    hand.palmY = PALM_Y;
    hand.palmZ = keys.length > 0 ? HAND_Z : REST_Z;
    hand.energy = easeTo(hand.energy, energyTarget, dt, 0.1);

    // choose which of the 5 finger slots hold real keys (centred), rest the others
    const n = keys.length;
    const used = Math.min(n, FINGERS);
    const startSlot = Math.floor((FINGERS - used) / 2);

    for (let s = 0; s < FINGERS; s++) {
      const f = hand.fingers[s];
      const j = s - startSlot; // index into keys[] if this slot is used
      const holdsKey = n > 0 && j >= 0 && j < used;

      let tx: number;
      let onKey = false;
      let pressTarget = 0;
      if (holdsKey) {
        // when more keys than fingers, sample keys evenly across the span
        const ki = used < n ? Math.round((j * (n - 1)) / (used - 1 || 1)) : j;
        const key = keys[clamp(ki, 0, n - 1)];
        tx = key.x;
        onKey = true;
        if (key.pressedNow) pressTarget = clamp(key.velocity / 127, 0.2, 1);
      } else {
        // resting finger: natural spread around the palm + tiny breathing
        const breathe =
          0.05 * Math.sin(this.phase * 1.3 + s * 1.7 + this.rng() * 0.0);
        tx = hand.palmX + (s - 2) * FINGER_REST_SPREAD + breathe;
      }

      f.x = easeTo(f.x, tx, dt, holdsKey ? 0.07 : 0.22);
      f.z = easeTo(f.z, hand.palmZ - 0.15, dt, 0.15);
      f.press = easeTo(f.press, pressTarget, dt, pressTarget > f.press ? 0.02 : 0.12);
      // y dips from hover toward the key surface with press depth
      const yTarget = FINGER_HOVER_Y - (FINGER_HOVER_Y - FINGER_PRESS_Y) * f.press;
      f.y = easeTo(f.y, yTarget, dt, 0.05);
      f.onKey = onKey;
    }
  }
}

function makeHand(side: "left" | "right", homeX: number): HandPose {
  const fingers: FingerPose[] = [];
  for (let s = 0; s < FINGERS; s++) {
    fingers.push({
      x: homeX + (s - 2) * FINGER_REST_SPREAD,
      y: FINGER_HOVER_Y,
      z: HAND_Z - 0.15,
      press: 0,
      onKey: false,
    });
  }
  return { palmX: homeX, palmY: PALM_Y, palmZ: REST_Z, fingers, energy: 0, side };
}

// ── seeded synthetic note-roll — DEMO VISUAL FALLBACK ONLY (never audible) ────
// If loadTrackAnalysis returns null, we still want the hands alive. This builds
// a small, musical-ish two-hand pattern deterministically. It is used to drive
// the 3D only; audio always stays real-catalog-or-silent.
export function syntheticNoteRoll(seed = 0x1337): TrackNote[] {
  const rng = mulberry32(seed);
  const notes: TrackNote[] = [];
  const scale = [0, 2, 3, 5, 7, 8, 10]; // C minor-ish
  const beat = 0.42;
  let t = 0.5;
  for (let bar = 0; bar < 48; bar++) {
    // left hand: root + fifth every two beats, low register
    const root = 36 + scale[Math.floor(rng() * scale.length)];
    notes.push({ midi: root, time: t, duration: beat * 1.8, velocity: 62 + Math.floor(rng() * 20) });
    notes.push({ midi: root + 7, time: t, duration: beat * 1.8, velocity: 54 + Math.floor(rng() * 18) });
    // right hand: a little melodic run of 4 notes up high
    for (let s = 0; s < 4; s++) {
      const deg = scale[Math.floor(rng() * scale.length)];
      const oct = rng() > 0.5 ? 72 : 60;
      notes.push({
        midi: oct + deg,
        time: t + s * (beat / 2),
        duration: beat * 0.55,
        velocity: 70 + Math.floor(rng() * 30),
      });
    }
    t += beat * 2;
  }
  notes.sort((a, b) => a.time - b.time);
  return notes;
}
