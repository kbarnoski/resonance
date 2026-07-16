// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — deterministic day-scene + dream-recombination data for 1792-replay-svg
//
// Everything here is FIXED-SEED deterministic (mulberry32, seed 0x1792). No
// Math.random, no Date.now, no performance.now — the piece self-runs headless off
// an integer frame counter. The "day scene" (LAYOUT) is a small, legible set of
// warm luminous glyphs. The "dream" (DREAM_INSTANCES) is that SAME set of glyphs,
// referenced by id through SVG <use>, but scattered / drifting / condensing — the
// cortex replaying its own remembered forms, recombined.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed-seed PRNG. Deterministic across every build & headless run. */
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

/** The seven source glyphs of the "day". id matches a <g id> in the SVG <defs>. */
export interface GlyphMeta {
  gid: string;
  hue: number; // warm dream palette, degrees
}

/** A veridical placement of one glyph in the sharp, awake day scene. */
export interface LayoutItem extends GlyphMeta {
  x: number;
  y: number;
  scale: number;
}

/** viewBox is 0..1000 on both axes. */
export const VIEW = 1000;

// Warm-palette day scene: distinct position, colour, shape — crisp & veridical.
export const LAYOUT: LayoutItem[] = [
  { gid: "g0", hue: 42, x: 726, y: 232, scale: 1.5 }, // amber orb (a small sun)
  { gid: "g1", hue: 16, x: 296, y: 648, scale: 1.7 }, // red-orange prism
  { gid: "g2", hue: 50, x: 498, y: 186, scale: 1.05 }, // gold star
  { gid: "g3", hue: 32, x: 178, y: 306, scale: 1.15 }, // orange crescent
  { gid: "g4", hue: 8, x: 648, y: 566, scale: 1.25 }, // coral hexagon
  { gid: "g5", hue: 55, x: 832, y: 704, scale: 1.35 }, // warm eye / leaf
  { gid: "g6", hue: 26, x: 432, y: 470, scale: 1.05 }, // burnt-orange rhombus
];

export const GLYPHS: GlyphMeta[] = LAYOUT.map(({ gid, hue }) => ({ gid, hue }));

/** One replayed fragment: a <use> of a source glyph, recombined under α. */
export interface DreamInstance {
  gid: string;
  hue: number;
  bx: number; // base (remembered-ish) position
  by: number;
  ax: number; // drift amplitude
  ay: number;
  wx: number; // drift angular freq (kept < 0.3 Hz → slow, safe)
  wy: number;
  px: number; // drift phase
  py: number;
  rot: number; // deg / sec (signed) — wrong rotation, scaled by α
  baseScale: number;
  atx: number; // condensation attractor — two glyphs melt into one here
  aty: number;
  condense: number; // 0..1 how strongly it converges as α→1
  appearAt: number; // α threshold at which this fragment fades in
  op: number; // peak opacity
}

// A few shared attractors so multiple fragments converge → superimposition /
// two-glyphs-condensing-into-one at the height of the dream.
const ATTRACTORS = [
  { x: 500, y: 430 },
  { x: 372, y: 300 },
  { x: 676, y: 566 },
  { x: 560, y: 250 },
];

const TWO_PI = Math.PI * 2;

/** Build the recombination deterministically: K fragments per source glyph. */
function makeInstances(): DreamInstance[] {
  const rnd = mulberry32(0x1792);
  const out: DreamInstance[] = [];
  const K = 4;
  for (const item of LAYOUT) {
    for (let k = 0; k < K; k++) {
      const a = ATTRACTORS[Math.floor(rnd() * ATTRACTORS.length)];
      out.push({
        gid: item.gid,
        hue: item.hue,
        bx: item.x + (rnd() - 0.5) * 380,
        by: item.y + (rnd() - 0.5) * 380,
        ax: 36 + rnd() * 120,
        ay: 36 + rnd() * 120,
        wx: TWO_PI * (0.035 + rnd() * 0.08),
        wy: TWO_PI * (0.035 + rnd() * 0.08),
        px: rnd() * TWO_PI,
        py: rnd() * TWO_PI,
        rot: (rnd() - 0.5) * 20,
        baseScale: 0.55 + rnd() * 1.15,
        atx: a.x,
        aty: a.y,
        condense: 0.28 + rnd() * 0.6,
        // Fragments fade in progressively → recombination DENSITY rises with α,
        // never a flash. Earlier index = appears sooner in the drift.
        appearAt: 0.12 + k * 0.15 + rnd() * 0.08,
        op: 0.42 + rnd() * 0.4,
      });
    }
  }
  return out;
}

export const DREAM_INSTANCES: DreamInstance[] = makeInstances();

// ── The α arc ────────────────────────────────────────────────────────────────
// Self-running WAKE→SLEEP→return loop, in seconds. No input required.
//   0 .. WAKE_HOLD          : α = 0        (sharp, veridical day scene + motif)
//   .. + RISE               : α 0→1 smooth (the sensory gate closes, replay grows)
//   .. + SLEEP_HOLD         : α ≈ 1        (full dream-recombination of memory)
//   .. + RETURN             : α 1→0 eased  (a gentle waking, then it loops)
export const WAKE_HOLD = 14;
export const RISE = 52;
export const SLEEP_HOLD = 8;
export const RETURN = 20;
export const ARC_PERIOD = WAKE_HOLD + RISE + SLEEP_HOLD + RETURN;

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** α ∈ [0,1] for absolute time `tSec`, looping every ARC_PERIOD. */
export function arcAlpha(tSec: number): number {
  const t = ((tSec % ARC_PERIOD) + ARC_PERIOD) % ARC_PERIOD;
  if (t < WAKE_HOLD) return 0;
  if (t < WAKE_HOLD + RISE) return smoothstep((t - WAKE_HOLD) / RISE);
  if (t < WAKE_HOLD + RISE + SLEEP_HOLD) return 1;
  const r = (t - (WAKE_HOLD + RISE + SLEEP_HOLD)) / RETURN;
  return 1 - smoothstep(r);
}
