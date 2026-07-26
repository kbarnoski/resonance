// autopilot.ts — the seeded "ghost hand".
//
// On load, and whenever the human hands control back, a deterministic ghost
// hand traces a small repertoire of phrases across the field. Phrases are
// deliberately REVISITED (the schedule is biased toward repeating the most
// recent phrase) so attractors build up and a swarm grows without any user
// input — the self-demo of the instrument's stigmergic memory.

interface Phrase {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  a: number; // lissajous x frequency
  b: number; // lissajous y frequency
  ph: number; // phase
  speed: number; // loops per second along the curve
}

export class Autopilot {
  private phrases: Phrase[] = [];
  private schedule: number[] = [];
  private segLen: number[] = [];
  private cursor = 0;
  private tInSeg = 0;
  private segIndex = 0;

  // Smoothed output position in normalised [0,1]^2.
  x = 0.5;
  y = 0.5;

  constructor(rand: () => number) {
    const K = 4;
    for (let i = 0; i < K; i++) {
      this.phrases.push({
        cx: 0.22 + rand() * 0.56,
        cy: 0.22 + rand() * 0.56,
        sx: 0.1 + rand() * 0.18,
        sy: 0.08 + rand() * 0.16,
        a: 1 + Math.floor(rand() * 3),
        b: 1 + Math.floor(rand() * 3),
        ph: rand() * Math.PI * 2,
        speed: 0.16 + rand() * 0.12,
      });
    }
    // Build a long, revisit-biased schedule of phrase indices.
    let prev = Math.floor(rand() * K);
    for (let s = 0; s < 48; s++) {
      // 55% chance to repeat the previous phrase (consolidation), else jump.
      const next = rand() < 0.55 ? prev : Math.floor(rand() * K);
      this.schedule.push(next);
      this.segLen.push(5 + rand() * 4); // 5–9 s per segment
      prev = next;
    }
  }

  /** Advance the ghost hand; updates this.x / this.y in normalised space. */
  step(dt: number): void {
    this.tInSeg += dt;
    if (this.tInSeg >= this.segLen[this.segIndex]) {
      this.tInSeg = 0;
      this.segIndex = (this.segIndex + 1) % this.schedule.length;
      this.cursor = 0;
    }
    const p = this.phrases[this.schedule[this.segIndex]];
    this.cursor += dt * p.speed;
    const u = this.cursor * Math.PI * 2;
    const tx = p.cx + p.sx * Math.sin(p.a * u + p.ph);
    const ty = p.cy + p.sy * Math.sin(p.b * u);
    // Ease toward the target so the trace is a smooth continuous gesture.
    this.x += (tx - this.x) * Math.min(1, dt * 6);
    this.y += (ty - this.y) * Math.min(1, dt * 6);
  }
}
