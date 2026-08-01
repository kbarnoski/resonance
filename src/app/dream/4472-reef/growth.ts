// growth.ts — the irreversible garden: a space-colonization branching engine
// with a built-in CONSEQUENCE model (local crowding → harmonic penalty).
//
// The growth core is the Space Colonization Algorithm (Runions, Lane &
// Prusinkiewicz, "Modeling Trees with a Space Colonization Algorithm",
// Eurographics Workshop on Natural Phenomena, 2007; and Runions et al.,
// "Modeling and visualization of leaf venation patterns", 2005): a cloud of
// ATTRACTOR points pulls a network of NODES; each attractor tugs its nearest
// node; an influenced node steps one segment toward the *average* pull and
// spawns a child; attractors inside the kill radius are consumed. Bifurcation
// emerges wherever a node is pulled in divergent directions.
//
// What is specific to THIS piece — the reason it is not just another grower —
// is irreversibility + consequence: nodes are NEVER deleted, and every birth is
// scored against the LOCAL NODE DENSITY it was born into. A sparse birth lands
// clean on a just-pentatonic degree; a crowded birth is detuned, dulled and
// shortened, and the whole garden's global "chokedness" (a smoothed average of
// recent crowding) rises — which the host uses to bleach the color and choke
// the master audio. Greed is punished. You live with what you planted.
//
// Pure module: no React / DOM / Web-Audio imports. Deterministic — all
// randomness comes from an injected mulberry32 stream (never Math.random /
// Date.now / new Date()).

// ── determinism ──────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32). Deterministic; the only source of randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── field geometry ───────────────────────────────────────────────────────────

export const FIELD_W = 1000;
export const FIELD_H = 640;

export interface GrowthParams {
  attractionRadius: number; // attractors farther than this cannot pull a node
  killRadius: number; // attractors closer than this to any node are consumed
  segmentLength: number; // step a node takes toward its averaged pull
  densityRadius: number; // neighbourhood radius for the crowding penalty
  maxNodes: number; // hard cap — the garden fills, then holds (irreversible)
  jitter: number; // organic wander on each step (radians, ±)
}

export const PARAMS: GrowthParams = {
  attractionRadius: 62,
  killRadius: 12,
  segmentLength: 8,
  densityRadius: 46,
  maxNodes: 2600,
  jitter: 0.34,
};

/** The five species = five degrees of greed. Bigger clouds packed into a
 *  similar radius crowd themselves and choke; the smallest sprout stays clean. */
export interface Species {
  label: string;
  attractors: number; // cloud size scattered per planting
  radius: number; // cloud disc radius
}
export const SPECIES: Species[] = [
  { label: "sprig", attractors: 22, radius: 66 },
  { label: "frond", attractors: 40, radius: 78 },
  { label: "bough", attractors: 62, radius: 88 },
  { label: "thicket", attractors: 90, radius: 96 },
  { label: "briar", attractors: 126, radius: 104 },
];

// ── node / attractor model ───────────────────────────────────────────────────

export interface GNode {
  x: number;
  y: number;
  parent: number; // index of parent node, or -1 for a seed root
  depth: number; // generations from the seed root
  seed: number; // which planting this belongs to
  angle: number; // direction parent→node (radians), selects the scale degree
  bornStep: number; // growth step index at birth (for the fresh-tip glow)
  crowd: number; // local density at birth, normalised 0..1 (the penalty)
  hasChild: boolean;
}

export interface Attractor {
  x: number;
  y: number;
  dead: boolean;
}

/** Emitted for each node born in a step, so the host can sonify the birth. */
export interface Birth {
  index: number;
  x: number;
  y: number;
  depth: number;
  angle: number;
  crowd: number;
}

export interface Garden {
  nodes: GNode[];
  attractors: Attractor[];
  seedCount: number;
  step: number; // growth-step counter (not frames)
  chokedness: number; // smoothed global crowding 0..1 — drives the bleaching
  full: boolean; // node cap reached
}

export function makeGarden(): Garden {
  return {
    nodes: [],
    attractors: [],
    seedCount: 0,
    step: 0,
    chokedness: 0,
    full: false,
  };
}

/** Plant a permanent seed: one root node + a local cloud of attractors around
 *  it. This is the ONLY way to add growth — and it can never be undone. */
export function plantSeed(
  g: Garden,
  x: number,
  y: number,
  species: Species,
  rng: () => number,
): void {
  if (g.full) return;
  const seed = g.seedCount++;
  g.nodes.push({
    x,
    y,
    parent: -1,
    depth: 0,
    seed,
    angle: -Math.PI / 2, // seeds "reach up" by default until pulled
    bornStep: g.step,
    crowd: 0,
    hasChild: false,
  });
  for (let i = 0; i < species.attractors; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = species.radius * Math.sqrt(rng());
    const ax = Math.max(4, Math.min(FIELD_W - 4, x + Math.cos(ang) * rad));
    const ay = Math.max(4, Math.min(FIELD_H - 4, y + Math.sin(ang) * rad));
    g.attractors.push({ x: ax, y: ay, dead: false });
  }
}

export function liveAttractors(g: Garden): number {
  let n = 0;
  for (const a of g.attractors) if (!a.dead) n++;
  return n;
}

/** clamp helper */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── one growth step (space colonization + crowding score) ────────────────────

/**
 * Advance the garden one space-colonization step and return the births.
 * A coarse grid gives O(1) density lookups so the crowding penalty stays cheap
 * even as the node count climbs into the thousands.
 */
export function stepGarden(g: Garden, rng: () => number): Birth[] {
  const births: Birth[] = [];
  if (g.full || g.attractors.length === 0) return births;

  const { attractionRadius, killRadius, segmentLength, densityRadius, jitter } =
    PARAMS;
  const ar2 = attractionRadius * attractionRadius;
  const kr2 = killRadius * killRadius;
  const nodes = g.nodes;

  // Coarse spatial grid over existing nodes for the density penalty.
  const cell = densityRadius;
  const cols = Math.ceil(FIELD_W / cell) + 1;
  const grid = new Map<number, number>();
  const keyOf = (x: number, y: number) =>
    (Math.floor(y / cell) * cols + Math.floor(x / cell)) | 0;
  for (const n of nodes) {
    const k = keyOf(n.x, n.y);
    grid.set(k, (grid.get(k) ?? 0) + 1);
  }
  const densityAt = (x: number, y: number): number => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let c = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        c += grid.get(((cy + dy) * cols + (cx + dx)) | 0) ?? 0;
    return c;
  };

  // Accumulate each attractor's pull onto its nearest node.
  const pullX = new Float64Array(nodes.length);
  const pullY = new Float64Array(nodes.length);
  const pullN = new Int32Array(nodes.length);
  for (const a of g.attractors) {
    if (a.dead) continue;
    let best = -1;
    let bestD2 = ar2;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best >= 0) {
      const n = nodes[best];
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      const len = Math.hypot(dx, dy) || 1;
      pullX[best] += dx / len;
      pullY[best] += dy / len;
      pullN[best] += 1;
    }
  }

  // Step every influenced node forward, spawning one child.
  g.step++;
  const snapshot = nodes.length; // don't grow into the children we add
  for (let i = 0; i < snapshot; i++) {
    if (pullN[i] === 0) continue;
    if (nodes.length >= PARAMS.maxNodes) {
      g.full = true;
      break;
    }
    const n = nodes[i];
    let dx = pullX[i] / pullN[i];
    let dy = pullY[i] / pullN[i];
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    dx /= len;
    dy /= len;
    const j = (rng() - 0.5) * 2 * jitter;
    const cs = Math.cos(j);
    const sn = Math.sin(j);
    const jx = dx * cs - dy * sn;
    const jy = dx * sn + dy * cs;

    const childX = n.x + jx * segmentLength;
    const childY = n.y + jy * segmentLength;
    const angle = Math.atan2(jy, jx);

    // Crowding penalty: local density BEFORE this birth, normalised.
    const dens = densityAt(childX, childY);
    const crowd = clamp01((dens - 6) / 34);

    n.hasChild = true;
    const child: GNode = {
      x: childX,
      y: childY,
      parent: i,
      depth: n.depth + 1,
      seed: n.seed,
      angle,
      bornStep: g.step,
      crowd,
      hasChild: false,
    };
    const idx = nodes.length;
    nodes.push(child);
    births.push({ index: idx, x: childX, y: childY, depth: child.depth, angle, crowd });

    // Smooth the garden-wide chokedness toward this birth's crowding.
    g.chokedness += (crowd - g.chokedness) * 0.05;
  }

  // Consume attractors within kill radius of any node.
  for (const a of g.attractors) {
    if (a.dead) continue;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      if (dx * dx + dy * dy < kr2) {
        a.dead = true;
        break;
      }
    }
  }
  // Compact dead attractors occasionally to keep the inner loop lean.
  if (g.step % 90 === 0) {
    g.attractors = g.attractors.filter((a) => !a.dead);
  }

  return births;
}

/** Biomass 0..1 for the drone swell (saturates well before the hard cap). */
export function biomass01(g: Garden): number {
  return clamp01(g.nodes.length / 1500);
}

// ── geometry → harmony (deterministic mapping) ───────────────────────────────

// Just-intonation MAJOR PENTATONIC on C — the warm, always-consonant bank.
// C  D(9/8)  E(5/4)  G(3/2)  A(5/3), from C3 = 130.81 Hz.
const C3 = 130.81;
const PENTA = [
  C3 * 1, // C
  C3 * (9 / 8), // D
  C3 * (5 / 4), // E
  C3 * (3 / 2), // G
  C3 * (5 / 3), // A
];

export interface Voicing {
  freq: number; // Hz on the just-pentatonic grid
  detuneCents: number; // crowding pushes the voice sour (±)
  brightness: number; // 1 sparse & ringing → ~0.15 crowded & dull
}

/**
 * Map a birth's GEOMETRY to a note, deterministically:
 *  • branch ANGLE selects the scale degree (which of 5 pentatonic pitches),
 *  • DEPTH selects the octave (tips reaching outward ring higher),
 *  • local CROWD detunes / dulls it — the consequence of greed.
 * A sparse garden therefore lands on clean just intervals; an overgrown one
 * beats and bleaches.
 */
export function voiceForBirth(b: Birth): Voicing {
  const a = (b.angle + Math.PI * 4) % (Math.PI * 2); // 0..2π
  const degree = Math.floor((a / (Math.PI * 2)) * PENTA.length) % PENTA.length;
  const octave = Math.min(2, Math.floor(b.depth / 11));
  const freq = PENTA[degree] * Math.pow(2, octave);
  const sign = b.index % 2 === 0 ? 1 : -1;
  const detuneCents = sign * b.crowd * 58;
  const brightness = 1 - 0.82 * b.crowd;
  return { freq, detuneCents, brightness };
}
