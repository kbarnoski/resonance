// THE LUTHIER — mass-interaction physical model, shared core.
//
// A network of point masses connected by spring+damper links is integrated
// with semi-implicit (symplectic) Euler. The motion of one "listener" node IS
// the audio sample stream; the same node positions ARE the picture. Topology +
// material (mass / stiffness / damping) = timbre. This file holds the shared
// types, the deterministic RNG, the three editable presets, a main-thread
// visual integrator (self-demo + no-worklet fallback), and the builder for the
// AudioWorklet processor source (an inline JS string loaded via a Blob URL —
// nothing lives outside this folder, and the string is not type-checked).

export type MINode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rx: number; // rest x (equilibrium)
  ry: number; // rest y
  fixed: boolean;
};

export type MILink = {
  a: number;
  b: number;
  L0: number; // rest length
};

export type Model = {
  nodes: MINode[];
  links: MILink[];
  listener: number;
};

export type PresetName = "string" | "ring" | "web";

// ---------------------------------------------------------------------------
// Deterministic RNG — seeded, never Math.random.
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Material mapping: abstract 0..100 UI sliders -> physics constants.
// (Big k values are normal — velocity-based plucks keep amplitudes bounded.)
// ---------------------------------------------------------------------------
export const K_MIN = 6e7;
export const K_MAX = 5e8;
export const Z_MAX = 6;
export const M_MIN = 0.5;
export const M_MAX = 4;

export const DEFAULT_K_UI = 42;
export const DEFAULT_Z_UI = 16;
export const DEFAULT_M_UI = 14;

export const uiToK = (ui: number) => K_MIN + (K_MAX - K_MIN) * (ui / 100);
export const uiToZ = (ui: number) => Z_MAX * (ui / 100);
export const uiToM = (ui: number) => M_MIN + (M_MAX - M_MIN) * (ui / 100);

// Physics-space bounds (normalised to canvas width; y runs 0..~0.625).
export const FIELD_H = 0.625;

// ---------------------------------------------------------------------------
// Preset builders. All authored in normalised [0..1] x [0..FIELD_H] space.
// ---------------------------------------------------------------------------
function node(x: number, y: number, fixed = false): MINode {
  return { x, y, vx: 0, vy: 0, rx: x, ry: y, fixed };
}

function dist(a: MINode, b: MINode): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function link(nodes: MINode[], a: number, b: number, factor = 1): MILink {
  return { a, b, L0: dist(nodes[a], nodes[b]) * factor };
}

export function buildPreset(name: PresetName): Model {
  const rng = mulberry32(0x8728);
  if (name === "string") {
    // A line of 16 masses, ends grounded, springs PRE-TENSIONED (rest length
    // shorter than spacing) so transverse plucks ring at a stable pitch —
    // a taut string. Harmonic-ish overtone series.
    const N = 16;
    const nodes: MINode[] = [];
    const y = 0.31;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = 0.1 + t * 0.8;
      nodes.push(node(x, y, i === 0 || i === N - 1));
    }
    const links: MILink[] = [];
    for (let i = 0; i < N - 1; i++) links.push(link(nodes, i, i + 1, 0.9));
    return { nodes, links, listener: 5 };
  }

  if (name === "ring") {
    // A closed loop of 14 masses — a bell. No pre-tension; the loop's bending
    // + breathing modes are naturally INHARMONIC. One node grounded to kill
    // rigid drift. Slight seeded radius jitter deepens the inharmonicity.
    const N = 14;
    const cx = 0.5;
    const cy = 0.31;
    const nodes: MINode[] = [];
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r = 0.22 * (0.97 + rng() * 0.06);
      nodes.push(node(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, i === 0));
    }
    const links: MILink[] = [];
    for (let i = 0; i < N; i++) links.push(link(nodes, i, (i + 1) % N, 1));
    return { nodes, links, listener: 5 };
  }

  // web: a triangulated net. Corners grounded, dense modal cluster — a rattly,
  // metallic, in-between timbre with no single clear pitch.
  const cols = 4;
  const rows = 3;
  const x0 = 0.2;
  const x1 = 0.8;
  const y0 = 0.12;
  const y1 = 0.5;
  const nodes: MINode[] = [];
  const idx = (c: number, r: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c / (cols - 1)) * (x1 - x0);
      const y = y0 + (r / (rows - 1)) * (y1 - y0);
      const corner =
        (c === 0 || c === cols - 1) && (r === 0 || r === rows - 1);
      nodes.push(node(x, y, corner));
    }
  }
  const links: MILink[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) links.push(link(nodes, idx(c, r), idx(c + 1, r)));
      if (r < rows - 1) links.push(link(nodes, idx(c, r), idx(c, r + 1)));
      if (c < cols - 1 && r < rows - 1) {
        links.push(link(nodes, idx(c, r), idx(c + 1, r + 1))); // diagonal brace
      }
    }
  }
  // listener: an interior node (not grounded).
  return { nodes, links, listener: idx(1, 1) };
}

// ---------------------------------------------------------------------------
// Main-thread visual integrator. Runs a SOFTENED version of the same physics
// (reduced stiffness so it is stable at a coarse dt) purely for the muted
// self-demo on load and for the no-AudioWorklet fallback. It mutates the model
// in place; the render layer draws model.nodes directly.
// ---------------------------------------------------------------------------
const VIS_K = 22000;
const VIS_SUBSTEPS = 10;

export type VisState = { heldIndex: number };

export function stepVisual(
  model: Model,
  mUI: number,
  zUI: number,
  held: number,
  reduced: boolean
): void {
  const m = uiToM(mUI);
  const z = 3 + uiToZ(zUI) * 0.8;
  const k = VIS_K; // fixed softened stiffness — visual stability at coarse dt
  const subs = reduced ? 6 : VIS_SUBSTEPS;
  const dt = 1 / (60 * VIS_SUBSTEPS);
  const gd = reduced ? 0.994 : 0.9985;
  const nodes = model.nodes;
  const links = model.links;
  const N = nodes.length;

  for (let s = 0; s < subs; s++) {
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      // reuse vx/vy accumulators via temp force store on the node object
      (n as unknown as { fx: number }).fx = 0;
      (n as unknown as { fy: number }).fy = 0;
    }
    for (let j = 0; j < links.length; j++) {
      const l = links[j];
      const A = nodes[l.a];
      const B = nodes[l.b];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const inv = 1 / len;
      const ux = dx * inv;
      const uy = dy * inv;
      const sF = -k * (len - l.L0);
      const dvn = (B.vx - A.vx) * ux + (B.vy - A.vy) * uy;
      const dF = -z * dvn;
      const F = sF + dF;
      const Fx = F * ux;
      const Fy = F * uy;
      (B as unknown as { fx: number }).fx += Fx;
      (B as unknown as { fy: number }).fy += Fy;
      (A as unknown as { fx: number }).fx -= Fx;
      (A as unknown as { fy: number }).fy -= Fy;
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      if (n.fixed || i === held) continue;
      const fx = (n as unknown as { fx: number }).fx;
      const fy = (n as unknown as { fy: number }).fy;
      n.vx = (n.vx + (fx / m) * dt) * gd;
      n.vy = (n.vy + (fy / m) * dt) * gd;
      let nx = n.x + n.vx * dt;
      let ny = n.y + n.vy * dt;
      if (!(nx > -8 && nx < 8 && ny > -8 && ny < 8)) {
        nx = n.rx;
        ny = n.ry;
        n.vx = 0;
        n.vy = 0;
      }
      n.x = nx;
      n.y = ny;
    }
  }
}

/** Inject a velocity pluck into a node (visual model). */
export function pluckVisual(
  model: Model,
  i: number,
  vx: number,
  vy: number
): void {
  const n = model.nodes[i];
  if (!n || n.fixed) return;
  n.vx += vx;
  n.vy += vy;
}

export function resetModel(model: Model): void {
  for (const n of model.nodes) {
    n.x = n.rx;
    n.y = n.ry;
    n.vx = 0;
    n.vy = 0;
  }
}

/** Serialise a model into the plain payload the worklet expects. */
export function modelToTopo(model: Model) {
  return {
    type: "topology" as const,
    nodes: model.nodes.map((n) => ({ x: n.rx, y: n.ry, fixed: n.fixed })),
    links: model.links.map((l) => ({ a: l.a, b: l.b, L0: l.L0 })),
    listener: model.listener,
  };
}

// ---------------------------------------------------------------------------
// AudioWorklet processor source. Built as a string, loaded from a Blob URL.
// Plain JS — NOT type-checked by the build. Integrates the SAME spring+damper
// physics per audio sample; output = listener velocity, DC-blocked + soft
// clipped; posts a position snapshot ~60x/sec back to the main thread.
// ---------------------------------------------------------------------------
export function buildWorkletSource(): string {
  return `
class MIProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.n = 0; this.nl = 0;
    this.px = new Float32Array(0); this.py = new Float32Array(0);
    this.vx = new Float32Array(0); this.vy = new Float32Array(0);
    this.rx = new Float32Array(0); this.ry = new Float32Array(0);
    this.fx = new Float32Array(0); this.fy = new Float32Array(0);
    this.fixed = new Uint8Array(0);
    this.la = new Int32Array(0); this.lb = new Int32Array(0); this.l0 = new Float32Array(0);
    this.snap = new Float32Array(0);
    this.k = 2.4e8; this.z = 1.0; this.m = 1.0;
    this.listener = 0; this.held = -1;
    this.gd = 0.99997; this.gain = 0.12; this.dt = 1 / sampleRate;
    this.dcx = 0; this.dcy = 0;
    this.snapCount = 0; this.snapEvery = 735;
    this.port.onmessage = (e) => this.msg(e.data);
  }
  setTopo(d) {
    const N = d.nodes.length;
    this.n = N;
    this.px = new Float32Array(N); this.py = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.rx = new Float32Array(N); this.ry = new Float32Array(N);
    this.fx = new Float32Array(N); this.fy = new Float32Array(N);
    this.fixed = new Uint8Array(N);
    this.snap = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const nd = d.nodes[i];
      this.px[i] = nd.x; this.py[i] = nd.y;
      this.rx[i] = nd.x; this.ry[i] = nd.y;
      this.fixed[i] = nd.fixed ? 1 : 0;
    }
    const L = d.links.length; this.nl = L;
    this.la = new Int32Array(L); this.lb = new Int32Array(L); this.l0 = new Float32Array(L);
    for (let j = 0; j < L; j++) {
      const lk = d.links[j];
      this.la[j] = lk.a; this.lb[j] = lk.b; this.l0[j] = lk.L0;
    }
    this.listener = d.listener | 0;
    this.held = -1; this.dcx = 0; this.dcy = 0;
  }
  msg(d) {
    if (!d) return;
    if (d.type === 'topology') this.setTopo(d);
    else if (d.type === 'material') { this.k = d.k; this.z = d.z; this.m = d.m; }
    else if (d.type === 'pluck') {
      if (d.i >= 0 && d.i < this.n && !this.fixed[d.i]) { this.vx[d.i] += d.vx; this.vy[d.i] += d.vy; }
    }
    else if (d.type === 'grab') { this.held = d.i; if (d.i >= 0 && d.i < this.n) { this.vx[d.i] = 0; this.vy[d.i] = 0; } }
    else if (d.type === 'grabmove') { if (d.i >= 0 && d.i < this.n) { this.px[d.i] = d.x; this.py[d.i] = d.y; this.vx[d.i] = 0; this.vy[d.i] = 0; } }
    else if (d.type === 'release') { const i = d.i; if (i >= 0 && i < this.n && !this.fixed[i]) { this.vx[i] = d.vx; this.vy[i] = d.vy; } this.held = -1; }
    else if (d.type === 'reset') { for (let i = 0; i < this.n; i++) { this.px[i] = this.rx[i]; this.py[i] = this.ry[i]; this.vx[i] = 0; this.vy[i] = 0; } this.held = -1; }
    else if (d.type === 'listener') { this.listener = d.i | 0; }
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    const N = this.n;
    if (N === 0) { for (let s = 0; s < out.length; s++) out[s] = 0; return true; }
    const px = this.px, py = this.py, vx = this.vx, vy = this.vy;
    const fx = this.fx, fy = this.fy, la = this.la, lb = this.lb, l0 = this.l0, fixed = this.fixed;
    const k = this.k, z = this.z, m = this.m, dt = this.dt, gd = this.gd, nl = this.nl;
    const held = this.held, li = this.listener;
    for (let s = 0; s < out.length; s++) {
      for (let i = 0; i < N; i++) { fx[i] = 0; fy[i] = 0; }
      for (let j = 0; j < nl; j++) {
        const a = la[j], b = lb[j];
        const dx = px[b] - px[a], dy = py[b] - py[a];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) continue;
        const inv = 1 / len, ux = dx * inv, uy = dy * inv;
        const sF = -k * (len - l0[j]);
        const dvn = (vx[b] - vx[a]) * ux + (vy[b] - vy[a]) * uy;
        const F = sF - z * dvn;
        const Fx = F * ux, Fy = F * uy;
        fx[b] += Fx; fy[b] += Fy; fx[a] -= Fx; fy[a] -= Fy;
      }
      for (let i = 0; i < N; i++) {
        if (fixed[i] || i === held) continue;
        let nvx = (vx[i] + (fx[i] / m) * dt) * gd;
        let nvy = (vy[i] + (fy[i] / m) * dt) * gd;
        vx[i] = nvx; vy[i] = nvy;
        let nx = px[i] + nvx * dt, ny = py[i] + nvy * dt;
        if (!(nx > -8 && nx < 8 && ny > -8 && ny < 8)) { nx = this.rx[i]; ny = this.ry[i]; vx[i] = 0; vy[i] = 0; }
        px[i] = nx; py[i] = ny;
      }
      let sig = (vy[li] * 0.85 + vx[li] * 0.5) * this.gain;
      const y = sig - this.dcx + 0.995 * this.dcy;
      this.dcx = sig; this.dcy = y;
      out[s] = Math.tanh(y);
      if (++this.snapCount >= this.snapEvery) {
        this.snapCount = 0;
        const snap = this.snap;
        for (let i = 0; i < N; i++) { snap[2 * i] = px[i]; snap[2 * i + 1] = py[i]; }
        this.port.postMessage(snap);
      }
    }
    return true;
  }
}
registerProcessor('mi-processor', MIProcessor);
`;
}
