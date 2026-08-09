// ─────────────────────────────────────────────────────────────────────────────
// performer.ts — seeded deterministic auto-wind. A gentle scripted breeze that
// periodically GUSTS the cloth so a fold sweeps across on its own — the concept
// is legible with zero interaction, and the travelling fold reads even muted.
// All randomness comes from the injected mulberry32 stream (never Math.random).
// ─────────────────────────────────────────────────────────────────────────────

import { ClothForces } from "./cloth";

interface Gust {
  x: number; // world-x centre
  vx: number; // travel speed (world units / s)
  amp: number; // out-of-plane push
  sig: number; // gaussian half-width
}

const GRAVITY = -2.3;

export class Performer {
  private readonly rng: () => number;
  private gusts: Gust[] = [];
  private nextAt = 0;
  private started = false;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  private schedule(now: number, reduced: boolean): void {
    const gap = reduced ? 4.5 + this.rng() * 3 : 2.2 + this.rng() * 2.3;
    this.nextAt = now + gap;
  }

  private spawn(reduced: boolean): void {
    const dir = this.rng() < 0.5 ? 1 : -1;
    const ampBase = 0.7 + this.rng() * 0.9;
    this.gusts.push({
      x: dir > 0 ? -1.15 : 1.15,
      vx: dir * (0.38 + this.rng() * 0.4),
      amp: (dir > 0 ? 1 : -1) * ampBase * (reduced ? 0.45 : 1),
      sig: 0.18 + this.rng() * 0.16,
    });
  }

  // advance the scripted wind and return the forces to apply this frame
  step(dt: number, nowSec: number, reduced: boolean): ClothForces {
    if (!this.started) {
      this.started = true;
      this.schedule(nowSec, reduced);
    }
    if (nowSec >= this.nextAt) {
      this.spawn(reduced);
      // occasionally a quick double-gust for a richer arpeggio
      if (this.rng() < 0.3) this.spawn(reduced);
      this.schedule(nowSec, reduced);
    }
    for (const g of this.gusts) g.x += g.vx * dt;
    this.gusts = this.gusts.filter((g) => g.x > -1.4 && g.x < 1.4);

    // a slow breathing swell so the fabric is never fully static
    const breath = (reduced ? 0.08 : 0.16) * Math.sin(nowSec * 0.6);

    return {
      gx: 0.05 * Math.sin(nowSec * 0.37),
      gy: GRAVITY,
      wz: breath,
      gusts: this.gusts.map((g) => ({ x: g.x, amp: g.amp, sig: g.sig })),
    };
  }
}

// forces produced from direct user control (tilt or drag). No gusts — the user
// IS the wind, pushing the whole sheet with a steady, aimable vector.
export function userForces(windX: number, windZ: number): ClothForces {
  return {
    gx: windX,
    gy: GRAVITY,
    wz: windZ,
    gusts: [],
  };
}
