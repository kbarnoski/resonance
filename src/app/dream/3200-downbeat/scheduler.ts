// ─────────────────────────────────────────────────────────────────────────────
// 3200-downbeat · scheduler.ts
//
//   The ensemble's score + an AudioContext lookahead scheduler. Notes are NOT
//   played on a fixed metronome — they are placed onto the conductor's live
//   grid (see pll.ts). Each tick we look ~150 ms ahead, find every note whose
//   grid time falls inside the window, and hand it to the caller to sound at a
//   precise audio time. Steady conducting → a tight, even grid. Rushing → the
//   grid lags and notes flam against the conductor's beat.
//
//   Pure TypeScript: no DOM, no Web Audio. `emit` does the actual scheduling.
// ─────────────────────────────────────────────────────────────────────────────

import { gridTimeOf, reanchor, type Conductor } from "./pll";

export type Voice = "bass" | "chord" | "melody";

export interface ScoreEvent {
  /** Position within the loop, in beats (0 … LOOP_BEATS). */
  beat: number;
  voice: Voice;
  /** MIDI note numbers — one for bass/melody, several for a chord. */
  midis: number[];
  /** Duration in beats. */
  dur: number;
  vel: number;
}

export interface EnsembleNote {
  voice: Voice;
  time: number; // audio time to sound at
  freqs: number[];
  dur: number; // seconds
  vel: number;
  beat: number; // absolute beat index (for the visual grid)
}

export const LOOP_BEATS = 8;

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ── The phrase — two bars in A minor: Am · F · C · G (i–VI–III–VII). ─────────
// Chords change every two beats; a walking bass under stab chords and a calm
// pentatonic melody line. Fixed pitches: the axis of play here is TIME, not
// pitch, so nothing is quantised on the way in.
const CHORDS: Record<number, number[]> = {
  0: [57, 60, 64], // Am  (A3 C4 E4)
  2: [53, 57, 60], // F   (F3 A3 C4)
  4: [60, 64, 67], // C   (C4 E4 G4)
  6: [55, 59, 62], // G   (G3 B3 D4)
};
const BASS_ROOT: Record<number, number> = { 0: 45, 2: 41, 4: 48, 6: 43 };
const BASS_PASS: Record<number, number> = { 0: 48, 2: 45, 4: 52, 6: 47 };

function makeScore(): ScoreEvent[] {
  const s: ScoreEvent[] = [];
  for (const b of [0, 2, 4, 6]) {
    // Walking bass: root on the chord beat, passing tone on the next beat.
    s.push({ beat: b, voice: "bass", midis: [BASS_ROOT[b]], dur: 0.9, vel: 0.9 });
    s.push({ beat: b + 1, voice: "bass", midis: [BASS_PASS[b]], dur: 0.9, vel: 0.7 });
    // Chord stabs: on the beat and a lighter off-beat push.
    s.push({ beat: b, voice: "chord", midis: CHORDS[b], dur: 0.45, vel: 0.8 });
    s.push({ beat: b + 1.5, voice: "chord", midis: CHORDS[b], dur: 0.3, vel: 0.5 });
  }
  // Melody — A-minor pentatonic, syncopated across the two bars.
  const mel: Array<[number, number, number]> = [
    [0, 72, 0.5], [1, 76, 0.5], [1.5, 74, 0.5], [3, 72, 0.75],
    [4, 79, 0.5], [4.5, 76, 0.5], [5, 74, 0.75], [6.5, 72, 0.5], [7, 69, 0.9],
  ];
  for (const [beat, midi, dur] of mel) {
    s.push({ beat, voice: "melody", midis: [midi], dur, vel: 0.65 });
  }
  return s.sort((a, b) => a.beat - b.beat);
}

export const SCORE = makeScore();

export interface Scheduler {
  nextBeatIndex: number;
}

export function makeScheduler(startBeat = 0): Scheduler {
  return { nextBeatIndex: startBeat };
}

/** Look `lookahead` seconds ahead on the conductor's grid and emit every note
 *  due in that window. Marches one integer beat at a time. */
export function runScheduler(
  sched: Scheduler,
  c: Conductor,
  currentTime: number,
  lookahead: number,
  emit: (note: EnsembleNote) => void
): void {
  // Keep the grid anchored near the playhead so period changes only bend the
  // near future (short phase-lever) — see pll.reanchor.
  reanchor(c, sched.nextBeatIndex);

  let guard = 0;
  while (
    gridTimeOf(c, sched.nextBeatIndex) < currentTime + lookahead &&
    guard < 32
  ) {
    const b = sched.nextBeatIndex;
    const loopPos = ((b % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
    for (const ev of SCORE) {
      if (Math.floor(ev.beat) !== loopPos) continue;
      const time = gridTimeOf(c, b) + (ev.beat - loopPos) * c.period;
      // Skip notes already in the past (e.g. after a big phase correction).
      if (time < currentTime - 0.03) continue;
      emit({
        voice: ev.voice,
        time,
        freqs: ev.midis.map(midiToFreq),
        dur: Math.max(0.08, ev.dur * c.period),
        vel: ev.vel,
        beat: b + (ev.beat - loopPos),
      });
    }
    sched.nextBeatIndex++;
    guard++;
  }
}
