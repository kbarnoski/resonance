// memory.ts — the spatial-MEMORY model: dwell detection + durable resonant nodes.
//
// The room watches the live "present locus" (your body's position in the depth
// volume). When the locus holds still inside a small sphere for DWELL_SECONDS,
// the room DEPOSITS a durable memory-node at that 3D spot — assigned a just-
// intonation partial from the depth it was born at, and a stereo pan from its
// horizontal position. Nodes persist for the whole session. When the live locus
// passes back through a node's sphere, that node SWELLS (louder + brighter).
//
// This module is pure data/logic — no audio, no rendering. The page wires the
// returned events to the audio engine and reads `nodes` for the renderer.

import { freqForDepth } from "./audio";

export interface Locus {
  x: number; // world coords (see cloud.ts SPAN)
  y: number;
  z: number;
  band: number; // 0..1 depth band at the locus (→ which partial)
  level: number; // 0..1 how present / near the subject is
}

export interface MemoryNode {
  id: number;
  x: number;
  y: number;
  z: number;
  freq: number;
  index: number; // scale index (for colour/register hints)
  pan: number;
  bornAt: number;
  swell: number; // smoothed proximity swell, 0..1
  glow: number; // visual brightness, 0..1
}

export type WellEvent =
  | { type: "add"; node: MemoryNode }
  | { type: "pluck"; node: MemoryNode }
  | { type: "remove"; id: number };

const DWELL_RADIUS = 0.16; // world units — how still counts as "dwelling"
const DWELL_SECONDS = 1.25; // hold this long to deposit
const COOLDOWN = 0.9; // min gap between deposits
const MERGE_RADIUS = 0.24; // re-dwell within this of a node → swell it, no dup
const SWELL_RADIUS = 0.55; // locus within this of a node → node swells
const MAX_NODES = 13;
const LEVEL_MIN = 0.14; // below this presence, never deposit (empty room)

function dist3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function smoothFalloff(edge: number, d: number): number {
  if (d >= edge) return 0;
  const x = 1 - d / edge;
  return x * x * (3 - 2 * x); // smoothstep
}

export class Well {
  readonly nodes: MemoryNode[] = [];
  dwellProgress = 0;

  private anchorX = 0;
  private anchorY = 0;
  private anchorZ = 0;
  private dwellTime = 0;
  private cooldown = 0;
  private nextId = 1;
  private panFor: (worldX: number) => number;

  constructor(panFor: (worldX: number) => number) {
    this.panFor = panFor;
  }

  /** Advance one frame. Returns audio events to apply. */
  update(locus: Locus, dt: number, t: number): WellEvent[] {
    const events: WellEvent[] = [];
    this.cooldown = Math.max(0, this.cooldown - dt);

    // 1. proximity swell for every durable node
    for (const n of this.nodes) {
      const d = dist3(locus.x, locus.y, locus.z, n.x, n.y, n.z);
      const target = smoothFalloff(SWELL_RADIUS, d) * Math.min(1, locus.level * 1.3);
      n.swell += (target - n.swell) * Math.min(1, dt * 4.5);
      n.glow = 0.28 + n.swell * 0.9;
    }

    // 2. dwell detection (only when someone is actually present)
    if (locus.level < LEVEL_MIN) {
      this.anchorX = locus.x;
      this.anchorY = locus.y;
      this.anchorZ = locus.z;
      this.dwellTime = 0;
      this.dwellProgress = 0;
      return events;
    }

    const d = dist3(
      locus.x,
      locus.y,
      locus.z,
      this.anchorX,
      this.anchorY,
      this.anchorZ,
    );
    if (d < DWELL_RADIUS) {
      this.dwellTime += dt;
      // let the anchor drift gently toward the locus so it tracks a slow hold
      this.anchorX += (locus.x - this.anchorX) * Math.min(1, dt * 1.2);
      this.anchorY += (locus.y - this.anchorY) * Math.min(1, dt * 1.2);
      this.anchorZ += (locus.z - this.anchorZ) * Math.min(1, dt * 1.2);
    } else {
      this.anchorX = locus.x;
      this.anchorY = locus.y;
      this.anchorZ = locus.z;
      this.dwellTime = 0;
    }
    this.dwellProgress = Math.min(1, this.dwellTime / DWELL_SECONDS);

    if (this.dwellTime >= DWELL_SECONDS && this.cooldown <= 0) {
      this.deposit(locus, t, events);
      this.dwellTime = 0;
      this.dwellProgress = 0;
      this.cooldown = COOLDOWN;
    }

    return events;
  }

  private deposit(locus: Locus, t: number, events: WellEvent[]): void {
    // Re-dwelling near an existing node just re-sounds it (no duplicate).
    let nearest: MemoryNode | null = null;
    let nd = Infinity;
    for (const n of this.nodes) {
      const d = dist3(this.anchorX, this.anchorY, this.anchorZ, n.x, n.y, n.z);
      if (d < nd) {
        nd = d;
        nearest = n;
      }
    }
    if (nearest && nd < MERGE_RADIUS) {
      nearest.bornAt = t;
      nearest.swell = Math.max(nearest.swell, 0.8);
      events.push({ type: "pluck", node: nearest });
      return;
    }

    const { freq, index } = freqForDepth(locus.band);
    const node: MemoryNode = {
      id: this.nextId++,
      x: this.anchorX,
      y: this.anchorY,
      z: this.anchorZ,
      freq,
      index,
      pan: this.panFor(this.anchorX),
      bornAt: t,
      swell: 0.85,
      glow: 1,
    };
    this.nodes.push(node);
    events.push({ type: "add", node });

    // Cap: recycle the dimmest, oldest node so the chord stays legible.
    if (this.nodes.length > MAX_NODES) {
      let worstI = 0;
      let worstScore = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (n.id === node.id) continue;
        const score = n.swell * 4 + (t - n.bornAt) * -0.02;
        if (score < worstScore) {
          worstScore = score;
          worstI = i;
        }
      }
      const [removed] = this.nodes.splice(worstI, 1);
      events.push({ type: "remove", id: removed.id });
    }
  }
}
