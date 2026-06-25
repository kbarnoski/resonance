// Voice-leading harmony engine for 941-kids-choir-bloom.
//
// Principle (Aldwell & Schachter, "Harmony and Voice Leading"):
// inner/lower voices move to the NEAREST chord tone, producing smooth
// voice-leading. The child conducts the soprano (lead) melody; the chord
// implied by the soprano's scale degree drives the other three voices, each
// gliding to the closest tone of that chord to its current pitch.

// C-major diatonic scale, expressed as MIDI note numbers across the range the
// four creatures can sing. We snap dragged pitches to this set so there are no
// wrong notes, but the child genuinely chooses which note (and thus melody).
//
// We define one octave of C-major as pitch-classes, then expand across octaves.
const C_MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B (semitone offsets)

// Build the full ladder of diatonic MIDI notes from low bass to high soprano.
// MIDI 36 = C2 ... MIDI 84 = C6. This spans the choir comfortably.
export const SCALE_MIDI: number[] = (() => {
  const out: number[] = [];
  for (let m = 36; m <= 84; m++) {
    if (C_MAJOR_PCS.includes(((m % 12) + 12) % 12)) out.push(m);
  }
  return out;
})();

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Snap an arbitrary (possibly fractional) MIDI value to the nearest diatonic
// scale note within a clamped [lo, hi] window.
export function snapToScale(midi: number, lo: number, hi: number): number {
  let best = SCALE_MIDI[0];
  let bestDist = Infinity;
  for (const s of SCALE_MIDI) {
    if (s < lo || s > hi) continue;
    const d = Math.abs(s - midi);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

// The four voices, low to high index. Each has a comfortable MIDI window.
export type VoiceId = "bass" | "tenor" | "alto" | "soprano";

export interface VoiceRange {
  id: VoiceId;
  lo: number; // lowest MIDI it will sing
  hi: number; // highest MIDI it will sing
}

// Ranges deliberately overlap a little but keep voices stacked low→high.
export const VOICE_RANGES: VoiceRange[] = [
  { id: "bass", lo: 40, hi: 57 }, // E2 .. A3
  { id: "tenor", lo: 48, hi: 64 }, // C3 .. E4
  { id: "alto", lo: 55, hi: 72 }, // G3 .. C5
  { id: "soprano", lo: 60, hi: 81 }, // C4 .. A5 (the lead the child drags)
];

// Diatonic triads built on each scale degree of C major (root, third, fifth)
// as pitch-classes. Index 0 => degree 1 (I), 1 => degree 2 (ii), etc.
// I=C  ii=Dm  iii=Em  IV=F  V=G  vi=Am  (vii° omitted — we map degree 7 → V).
const DEGREE_TRIAD_PCS: number[][] = [
  [0, 4, 7], // I   C E G
  [2, 5, 9], // ii  D F A
  [4, 7, 11], // iii E G B
  [5, 9, 0], // IV  F A C
  [7, 11, 2], // V   G B D
  [9, 0, 4], // vi  A C E
  [7, 11, 2], // (deg 7) -> treat as V for kids
];

// Given a soprano MIDI note, return which diatonic chord it implies.
// We look at the soprano's scale degree (its pitch-class within C major).
export function chordForSoprano(sopranoMidi: number): { degree: number; pcs: number[] } {
  const pc = ((sopranoMidi % 12) + 12) % 12;
  // Map pitch-class to degree index 0..6.
  const idx = C_MAJOR_PCS.indexOf(pc);
  const degree = idx >= 0 ? idx : 0;
  return { degree, pcs: DEGREE_TRIAD_PCS[degree] };
}

// For a single voice, find the nearest MIDI note (within its range) whose
// pitch-class is one of the chord tones, closest to `currentMidi`.
function nearestChordTone(currentMidi: number, pcs: number[], range: VoiceRange): number {
  let best = currentMidi;
  let bestDist = Infinity;
  for (let m = range.lo; m <= range.hi; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (!pcs.includes(pc)) continue;
    const d = Math.abs(m - currentMidi);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

// Given the conducted soprano note and the current positions of the lower
// three voices, return the new target MIDI for bass/tenor/alto via nearest
// voice-leading. Soprano is returned unchanged (the child owns it).
export interface VoiceTargets {
  bass: number;
  tenor: number;
  alto: number;
  soprano: number;
}

export function voiceLead(
  sopranoMidi: number,
  current: { bass: number; tenor: number; alto: number },
): VoiceTargets {
  const { pcs } = chordForSoprano(sopranoMidi);
  const ranges = Object.fromEntries(VOICE_RANGES.map((r) => [r.id, r])) as Record<
    VoiceId,
    VoiceRange
  >;

  let bass = nearestChordTone(current.bass, pcs, ranges.bass);
  const tenor = nearestChordTone(current.tenor, pcs, ranges.tenor);
  let alto = nearestChordTone(current.alto, pcs, ranges.alto);

  // Encourage the bass toward the chord root for a clearer harmonic floor:
  // pick the lowest in-range note matching the root pitch-class that is still
  // reasonably near the current bass.
  const rootPc = pcs[0];
  let rootCandidate = bass;
  let rootDist = Infinity;
  for (let m = ranges.bass.lo; m <= ranges.bass.hi; m++) {
    if ((((m % 12) + 12) % 12) !== rootPc) continue;
    const d = Math.abs(m - current.bass);
    if (d < rootDist) {
      rootDist = d;
      rootCandidate = m;
    }
  }
  // Only adopt the root if it is not a wild leap (keeps motion smooth).
  if (Math.abs(rootCandidate - bass) <= 4) bass = rootCandidate;

  // Avoid two inner voices landing on the exact same note (thin sound):
  // if tenor === alto, nudge alto to the next chord tone above.
  if (alto === tenor) {
    for (let m = alto + 1; m <= ranges.alto.hi; m++) {
      if (pcs.includes((((m % 12) + 12) % 12))) {
        alto = m;
        break;
      }
    }
  }

  return { bass, tenor, alto, soprano: sopranoMidi };
}

// Consonance / "bloom" measure in [0,1]: how tightly the four pitches form a
// nice close-voiced chord. We reward small spread between adjacent voices and
// the soprano sitting within an octave of the bass.
export function consonance(t: VoiceTargets): number {
  const spread = t.soprano - t.bass; // semitones
  // Ideal full-choir spread is roughly 12..19 semitones (octave+). Penalize
  // very wide or collapsed voicings.
  const ideal = 16;
  const s = 1 - Math.min(1, Math.abs(spread - ideal) / 16);
  // Reward inner voices being evenly stacked.
  const gaps = [t.tenor - t.bass, t.alto - t.tenor, t.soprano - t.alto].map(Math.abs);
  const even = 1 - Math.min(1, (Math.max(...gaps) - Math.min(...gaps)) / 12);
  return Math.max(0, Math.min(1, 0.5 * s + 0.5 * even));
}

// A gentle diatonic tune for the auto-demo (soprano scale-degree path).
// Expressed as soprano MIDI notes — a calm rising/falling phrase.
export const DEMO_MELODY: number[] = [
  67, 69, 72, 71, 69, 67, 64, 65, 67, 72, 71, 67, 64, 67, 69, 67,
];
