// score.ts — Reference score for Pachelbel's Canon in D (melody excerpt)
// in D major, plus a baked "known performance" with legible expression baked in:
// accelerando through the middle, ritardando at the end, crescendo then
// diminuendo, and a legato phrase followed by a staccato phrase.
//
// The melody (right hand) is the player's part. The accompaniment (functional
// bass + chord per beat) is what the follower triggers, driven by the player's
// committed score position. The follower never sees the score positions — it
// only receives (pitch, time, velocity, duration) tuples and must align + react.

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

// ─── The melody (reference) — Pachelbel Canon in D, main melody ─────────────
// 16-note phrase in D major (MIDI octave 5 for right-hand melody):
//   D  E  F# G  | A  G  F# E  | D  E  F# A  | G  A  B  A
// (D5=74, E5=76, F#5=78, G5=79, A5=81, B5=83)

export interface ScoreNote {
  midi: number   // pitch of the melody note
  beats: number  // nominal duration in beats
}

export const REFERENCE: ScoreNote[] = [
  { midi: 74, beats: 1 }, // D5
  { midi: 76, beats: 1 }, // E5
  { midi: 78, beats: 1 }, // F#5
  { midi: 79, beats: 1 }, // G5
  { midi: 81, beats: 1 }, // A5
  { midi: 79, beats: 1 }, // G5
  { midi: 78, beats: 1 }, // F#5
  { midi: 76, beats: 1 }, // E5
  { midi: 74, beats: 1 }, // D5
  { midi: 76, beats: 1 }, // E5
  { midi: 78, beats: 1 }, // F#5
  { midi: 81, beats: 1 }, // A5
  { midi: 79, beats: 1 }, // G5
  { midi: 81, beats: 1 }, // A5
  { midi: 83, beats: 1.5 }, // B5 (held)
  { midi: 81, beats: 0.5 }, // A5
]

// ─── Accompaniment (left hand) ──────────────────────────────────────────────
// Pachelbel Canon functional bass in D major: I–V–vi–III–IV–I–IV–V
// Each is a bass MIDI note + chord MIDI notes. Fires per committed note.

export interface Harmony {
  bass: number
  chord: number[]
  roman: string
}

const D_maj: Harmony = { bass: 38, chord: [50, 54, 57], roman: "I" }   // D F# A
const A_maj: Harmony = { bass: 33, chord: [49, 52, 57], roman: "V" }   // A C# E
const Bm:    Harmony = { bass: 35, chord: [50, 54, 59], roman: "vi" }  // B D F#
const Fsh_m: Harmony = { bass: 42, chord: [54, 57, 61], roman: "III" } // F# A C#
const G_maj: Harmony = { bass: 31, chord: [50, 55, 59], roman: "IV" }  // G B D

// Per reference index → harmony (Pachelbel's ground bass pattern, adapted).
export const HARMONY: Harmony[] = [
  D_maj,   // D5   I
  A_maj,   // E5   V
  Bm,      // F#5  vi
  Fsh_m,   // G5   III
  G_maj,   // A5   IV
  D_maj,   // G5   I
  G_maj,   // F#5  IV
  A_maj,   // E5   V
  D_maj,   // D5   I
  A_maj,   // E5   V
  Bm,      // F#5  vi
  Fsh_m,   // A5   III
  G_maj,   // G5   IV
  D_maj,   // A5   I
  G_maj,   // B5   IV
  A_maj,   // A5   V
]

// ─── Keyboard mapping ────────────────────────────────────────────────────────
export interface KeyMap {
  key: string
  midi: number
  label: string
}

export const KEY_MAP: KeyMap[] = [
  { key: "a", midi: 74, label: "D" },
  { key: "s", midi: 76, label: "E" },
  { key: "d", midi: 78, label: "F#" },
  { key: "f", midi: 79, label: "G" },
  { key: "g", midi: 81, label: "A" },
  { key: "h", midi: 83, label: "B" },
  { key: "j", midi: 85, label: "C#'" },
  { key: "k", midi: 86, label: "D'" },
]

// ─── Baked "known performance" with rich expression ──────────────────────────
// Expressively rendered with:
//   • Accelerando through the middle (notes 3–10)
//   • Ritardando into the final phrase (notes 11–15)
//   • Crescendo (velocity rises notes 0–8), then diminuendo (falls notes 9–15)
//   • Legato articulation (long note durations) for notes 0–7
//   • Staccato articulation (short note durations) for notes 8–15
//
// Each event: pitch played, velocity (0–127), note duration (ms), and the
// wall-clock delay (ms) BEFORE it sounds relative to the previous note.
// The follower never sees the score positions — it only receives these tuples.

export interface PerfEvent {
  midi: number
  velocity: number  // 0–127, drives dynamics coupling
  durationMs: number // actual hold duration, drives articulation coupling
  dtMs: number      // delay before this note relative to previous
}

// makePerformance builds a reproducible, legible baked performance.
export function makePerformance(): PerfEvent[] {
  const baseBeatMs = 500 // 120 BPM nominal
  const n = REFERENCE.length

  // Deterministic pseudo-random jitter.
  let seed = 2337
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const events: PerfEvent[] = []
  for (let i = 0; i < n; i++) {
    const note = REFERENCE[i]
    const t = i / (n - 1)

    // ── Tempo curve ──────────────────────────────────────────────────────────
    // factor < 1 = faster (accelerando), > 1 = slower (ritardando)
    let tempoFactor: number
    if (t < 0.2) {
      tempoFactor = 1.05                              // slightly slow start
    } else if (t < 0.6) {
      tempoFactor = 1.05 - 0.45 * ((t - 0.2) / 0.4)  // accelerando → 0.60×
    } else {
      tempoFactor = 0.60 + 1.10 * ((t - 0.6) / 0.4)  // big ritardando → 1.70×
    }
    const jitter = 0.93 + 0.14 * rand()
    const prevBeats = i === 0 ? 1 : REFERENCE[i - 1].beats
    const dtMs = i === 0 ? 400 : prevBeats * baseBeatMs * tempoFactor * jitter

    // ── Velocity curve (dynamics) ─────────────────────────────────────────────
    // Crescendo peaks at note 8, then diminuendo to the end.
    let velocity: number
    if (t < 0.5) {
      // Crescendo: pp (40) → ff (110)
      velocity = Math.round(40 + 70 * (t / 0.5))
    } else {
      // Diminuendo: ff (110) → mp (55)
      velocity = Math.round(110 - 55 * ((t - 0.5) / 0.5))
    }
    velocity = Math.max(30, Math.min(127, velocity + Math.round((rand() - 0.5) * 10)))

    // ── Articulation curve ───────────────────────────────────────────────────
    // First half: legato (80–95% of IOI). Second half: staccato (20–35% of IOI).
    const ioi = prevBeats * baseBeatMs * tempoFactor
    let articulationRatio: number
    if (i < 8) {
      articulationRatio = 0.85 + 0.10 * rand()  // legato
    } else {
      articulationRatio = 0.22 + 0.13 * rand()  // staccato
    }
    const durationMs = Math.max(60, ioi * articulationRatio)

    events.push({ midi: note.midi, velocity, durationMs, dtMs })
  }
  return events
}
