// 1183 · In C Loom — pure ensemble logic (no React, no audio).
//
// A faithful-in-spirit realisation of Terry Riley's *In C* (1964): ~12 virtual
// players each move forward-only through 53 short melodic cells, repeating each
// cell a probabilistic number of times before advancing. A herding rule keeps
// the fastest player from running more than ~3 cells ahead of the slowest, so
// the ensemble phases apart and re-converges into ever-shifting interlocking
// patterns. When a player finishes cell 53 it wraps to cell 1 and begins a new
// pass, so the piece never ends.

/** A single note inside a cell.
 *  `degree` is a semitone offset from C4 (261.63 Hz); `null` is a rest.
 *  `dur` is measured in eighth-note pulse units (an eighth = 1). */
export interface CellNote {
  degree: number | null;
  dur: number;
}

// Semitone offsets from C4 for readability.
const C = 0;
const D = 2;
const E = 4;
const F = 5;
const Fs = 6; // F# — the "brightest" lydian sparkle, late in the piece
const G = 7;
const A = 9;
const Bb = 10; // B♭ — the mixolydian/dorian shading of the middle stretch
const B = 11;
const C5 = 12;
const D5 = 14;
const E5 = 16;
const G5 = 19;
const R = null; // rest

/**
 * The 53 cells. The arc is deliberate:
 *   • cells 1–20  — diatonic C major, a gentle brightening rise
 *   • cells 21–39 — B♭ enters (mixolydian shading — the famous emotional turn)
 *   • cells 40–53 — B natural and F# return, resolving bright to a C octave
 * These are authored to be faithful in shape and feel rather than an exact
 * transcription (In C is intentionally open to interpretation).
 */
export const CELLS: CellNote[][] = [
  // — 1–20 · C major, brightening rise —
  [{ degree: C, dur: 2 }, { degree: E, dur: 2 }], // 1
  [{ degree: E, dur: 1 }, { degree: F, dur: 1 }, { degree: E, dur: 1 }, { degree: C, dur: 1 }], // 2
  [{ degree: G, dur: 2 }, { degree: E, dur: 2 }], // 3
  [{ degree: C, dur: 1 }, { degree: D, dur: 1 }, { degree: E, dur: 2 }], // 4
  [{ degree: C, dur: 1 }, { degree: D, dur: 1 }, { degree: E, dur: 1 }, { degree: G, dur: 1 }], // 5
  [{ degree: G, dur: 4 }], // 6
  [{ degree: E, dur: 1 }, { degree: G, dur: 1 }, { degree: A, dur: 1 }, { degree: G, dur: 1 }], // 7
  [{ degree: C5, dur: 2 }, { degree: B, dur: 1 }, { degree: G, dur: 1 }], // 8
  [{ degree: A, dur: 1 }, { degree: G, dur: 1 }, { degree: E, dur: 1 }, { degree: D, dur: 1 }], // 9
  [{ degree: C, dur: 1 }, { degree: E, dur: 1 }, { degree: G, dur: 1 }, { degree: C5, dur: 1 }], // 10
  [{ degree: G, dur: 2 }, { degree: A, dur: 2 }], // 11
  [{ degree: E, dur: 1 }, { degree: R, dur: 1 }, { degree: G, dur: 2 }], // 12
  [{ degree: D, dur: 1 }, { degree: E, dur: 1 }, { degree: F, dur: 1 }, { degree: E, dur: 1 }], // 13
  [{ degree: C, dur: 4 }], // 14
  [{ degree: E, dur: 1 }, { degree: F, dur: 1 }, { degree: G, dur: 1 }, { degree: A, dur: 1 }], // 15
  [{ degree: G, dur: 1 }, { degree: F, dur: 1 }, { degree: E, dur: 1 }, { degree: D, dur: 1 }], // 16
  [{ degree: C5, dur: 1 }, { degree: G, dur: 1 }, { degree: E, dur: 1 }, { degree: G, dur: 1 }], // 17
  [{ degree: A, dur: 2 }, { degree: G, dur: 2 }], // 18
  [{ degree: E, dur: 1 }, { degree: D, dur: 1 }, { degree: C, dur: 2 }], // 19
  [{ degree: G, dur: 1 }, { degree: C5, dur: 1 }, { degree: D5, dur: 1 }, { degree: C5, dur: 1 }], // 20

  // — 21–39 · B♭ shading (mixolydian turn) —
  [{ degree: Bb, dur: 2 }, { degree: A, dur: 2 }], // 21
  [{ degree: G, dur: 1 }, { degree: Bb, dur: 1 }, { degree: A, dur: 1 }, { degree: G, dur: 1 }], // 22
  [{ degree: F, dur: 1 }, { degree: G, dur: 1 }, { degree: Bb, dur: 2 }], // 23
  [{ degree: Bb, dur: 1 }, { degree: A, dur: 1 }, { degree: G, dur: 1 }, { degree: F, dur: 1 }], // 24
  [{ degree: D, dur: 1 }, { degree: F, dur: 1 }, { degree: A, dur: 1 }, { degree: Bb, dur: 1 }], // 25
  [{ degree: Bb, dur: 4 }], // 26
  [{ degree: C5, dur: 1 }, { degree: Bb, dur: 1 }, { degree: A, dur: 1 }, { degree: G, dur: 1 }], // 27
  [{ degree: E, dur: 1 }, { degree: G, dur: 1 }, { degree: Bb, dur: 1 }, { degree: A, dur: 1 }], // 28
  [{ degree: G, dur: 2 }, { degree: Bb, dur: 2 }], // 29
  [{ degree: A, dur: 1 }, { degree: Bb, dur: 1 }, { degree: C5, dur: 2 }], // 30
  [{ degree: Bb, dur: 1 }, { degree: G, dur: 1 }, { degree: E, dur: 1 }, { degree: G, dur: 1 }], // 31
  [{ degree: F, dur: 2 }, { degree: A, dur: 2 }], // 32
  [{ degree: D, dur: 1 }, { degree: E, dur: 1 }, { degree: F, dur: 1 }, { degree: G, dur: 1 }], // 33
  [{ degree: Bb, dur: 1 }, { degree: A, dur: 1 }, { degree: G, dur: 1 }, { degree: E, dur: 1 }], // 34
  [{ degree: C5, dur: 1 }, { degree: Bb, dur: 1 }, { degree: G, dur: 2 }], // 35
  [{ degree: A, dur: 1 }, { degree: G, dur: 1 }, { degree: F, dur: 1 }, { degree: E, dur: 1 }], // 36
  [{ degree: G, dur: 1 }, { degree: A, dur: 1 }, { degree: Bb, dur: 1 }, { degree: C5, dur: 1 }], // 37
  [{ degree: D5, dur: 2 }, { degree: C5, dur: 1 }, { degree: Bb, dur: 1 }], // 38
  [{ degree: A, dur: 2 }, { degree: G, dur: 2 }], // 39

  // — 40–53 · bright resolution back to C (B natural + F# return) —
  [{ degree: G, dur: 1 }, { degree: A, dur: 1 }, { degree: B, dur: 1 }, { degree: C5, dur: 1 }], // 40
  [{ degree: C5, dur: 2 }, { degree: E5, dur: 2 }], // 41
  [{ degree: D, dur: 1 }, { degree: E, dur: 1 }, { degree: Fs, dur: 1 }, { degree: G, dur: 1 }], // 42
  [{ degree: G, dur: 1 }, { degree: Fs, dur: 1 }, { degree: G, dur: 1 }, { degree: A, dur: 1 }], // 43
  [{ degree: E, dur: 1 }, { degree: G, dur: 1 }, { degree: C5, dur: 1 }, { degree: E5, dur: 1 }], // 44
  [{ degree: G5, dur: 2 }, { degree: E5, dur: 2 }], // 45
  [{ degree: C5, dur: 1 }, { degree: D5, dur: 1 }, { degree: E5, dur: 2 }], // 46
  [{ degree: B, dur: 1 }, { degree: C5, dur: 1 }, { degree: D5, dur: 1 }, { degree: C5, dur: 1 }], // 47
  [{ degree: E5, dur: 1 }, { degree: D5, dur: 1 }, { degree: C5, dur: 1 }, { degree: B, dur: 1 }], // 48
  [{ degree: C5, dur: 4 }], // 49
  [{ degree: G, dur: 1 }, { degree: C5, dur: 1 }, { degree: E5, dur: 1 }, { degree: G5, dur: 1 }], // 50
  [{ degree: E5, dur: 1 }, { degree: C5, dur: 1 }, { degree: G, dur: 1 }, { degree: E, dur: 1 }], // 51
  [{ degree: C, dur: 1 }, { degree: E, dur: 1 }, { degree: G, dur: 1 }, { degree: C5, dur: 1 }], // 52
  [{ degree: C, dur: 2 }, { degree: C5, dur: 2 }], // 53
];

export const CELL_COUNT = CELLS.length; // 53

/** Deterministic PRNG — Tommy Ettinger's mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Player {
  cellIndex: number; // 0-based index into CELLS
  noteCursor: number; // index of the next note to sound in the current cell
  waitEighths: number; // eighths remaining before the next onset fires
  pass: number; // how many full passes through all 53 cells completed
  repeatProb: number; // per-player patience (probability of repeating a cell)
  gain: number; // per-player relative loudness
  active: boolean; // participates when density is high enough
}

/** An onset produced by a player on a given eighth. */
export interface Onset {
  playerIndex: number;
  degree: number; // semitones from C4 (rests are never emitted as onsets)
  durEighths: number;
  cellIndex: number;
  gain: number;
}

/** Compact readout of how spread-out the ensemble currently is. */
export interface Spread {
  minCell: number; // 1-based
  maxCell: number; // 1-based
  pass: number; // 1-based (the pass the trailing player is in)
  activeCount: number;
}

const HERD_LIMIT = 3; // no player may sit more than this many cells ahead

export class InCEnsemble {
  readonly players: Player[];
  private rng: () => number;

  constructor(seed: number, numPlayers = 12) {
    this.rng = mulberry32(seed);
    this.players = [];
    for (let i = 0; i < numPlayers; i++) {
      this.players.push({
        cellIndex: 0,
        noteCursor: 0,
        // small initial stagger so voices enter over the first bar or two
        waitEighths: Math.floor(this.rng() * numPlayers) + i,
        pass: 0,
        repeatProb: 0.55 + this.rng() * 0.25, // 0.55–0.80
        gain: 0.7 + this.rng() * 0.3,
        active: true,
      });
    }
  }

  /** Reset every player to the top with a fresh seed (keeps player count). */
  reseed(seed: number): void {
    this.rng = mulberry32(seed);
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const p = this.players[i];
      p.cellIndex = 0;
      p.noteCursor = 0;
      p.waitEighths = Math.floor(this.rng() * n) + i;
      p.pass = 0;
      p.repeatProb = 0.55 + this.rng() * 0.25;
      p.gain = 0.7 + this.rng() * 0.3;
    }
  }

  /** Enable exactly the first `count` players (density control). */
  setActiveCount(count: number): void {
    const c = Math.max(1, Math.min(this.players.length, Math.round(count)));
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].active = i < c;
    }
  }

  /** Absolute position used for herding (monotonic across passes). */
  private absPos(p: Player): number {
    return p.pass * CELL_COUNT + p.cellIndex;
  }

  private trailingAbs(): number {
    let min = Infinity;
    for (const p of this.players) {
      if (!p.active) continue;
      const a = this.absPos(p);
      if (a < min) min = a;
    }
    return min === Infinity ? 0 : min;
  }

  /** Advance the ensemble by one eighth-note pulse; return note onsets. */
  tick(): Onset[] {
    const onsets: Onset[] = [];
    const trailing = this.trailingAbs();

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.active) continue;

      if (p.waitEighths > 0) {
        p.waitEighths--;
        continue;
      }

      const cell = CELLS[p.cellIndex];
      const note = cell[p.noteCursor];

      if (note.degree !== null) {
        onsets.push({
          playerIndex: i,
          degree: note.degree,
          durEighths: note.dur,
          cellIndex: p.cellIndex,
          gain: p.gain,
        });
      }

      p.waitEighths = note.dur - 1;
      p.noteCursor++;

      if (p.noteCursor >= cell.length) {
        // Finished the cell — decide whether to repeat or advance.
        p.noteCursor = 0;
        const wantAdvance = this.rng() >= p.repeatProb;
        if (wantAdvance) {
          const nextAbs = this.absPos(p) + 1;
          // Herding: only advance if it keeps us within HERD_LIMIT of the
          // trailing player. Otherwise we are forced to repeat this cell.
          if (nextAbs - trailing <= HERD_LIMIT) {
            p.cellIndex++;
            if (p.cellIndex >= CELL_COUNT) {
              p.cellIndex = 0;
              p.pass++;
            }
          }
        }
      }
    }

    return onsets;
  }

  spread(): Spread {
    let minCell = Infinity;
    let maxCell = -Infinity;
    let minPass = Infinity;
    let count = 0;
    for (const p of this.players) {
      if (!p.active) continue;
      count++;
      if (p.cellIndex < minCell) minCell = p.cellIndex;
      if (p.cellIndex > maxCell) maxCell = p.cellIndex;
      if (p.pass < minPass) minPass = p.pass;
    }
    if (count === 0) {
      return { minCell: 1, maxCell: 1, pass: 1, activeCount: 0 };
    }
    return {
      minCell: minCell + 1,
      maxCell: maxCell + 1,
      pass: minPass + 1,
      activeCount: count,
    };
  }
}
