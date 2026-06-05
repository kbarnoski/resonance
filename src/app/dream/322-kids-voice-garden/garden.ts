// Space colonization growth simulation.
//
// Reference: Runions, Lane & Prusinkiewicz (2007), "Modeling Trees with a
// Space Colonization Algorithm", algorithmicbotany.org. Branch tips grow toward
// nearby attractor points ("light") within an influence radius, stepping a fixed
// distance along the averaged attractor direction; attractors within a kill
// radius are consumed (removed). This yields organic, alive-looking growth that
// a recursive L-system can't.
//
// Coordinate space is the SVG viewBox: 0..VIEW_W wide, 0..VIEW_H tall, y=0 at
// the top of the sky, y=VIEW_H at the soil line. Plants grow UPWARD (toward
// smaller y) chasing light placed high by high-pitched voice.

export const VIEW_W = 1000;
export const VIEW_H = 1000;
export const SOIL_Y = 940; // ground line — seeds start here

// Algorithm tuning. Distances are in viewBox units.
const INFLUENCE_R = 230; // attractor influences a node within this radius
const KILL_R = 34; // attractor consumed when a tip gets this close
const STEP = 14; // growth step length per grow tick
const MAX_NODES_PER_PLANT = 520; // safety cap so a plant can't explode
const BRANCH_MIN_GAP = 26; // min spacing between new tips off one node

export interface GNode {
  id: number;
  x: number;
  y: number;
  parent: number; // index into nodes, -1 for the seed root
  /** Distance (in steps) from this node back to the seed — drives thickness. */
  depth: number;
  /** A node becomes a bloom when it stops growing near a consumed attractor. */
  bloom: number; // 0 = not blooming, else 0..1 bloom openness
  bloomNote: number; // scale-degree index chosen when it bloomed
  /** Has this tip's bloom note already been played? */
  played: boolean;
  hue: number; // colour at this node (degrees) — set from harmonic state
}

export interface Attractor {
  x: number;
  y: number;
  /** Energy 0..1 — how brightly the light glows; decays over time. */
  energy: number;
}

export interface Plant {
  id: number;
  seedX: number;
  nodes: GNode[];
  attractors: Attractor[];
  /** Growth budget accumulated from voice/touch; spent one STEP per node. */
  budget: number;
  bornAt: number; // ms timestamp (wall clock)
  baseHue: number; // a plant's signature colour family
}

let _nid = 1;
let _pid = 1;

export function nextPlantId(): number {
  return _pid++;
}

/** Seed a new plant at ground level at viewBox x. */
export function growSeed(x: number, bornAt: number, baseHue: number): Plant {
  const root: GNode = {
    id: _nid++,
    x,
    y: SOIL_Y,
    parent: -1,
    depth: 0,
    bloom: 0,
    bloomNote: 0,
    played: true, // root never plays
    hue: baseHue,
  };
  return {
    id: nextPlantId(),
    seedX: x,
    nodes: [root],
    attractors: [],
    budget: STEP * 3, // a little initial reach so a fresh seed sprouts
    bornAt,
    baseHue,
  };
}

/** Add a light/attractor to a plant (called by voice or touch). */
export function applyLight(plant: Plant, x: number, y: number, energy: number) {
  // Merge into a nearby attractor instead of stacking dozens.
  for (const a of plant.attractors) {
    const dx = a.x - x;
    const dy = a.y - y;
    if (dx * dx + dy * dy < KILL_R * KILL_R * 4) {
      a.energy = Math.min(1, a.energy + energy * 0.6);
      a.x = (a.x + x) / 2;
      a.y = (a.y + y) / 2;
      return;
    }
  }
  if (plant.attractors.length > 60) return; // cap
  plant.attractors.push({ x, y, energy: Math.min(1, energy) });
}

/** Add growth budget (loudness → speed). */
export function applyBudget(plant: Plant, amount: number) {
  plant.budget = Math.min(plant.budget + amount, STEP * 60);
}

/** True if a plant has anything to do (used to skip idle work). */
export function plantActive(plant: Plant): boolean {
  return (
    plant.budget > 0 &&
    plant.attractors.length > 0 &&
    plant.nodes.length < MAX_NODES_PER_PLANT
  );
}

/**
 * Run ONE space-colonization growth step on a plant. Returns indices of any
 * nodes that newly bloomed this step (so the caller can play their notes).
 *
 * hueFor: maps a freshly grown node's height to a hue (caller supplies the
 * current harmonic colour). noteFor: picks a scale-degree for a new bloom.
 */
export function stepPlant(
  plant: Plant,
  hueFor: (y: number) => number,
  noteFor: () => number,
): number[] {
  const bloomed: number[] = [];
  if (plant.budget < STEP || plant.attractors.length === 0) return bloomed;
  if (plant.nodes.length >= MAX_NODES_PER_PLANT) {
    plant.budget = 0;
    return bloomed;
  }

  const nodes = plant.nodes;
  const atts = plant.attractors;

  // 1. For each attractor, find its single closest node within influence.
  //    influencedBy[nodeIndex] = list of attractor indices pulling on it.
  const influencedBy = new Map<number, number[]>();
  for (let ai = 0; ai < atts.length; ai++) {
    const a = atts[ai];
    let best = -1;
    let bestD = INFLUENCE_R * INFLUENCE_R;
    for (let ni = 0; ni < nodes.length; ni++) {
      const n = nodes[ni];
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = ni;
      }
    }
    if (best >= 0) {
      const list = influencedBy.get(best);
      if (list) list.push(ai);
      else influencedBy.set(best, [ai]);
    }
  }

  if (influencedBy.size === 0) {
    // No attractor in reach of any tip — nudge nothing; let energy decay.
    return bloomed;
  }

  // 2. Each influenced node grows ONE new node toward its averaged attractors.
  const newNodes: GNode[] = [];
  let spent = 0;
  for (const [ni, attIdxs] of influencedBy) {
    if (plant.budget - spent < STEP) break;
    const n = nodes[ni];
    let dirX = 0;
    let dirY = 0;
    for (const ai of attIdxs) {
      const a = atts[ai];
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      const len = Math.hypot(dx, dy) || 1;
      dirX += dx / len;
      dirY += dy / len;
    }
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-4) continue;
    dirX /= len;
    dirY /= len;

    // Avoid spawning a near-duplicate tip right on top of an existing child.
    const nx = n.x + dirX * STEP;
    const ny = n.y + dirY * STEP;

    const child: GNode = {
      id: _nid++,
      x: nx,
      y: ny,
      parent: ni,
      depth: n.depth + 1,
      bloom: 0,
      bloomNote: 0,
      played: false,
      hue: hueFor(ny),
    };
    newNodes.push(child);
    spent += STEP;
  }
  plant.budget -= spent;

  // 3. Append new nodes, then consume attractors within kill radius of any tip.
  const startIdx = nodes.length;
  for (const c of newNodes) nodes.push(c);

  // Track which new tips ended up near a now-dead attractor → those bloom.
  const survivors: Attractor[] = [];
  for (const a of atts) {
    let consumedBy = -1;
    for (let ni = startIdx; ni < nodes.length; ni++) {
      const n = nodes[ni];
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      if (dx * dx + dy * dy < KILL_R * KILL_R) {
        consumedBy = ni;
        break;
      }
    }
    if (consumedBy >= 0) {
      const n = nodes[consumedBy];
      if (n.bloom === 0) {
        n.bloom = 0.001; // begin opening (animated up elsewhere)
        n.bloomNote = noteFor();
        n.played = false;
        bloomed.push(consumedBy);
      }
    } else {
      // Decay attractor energy; drop the faint ones.
      a.energy *= 0.985;
      if (a.energy > 0.04) survivors.push(a);
    }
  }
  plant.attractors = survivors;

  // 4. Prune duplicate-ish tips (keep spacing) — cheap dedupe on new nodes.
  if (newNodes.length > 1) {
    for (let i = startIdx; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < BRANCH_MIN_GAP * BRANCH_MIN_GAP * 0.25) {
          // Merge b into a by re-parenting — leave geometry, just stop double work.
          b.x = (a.x + b.x) / 2;
          b.y = (a.y + b.y) / 2;
        }
      }
    }
  }

  return bloomed;
}

/** Advance bloom-open animation; mutates in place. dt seconds. */
export function stepBlooms(plant: Plant, dt: number) {
  for (const n of plant.nodes) {
    if (n.bloom > 0 && n.bloom < 1) {
      n.bloom = Math.min(1, n.bloom + dt * 1.6);
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence. Plants are saved with wall-clock timestamps. On reopen we
// simulate "offline growth" so a garden seeded last night is fuller this
// morning — capped so it can't explode.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "voice-garden-322-v1";
const OFFLINE_GROWTH_PER_MIN = STEP * 1.1; // budget gained per offline minute
const OFFLINE_MAX_BUDGET = STEP * 240; // cap on accumulated offline budget

interface SavedPlant {
  id: number;
  seedX: number;
  bornAt: number;
  baseHue: number;
  nodes: GNode[];
}

interface SaveBlob {
  savedAt: number;
  plants: SavedPlant[];
}

export function saveGarden(plants: Plant[]) {
  try {
    const blob: SaveBlob = {
      savedAt: Date.now(),
      plants: plants.slice(0, 8).map((p) => ({
        id: p.id,
        seedX: p.seedX,
        bornAt: p.bornAt,
        baseHue: p.baseHue,
        // Trim node list if a plant got huge, keep the structure.
        nodes: p.nodes.slice(0, MAX_NODES_PER_PLANT),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    // storage full / disabled — silently ignore, garden just won't persist.
  }
}

/**
 * Load saved plants and grant each an offline-growth budget proportional to how
 * long the garden was closed (capped). Returns reconstructed plants plus the
 * total offline minutes (for a gentle "welcome back, your garden grew" cue).
 */
export function loadGarden(): { plants: Plant[]; offlineMin: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plants: [], offlineMin: 0 };
    const blob = JSON.parse(raw) as SaveBlob;
    if (!blob.plants?.length) return { plants: [], offlineMin: 0 };
    const now = Date.now();
    const offlineMs = Math.max(0, now - (blob.savedAt ?? now));
    const offlineMin = offlineMs / 60000;
    const offlineBudget = Math.min(
      OFFLINE_MAX_BUDGET,
      offlineMin * OFFLINE_GROWTH_PER_MIN,
    );

    // Keep id counters ahead of anything we load so new nodes don't collide.
    let maxNid = 1;
    let maxPid = 1;

    const plants: Plant[] = blob.plants.map((sp) => {
      for (const n of sp.nodes) if (n.id >= maxNid) maxNid = n.id + 1;
      if (sp.id >= maxPid) maxPid = sp.id + 1;
      return {
        id: sp.id,
        seedX: sp.seedX,
        nodes: sp.nodes,
        attractors: [],
        budget: offlineBudget,
        bornAt: sp.bornAt,
        baseHue: sp.baseHue,
      };
    });
    _nid = Math.max(_nid, maxNid);
    _pid = Math.max(_pid, maxPid);
    return { plants, offlineMin };
  } catch {
    return { plants: [], offlineMin: 0 };
  }
}

/**
 * Spend offline budget by seeding upward attractors and running growth steps,
 * so a returning garden visibly fills out. Mutates plants in place.
 */
export function runOfflineGrowth(
  plants: Plant[],
  hueFor: (y: number) => number,
  noteFor: () => number,
) {
  for (const p of plants) {
    let guard = 0;
    while (p.budget >= STEP && guard < 400) {
      guard++;
      // Drop a few light points above the current canopy so growth heads up.
      if (p.attractors.length < 6) {
        const topY = Math.min(...p.nodes.map((n) => n.y));
        for (let i = 0; i < 4; i++) {
          applyLight(
            p,
            p.seedX + (Math.random() - 0.5) * 360,
            Math.max(120, topY - 80 - Math.random() * 220),
            0.7,
          );
        }
      }
      stepPlant(p, hueFor, noteFor);
    }
    // Offline blooms are already "open" — no audio for past growth.
    for (const n of p.nodes) if (n.bloom > 0) n.bloom = 1;
  }
}

export const GARDEN_TUNING = { INFLUENCE_R, KILL_R, STEP, MAX_NODES_PER_PLANT };
