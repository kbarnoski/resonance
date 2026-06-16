// score.ts — pure helpers for the unfolding two-staff SVG "score".
//
// We render notes as dots on two staves (White on the upper staff, Black
// on the lower). Vertical position = pitch (MIDI), horizontal = ply order.
// This is a sonification visual, not engraving — readable, not exact.

import { NoteSpec } from "./music";

export interface ScoreDot {
  x: number;
  y: number;
  r: number;
  color: "w" | "b";
  capture: boolean;
  check: boolean;
  mate: boolean;
  played: boolean;
  index: number;
}

// Map a MIDI value to a y within a staff band [yTop, yBottom].
// We clamp to a sensible MIDI window around the playing register.
const MIDI_LOW = 36;
const MIDI_HIGH = 74;

function midiToY(midi: number, yTop: number, yBottom: number): number {
  const t = (midi - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW);
  const c = Math.max(0, Math.min(1, t));
  return yBottom - c * (yBottom - yTop);
}

export function layoutScore(
  notes: NoteSpec[],
  opts: {
    width: number;
    height: number;
    leftPad: number;
    rightPad: number;
    currentIndex: number;
  }
): { dots: ScoreDot[]; whiteBand: [number, number]; blackBand: [number, number] } {
  const { width, height, leftPad, rightPad, currentIndex } = opts;
  const n = Math.max(1, notes.length);
  const usableW = width - leftPad - rightPad;
  const stepX = usableW / n;

  const midY = height / 2;
  const whiteBand: [number, number] = [height * 0.1, midY - height * 0.04];
  const blackBand: [number, number] = [midY + height * 0.04, height * 0.9];

  const dots: ScoreDot[] = notes.map((note, i) => {
    const x = leftPad + stepX * (i + 0.5);
    const band = note.color === "w" ? whiteBand : blackBand;
    const y = midiToY(note.midiTo, band[0], band[1]);
    const r = note.mate ? 7 : note.capture ? 5.5 : note.color === "w" ? 4 : 4;
    return {
      x,
      y,
      r,
      color: note.color,
      capture: note.capture,
      check: note.check,
      mate: note.mate,
      played: i <= currentIndex,
      index: i,
    };
  });

  return { dots, whiteBand, blackBand };
}
