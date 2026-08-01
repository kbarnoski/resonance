/*
 * 4568 · MARBLE — material model (pure logic, no React, no audio, no DOM)
 *
 * The "block" is a bank of N sine partials, all sounding at once (the uncarved
 * marble). Carving silences a partial FOREVER. The material has agency: it
 * resists — neighbours of a fresh cut lean back (get louder/brighter), the
 * remaining block slowly re-tunes, and greedy sweeping is punished while
 * precise, spaced carving is rewarded.
 *
 * Determinism: NO Math.random / Date.now / new Date() anywhere. Randomness is a
 * seeded mulberry32 PRNG with a fixed integer seed; timing is performance.now().
 */

export const N_PARTIALS = 48; // 4 chromatic octaves — a dense, bright slab
export const SEED = 0x9e3779b9; // fixed integer seed (never Math.random)

/** MIDI note of the lowest partial (C3). freq(i) = 440 * 2^((BASE_MIDI+i-69)/12) */
const BASE_MIDI = 48;

/**
 * The FIGURE hidden in the marble: the partials the auto-sculptor LEAVES.
 * Indices are semitones above C3. C E G B D across octaves = a wide, luminous
 * Cmaj9 — a recognisable sparse chord revealed purely by removal.
 */
export const FIGURE: readonly number[] = [0, 7, 12, 16, 19, 23, 26, 31, 40];
export const FIGURE_NAME = "Cmaj9";

/** Below this fraction of surviving material we warn: restraint, or silence. */
export const THIN_WARNING = 0.15;

export interface Partial {
  index: number;
  freq: number;
  /** static per-partial detune in cents — gives the slab its beating shimmer */
  detune: number;
  alive: boolean;
  /** transient neighbour "lean-back" 0..~1.6, decays every frame */
  boost: number;
  /** performance.now() timestamp of the cut, or -1 while standing */
  carvedAt: number;
  /** 0 standing → 1 fully fallen (visual collapse after a cut) */
  fall: number;
}

/** Classic mulberry32 — deterministic, seedable, fast. */
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

export function partialFreq(index: number): number {
  return 440 * Math.pow(2, (BASE_MIDI + index - 69) / 12);
}

/** Build a fresh, fully saturated block (every partial alive). */
export function createBlock(seed = SEED): Partial[] {
  const rng = mulberry32(seed);
  const out: Partial[] = [];
  for (let i = 0; i < N_PARTIALS; i++) {
    out.push({
      index: i,
      freq: partialFreq(i),
      detune: (rng() * 2 - 1) * 7, // ±7 cents of deterministic beating
      alive: true,
      boost: 0,
      carvedAt: -1,
      fall: 0,
    });
  }
  return out;
}

/**
 * Order in which the auto-sculptor removes the non-figure partials. Seeded
 * shuffle, then greedily reordered to MAXIMISE the jump between consecutive
 * cuts — so the lean-back boosts land spread across the slab (a shimmering
 * cascade) instead of stacking into a roar. The result reads as deliberate
 * chiselling that pings back and forth across the stone.
 */
export function autoSculptOrder(seed = SEED): number[] {
  const rng = mulberry32(seed ^ 0x85ebca6b);
  const figure = new Set(FIGURE);
  const pool: number[] = [];
  for (let i = 0; i < N_PARTIALS; i++) if (!figure.has(i)) pool.push(i);
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  const out: number[] = [];
  let last = N_PARTIALS >> 1;
  while (pool.length) {
    let bi = 0;
    let bd = -1;
    for (let k = 0; k < pool.length; k++) {
      const d = Math.abs(pool[k] - last);
      if (d > bd) {
        bd = d;
        bi = k;
      }
    }
    out.push(pool[bi]);
    last = pool[bi];
    pool.splice(bi, 1);
  }
  return out;
}

/** Nearest still-alive partial to a detected frequency, with the signed cents. */
export function nearestAlivePartial(
  freq: number,
  partials: Partial[],
): { index: number; cents: number } {
  let index = -1;
  let cents = Infinity;
  for (const p of partials) {
    if (!p.alive) continue;
    const c = 1200 * Math.log2(freq / p.freq);
    if (Math.abs(c) < Math.abs(cents)) {
      cents = c;
      index = p.index;
    }
  }
  return { index, cents };
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function freqToNote(freq: number): string {
  if (!(freq > 0)) return "—";
  const m = Math.round(69 + 12 * Math.log2(freq / 440));
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function aliveCount(partials: Partial[]): number {
  let n = 0;
  for (const p of partials) if (p.alive) n++;
  return n;
}
