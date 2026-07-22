// rng.ts — 2314 · The Return
//
// Deterministic seeded RNG (mulberry32) plus a scripted "phantom body"
// autopilot. When there is no camera (denied, unavailable, or a 06:30 phone),
// the autopilot synthesizes a plausible moving body so the room can still
// LEARN → PREDICT → be SURPRISED → HABITUATE, self-demoing the full ~20s arc
// with zero permissions. Everything below is a pure function of the seed, so
// the demo is byte-for-byte reproducible.

export const RETURN_SEED = 0x2314;

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. */
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

export interface PhantomSample {
  x: number; // normalized [0,1], 0 = left
  y: number; // normalized [0,1], 0 = top
  energy: number; // 0..1 how much it is "moving" this instant
}

export interface Autopilot {
  /** Position/energy of the phantom body at wall-clock seconds since start. */
  step(tSec: number): PhantomSample;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A scripted-but-seeded phantom body. The timeline is chosen so the arc is
 * legible even to a half-awake reviewer:
 *
 *   0.0–9.0s   wander tightly around a "home" region  → the room BUILDS memory
 *   9.0–12.5s  hold almost still at home              → the room's PREDICTION
 *                                                        glows ahead, waiting
 *   12.5–15.5s BREAK: jump to a far region            → high surprise, FLARE
 *   15.5–22s   oscillate, then settle at the new spot → the room HABITUATES
 *
 * After ~22s it loops. All offsets/jitter are drawn from the seed.
 */
export function makeAutopilot(seed: number): Autopilot {
  const rnd = mulberry32(seed);
  // Home region (habit) and the break region (the surprise), both seeded.
  const home = { x: 0.34 + rnd() * 0.12, y: 0.42 + rnd() * 0.14 };
  const brk = { x: 0.70 + rnd() * 0.12, y: 0.24 + rnd() * 0.16 };
  // Per-phantom wobble frequencies/phases so the wander looks organic.
  const wa = 0.6 + rnd() * 0.5;
  const wb = 0.9 + rnd() * 0.6;
  const pa = rnd() * 6.283;
  const pb = rnd() * 6.283;
  const jx = 0.05 + rnd() * 0.03;
  const jy = 0.05 + rnd() * 0.03;
  const LOOP = 22;

  return {
    step(tRaw: number): PhantomSample {
      const t = tRaw % LOOP;
      // Small organic wobble shared by every phase.
      const wob = {
        x: Math.sin(t * wa + pa) * jx + Math.sin(t * 2.3 + pb) * jx * 0.4,
        y: Math.cos(t * wb + pb) * jy + Math.sin(t * 1.7 + pa) * jy * 0.4,
      };

      let cx = home.x;
      let cy = home.y;
      let energy = 0.8;

      if (t < 9) {
        // Wander around home; energy high (learning phase).
        cx = home.x + Math.sin(t * 0.7 + pa) * 0.06;
        cy = home.y + Math.cos(t * 0.9 + pb) * 0.05;
        energy = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.3));
      } else if (t < 12.5) {
        // Hold still: the room should predict us here and calm down.
        const k = smooth((t - 9) / 3.5);
        cx = lerp(home.x, home.x + 0.01, k);
        cy = lerp(home.y, home.y - 0.01, k);
        energy = lerp(0.5, 0.06, k); // fade toward stillness
      } else if (t < 15.5) {
        // BREAK — leap to the far region. Fast transit = big surprise.
        const k = smooth(clamp01((t - 12.5) / 1.2));
        cx = lerp(home.x, brk.x, k);
        cy = lerp(home.y, brk.y, k);
        energy = 0.55 + 0.45 * Math.sin((t - 12.5) * 3.0); // agitated
        energy = clamp01(0.5 + 0.5 * energy);
      } else {
        // Oscillate between break and home, biasing toward break as it
        // habituates (memory relearns → surprise fades).
        const phase = (t - 15.5) / (LOOP - 15.5); // 0..1
        const bias = smooth(phase); // spend more time at the new spot
        const osc = 0.5 + 0.5 * Math.sin((t - 15.5) * 1.4);
        const target = lerp(brk.x, home.x, osc * (1 - bias));
        cx = target;
        cy = lerp(brk.y, home.y, osc * (1 - bias));
        energy = 0.35 + 0.35 * osc;
      }

      return {
        x: clamp01(cx + wob.x),
        y: clamp01(cy + wob.y),
        energy: clamp01(energy),
      };
    },
  };
}
