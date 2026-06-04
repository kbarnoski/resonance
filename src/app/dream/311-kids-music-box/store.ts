// Persistence / memory for the music box.
//
// The pattern IS the state: a boolean grid [row][step]. Pins the child places
// accumulate here, the loop keeps playing it, and we persist to localStorage
// so the box remembers across reloads. This is the whole point of the brief:
// the child builds a real little machine that is remembered and grows, not a
// momentary forgettable wash.

import { ROW_COUNT } from "./ks-audio";

export const STEP_COUNT = 14; // time steps around the circumference

export type Pattern = boolean[][]; // [row][step]

const STORAGE_KEY = "dream-311-kids-music-box-v1";

export function makeEmptyPattern(): Pattern {
  return Array.from({ length: ROW_COUNT }, () =>
    Array.from({ length: STEP_COUNT }, () => false),
  );
}

// A simple, already-singing starter tune in D Lydian, so the box is alive at
// a glance (used only when nothing has been saved yet).
export function makeSeedPattern(): Pattern {
  const p = makeEmptyPattern();
  // row indices: 0=D 1=E 2=F# 3=G# 4=A 5=B
  const seed: Array<[number, number]> = [
    [0, 0], [4, 2], [2, 4], [4, 6],
    [5, 8], [4, 10], [2, 11], [0, 12],
    [1, 3], [3, 9],
  ];
  for (const [r, s] of seed) {
    if (p[r] && s < STEP_COUNT) p[r][s] = true;
  }
  return p;
}

export function loadPattern(): Pattern | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // sanitize into a correctly-shaped grid
    const p = makeEmptyPattern();
    for (let r = 0; r < ROW_COUNT; r++) {
      const row = parsed[r];
      if (Array.isArray(row)) {
        for (let s = 0; s < STEP_COUNT; s++) {
          p[r][s] = Boolean(row[s]);
        }
      }
    }
    return p;
  } catch {
    return null;
  }
}

export function savePattern(p: Pattern): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage unavailable (private mode, quota) — degrade silently */
  }
}

export function clearStored(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
