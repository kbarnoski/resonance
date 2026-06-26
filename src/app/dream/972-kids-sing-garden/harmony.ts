// Functional harmony + voice-leading engine.
//
// The child's voice is the MELODY. We snap the sung Hz to the nearest scale
// degree of a fixed diatonic mode (C major here) so it is always "in tune"
// (no wrong notes). Underneath, each scale degree implies its diatonic triad
// (1->I, 2->ii, 3->iii, 4->IV, 5->V, 6->vi, 7->vii deg) and a real three-voice
// accompaniment + bass voice-LEADS to the nearest chord tones — common tones
// kept, other voices moved by the smallest interval (Aldwell & Schachter).
//
// This is deliberately NOT pentatonic-no-wrong-notes: there is genuine
// functional motion (real ii/V/I, real leading-tone resolution) underneath.

export type ChordFunction = "tonic" | "subdominant" | "dominant" | "predom";

export interface DegreeInfo {
  degree: number; // 1..7
  fn: ChordFunction;
  /** Hex color encoding harmonic function for the bloom. */
  color: string;
  label: string; // roman numeral, for the design notes only
}

export interface ChordEvent {
  degree: number;
  /** MIDI note of the bass voice. */
  bass: number;
  /** MIDI notes of the 3 upper accompaniment voices (already voice-led). */
  voices: number[];
  fn: ChordFunction;
  color: string;
  /** True when this event is a real V->I (or vii->I) cadential resolution. */
  cadence: boolean;
}

// --- Mode -------------------------------------------------------------------
// C major. Tonic C = MIDI 60 reference for snapping; degrees as scale steps.
const ROOT_MIDI = 60; // C4 reference for melody snapping
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]; // semitone offsets of degrees 1..7

// Diatonic triads as root-position chord tones (semitone offsets from C),
// expressed as scale-degree-rooted stacks. Index 0 == degree 1.
// Each triad: root, third, fifth as absolute semitone offsets from tonic C.
const TRIADS: number[][] = [
  [0, 4, 7], //  I   C  E  G   (major  / tonic)
  [2, 5, 9], //  ii  D  F  A   (minor  / predominant)
  [4, 7, 11], // iii E  G  B   (minor)
  [5, 9, 12], // IV  F  A  C   (major  / subdominant)
  [7, 11, 14], // V  G  B  D   (major  / dominant)
  [9, 12, 16], // vi A  C  E   (minor)
  [11, 14, 17], // vii dim B D F (diminished / dominant)
];

const FUNCTIONS: ChordFunction[] = [
  "tonic", // I
  "predom", // ii
  "tonic", // iii (tonic substitute)
  "subdominant", // IV
  "dominant", // V
  "tonic", // vi (tonic substitute)
  "dominant", // vii dim
];

const LABELS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

// Function colors (the visible language of the garden):
//   tonic        = warm gold (home)
//   dominant     = orange (tension)
//   subdominant  = green
//   predominant  = cooler teal/blue
//   minor triads lean cooler regardless (blues / violets)
const FUNCTION_COLOR: Record<ChordFunction, string> = {
  tonic: "#f7c948", // warm gold
  dominant: "#fb7a3c", // orange
  subdominant: "#3fae6b", // green
  predom: "#4b86c9", // cool blue
};

// vi and iii are tonic-function but minor — tint them violet/indigo so the
// garden reads "cool minor" rather than pure gold.
const MINOR_TINT: Record<number, string> = {
  3: "#8b7fd6", // iii -> violet
  6: "#6f8bd8", // vi  -> indigo-blue
  2: "#4b86c9", // ii
  7: "#c98bd0", // vii dim -> dusky orchid (still dominant pull)
};

export function degreeInfo(degree: number): DegreeInfo {
  const i = degree - 1;
  const fn = FUNCTIONS[i];
  const color = MINOR_TINT[degree] ?? FUNCTION_COLOR[fn];
  return { degree, fn, color, label: LABELS[i] };
}

/** All 7 degrees, lowest sung octave first — used to build the sing-pads. */
export function allDegrees(): DegreeInfo[] {
  return [1, 2, 3, 4, 5, 6, 7].map(degreeInfo);
}

// --- Melody snapping --------------------------------------------------------

/** Snap a sung Hz to the nearest scale degree (1..7). Returns the degree and
 *  the snapped MIDI note of the melody (in whatever octave was sung). */
export function snapToDegree(hz: number): { degree: number; melodyMidi: number } {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const rel = midi - ROOT_MIDI;
  const octave = Math.floor(rel / 12);
  const within = rel - octave * 12; // 0..11 within the octave

  // nearest diatonic step within the octave
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MAJOR_STEPS.length; i++) {
    const d = Math.abs(within - MAJOR_STEPS[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const snappedSemis = MAJOR_STEPS[best] + octave * 12;
  const melodyMidi = ROOT_MIDI + snappedSemis;
  return { degree: best + 1, melodyMidi };
}

// --- Voice leading ----------------------------------------------------------

const ACCOMP_CENTER = 60; // keep upper voices clustered around C4
const BASS_CENTER = 43; // around G2

/** Place a pitch-class (0..11 from C) in the octave nearest a target MIDI. */
function placeNear(pcOffset: number, target: number): number {
  // pcOffset already a semitone offset from C; find octave nearest target.
  let m = 60 + pcOffset; // start near C4
  while (m - target > 6) m -= 12;
  while (target - m > 6) m += 12;
  return m;
}

/**
 * Build the next chord event for a sung degree, voice-leading the three upper
 * voices from their previous positions to the nearest chord tones, and moving
 * the bass to the chord root in the bass register.
 *
 * Cadence logic: leading tone (7) or 5 immediately followed by 1 leans the
 * harmony toward a real V (then resolves on the next tonic), so the child hears
 * tension build and release.
 */
export function runVoiceLeading(
  degree: number,
  prevVoices: number[] | null,
  prevDegree: number | null
): ChordEvent {
  let chordDegree = degree;
  let cadence = false;

  // If the child sings the leading tone, treat the underlying harmony as a
  // real dominant (V) so the next tonic feels like a resolution.
  if (degree === 7) {
    chordDegree = 5; // borrow V's stable triad under the leading tone melody
  }

  // 5 -> 1 or 7 -> 1: this landing IS the cadence; mark it.
  if (degree === 1 && (prevDegree === 5 || prevDegree === 7)) {
    cadence = true;
  }

  const triad = TRIADS[chordDegree - 1];
  const fn = FUNCTIONS[chordDegree - 1];
  const color = MINOR_TINT[degree] ?? FUNCTION_COLOR[fn];

  // Candidate upper-voice pitches: the three triad tones placed near center.
  const targets = triad.map((off) => placeNear(off % 12, ACCOMP_CENTER));

  let voices: number[];
  if (!prevVoices || prevVoices.length !== 3) {
    voices = [...targets].sort((a, b) => a - b);
  } else {
    // Greedy nearest assignment: for each previous voice, pick the closest
    // unused triad tone (common-tone retention falls out naturally).
    const used = [false, false, false];
    voices = prevVoices.map((pv) => {
      let bi = -1;
      let bd = Infinity;
      for (let i = 0; i < targets.length; i++) {
        if (used[i]) continue;
        // allow octave shift of the target to minimise motion
        let t = targets[i];
        while (t - pv > 6) t -= 12;
        while (pv - t > 6) t += 12;
        const d = Math.abs(t - pv);
        if (d < bd) {
          bd = d;
          bi = i;
          targets[i] = t;
        }
      }
      used[bi] = true;
      return targets[bi];
    });
    voices.sort((a, b) => a - b);
  }

  const rootPc = triad[0] % 12;
  const bass = placeNear(rootPc, BASS_CENTER);

  return { degree, bass, voices, fn, color, cadence };
}

/** MIDI -> Hz. */
export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** The always-on tonic drone roots (C2 + C3) for the pad. */
export const DRONE_MIDIS = [36, 48];

/** A short auto-demo phrase (scale degrees) that ends 7 -> 1 — a real cadence,
 *  so a hands-free glance both sees the garden grow and hears tension resolve. */
export const DEMO_PHRASE: number[] = [1, 3, 5, 6, 4, 5, 7, 1];
