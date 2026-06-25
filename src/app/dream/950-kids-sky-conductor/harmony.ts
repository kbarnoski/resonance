// harmony.ts — the musical idea, in one place.
//
// Two interlocking roles make REAL chord-over-melody music:
//   • the CONDUCTOR chooses the harmonic CONTEXT (which warm chord the sky is on)
//     and the tempo.
//   • the PLAYER drops melody notes that are SNAPPED into chord tones of the
//     conductor's CURRENT chord — so every tap harmonizes, no wrong note exists.
//
// This is deliberately SOCIAL/STRUCTURAL harmony (two complementary parts), not
// an automatic voice-leading engine. The structure comes from the role split.
// (cf. Orff Schulwerk children's-ensemble pedagogy; The Hub / League of
// Automatic Music Composers — small messages travel, each node sounds locally.)

// A warm, friendly I–IV–V–vi progression in C major. Every chord here is a
// consonant triad a 4-year-old's ear loves; moving between them is the
// "the sky changed color" moment.
export type Chord = {
  name: string // human label, e.g. "C"
  root: number // MIDI root for the pad bass
  // chord tones as MIDI notes, low → high, spanning a couple of octaves so the
  // player can reach "higher = brighter" notes. All are triad tones of `name`.
  tones: number[]
  // 0..1 hue that colors the whole sky for this chord. Warm, candy, distinct.
  hue: number
}

// MIDI helpers (A4 = 69 = 440Hz).
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

// I–IV–V–vi : C major, F major, G major, A minor.
// Each chord exposes a wide spread of its own triad tones (root/3rd/5th across
// octaves) so the player's vertical taps always land ON the chord.
export const PROGRESSION: Chord[] = [
  {
    name: 'C',
    root: 48, // C3
    tones: [60, 64, 67, 72, 76, 79, 84], // C E G C E G C
    hue: 0.08, // warm gold
  },
  {
    name: 'F',
    root: 41, // F2
    tones: [60, 65, 69, 72, 77, 81, 84], // C F A C F A C
    hue: 0.95, // rose / coral
  },
  {
    name: 'G',
    root: 43, // G2
    tones: [59, 62, 67, 71, 74, 79, 83], // B D G B D G B
    hue: 0.55, // sky cyan
  },
  {
    name: 'Am',
    root: 45, // A2
    tones: [60, 64, 69, 72, 76, 81, 84], // C E A C E A C
    hue: 0.72, // soft violet
  },
]

export const PROGRESSION_LEN = PROGRESSION.length

// Snap a vertical tap (y01: 0 = top of screen, 1 = bottom) to a chord tone of
// the given chord. Top of screen = highest/brightest tone, bottom = lowest.
// The result is ALWAYS a member of the chord → harmony is guaranteed.
export function voiceTap(chord: Chord, y01: number): number {
  const yUp = 1 - Math.min(1, Math.max(0, y01)) // flip so up = high
  const n = chord.tones.length
  const i = Math.min(n - 1, Math.max(0, Math.round(yUp * (n - 1))))
  return chord.tones[i]
}

// Tempo: the conductor's horizontal sweep (x01: 0 left .. 1 right) picks a
// gentle, kid-safe BPM. Slow and calm at the left, a touch livelier at right.
export const BPM_MIN = 60
export const BPM_MAX = 108
export function sweepToBpm(x01: number): number {
  const x = Math.min(1, Math.max(0, x01))
  return Math.round(BPM_MIN + x * (BPM_MAX - BPM_MIN))
}

// Beats per chord change in the conductor's gentle auto-walk through the
// progression. Long enough that each "sky color" is felt.
export const BEATS_PER_CHORD = 8
