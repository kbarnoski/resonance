// ════════════════════════════════════════════════════════════════════════════
// STRETTO (1242) — the canon engine
//
// THE ONE QUESTION: what if Resonance could answer your single melodic line with
// a real CANON — delayed, transposed, inverted imitative voices that chase your
// line and self-adjust to stay consonant — building into a stretto?
//
// This is the DEEPENING of 1218-shadow. Where shadow made *homophonic* block
// chords under a melody, this makes *imitative POLYPHONY*: every extra voice is a
// time-shifted, interval-transposed (and optionally inverted / augmented) copy of
// the SAME subject — a fugal answer, not a chord. That imitation is the whole
// point.
//
// Lineage: the canon tradition — J.S. Bach's canons in the *Musical Offering* and
// the *Goldberg Variations* (canons at the unison, 2nd, 3rd … through the ninth,
// including canon by inversion and by augmentation); Fux species counterpoint for
// the consonant/dissonant classification. No neural net: a tiny diatonic engine
// proves the imitation + self-correction works fully client-side.
// ════════════════════════════════════════════════════════════════════════════

export type ModeName = "ionian" | "dorian" | "aeolian";

// Diatonic scales as semitone offsets from the tonic. Dorian is the default —
// its raised 6th gives the imitative texture a bright, modal, "early-music" cast.
export const SCALES: Record<ModeName, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11], // major
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], // natural minor
};

// The subject is drawn on an integer beat-grid: this many quarter-note steps.
export const STEPS = 8;

// The tonic MIDI note the subject is built from (D4). Comes voices transpose
// diatonically around it, so everything stays inside the chosen mode.
export const ROOT_MIDI = 62;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** MIDI → scientific note name, e.g. 62 → "D4". */
export function noteName(midi: number): string {
  return NOTE_NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
}

/** Equal-tempered MIDI → frequency (Hz). */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert a *diatonic index* (0 = tonic, 7 = the octave, negatives go below) into
 * a MIDI note within a given scale. Working in diatonic steps — not semitones —
 * is what lets us transpose "up a fifth" or invert a contour and always land on a
 * scale tone, so the answer stays in key.
 */
export function degToMidi(scale: number[], dIndex: number): number {
  const oct = Math.floor(dIndex / 7);
  const step = mod(dIndex, 7);
  return ROOT_MIDI + 12 * oct + scale[step];
}

// ─── Consonance classification (Fux) ─────────────────────────────────────────
// Harmonic intervals reduced to a pitch-class distance (0..11). The perfect and
// imperfect consonances are the interval classes a canon should land on when two
// voices sound together on a strong beat; the rest are the "hard" dissonances the
// self-correction nudges away from.
const DISSONANT = new Set([1, 2, 6, 10, 11]); // m2/M2, tritone, m7/M7
function isDissonant(interval: number): boolean {
  return DISSONANT.has(mod(interval, 12));
}

// A strong beat = a note that lands squarely on the beat grid (integer beat).
// Passing dissonances *between* the beats are musical and are left untouched.
function isStrongBeat(beat: number): boolean {
  return Math.abs(beat - Math.round(beat)) < 1e-6;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CanonNote {
  voice: number; // 0 = dux (subject); 1..3 = comes (imitative answers)
  dIndex: number; // diatonic index actually sounded (post-correction)
  beat: number; // onset, in beats from the top of the canon
  dur: number; // duration in beats
  midi: number;
  corrected: boolean; // true if the consonance engine nudged this note
}

export interface VoiceSpec {
  delayBeats: number; // how far behind the subject this comes enters
  intervalSteps: number; // diatonic interval of imitation (0=unison, 4=a fifth …)
  invert: boolean; // mirror the contour (canon by inversion)
  augment: boolean; // double the note values (canon by augmentation)
}

export interface CanonResult {
  notes: CanonNote[]; // dux + every comes, flattened and sorted by onset
  totalBeats: number; // loop length (includes a short tail)
  correctedCount: number;
}

// Interval-of-imitation names → diatonic steps.
export const INTERVAL_STEPS: Record<string, number> = {
  unison: 0,
  fourth: 3,
  fifth: 4,
  octave: 7,
};

// Register spread so stacked comes voices don't collide in one octave.
const REGISTER_OFFSET = [0, 7, -7];

/**
 * Turn the high-level UI config into one VoiceSpec per imitative voice.
 * Successive voices enter later (delay × n) and are spread by an octave, giving
 * the piled-up "stretto" texture when the base delay is short.
 */
export function makeVoiceSpecs(cfg: {
  nVoices: number;
  baseDelay: number;
  intervalSteps: number;
  invert: boolean;
  augment: boolean;
}): VoiceSpec[] {
  const specs: VoiceSpec[] = [];
  for (let i = 0; i < cfg.nVoices; i++) {
    specs.push({
      delayBeats: cfg.baseDelay * (i + 1),
      intervalSteps: cfg.intervalSteps + REGISTER_OFFSET[i % REGISTER_OFFSET.length],
      invert: cfg.invert,
      // Classic augmentation canon: only the *last* entering voice augments.
      augment: cfg.augment && i === cfg.nVoices - 1,
    });
  }
  return specs;
}

/** The dux pitch sounding at time `t` (subject is monophonic → at most one). */
function duxMidiAt(dux: CanonNote[], t: number): number | null {
  for (const n of dux) {
    if (n.beat <= t + 1e-6 && t < n.beat + n.dur - 1e-9) return n.midi;
  }
  return null;
}

/**
 * THE CORE CALL. Build the whole canon from a drawn/generated subject.
 *
 * 1. The DUX is the subject itself (voice 0), one note per filled beat-step.
 * 2. Each COMES is a transformed copy of that same line: transposed by a diatonic
 *    interval, delayed, and optionally inverted (contour mirrored around the
 *    subject's first note) or augmented (note values doubled).
 * 3. CONSONANCE SELF-CORRECTION — the real intelligence. Where a comes note would
 *    land on a STRONG beat as a HARD dissonance against the dux sounding at that
 *    moment, we nudge it to the nearest consonant scale tone (±1, then ±2 diatonic
 *    steps). Because the nudge is tiny and diatonic, the answer stays euphonious
 *    while its melodic CONTOUR is preserved — the imitation still reads as itself.
 */
export function buildCanon(
  subject: (number | null)[],
  mode: ModeName,
  specs: VoiceSpec[],
  correctOn: boolean,
): CanonResult {
  const scale = SCALES[mode];

  // 1 — the dux
  const dux: CanonNote[] = [];
  for (let i = 0; i < subject.length; i++) {
    const deg = subject[i];
    if (deg == null) continue;
    dux.push({
      voice: 0,
      dIndex: deg,
      beat: i,
      dur: 1,
      midi: degToMidi(scale, deg),
      corrected: false,
    });
  }

  // Axis of inversion = the subject's first sounding note (contour mirrors here).
  const axis = subject.find((d) => d != null) ?? 0;

  const notes: CanonNote[] = [...dux];
  let correctedCount = 0;

  // 2 + 3 — every comes
  specs.forEach((spec, vi) => {
    const aug = spec.augment ? 2 : 1;
    for (let i = 0; i < subject.length; i++) {
      const deg = subject[i];
      if (deg == null) continue;

      // transform: (invert around axis) then transpose by the interval
      let d = spec.invert ? 2 * axis - deg : deg;
      d += spec.intervalSteps;

      const beat = i * aug + spec.delayBeats;
      const dur = aug;
      let midi = degToMidi(scale, d);
      let corrected = false;

      // consonance self-correction on strong beats
      if (correctOn && isStrongBeat(beat)) {
        const dm = duxMidiAt(dux, beat);
        if (dm != null && isDissonant(midi - dm)) {
          // try the smallest diatonic nudges first, preserving contour
          for (const shift of [1, -1, 2, -2]) {
            const cand = degToMidi(scale, d + shift);
            if (!isDissonant(cand - dm)) {
              midi = cand;
              d += shift;
              corrected = true;
              break;
            }
          }
        }
      }
      if (corrected) correctedCount++;

      notes.push({ voice: vi + 1, dIndex: d, beat, dur, midi, corrected });
    }
  });

  // loop length: last note-off + a two-beat tail so the score clears cleanly
  let end = 0;
  for (const n of notes) end = Math.max(end, n.beat + n.dur);
  const totalBeats = Math.ceil(end) + 2;

  notes.sort((a, b) => a.beat - b.beat || a.voice - b.voice);
  return { notes, totalBeats, correctedCount };
}

/**
 * Generate a short modal subject with a clear arch contour (rise to a peak, fall
 * back to a cadence on the tonic) plus one expressive leap — so the imitation is
 * easy to hear and see. Returns diatonic indices (or null rests), length STEPS.
 */
export function generateSubject(): (number | null)[] {
  const len = STEPS;
  const peak = 3 + Math.floor(Math.random() * 3); // step where the line tops out
  const top = 4 + Math.floor(Math.random() * 3); // diatonic height of that peak
  const out: (number | null)[] = [];

  for (let i = 0; i < len; i++) {
    let d: number;
    if (i === 0) {
      d = 0; // begin on the tonic
    } else if (i <= peak) {
      // ascend toward the peak: mostly steps, an occasional third-leap for shape
      const target = Math.round(top * (i / peak));
      d = Math.random() < 0.3 ? target + 1 : target;
    } else {
      // descend back down toward the cadence
      const frac = (i - peak) / Math.max(1, len - 1 - peak);
      d = Math.round(top * (1 - frac));
    }
    out.push(Math.max(-1, Math.min(9, d)));
  }
  out[len - 1] = 0; // cadence on the tonic
  return out;
}
