// ════════════════════════════════════════════════════════════════════════════
// harmony.ts — REAL functional harmony (1027 Kids Chaos Aurora)
//
// NOT pentatonic "no wrong notes". This is a genuine diatonic progression in
// C major — I – vi – IV – V — that advances on a slow clock. At any instant the
// chaotic lower bob is SNAPPED to a chord tone of the CURRENT chord, so the
// melody is always consonant with the live harmony (never "wrong") yet, because
// the source is deterministic chaos, the tune never loops.
//
// Pure functions only (no DOM) so the test can verify snapping stays in-key.
// ════════════════════════════════════════════════════════════════════════════

// Equal-temperament frequency for a MIDI note number.
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// The progression as root MIDI + chord-tone semitone offsets (triads, C major).
// C4 = 60.  I = C major, vi = A minor, IV = F major, V = G major.
export interface Chord {
  name: string;
  rootMidi: number;
  tones: number[]; // semitone offsets from root forming the triad
}

export const PROGRESSION: Chord[] = [
  { name: "I (C)", rootMidi: 60, tones: [0, 4, 7] }, // C E G
  { name: "vi (Am)", rootMidi: 57, tones: [0, 3, 7] }, // A C E
  { name: "IV (F)", rootMidi: 53, tones: [0, 4, 7] }, // F A C
  { name: "V (G)", rootMidi: 55, tones: [0, 4, 7] }, // G B D
];

export const CHORD_SECONDS = 4; // each chord lasts ~4s

// Which chord is live at elapsed time t (seconds).
export function chordIndexAt(t: number): number {
  return Math.floor(t / CHORD_SECONDS) % PROGRESSION.length;
}

// The full set of pitch classes available in a chord, across several octaves.
// Returns MIDI notes spanning a kid-friendly comfortable register.
export function chordToneMidis(chord: Chord, octaveSpan = 3): number[] {
  const out: number[] = [];
  for (let oct = 0; oct < octaveSpan; oct++) {
    for (const semi of chord.tones) {
      out.push(chord.rootMidi + semi + 12 * oct);
    }
  }
  return out.sort((a, b) => a - b);
}

// SNAP: given a normalized height/angle value `h` in [0,1] (high bob = high
// pitch), an octave bias from energy, and the current chord, return the chord
// tone (as a frequency) nearest to the desired pitch. ALWAYS returns a member
// of the current chord — that is the in-key guarantee the test checks.
export function snapToChord(
  h: number,
  chord: Chord,
  octaveBias = 0,
): number {
  const clamped = Math.max(0, Math.min(1, h));
  const candidates = chordToneMidis(chord, 3);
  const lo = candidates[0];
  const hi = candidates[candidates.length - 1];
  const desired = lo + clamped * (hi - lo) + octaveBias * 12;

  let best = candidates[0];
  let bestDist = Infinity;
  for (const m of candidates) {
    const d = Math.abs(m - desired);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return midiToFreq(best);
}

// Convenience: the set of valid frequencies for a chord (used by the test).
export function chordFreqSet(chord: Chord): Set<number> {
  return new Set(chordToneMidis(chord, 3).map((m) => midiToFreq(m)));
}

// The drone pad's two root-ish frequencies for the current chord (so the pad
// also moves with the harmony but stays soft and low).
export function dronePadFreqs(chord: Chord): [number, number] {
  return [
    midiToFreq(chord.rootMidi - 12), // root, one octave down
    midiToFreq(chord.rootMidi + chord.tones[2] - 12), // fifth, octave down
  ];
}
