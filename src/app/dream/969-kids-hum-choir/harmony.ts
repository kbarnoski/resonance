// harmony.ts — real functional harmony in C major, with voice-leading.
//
// We deliberately do NOT use a "can't-be-wrong" pentatonic scale. The whole
// point of this toy is that a child can cause real *tension* (lean on the
// dominant / leading tone) and real *resolution* (land home on the tonic).
// That requires functional triads (I ii iii IV V vi viio) and minimal-motion
// voice-leading between them. See Aldwell & Schachter, Harmony and Voice
// Leading, for the underlying theory of triadic harmony + voice-leading.

// C major, one octave of scale degrees expressed as semitone offsets from C.
// degree index 0..6  ->  C D E F G A B
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

export const DEGREE_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;

// Roman-numeral label for each scale-degree's diatonic triad (for the UI).
export const DEGREE_ROMAN = [
  "I", // C  E  G   tonic
  "ii", // D  F  A   supertonic
  "iii", // E  G  B   mediant
  "IV", // F  A  C   subdominant
  "V", // G  B  D   dominant  (tension!)
  "vi", // A  C  E   submediant
  "vii°", // B  D  F   leading-tone (strong tension!)
] as const;

export type Degree = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// A chord is the set of MIDI notes that are sounding: the child's lead note
// plus the three companion creature voices.
export interface Chord {
  degree: Degree;
  roman: string;
  name: string;
  lead: number; // child's (snapped) MIDI note
  voices: [number, number, number]; // three companion MIDI notes
  /** 0 = fully at rest (tonic), 1 = maximum harmonic tension. */
  tension: number;
}

const C4 = 60; // middle C = MIDI 60

/** Nearest MIDI note for a frequency (equal temperament, A4=440). */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Snap an arbitrary (possibly fractional) MIDI pitch to the nearest note that
 * belongs to C major, in any octave. Returns the snapped MIDI integer and the
 * scale degree (0..6) it represents. A wobbly kid hum of, say, 61.4 will snap
 * to 60 (C) — degree 0.
 */
export function snapToCMajor(midiFloat: number): { midi: number; degree: Degree } {
  const round = Math.round(midiFloat);
  let best = round;
  let bestDist = Infinity;
  // Search a couple of semitones either side for the nearest in-scale note.
  for (let m = round - 2; m <= round + 2; m++) {
    const pc = ((m % 12) + 12) % 12;
    if ((MAJOR_SCALE as readonly number[]).includes(pc)) {
      const d = Math.abs(m - midiFloat);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
  }
  const pc = ((best % 12) + 12) % 12;
  const degree = MAJOR_SCALE.indexOf(pc as (typeof MAJOR_SCALE)[number]) as Degree;
  return { midi: best, degree };
}

/**
 * The diatonic triad built on a scale degree, as semitone offsets from C in
 * the *home* octave. I=C E G, ii=D F A, iii=E G B, IV=F A C, V=G B D,
 * vi=A C E, viio=B D F. Stacked thirds within the C-major scale.
 */
export function triadForDegree(degree: Degree): [number, number, number] {
  const root = MAJOR_SCALE[degree];
  const third = MAJOR_SCALE[(degree + 2) % 7] + (degree + 2 >= 7 ? 12 : 0);
  const fifth = MAJOR_SCALE[(degree + 4) % 7] + (degree + 4 >= 7 ? 12 : 0);
  return [root, third, fifth];
}

/**
 * How much harmonic tension a degree carries. The dominant (V) and the
 * leading-tone triad (viio) want to resolve to the tonic; the tonic (I) and
 * its relatives are at rest. This scalar drives the "lean" of the creatures
 * and a slight detune/brightening in the synth.
 */
export function tensionForDegree(degree: Degree): number {
  switch (degree) {
    case 0:
      return 0.0; // I  — home, fully resolved
    case 5:
      return 0.12; // vi — gentle, a soft relative
    case 3:
      return 0.28; // IV — pre-dominant pull
    case 1:
      return 0.4; // ii — pre-dominant
    case 2:
      return 0.5; // iii
    case 4:
      return 0.85; // V  — the dominant: strong pull home
    case 6:
      return 1.0; // viio — leading tone: maximum lean
    default:
      return 0;
  }
}

/**
 * Minimal-motion voice-leading. Given the three companion notes currently
 * sounding (`from`) and a set of pitch-classes we want the new chord to cover
 * (`targetTones`, semitone offsets from C), assign each companion the nearest
 * available chord tone so the creatures GLIDE rather than leap between chords.
 *
 * Greedy nearest-tone assignment over a comfortable register around middle C.
 */
export function voiceLead(
  from: [number, number, number],
  targetTones: [number, number, number],
  centerMidi = C4,
): [number, number, number] {
  // Candidate absolute MIDI notes for each target pitch-class, in the two
  // octaves bracketing the center, so voices can move up or down minimally.
  const baseOct = Math.floor((centerMidi - 0) / 12) * 12; // octave start near center

  const result: number[] = [];
  const used = new Set<number>();
  // Sort companion voices by current pitch so low voices tend to take low
  // targets — keeps the choir from crossing awkwardly.
  const order = [0, 1, 2].sort((a, b) => from[a] - from[b]);

  for (const idx of order) {
    const prev = from[idx];
    let best = prev;
    let bestDist = Infinity;
    for (const tone of targetTones) {
      for (let oct = -1; oct <= 2; oct++) {
        const cand = baseOct + tone + oct * 12;
        if (used.has(cand)) continue;
        const dist = Math.abs(cand - prev);
        if (dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
    }
    used.add(best);
    result[idx] = best;
  }
  return [result[0], result[1], result[2]];
}

/**
 * Build the full sounding chord for a snapped lead pitch. We keep the child's
 * own note as the melody (lead) and voice-lead the three companions to the
 * other tones of the diatonic triad so they move smoothly as the child slides.
 */
export function chordForLead(
  leadMidi: number,
  degree: Degree,
  prevVoices: [number, number, number],
): Chord {
  const triad = triadForDegree(degree);
  const leadPc = ((leadMidi % 12) + 12) % 12;

  // The companions cover the *other* two triad tones, plus a doubling (usually
  // the root an octave away) to give the choir a full three-voice body. We
  // pick the doubling to be whichever tone gives the warmest, fullest triad:
  // double the root for stability, the fifth for openness.
  const triadPcs = triad.map((t) => ((t % 12) + 12) % 12);
  const others = triadPcs.filter((pc) => pc !== leadPc);
  // Double the root for a stable, warm body under the child's lead.
  const doubling = triadPcs[0];

  const targetTones: [number, number, number] = [
    others[0] ?? triadPcs[0],
    others[1] ?? triadPcs[1],
    doubling,
  ];

  // Voice-lead, centered a bit below the lead so the choir sits underneath.
  const center = Math.max(48, Math.min(67, leadMidi - 4));
  const voices = voiceLead(prevVoices, targetTones, center);

  return {
    degree,
    roman: DEGREE_ROMAN[degree],
    name: DEGREE_NAMES[degree],
    lead: leadMidi,
    voices,
    tension: tensionForDegree(degree),
  };
}
