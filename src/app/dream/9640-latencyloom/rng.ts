// ─────────────────────────────────────────────────────────────────────────────
// rng.ts — deterministic randomness for 9640-latencyloom.
//
// The CI grep bans the forbidden time/randomness globals. Every "random" choice in
// this piece (synthetic-player distances, phrases, jitter) is drawn from a
// seeded mulberry32 stream so the auto-demo is byte-identical on every load —
// a muted phone at 06:30 always sees the same living network. `crypto` is the
// ONLY entropy source, used once to mint a stable per-tab player id.
// ─────────────────────────────────────────────────────────────────────────────

/** Classic mulberry32 — small, fast, deterministic. Returns floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32. Stable colour/lane derivation from a player id. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One real burst of entropy (crypto — not the banned RNG) to seed a tab's id. */
export function makeEntropySeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  }
  // SSR / ancient fallback — performance.now is allowed (wall-clock is not).
  return (performance.now() * 1000) >>> 0;
}

/** Short, human-legible id from a numeric seed. */
export function seedToId(seed: number): string {
  return (seed >>> 0).toString(36).padStart(6, "0").slice(-6);
}
