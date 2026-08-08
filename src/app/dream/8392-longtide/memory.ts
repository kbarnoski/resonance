// 8392-longtide · memory.ts
// The persistent memory of the piece: a ring buffer of SEEDS the user (or the
// virtual traveller) plants, plus the deterministic traveller that seeds and
// steers so the arc self-plays.
//
// A seed is a persistent vortex in the flow field AND a captured grain window
// of the carrier — a "phrase" the field can replay later, transformed.

import { mulberry32, MOVEMENT_SEC } from "./util";

export interface Seed {
  id: number;
  /** World-space position of the persistent vortex. */
  x: number;
  y: number;
  z: number;
  /** Seconds into the journey when planted. */
  t: number;
  /** 0..1 strength of the vortex / brightness of the mark. */
  intensity: number;
  /** Read-head position (0..1) captured from the carrier at plant time. */
  grainWindow: number;
  /** Semitone transposition chosen for this seed's phrase. */
  pitch: number;
  /** 0..1 relight envelope, driven up during Recollection then decaying. */
  relit: number;
}

const RING_CAPACITY = 40;

/** Fixed-capacity memory of planted seeds (oldest dropped first). */
export class MemoryRing {
  private seeds: Seed[] = [];
  private nextId = 1;

  add(s: Omit<Seed, "id" | "relit">): Seed {
    const seed: Seed = { ...s, id: this.nextId++, relit: 0 };
    this.seeds.push(seed);
    if (this.seeds.length > RING_CAPACITY) this.seeds.shift();
    return seed;
  }

  list(): Seed[] {
    return this.seeds;
  }

  /** Seeds planted strictly before a given time — the "past" to recollect. */
  before(t: number): Seed[] {
    return this.seeds.filter((s) => s.t < t);
  }

  clear(): void {
    this.seeds = [];
    this.nextId = 1;
  }
}

// ── The virtual traveller ────────────────────────────────────────────────────
// A deterministic autopilot seeded from 0x8392. It plants a front-loaded
// cluster in the first seconds (so Recollection always has material), then
// keeps steering and occasionally seeding through Stillness→Turbulence, goes
// quiet during Recollection, and leaves a last mark in Dissolution.

export interface TravellerApi {
  /** Plant a seed at a normalised-device coord (-1..1, -1..1). */
  plantAt: (ndcX: number, ndcY: number) => void;
  /** Steer the flow toward a normalised-device coord with a strength. */
  steer: (ndcX: number, ndcY: number, strength: number) => void;
}

interface PlantEvent {
  t: number;
  x: number;
  y: number;
  done: boolean;
}

export class VirtualTraveller {
  private rng: () => number;
  private plants: PlantEvent[] = [];
  active = true;

  constructor() {
    this.rng = mulberry32(0x8392);
    this.buildSchedule();
  }

  private buildSchedule(): void {
    const push = (t: number, x: number, y: number) =>
      this.plants.push({ t, x, y, done: false });

    // Front-loaded cluster: 6 seeds in the first ~9s so memory is never empty.
    for (let i = 0; i < 6; i++) {
      const t = 1.4 + i * 1.3;
      const x = (this.rng() * 2 - 1) * 0.8;
      const y = (this.rng() * 2 - 1) * 0.7;
      push(t, x, y);
    }
    // Sparse seeding through Bloom + Turbulence (movements 1–2).
    let t = MOVEMENT_SEC * 1.0;
    while (t < MOVEMENT_SEC * 3.0) {
      const x = (this.rng() * 2 - 1) * 0.9;
      const y = (this.rng() * 2 - 1) * 0.8;
      push(t, x, y);
      t += 8 + this.rng() * 12;
    }
    // A final mark early in Dissolution (movement 5).
    push(MOVEMENT_SEC * 4.2, (this.rng() * 2 - 1) * 0.5, (this.rng() * 2 - 1) * 0.4);
  }

  /** Advance the autopilot. No-op once the user has taken over. */
  update(tSec: number, api: TravellerApi): void {
    if (!this.active) return;

    // Continuous gentle steering along a slow Lissajous path.
    const sx = Math.sin(tSec * 0.11) * 0.7;
    const sy = Math.cos(tSec * 0.07 + 1.3) * 0.6;
    api.steer(sx, sy, 0.55);

    for (const p of this.plants) {
      if (!p.done && tSec >= p.t) {
        p.done = true;
        api.plantAt(p.x, p.y);
      }
    }
  }

  /** Called the instant a real human acts — the traveller yields forever. */
  retire(): void {
    this.active = false;
  }
}
