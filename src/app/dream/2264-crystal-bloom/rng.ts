// ─────────────────────────────────────────────────────────────────────────────
// 2264-crystal-bloom · rng.ts — the lab's deterministic PRNG.
//
//   The dream lab must build reproducibly, so shipped code may NEVER call
//   Math.random(), Date.now(), or argless new Date(). Every stochastic choice in
//   this piece (reverb noise, bud directions, autopilot jitter) draws from a
//   seeded mulberry32 stream. Seed = 0x2264 (this prototype's number).
// ─────────────────────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This prototype's canonical seed. */
export const SEED = 0x2264;
