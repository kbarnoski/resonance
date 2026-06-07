// score.ts — Reference score for "Ode to Joy" (Beethoven, Symphony No. 9 theme)
// in D major, plus a baked "known performance" with expressive rubato that the
// built-in demo plays note-by-note against the follower.
//
// The melody (right hand) is the player's part. The accompaniment (functional
// bass + chord per beat) is what the follower triggers, locked to the player's
// committed score position.

// ─── Pitch helpers ──────────────────────────────────────────────────────────

// MIDI note number → frequency (A4 = 69 = 440 Hz).
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

// MIDI note number → note name with octave (e.g. 62 → "D3").
export function midiToName(m: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
}

// ─── The melody (reference) ─────────────────────────────────────────────────
// Classic first phrase of Ode to Joy in D major. Each entry is a MIDI pitch and
// a nominal duration in beats. The first phrase:
//   F# F# G  A  | A  G  F# E  | D  D  E  F# | F#. E  E
// (in D major; F#=66, G=67, A=69, E=64, D=62)

export interface ScoreNote {
  midi: number   // pitch of the melody note
  beats: number  // nominal duration in beats
}

export const REFERENCE: ScoreNote[] = [
  { midi: 66, beats: 1 }, // F#
  { midi: 66, beats: 1 }, // F#
  { midi: 67, beats: 1 }, // G
  { midi: 69, beats: 1 }, // A
  { midi: 69, beats: 1 }, // A
  { midi: 67, beats: 1 }, // G
  { midi: 66, beats: 1 }, // F#
  { midi: 64, beats: 1 }, // E
  { midi: 62, beats: 1 }, // D
  { midi: 62, beats: 1 }, // D
  { midi: 64, beats: 1 }, // E
  { midi: 66, beats: 1 }, // F#
  { midi: 66, beats: 1.5 }, // F#.
  { midi: 64, beats: 0.5 }, // E
  { midi: 64, beats: 2 }, // E (held)
]

// ─── Accompaniment (left hand) ──────────────────────────────────────────────
// One harmony per reference-note index. Functional bass in D major:
// I (D), V (A), vi (Bm), IV (G). Each is a bass MIDI note + chord MIDI notes.
// The follower fires the chord for the reference index it has committed to.

export interface Harmony {
  bass: number
  chord: number[]
  roman: string
}

const D_maj: Harmony = { bass: 38, chord: [50, 54, 57], roman: "I" }   // D F# A
const A_maj: Harmony = { bass: 33, chord: [49, 52, 57], roman: "V" }   // A C# E
const Bm:    Harmony = { bass: 35, chord: [50, 54, 59], roman: "vi" }  // B D F#
const G_maj: Harmony = { bass: 31, chord: [50, 55, 59], roman: "IV" }  // G B D

// Per reference index → harmony. Reasoned voice-leading under the melody.
export const HARMONY: Harmony[] = [
  D_maj, // F#  I
  D_maj, // F#  I
  G_maj, // G   IV
  D_maj, // A   I
  D_maj, // A   I
  G_maj, // G   IV
  D_maj, // F#  I
  A_maj, // E   V
  Bm,    // D   vi
  Bm,    // D   vi
  A_maj, // E   V
  D_maj, // F#  I
  D_maj, // F#  I
  A_maj, // E   V
  D_maj, // E→  I (resolution)
]

// ─── The pitch palette for the computer keyboard ────────────────────────────
// Eight home-row keys mapped to the pitches that appear in the melody, low→high.
// D E F# G A  (plus octave/extra so all melody pitches are reachable).

export interface KeyMap {
  key: string   // keyboard char
  midi: number
  label: string // note name
}

export const KEY_MAP: KeyMap[] = [
  { key: "a", midi: 62, label: "D" },
  { key: "s", midi: 64, label: "E" },
  { key: "d", midi: 66, label: "F#" },
  { key: "f", midi: 67, label: "G" },
  { key: "g", midi: 69, label: "A" },
  { key: "h", midi: 71, label: "B" },
  { key: "j", midi: 73, label: "C#" },
  { key: "k", midi: 74, label: "D'" },
]

// ─── Baked "known performance" with rubato ──────────────────────────────────
// A human-like rendering of the melody: an opening that pushes ahead
// (accelerando), a relaxed middle, and a ritardando into the final held note,
// plus small per-note timing jitter. Emitted note-by-note by the demo player.
//
// Each event: the pitch played, and the wall-clock delay (ms) BEFORE it sounds
// relative to the previous note. The follower never sees the score positions —
// it only receives pitches over time and must align them.

export interface PerfEvent {
  midi: number
  dtMs: number // delay before this note relative to previous
}

// Build the performance from REFERENCE with an expressive tempo curve.
export function makePerformance(): PerfEvent[] {
  const baseBeatMs = 480 // ~125 BPM nominal
  const n = REFERENCE.length
  // Deterministic pseudo-jitter so the demo is reproducible.
  let seed = 1337
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const events: PerfEvent[] = []
  for (let i = 0; i < n; i++) {
    const note = REFERENCE[i]
    // Tempo curve: factor <1 = faster (rushing), >1 = slower (dragging).
    const t = i / (n - 1)
    let factor: number
    if (t < 0.35) {
      factor = 1.0 - 0.32 * (t / 0.35)          // accelerando: down to 0.68×
    } else if (t < 0.7) {
      factor = 0.68 + 0.15 * ((t - 0.35) / 0.35) // ease back toward steady
    } else {
      factor = 0.83 + 0.9 * ((t - 0.7) / 0.3)    // big ritardando: up to ~1.73×
    }
    const jitter = 0.9 + 0.2 * rand() // ±10% per-note timing jitter
    const prevBeats = i === 0 ? 1 : REFERENCE[i - 1].beats
    const dtMs = i === 0 ? 300 : prevBeats * baseBeatMs * factor * jitter
    events.push({ midi: note.midi, dtMs })
  }
  return events
}
