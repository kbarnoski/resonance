// 2952-tabla — worklet.ts
// Exports the AudioWorkletProcessor source as a STRING. At runtime engine.ts
// wraps it in a Blob, mints a Blob URL and loads it with
// ctx.audioWorklet.addModule(url) — no network fetch, no external file, so
// Next bundles nothing special. Worklet code runs in AudioWorkletGlobalScope
// with NO module system, so the 2-D digital-waveguide-mesh membrane is inlined
// here (kept in sync with mesh.ts). See mesh.ts for the physics commentary.

export const WORKLET_SOURCE = String.raw`
const C2_CAP = 0.49;

class Mesh {
  constructor(o) {
    this.cfg = o;
    const G = o.size;
    this.size = G;
    this.cx = (G - 1) / 2;
    this.cy = (G - 1) / 2;
    this.radiusCells = (G - 1) / 2 - 1.5;
    const n = G * G;
    this.field = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.c2 = new Float32Array(n);
    this.tension = new Float32Array(n);
    this.mask = new Uint8Array(n);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        const dx = x - this.cx, dy = y - this.cy;
        this.mask[i] = Math.sqrt(dx * dx + dy * dy) <= this.radiusCells ? 1 : 0;
        this.c2[i] = o.baseC2;
      }
    }
    const lx = Math.round(this.cx + this.radiusCells * 0.42);
    const ly = Math.round(this.cy - this.radiusCells * 0.18);
    this.listenIdx = ly * G + lx;
    this.press = { active: false, cx: 0, cy: 0, amount: 0, radius: 0 };
  }
  strike(nx, ny, vel, width) {
    const G = this.size;
    const gx = this.cx + nx * this.radiusCells;
    const gy = this.cy + ny * this.radiusCells;
    const w = Math.max(0.8, width);
    const rad = Math.ceil(w * 2.4);
    const gxi = Math.round(gx), gyi = Math.round(gy);
    for (let y = -rad; y <= rad; y++) {
      const py = gyi + y;
      if (py < 0 || py >= G) continue;
      for (let x = -rad; x <= rad; x++) {
        const px = gxi + x;
        if (px < 0 || px >= G) continue;
        const i = py * G + px;
        if (!this.mask[i]) continue;
        const ddx = px - gx, ddy = py - gy;
        const bump = Math.exp(-(ddx * ddx + ddy * ddy) / (w * w)) * vel;
        this.field[i] += bump;
        this.prev[i] += bump;
      }
    }
  }
  setPress(nx, ny, amount, radiusFrac) {
    this.press.active = true;
    this.press.cx = this.cx + nx * this.radiusCells;
    this.press.cy = this.cy + ny * this.radiusCells;
    this.press.amount = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    this.press.radius = Math.max(2, radiusFrac * this.radiusCells);
  }
  releasePress() { this.press.active = false; }
  updateControl() {
    const tension = this.tension, c2 = this.c2, mask = this.mask, cfg = this.cfg;
    const n = c2.length;
    const relax = cfg.tensionRelax;
    for (let i = 0; i < n; i++) tension[i] *= relax;
    const p = this.press;
    if (p.active && p.amount > 0) {
      const G = this.size;
      const rad = Math.ceil(p.radius * 2.5);
      const inv = 1 / (p.radius * p.radius);
      const target = p.amount * cfg.maxTension;
      const cxi = Math.round(p.cx), cyi = Math.round(p.cy);
      const y0 = Math.max(0, cyi - rad), y1 = Math.min(G - 1, cyi + rad);
      const x0 = Math.max(0, cxi - rad), x1 = Math.min(G - 1, cxi + rad);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * G + x;
          if (!mask[i]) continue;
          const dx = x - p.cx, dy = y - p.cy;
          const t = target * Math.exp(-(dx * dx + dy * dy) * inv);
          if (t > tension[i]) tension[i] += (t - tension[i]) * cfg.tensionEase;
        }
      }
    }
    const base = cfg.baseC2;
    for (let i = 0; i < n; i++) {
      const v = base + tension[i];
      c2[i] = v > C2_CAP ? C2_CAP : v;
    }
  }
  step() {
    const field = this.field, prev = this.prev, c2 = this.c2, mask = this.mask, G = this.size;
    const loss = this.cfg.loss;
    const last = G - 1;
    for (let y = 1; y < last; y++) {
      const row = y * G;
      for (let x = 1; x < last; x++) {
        const i = row + x;
        if (!mask[i]) { prev[i] = 0; continue; }
        const u = field[i];
        const lap = field[i - 1] + field[i + 1] + field[i - G] + field[i + G] - 4 * u;
        prev[i] = (2 * u - prev[i] + c2[i] * lap) * loss;
      }
    }
    const tmp = this.field; this.field = this.prev; this.prev = tmp;
    return this.field[this.listenIdx];
  }
}

class TablaMeshProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.mesh = new Mesh(o);
    this.drive = o.drive;
    this.lp = 0;         // output lowpass state
    this.dcx = 0;        // DC-blocker input memory
    this.dcy = 0;        // DC-blocker output memory
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.t === 'strike') this.mesh.strike(d.x, d.y, d.vel, d.width);
      else if (d.t === 'press') this.mesh.setPress(d.x, d.y, d.amount, d.radius);
      else if (d.t === 'release') this.mesh.releasePress();
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    if (!chL) return true;
    const n = chL.length;
    this.mesh.updateControl();
    const drive = this.drive;
    for (let s = 0; s < n; s++) {
      const raw = this.mesh.step();
      // DC blocker: y = x - x1 + 0.995 y1
      const y = raw - this.dcx + 0.995 * this.dcy;
      this.dcx = raw;
      this.dcy = y;
      // gentle lowpass, then soft tanh limiter capped at 0.12
      this.lp += (y - this.lp) * 0.4;
      chL[s] = Math.tanh(this.lp * drive) * 0.12;
    }
    const chR = out[1];
    if (chR) chR.set(chL);
    return true;
  }
}

registerProcessor('tabla-mesh-processor', TablaMeshProcessor);
`;
