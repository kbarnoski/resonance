// rng.ts — deterministic helpers for the seeded synthetic chorus.
//
// The DEMO must be reproducible: a solo reviewer at 06:30 with no mic and no
// second tab should always see the SAME populated, breathing, coupling room.
// So every synthetic presence (rate, hue, initial phase, drift) is drawn from a
// mulberry32 stream seeded with 0x2326. Runtime-only, non-visual randomness
// (selfId, heartbeat jitter) is allowed to use Math.random elsewhere — only the
// synthetic chorus / autopilot flows through here.

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The canonical seed for this piece's deterministic demo. */
export const DEMO_SEED = 0x2326;

/** Stable 0..1 hash of a string — used to place a presence on screen from its
 *  id so its position is stable across frames without storing extra state. */
export function hash01(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Two decorrelated 0..1 hashes from one string (x/y placement). */
export function hash2(str: string): [number, number] {
  return [hash01(str), hash01(str + "~y")];
}
