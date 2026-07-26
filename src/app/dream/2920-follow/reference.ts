// The score the accompanist knows by heart.
//
// "Little Lantern" — a short, warm, ORIGINAL lullaby (~16 notes, F major),
// written to sit in a comfortable middle-voice range (E4–D5) so a real person
// can sing it. It is stored as beats + durations, NOT wall-clock time: the
// singer owns the tempo, and the follower re-derives beat position live.
//
// From the melody we also derive a per-segment chord track (pad + bass) so the
// accompaniment has something to breathe underneath the tune.

import { mulberry32, rangeOf } from "./rng";

export interface RefNote {
  /** Continuous is not needed here — score pitches are exact MIDI integers. */
  pitchMidi: number;
  /** Start position in beats. */
  beat: number;
  /** Duration in beats. */
  durBeats: number;
}

// F(65) G(67) A(69) C(72) D(74) E(64)
export const MELODY: RefNote[] = [
  { pitchMidi: 65, beat: 0, durBeats: 1 }, // F4
  { pitchMidi: 67, beat: 1, durBeats: 1 }, // G4
  { pitchMidi: 69, beat: 2, durBeats: 1.5 }, // A4
  { pitchMidi: 67, beat: 3.5, durBeats: 0.5 }, // G4
  { pitchMidi: 65, beat: 4, durBeats: 2 }, // F4 (held)
  { pitchMidi: 69, beat: 6, durBeats: 1 }, // A4
  { pitchMidi: 72, beat: 7, durBeats: 1 }, // C5
  { pitchMidi: 74, beat: 8, durBeats: 1.5 }, // D5 (peak)
  { pitchMidi: 72, beat: 9.5, durBeats: 0.5 }, // C5
  { pitchMidi: 69, beat: 10, durBeats: 2 }, // A4 (held)
  { pitchMidi: 67, beat: 12, durBeats: 1 }, // G4
  { pitchMidi: 69, beat: 13, durBeats: 1 }, // A4
  { pitchMidi: 67, beat: 14, durBeats: 1 }, // G4
  { pitchMidi: 65, beat: 15, durBeats: 1 }, // F4
  { pitchMidi: 64, beat: 16, durBeats: 1 }, // E4 (leading tone dip)
  { pitchMidi: 65, beat: 17, durBeats: 3 }, // F4 (home, long)
];

export const TOTAL_BEATS = 20;

/** How finely the reference contour is sampled for DTW (frames per beat). */
export const FRAMES_PER_BEAT = 4;

export interface ChordSeg {
  beat: number;
  name: string;
  bassMidi: number;
  padMidis: number[];
}

export const CHORDS: ChordSeg[] = [
  { beat: 0, name: "F", bassMidi: 41, padMidis: [53, 57, 60] }, // I
  { beat: 4, name: "Dm", bassMidi: 38, padMidis: [50, 53, 57] }, // vi
  { beat: 6, name: "B♭", bassMidi: 34, padMidis: [46, 50, 53] }, // IV
  { beat: 8, name: "C", bassMidi: 36, padMidis: [48, 52, 55] }, // V
  { beat: 10, name: "Dm", bassMidi: 38, padMidis: [50, 53, 57] }, // vi
  { beat: 12, name: "B♭", bassMidi: 34, padMidis: [46, 50, 53] }, // IV
  { beat: 14, name: "C", bassMidi: 36, padMidis: [48, 52, 55] }, // V
  { beat: 16, name: "F", bassMidi: 41, padMidis: [53, 57, 60] }, // I
  { beat: 18, name: "C", bassMidi: 36, padMidis: [48, 52, 55] }, // V
];

/** Chord active at (or most recently before) a given beat. */
export function chordAtBeat(beat: number): ChordSeg {
  let seg = CHORDS[0];
  for (const c of CHORDS) {
    if (c.beat <= beat) seg = c;
    else break;
  }
  return seg;
}

/** The score pitch sounding at a beat, or null in a gap. */
export function melodyPitchAtBeat(beat: number): number | null {
  for (const n of MELODY) {
    if (beat >= n.beat && beat < n.beat + n.durBeats) return n.pitchMidi;
  }
  return null;
}

export interface RefFrame {
  midi: number;
  beat: number;
}

/** Sample the melody into an evenly-spaced pitch contour for the DTW follower.
 *  Gaps hold the previous pitch so the contour is continuous. */
export function buildContour(): RefFrame[] {
  const frames: RefFrame[] = [];
  const n = TOTAL_BEATS * FRAMES_PER_BEAT;
  let held = MELODY[0].pitchMidi;
  for (let j = 0; j < n; j++) {
    const beat = j / FRAMES_PER_BEAT;
    const p = melodyPitchAtBeat(beat);
    if (p !== null) held = p;
    frames.push({ midi: held, beat });
  }
  return frames;
}

export const MELODY_MIN_MIDI = 61; // a little headroom below E4
export const MELODY_MAX_MIDI = 77; // a little above D5

// ─────────────────────────────────────────────────────────────────────────────
// The seeded virtual performer (headless / no-mic fallback).
//
// It walks "Little Lantern" note-by-note in its OWN elastic time — per-note
// tempo swings, breath pauses before phrases, an entry scoop, vibrato, and a
// touch of intonation drift — and emits a continuous MIDI pitch each frame.
// Crucially it does NOT tell anyone which beat it is on: that same pitch stream
// is fed to the SAME follower, which must infer the position via DTW. So the
// headless demo genuinely exercises the score-following, it is not a playback.
// ─────────────────────────────────────────────────────────────────────────────

interface PlanNote {
  note: RefNote;
  breath: number; // seconds of silence before this note
  dur: number; // seconds this note is sung
  inton: number; // steady intonation offset (semitones)
}

export interface SingerFrame {
  midi: number | null; // null = breath / silence
  wrapped: boolean; // true on the frame the performance loops back to the top
}

export class VirtualSinger {
  private rng: () => number;
  private plan: PlanNote[] = [];
  private idx = 0;
  private t = 0; // seconds into the current note (incl. its leading breath)
  private clock = 0; // absolute seconds, drives vibrato

  constructor(seed: number, private baseBps = 1.15) {
    this.rng = mulberry32(seed);
    this.buildPlan();
  }

  private buildPlan(): void {
    this.plan = MELODY.map((note, i) => {
      const tempoMul = rangeOf(this.rng, 0.72, 1.32);
      // Breathe before phrase starts (beats 0, 6, 12) and occasionally elsewhere.
      const phraseStart = note.beat === 0 || note.beat === 6 || note.beat === 12;
      const breath = phraseStart
        ? rangeOf(this.rng, 0.35, 0.7)
        : this.rng() < 0.28
          ? rangeOf(this.rng, 0.12, 0.4)
          : 0.04;
      const dur = (note.durBeats / (this.baseBps * tempoMul)) + (i === MELODY.length - 1 ? 0.3 : 0);
      const inton = rangeOf(this.rng, -0.18, 0.18);
      return { note, breath, dur, inton };
    });
  }

  reset(): void {
    this.idx = 0;
    this.t = 0;
    this.clock = 0;
    this.rng = mulberry32(0x2920);
    this.buildPlan();
  }

  step(dt: number): SingerFrame {
    this.t += dt;
    this.clock += dt;
    let wrapped = false;
    const cur = this.plan[this.idx];

    if (this.t >= cur.breath + cur.dur) {
      // advance to next note
      this.t -= cur.breath + cur.dur;
      this.idx++;
      if (this.idx >= this.plan.length) {
        this.idx = 0;
        wrapped = true;
      }
    }
    const p = this.plan[this.idx];

    if (this.t < p.breath) {
      return { midi: null, wrapped }; // breathing
    }

    const inNote = this.t - p.breath;
    const frac = p.dur > 0 ? inNote / p.dur : 1;
    // Entry scoop: start ~0.5 semitone flat, glide in over the first 90ms.
    const scoop = inNote < 0.09 ? -0.5 * (1 - inNote / 0.09) : 0;
    // Vibrato blooms after the note settles.
    const vibDepth = Math.min(1, frac * 3) * 0.13;
    const vib = Math.sin(this.clock * 2 * Math.PI * 5.4) * vibDepth;
    const midi = p.note.pitchMidi + p.inton + scoop + vib;
    return { midi, wrapped };
  }
}
