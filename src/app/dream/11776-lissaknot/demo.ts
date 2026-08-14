// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot · demo.ts — the seeded self-demo "DemoVoice".
//
//   A muted phone never opens a mic, so this stands in for a singer: a slow,
//   deterministic melody of HELD notes, each a clean harmonic interval over the
//   drone root. Every note attacks (an onset "whip"), then its clarity ramps up
//   as it is sustained — so within ~1s a Lissajous knot forms and, over the
//   melody, morphs from one clean figure to the next. Fully seeded (mulberry32),
//   so the demo is identical every visit and uses NO wall clock or Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, SEED, clamp } from "./prng";

export interface VoiceSample {
  /** Sung frequency in Hz (fed to the same pitch→ratio path as the live mic). */
  freq: number;
  /** 0..1 confidence — ramps up while a note is sustained, so it locks. */
  clarity: number;
  /** 0..1 loudness envelope. */
  amp: number;
  /** 0..1 spectral brightness → harmonic enrichment of the knot. */
  bright: number;
  /** True on the single frame a new note begins → a whip. */
  onset: boolean;
}

interface Note {
  freq: number;
  dur: number;
  bright: number;
}

export class DemoVoice {
  private readonly notes: Note[];
  private readonly total: number;
  private lastIndex = -1;

  constructor(rootFreq: number) {
    const rnd = mulberry32(SEED ^ 0x5a17);
    // Clean harmonic intervals over the root → each held note is a classic knot:
    // unison, fifth, octave, octave+third, twelfth (octave+fifth), fourth, etc.
    const intervals = [1, 3 / 2, 2, 5 / 2, 3, 4 / 3, 2, 5 / 4, 3 / 2, 2];
    this.notes = intervals.map((r) => ({
      freq: rootFreq * r,
      dur: 2.4 + rnd() * 2.0, // 2.4–4.4 s held
      bright: 0.25 + rnd() * 0.6,
    }));
    // First note short-ish so a knot has clearly locked within ~1s.
    this.notes[0].dur = 2.2;
    this.total = this.notes.reduce((s, n) => s + n.dur, 0);
  }

  /** Sample the singer at age seconds. Detects note starts to fire onsets. */
  sample(age: number): VoiceSample {
    let t = ((age % this.total) + this.total) % this.total;
    let index = 0;
    for (let i = 0; i < this.notes.length; i++) {
      if (t < this.notes[i].dur) {
        index = i;
        break;
      }
      t -= this.notes[i].dur;
    }
    const note = this.notes[index];
    const local = t; // seconds into this note
    const frac = clamp(local / note.dur, 0, 1);

    const onset = index !== this.lastIndex;
    this.lastIndex = index;

    // Amplitude envelope: quick swell in, gentle decay across the sustain.
    const attack = clamp(local / 0.18, 0, 1);
    const release = 1 - 0.35 * clamp((frac - 0.6) / 0.4, 0, 1);
    const amp = clamp(0.35 + 0.5 * attack * release, 0, 1);

    // Clarity ramps up as the note is held → the knot crystallizes and LOCKS.
    const clarity = clamp(0.35 + 1.4 * clamp(local / 0.7, 0, 1), 0, 0.97);

    // A slow vibrato-ish drift so the held knot breathes rather than freezing.
    const vib = 1 + 0.006 * Math.sin(local * 7.0);

    return {
      freq: note.freq * vib,
      clarity,
      amp,
      bright: note.bright,
      onset,
    };
  }
}
