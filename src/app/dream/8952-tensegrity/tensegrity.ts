// tensegrity.ts — a tiny tensegrity physics solver.
//
// Model: a canonical 3-strut tensegrity prism (a "T-prism"): 6 nodes, 3 rigid
// struts that touch nothing, held apart by 9 tension-only cables. This is the
// smallest unit of Kenneth Snelson's floating-compression structures and the
// building block of his Needle Tower (1968).
//
// Integration is Verlet + constraint relaxation (the same family as cloth):
//   • struts  = BIDIRECTIONAL distance constraints — they hold their rest
//               length exactly (rigid compression members).
//   • cables  = TENSION-ONLY constraints — they may only PULL. If a cable is
//               longer than its rest length it drags its endpoints together;
//               if it is shorter it does nothing. Cables never push. This
//               one-sided rule is what makes the whole net self-stress and sag
//               globally when perturbed, and spring back when released.
//
// Because every node is shared between several cables, moving ONE node
// re-tensions the ENTIRE network — the physical basis for "retune the whole
// chord by sculpting one node".

import { mulberry32 } from "./prng";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PNode {
  x: number;
  y: number;
  z: number;
  px: number; // previous position (Verlet)
  py: number;
  pz: number;
  pinned: boolean; // anchored base node — never moves
}

export type BarKind = "strut" | "cable";

export interface Bar {
  a: number; // node index
  b: number; // node index
  rest: number; // rest length
  kind: BarKind;
  stiffness: number; // constraint stiffness [0..1]
  length: number; // live length (updated each step)
  tension: number; // live tension = max(0, length-rest)*stiffness (cables)
}

export interface World {
  nodes: PNode[];
  bars: Bar[];
  struts: number[]; // indices into bars
  cables: number[]; // indices into bars
  gravity: number;
  damping: number;
  passes: number;
  maxTension: number; // running estimate for normalisation
  center: Vec3;
  radius: number; // rough bounding radius (for camera framing)
}

function dist(n: PNode, m: PNode): number {
  const dx = n.x - m.x;
  const dy = n.y - m.y;
  const dz = n.z - m.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
}

/** Which cables touch a given node — used to voice a pluck as a chord. */
export function incidentCables(world: World, node: number): number[] {
  const out: number[] = [];
  for (const bi of world.cables) {
    const bar = world.bars[bi];
    if (bar.a === node || bar.b === node) out.push(bi);
  }
  return out;
}

/**
 * Build the 3-strut prism. The top triangle is twisted relative to the base by
 * ~150° (the classic equilibrium twist for n=3); cable rest lengths are set
 * SHORTER than their built length so the assembly is prestressed — it settles
 * into a self-stressed equilibrium and springs back from any poke.
 */
export function buildTensegrity(seed: number): World {
  const rng = mulberry32(seed);
  const R = 1.0; // triangle circumradius
  const H = 1.7; // prism height
  const twist = (150 * Math.PI) / 180;

  const nodes: PNode[] = [];
  const jitter = () => (rng() - 0.5) * 0.02; // tiny seeded asymmetry

  // Base triangle (pinned), y = 0
  for (let i = 0; i < 3; i++) {
    const ang = (i * 2 * Math.PI) / 3 + Math.PI / 2;
    const x = R * Math.cos(ang);
    const z = R * Math.sin(ang);
    nodes.push({ x, y: 0, z, px: x, py: 0, pz: z, pinned: true });
  }
  // Top triangle (free), y = H, twisted
  for (let i = 0; i < 3; i++) {
    const ang = (i * 2 * Math.PI) / 3 + Math.PI / 2 + twist;
    const x = R * Math.cos(ang) + jitter();
    const y = H + jitter();
    const z = R * Math.sin(ang) + jitter();
    nodes.push({ x, y, z, px: x, py: y, pz: z, pinned: false });
  }

  const bars: Bar[] = [];
  const struts: number[] = [];
  const cables: number[] = [];

  const addBar = (
    a: number,
    b: number,
    kind: BarKind,
    restScale: number,
    stiffness: number,
  ) => {
    const len = dist(nodes[a], nodes[b]);
    const idx = bars.length;
    bars.push({
      a,
      b,
      rest: len * restScale,
      kind,
      stiffness,
      length: len,
      tension: 0,
    });
    if (kind === "strut") struts.push(idx);
    else cables.push(idx);
  };

  // Struts: base i -> top i (rigid). With the 150° twist these cross the
  // interior without touching — floating compression.
  for (let i = 0; i < 3; i++) addBar(i, 3 + i, "strut", 1.0, 1.0);

  // Base ring cables
  addBar(0, 1, "cable", 0.9, 0.55);
  addBar(1, 2, "cable", 0.9, 0.55);
  addBar(2, 0, "cable", 0.9, 0.55);
  // Top ring cables
  addBar(3, 4, "cable", 0.88, 0.5);
  addBar(4, 5, "cable", 0.88, 0.5);
  addBar(5, 3, "cable", 0.88, 0.5);
  // Saddle / vertical cables: base i -> top (i+2)%3
  addBar(0, 5, "cable", 0.9, 0.45);
  addBar(1, 3, "cable", 0.9, 0.45);
  addBar(2, 4, "cable", 0.9, 0.45);

  const world: World = {
    nodes,
    bars,
    struts,
    cables,
    gravity: 0.6,
    damping: 0.96,
    passes: 8,
    maxTension: 0.5,
    center: { x: 0, y: H * 0.5, z: 0 },
    radius: Math.max(R, H) * 1.35,
  };

  // Pre-settle so the very first rendered frame is already at equilibrium.
  for (let i = 0; i < 120; i++) step(world, 1 / 60);
  return world;
}

/** One physics step: Verlet integrate, then relax constraints, then measure. */
export function step(world: World, dt: number): void {
  const { nodes, bars } = world;
  const g = world.gravity;
  const damp = world.damping;
  const dt2 = dt * dt;

  // Verlet integration
  for (const n of nodes) {
    if (n.pinned) continue;
    const vx = (n.x - n.px) * damp;
    const vy = (n.y - n.py) * damp;
    const vz = (n.z - n.pz) * damp;
    n.px = n.x;
    n.py = n.y;
    n.pz = n.z;
    n.x += vx;
    n.y += vy - g * dt2;
    n.z += vz;
  }

  // Constraint relaxation
  for (let pass = 0; pass < world.passes; pass++) {
    for (const bar of bars) {
      const a = nodes[bar.a];
      const b = nodes[bar.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;

      // Tension-only cables never push.
      if (bar.kind === "cable" && len <= bar.rest) continue;

      const diff = ((len - bar.rest) / len) * bar.stiffness;
      const ox = dx * 0.5 * diff;
      const oy = dy * 0.5 * diff;
      const oz = dz * 0.5 * diff;

      const aFree = a.pinned ? 0 : 1;
      const bFree = b.pinned ? 0 : 1;
      const total = aFree + bFree;
      if (total === 0) continue;
      // Distribute correction, giving the whole share to the free endpoint
      // when the other is pinned.
      const wa = aFree === 0 ? 0 : (total === 1 ? 2 : 1);
      const wb = bFree === 0 ? 0 : (total === 1 ? 2 : 1);
      if (!a.pinned) {
        a.x += ox * wa;
        a.y += oy * wa;
        a.z += oz * wa;
      }
      if (!b.pinned) {
        b.x -= ox * wb;
        b.y -= oy * wb;
        b.z -= oz * wb;
      }
    }
  }

  // Measure live length + tension
  let maxT = 1e-4;
  for (const bar of bars) {
    const a = nodes[bar.a];
    const b = nodes[bar.b];
    bar.length = dist(a, b);
    bar.tension =
      bar.kind === "cable"
        ? Math.max(0, bar.length - bar.rest) * bar.stiffness
        : 0;
    if (bar.tension > maxT) maxT = bar.tension;
  }
  // Smoothly track the running max so cable glow normalisation is stable.
  world.maxTension += (Math.max(maxT, 0.15) - world.maxTension) * 0.05;
}

/** Add an impulse to a node (used by drag-release flick and the auto-breeze). */
export function perturbNode(
  world: World,
  node: number,
  ix: number,
  iy: number,
  iz: number,
): void {
  const n = world.nodes[node];
  if (n.pinned) return;
  // Verlet impulse = shift previous position backward.
  n.px -= ix;
  n.py -= iy;
  n.pz -= iz;
}
