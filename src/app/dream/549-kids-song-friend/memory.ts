"use client";

import { PENTA_COUNT } from "./audio";

// The persistent companion: the friend IS the accumulated library of songs.
const KEY = "resonance.dream.549";

export type Song = {
  notes: number[]; // pentatonic note indices
  ts: number; // when it was taught (ms epoch)
  day: number; // simulated visit-day this song belongs to
};

export type Memory = {
  songs: Song[];
  visits: number; // how many distinct visit-days
  totalNotesEver: number; // monotonic: every note ever sung, never decreases
  lastVisit: number; // ms epoch of last load
  day: number; // current simulated day index
};

export function emptyMemory(): Memory {
  return {
    songs: [],
    visits: 0,
    totalNotesEver: 0,
    lastVisit: 0,
    day: 0,
  };
}

export function loadMemory(): Memory | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Memory;
    if (!m || !Array.isArray(m.songs)) return null;
    // sanitize note indices
    m.songs = m.songs
      .filter((s) => s && Array.isArray(s.notes) && s.notes.length > 0)
      .map((s) => ({
        notes: s.notes
          .map((n) => Math.max(0, Math.min(PENTA_COUNT - 1, Math.round(n))))
          .slice(0, 12),
        ts: typeof s.ts === "number" ? s.ts : Date.now(),
        day: typeof s.day === "number" ? s.day : 0,
      }));
    return m;
  } catch {
    return null;
  }
}

export function saveMemory(m: Memory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // private mode / quota — companion simply lives only this session
  }
}

export function clearMemory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Pre-seeded "yesterday's songs" so the friend has a body from frame one. */
export function seedMemory(): Memory {
  const yesterday = Date.now() - 1000 * 60 * 60 * 20;
  // "Twinkle"-ish rise & a little lullaby fall, in pentatonic indices.
  const songA: Song = { notes: [0, 0, 5, 5, 7, 7, 5], ts: yesterday, day: 0 };
  const songB: Song = {
    notes: [9, 7, 5, 4, 5, 2, 0],
    ts: yesterday + 1000 * 30,
    day: 0,
  };
  return {
    songs: [songA, songB],
    visits: 1,
    totalNotesEver: songA.notes.length + songB.notes.length,
    lastVisit: yesterday,
    day: 0,
  };
}

/** Commit a freshly-sung melody to memory (mutates + returns a new object). */
export function addSong(m: Memory, notes: number[]): Memory {
  if (notes.length === 0) return m;
  const song: Song = { notes: notes.slice(0, 12), ts: Date.now(), day: m.day };
  return {
    ...m,
    songs: [...m.songs, song],
    totalNotesEver: m.totalNotesEver + song.notes.length,
  };
}

/** Was the last visit on an earlier calendar day than now? */
export function isNewCalendarDay(m: Memory): boolean {
  if (!m.lastVisit) return false;
  const a = new Date(m.lastVisit);
  const b = new Date();
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

/** Advance the simulated visit (the "pretend it's tomorrow" shortcut). */
export function advanceDay(m: Memory): Memory {
  return { ...m, day: m.day + 1, visits: m.visits + 1, lastVisit: Date.now() };
}

/** A friendly greeting the friend says, given its memory. */
export function greeting(m: Memory): string {
  const n = m.songs.length;
  if (n === 0) return "hi! sing me a little song?";
  if (m.day > 0) {
    return `you're back! you taught me ${n} song${n === 1 ? "" : "s"}… i remembered them all night!`;
  }
  return `hello again — i still have ${n} song${n === 1 ? "" : "s"} you sang me. listen…`;
}
