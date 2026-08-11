// prng.ts — the single deterministic source of "randomness" and timing seeds for
// 9864 · Handroom. HOUSE RULE: no Math.random(), no Date.now(), no new Date().
// Everything that varies — per-voice detune, the autonomous conductor's orbit
// parameters, wobble phases — is drawn from this seeded generator so the muted
// 06:30 phone always shows the exact same living chord.
//
// mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Seeded once with the
// prototype id 0x9864.

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

/** The canonical generator for this piece. */
export function handroomRng(): () => number {
  return mulberry32(0x9864);
}
