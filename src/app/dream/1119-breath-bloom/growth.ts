/**
 * growth.ts — the garden as persistent state.
 *
 * The plant is DATA, not pixels: a set of branches (each a chain of relative
 * turns) and blooms. Every completed exhale grows the garden by one step —
 * extend the newest living branch, occasionally fork, and every few segments
 * open a flower. State persists across the whole session: the garden after
 * five minutes of breathing is a different object than after one minute.
 *
 * Angles are stored as *relative* turns so the whole plant bends coherently
 * when we add sway at render time (tip moves most). 0 = straight up.
 */

import { mulberry32 } from "./breath";

export interface GNode {
  /** Turn relative to the previous segment's direction, radians. */
  turn: number;
  /** Segment length in world units. */
  len: number;
  /** Stroke width in world units. */
  width: number;
  /** Garden-time (breath count) at which this node was grown. */
  born: number;
  /** True if a leaf sprouts at this node. */
  leaf: boolean;
  /** Side the leaf points (-1 / +1). */
  leafSide: number;
}

export interface Branch {
  rootX: number;
  rootY: number;
  /** Base world direction of the branch (0 = up), radians. */
  baseAngle: number;
  nodes: GNode[];
  hue: number;
  sat: number;
  light: number;
  alive: boolean;
  /** Absolute tip direction, tracked during growth. */
  tipAbsAngle: number;
  sinceFlower: number;
  sinceFork: number;
  /** Per-branch phase so sway is decorrelated between branches. */
  swayPhase: number;
}

export interface Flower {
  branch: number;
  /** Node index along the branch the flower sits on. */
  node: number;
  size: number;
  /** Current openness 0..1 (animates toward openTarget). */
  open: number;
  openTarget: number;
  hue: number;
  sat: number;
  light: number;
  petals: number;
  /** Rotational offset. */
  spin: number;
  born: number;
}

export interface Garden {
  seed: number;
  rng: () => number;
  branches: Branch[];
  flowers: Flower[];
  /** Completed exhales so far (== notes rung). */
  breaths: number;
  /** Total segments grown. */
  segments: number;
  /** Slowly-incrementing register — drives palette + octave evolution. */
  register: number;
  /** Base stem hue (sage), drifts slowly over the session. */
  baseHue: number;
}

// world layout: root at (0,0); +x right, +y UP. Plant grows into +y.
const ROOT_X = 0;
const ROOT_Y = 0;

// segment sizing
const SEG_BASE_LEN = 0.09;
const SEG_STRENGTH_LEN = 0.11; // extra length scaled by exhale strength
const SEG_WIDTH = 0.016;

// growth behaviour
const FLOWER_EVERY = 4; // open a bloom every ~N segments on a branch
const REGISTER_EVERY = 12; // bump register (palette/octave) every N breaths

const STEM_HUE = 96; // sage / botanical green
const FLOWER_HUES = [352, 18, 300, 44, 340]; // rose, amber, mauve, gold, blush

function makeBranch(
  rng: () => number,
  rootX: number,
  rootY: number,
  baseAngle: number,
  baseHue: number,
): Branch {
  return {
    rootX,
    rootY,
    baseAngle,
    nodes: [],
    hue: baseHue + (rng() - 0.5) * 16,
    sat: 34 + rng() * 14,
    light: 40 + rng() * 12,
    alive: true,
    tipAbsAngle: baseAngle,
    sinceFlower: Math.floor(rng() * 2),
    sinceFork: 0,
    swayPhase: rng() * Math.PI * 2,
  };
}

export function makeGarden(seed: number): Garden {
  const rng = mulberry32(seed);
  const g: Garden = {
    seed,
    rng,
    branches: [],
    flowers: [],
    breaths: 0,
    segments: 0,
    register: 0,
    baseHue: STEM_HUE,
  };
  // seed a single short sprout so there is always something on screen
  const root = makeBranch(rng, ROOT_X, ROOT_Y, 0, g.baseHue);
  root.nodes.push({
    turn: 0,
    len: SEG_BASE_LEN * 0.8,
    width: SEG_WIDTH,
    born: 0,
    leaf: false,
    leafSide: 1,
  });
  g.branches.push(root);
  return g;
}

/** Walk a branch to node index `upto` (inclusive) and return the tip position.
 *  Pure geometry (no sway) — used to anchor forks and flowers. */
export function branchTip(
  b: Branch,
  upto: number,
): { x: number; y: number; angle: number } {
  let dir = b.baseAngle;
  let x = b.rootX;
  let y = b.rootY;
  const last = Math.min(upto, b.nodes.length - 1);
  for (let i = 0; i <= last; i++) {
    const n = b.nodes[i];
    dir += n.turn;
    x += Math.sin(dir) * n.len;
    y += Math.cos(dir) * n.len;
  }
  return { x, y, angle: dir };
}

/** Grow the garden by one step from a completed exhale. */
export function growGarden(g: Garden, strength: number): void {
  g.breaths += 1;

  // pick the youngest living branch to extend
  let target: Branch | null = null;
  for (let i = g.branches.length - 1; i >= 0; i--) {
    if (g.branches[i].alive) {
      target = g.branches[i];
      break;
    }
  }
  if (!target) {
    target = makeBranch(g.rng, ROOT_X, ROOT_Y, 0, g.baseHue);
    g.branches.push(target);
  }

  // extend: length scales with exhale strength; wobble with gentle upward pull
  const len = SEG_BASE_LEN + SEG_STRENGTH_LEN * strength;
  const wobble = (g.rng() - 0.5) * 0.5;
  const restore = -0.16 * target.tipAbsAngle; // gravitropism toward vertical
  const turn = wobble + restore;
  target.tipAbsAngle += turn;

  const width = Math.max(0.006, SEG_WIDTH * (1 - target.nodes.length * 0.03));
  const leaf = g.rng() < 0.55 && target.nodes.length > 0;
  target.nodes.push({
    turn,
    len,
    width,
    born: g.breaths,
    leaf,
    leafSide: g.rng() < 0.5 ? -1 : 1,
  });
  g.segments += 1;
  target.sinceFlower += 1;
  target.sinceFork += 1;

  // occasional fork off the tip
  if (
    target.nodes.length >= 3 &&
    target.sinceFork >= 2 &&
    g.rng() < 0.22 &&
    g.branches.length < 14
  ) {
    const tip = branchTip(target, target.nodes.length - 1);
    const spread = (0.5 + g.rng() * 0.4) * (g.rng() < 0.5 ? -1 : 1);
    const child = makeBranch(
      g.rng,
      tip.x,
      tip.y,
      tip.angle + spread,
      g.baseHue,
    );
    g.branches.push(child);
    target.sinceFork = 0;
  }

  // open a flower every few segments, at the tip
  if (target.sinceFlower >= FLOWER_EVERY) {
    target.sinceFlower = 0;
    const pick = FLOWER_HUES[(g.breaths + g.register) % FLOWER_HUES.length];
    g.flowers.push({
      branch: g.branches.indexOf(target),
      node: target.nodes.length - 1,
      size: 0.03 + g.rng() * 0.03 + strength * 0.02,
      open: 0,
      openTarget: 1,
      hue: pick + (g.rng() - 0.5) * 14,
      sat: 60 + g.rng() * 22,
      light: 62 + g.rng() * 12,
      petals: 5 + Math.floor(g.rng() * 3),
      spin: g.rng() * Math.PI * 2,
      born: g.breaths,
    });
  }

  // long-form evolution: drift palette + register so minute 5 != minute 1
  g.baseHue = STEM_HUE + Math.sin(g.breaths * 0.05) * 14;
  if (g.breaths % REGISTER_EVERY === 0) g.register += 1;
}

/** Per-frame animation: ease flower openness, gentle drift. `drive` shimmers. */
export function updateGarden(g: Garden, dt: number, drive: number): void {
  const k = Math.min(1, dt * 1.6);
  for (const f of g.flowers) {
    // blooms breathe a little wider on live drive
    const tgt = Math.min(1, f.openTarget * (0.85 + 0.15 * drive));
    f.open += (tgt - f.open) * k;
  }
}

/** Reset to a fresh garden (new seed) — clears all memory. */
export function resetGarden(seed: number): Garden {
  return makeGarden(seed);
}
