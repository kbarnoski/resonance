// score.ts — Reference score for "Twinkle Twinkle Little Star" in C major,
// the functional chord accompaniment, the keyboard map, and a BAKED performance
// that deliberately FUMBLES so the dual DTW⇄HMM follower can be seen recovering.
//
// Cycle 3 of the Resonance "Accompanist" thread. Cycles 1 & 2 lived in D major
// (Pachelbel). The jury banned the D tonal center, so this cycle moves to C major
// with an instantly recognizable tune — recognizability is the point: a wrong
// note is obvious to anyone, which makes the recovery legible.
//
// The follower never sees score positions. It only receives (pitch, velocity,
// duration, dt) tuples and must align + react in real time.

// ─── Pitch helpers ──────────────────────────────────────────────────────────

// MIDI note number → frequency (A4 = 69 = 440 Hz).
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

// MIDI note number → note name with octave (e.g. 60 → "C4").
export function midiToName(m: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
}

// ─── The melody (reference) — "Twinkle Twinkle Little Star", C major ─────────
// Two phrases (16 notes):
//   C  C  G  G  | A  A  G   | F  F  E  E  | D  D  C
//   (the classic ABCDEFG opening, ending on the tonic)
// C4=60, D4=62, E4=64, F4=65, G4=67, A4=69
//
// We keep all 14 melody notes; harmony is per-note so the follower's committed
// position directly indexes a chord.

export interface ScoreNote {
  midi: number   // pitch of the melody note
  beats: number  // nominal duration in beats
}

export const REFERENCE: ScoreNote[] = [
  { midi: 60, beats: 1 },   // 0  C4  "Twin-"
  { midi: 60, beats: 1 },   // 1  C4  "-kle"
  { midi: 67, beats: 1 },   // 2  G4  "twin-"
  { midi: 67, beats: 1 },   // 3  G4  "-kle"
  { midi: 69, beats: 1 },   // 4  A4  "lit-"
  { midi: 69, beats: 1 },   // 5  A4  "-tle"
  { midi: 67, beats: 2 },   // 6  G4  "star"
  { midi: 65, beats: 1 },   // 7  F4  "how"
  { midi: 65, beats: 1 },   // 8  F4  "I"
  { midi: 64, beats: 1 },   // 9  E4  "won-"
  { midi: 64, beats: 1 },   // 10 E4  "-der"
  { midi: 62, beats: 1 },   // 11 D4  "what"
  { midi: 62, beats: 1 },   // 12 D4  "you"
  { midi: 60, beats: 2 },   // 13 C4  "are"
]

// ─── Accompaniment (left hand) — functional C major harmony ──────────────────
// Twinkle's standard harmonization: I  I  IV  I  IV  I  V  I ... per pair.
// Each entry: bass MIDI note + chord triad. Fires at the trusted follower's
// committed position. A wrong note over the "right" chord clashes audibly.

export interface Harmony {
  bass: number
  chord: number[]
  roman: string
}

const C_maj: Harmony = { bass: 36, chord: [48, 52, 55], roman: "I" }   // C E G
const F_maj: Harmony = { bass: 41, chord: [48, 53, 57], roman: "IV" }  // F A C
const G_maj: Harmony = { bass: 43, chord: [47, 50, 55], roman: "V" }   // G B D

// Per reference index → harmony. Classic Twinkle changes.
export const HARMONY: Harmony[] = [
  C_maj, // 0  C   I
  C_maj, // 1  C   I
  F_maj, // 2  G   IV  (C over IV is fine; standard reharm)
  C_maj, // 3  G   I
  F_maj, // 4  A   IV
  C_maj, // 5  A   I
  G_maj, // 6  G   V
  C_maj, // 7  F   I
  F_maj, // 8  F   IV
  C_maj, // 9  E   I
  G_maj, // 10 E   V
  G_maj, // 11 D   V
  G_maj, // 12 D   V
  C_maj, // 13 C   I
]

// ─── Keyboard mapping ────────────────────────────────────────────────────────
// Eight home-row keys spanning the C-major scale so a visitor can play the tune
// live — and intentionally fumble (e.g. hit a black-key-adjacent wrong note).
export interface KeyMap {
  key: string
  midi: number
  label: string
}

export const KEY_MAP: KeyMap[] = [
  { key: "a", midi: 60, label: "C" },
  { key: "s", midi: 62, label: "D" },
  { key: "d", midi: 64, label: "E" },
  { key: "f", midi: 65, label: "F" },
  { key: "g", midi: 67, label: "G" },
  { key: "h", midi: 69, label: "A" },
  { key: "j", midi: 71, label: "B" },
  { key: "k", midi: 72, label: "C'" },
]

// ─── Baked "known performance" with DELIBERATE FUMBLES ────────────────────────
// This is the self-verifying centerpiece. It plays hands-free on a phone and,
// in order, contains:
//   (1) a clean opening phrase
//   (2) a WRONG-NOTE RUN (2-3 notes off the score)
//   (3) recovery (back on the score)
//   (4) a SKIP-AHEAD (soloist jumps forward a few notes)
//   (5) a HESITATION (a long pause + repeated note)
//   (6) a clean resolution
//
// Each event carries a `tag` describing what it represents, so the visualizer
// can label the fumble the instant it is played (and the README can map each
// moment to what to observe). The follower itself only consumes midi/vel/dur/dt.

export type FumbleTag =
  | "clean"
  | "wrong"
  | "skip"
  | "hesitate"
  | "resolve"

export interface PerfEvent {
  midi: number
  velocity: number   // 0–127, drives dynamics coupling
  durationMs: number // actual hold duration, drives articulation coupling
  dtMs: number       // delay before this note relative to previous
  tag: FumbleTag     // narrative label for the visualizer (NOT seen by follower)
  note: string       // human label e.g. "wrong note", shown on the timeline
}

// makePerformance builds a reproducible, legible baked performance with fumbles.
// Tempo ~ 120 BPM (500 ms / beat). Velocities give a gentle arc; the fumble
// region is left at a clear mezzo so the wrong notes are unmistakable.
export function makePerformance(): PerfEvent[] {
  const beat = 460 // ms per beat (~130 BPM, brisk but clear)

  // helper to build an event
  const E = (
    midi: number,
    tag: FumbleTag,
    note: string,
    opts: { vel?: number; durMul?: number; dtBeats?: number } = {},
  ): PerfEvent => {
    const vel = opts.vel ?? 84
    const dtBeats = opts.dtBeats ?? 1
    const durMul = opts.durMul ?? 0.85
    return {
      midi,
      velocity: vel,
      durationMs: Math.max(70, beat * dtBeats * durMul),
      dtMs: Math.round(beat * dtBeats),
      tag,
      note,
    }
  }

  return [
    // ── (1) clean opening: "Twinkle twinkle little..." ──────────────────────
    E(60, "clean", "", { vel: 70, dtBeats: 0.9 }),  // C
    E(60, "clean", "", { vel: 74 }),                 // C
    E(67, "clean", "", { vel: 82 }),                 // G
    E(67, "clean", "", { vel: 84 }),                 // G
    E(69, "clean", "", { vel: 90 }),                 // A   (score idx ~4)

    // ── (2) WRONG-NOTE RUN: should be A(69) G(67) G(67)... instead plays
    //         off-key notes. F#(66), D#(63), A#(70) — clearly wrong over IV/I.
    E(66, "wrong", "wrong note", { vel: 92 }),       // F#  ✗
    E(63, "wrong", "wrong note", { vel: 92 }),       // D#  ✗
    E(70, "wrong", "wrong note", { vel: 90 }),       // A#  ✗

    // ── (3) RECOVERY: back onto the score at G "star" then F "how" ──────────
    E(67, "clean", "recovered", { vel: 84, dtBeats: 1.2 }), // G "star" (idx 6)
    E(65, "clean", "", { vel: 80 }),                 // F "how"  (idx 7)
    E(65, "clean", "", { vel: 80 }),                 // F "I"    (idx 8)

    // ── (4) SKIP-AHEAD: soloist jumps forward past E E to D "what" (idx 11),
    //         skipping idx 9,10. The follower must leap forward, not stall.
    E(62, "skip", "skip ahead", { vel: 88, dtBeats: 0.9 }), // D (idx 11)

    // ── (5) HESITATION: long pause, then an accidental repeat of D before
    //         resolving. The follower must hold position, not run away.
    E(62, "hesitate", "hesitation", { vel: 60, dtBeats: 2.4, durMul: 0.5 }), // repeat D after long gap
    E(62, "hesitate", "repeat", { vel: 64, dtBeats: 0.7 }),  // accidental repeat D

    // ── (6) clean RESOLUTION onto the tonic C "are" ────────────────────────
    E(60, "resolve", "resolved", { vel: 78, dtBeats: 1.1, durMul: 1.6 }), // C (idx 13)
  ]
}
