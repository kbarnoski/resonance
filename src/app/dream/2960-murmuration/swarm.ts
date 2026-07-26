// swarm.ts — the boid-swarm of autonomous voice-agents.
//
// Each agent wanders the scent field, senses the local scent gradient by
// probing a few neighbour cells, and steers its velocity up-gradient (toward
// where you have been). Seeded noise + inertia keep the motion boid-like and
// alive. When an agent crosses a high-scent cell it fires a short grain AND
// deposits a little scent of its own — the stigmergic reinforcement that lets
// revisited phrases self-sustain into a choir.

import { ScentField } from "./field";

export interface AgentHit {
  gx: number;
  gy: number;
  strength: number; // scent value at the cell (0..~1 normalised outside)
}

export class Swarm {
  readonly n: number;
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  // Short trail of previous position for motion smear in the render layer.
  qx: Float32Array;
  qy: Float32Array;
  // Cooldown so each agent fires at most a few grains per second.
  cool: Float32Array;
  // Per-agent smoothed brightness (how much scent it is currently riding).
  glow: Float32Array;

  private rand: () => number;

  constructor(n: number, field: ScentField, rand: () => number) {
    this.n = n;
    this.rand = rand;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.qx = new Float32Array(n);
    this.qy = new Float32Array(n);
    this.cool = new Float32Array(n);
    this.glow = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = this.rand() * field.w;
      this.py[i] = this.rand() * field.h;
      this.qx[i] = this.px[i];
      this.qy[i] = this.py[i];
      const a = this.rand() * Math.PI * 2;
      this.vx[i] = Math.cos(a) * 4;
      this.vy[i] = Math.sin(a) * 4;
      this.cool[i] = this.rand() * 0.4;
    }
  }

  /**
   * Advance the swarm by dt seconds. Returns the grain hits produced this
   * step (bounded, so audio scheduling stays cheap). `hits` is reused.
   */
  step(field: ScentField, dt: number, hits: AgentHit[]): void {
    hits.length = 0;
    const w = field.w;
    const h = field.h;
    const peak = field.peak;
    const maxSpeed = 26; // cells / second
    const minSpeed = 3.5;
    const probe = 2.4; // gradient probe distance in cells

    for (let i = 0; i < this.n; i++) {
      const x = this.px[i];
      const y = this.py[i];

      // --- Sense the local scent gradient (central differences) ------------
      const sxp = field.sample(x + probe, y);
      const sxm = field.sample(x - probe, y);
      const syp = field.sample(x, y + probe);
      const sym = field.sample(x, y - probe);
      const here = field.sample(x, y);
      let gx = sxp - sxm;
      let gy = syp - sym;

      // Normalise the gradient direction; its magnitude sets pull strength.
      const gmag = Math.hypot(gx, gy) + 1e-6;
      gx /= gmag;
      gy /= gmag;

      // In rich scent the pull is strong (birds cluster); in dead regions
      // agents wander on inertia + noise and stay quiet.
      const richness = Math.min(1, here / (peak * 0.6 + 1e-4));
      const pull = 26 * richness;

      // --- Seeded wander noise --------------------------------------------
      const na = this.rand() * Math.PI * 2;
      const wander = 10;

      // --- Integrate velocity (inertia + gradient steer + noise) ----------
      this.vx[i] += (gx * pull + Math.cos(na) * wander) * dt;
      this.vy[i] += (gy * pull + Math.sin(na) * wander) * dt;

      // Damping keeps things smooth and bounded.
      this.vx[i] *= 0.94;
      this.vy[i] *= 0.94;

      // Clamp speed into [minSpeed, maxSpeed].
      let sp = Math.hypot(this.vx[i], this.vy[i]);
      if (sp < 1e-4) {
        this.vx[i] = minSpeed;
        sp = minSpeed;
      }
      if (sp > maxSpeed) {
        const k = maxSpeed / sp;
        this.vx[i] *= k;
        this.vy[i] *= k;
        sp = maxSpeed;
      } else if (sp < minSpeed) {
        const k = minSpeed / sp;
        this.vx[i] *= k;
        this.vy[i] *= k;
        sp = minSpeed;
      }

      // --- Integrate position, reflecting at the edges --------------------
      this.qx[i] = x;
      this.qy[i] = y;
      let nx = x + this.vx[i] * dt;
      let ny = y + this.vy[i] * dt;
      if (nx < 0) {
        nx = -nx;
        this.vx[i] = Math.abs(this.vx[i]);
      } else if (nx > w - 1) {
        nx = 2 * (w - 1) - nx;
        this.vx[i] = -Math.abs(this.vx[i]);
      }
      if (ny < 0) {
        ny = -ny;
        this.vy[i] = Math.abs(this.vy[i]);
      } else if (ny > h - 1) {
        ny = 2 * (h - 1) - ny;
        this.vy[i] = -Math.abs(this.vy[i]);
      }
      this.px[i] = nx;
      this.py[i] = ny;

      // --- Smoothed brightness for the render layer -----------------------
      const litTarget = Math.min(1, here / (peak + 1e-4));
      this.glow[i] += (litTarget - this.glow[i]) * 0.2;

      // --- Fire a grain + deposit scent (stigmergy) -----------------------
      this.cool[i] -= dt;
      const norm = here / (peak + 1e-4);
      if (this.cool[i] <= 0 && norm > 0.22) {
        hits.push({ gx: nx, gy: ny, strength: norm });
        // Reinforce the trail a little so revisited paths self-sustain.
        field.splat(nx, ny, 1.1, 0.06 * norm);
        // Louder trails => faster re-triggering (a denser choir).
        this.cool[i] = 0.18 + (1 - norm) * 0.5 + this.rand() * 0.12;
      }
    }
  }
}
