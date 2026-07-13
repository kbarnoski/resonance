// flame.ts — the fractal-flame engine + the see=hear feature vector.
//
// This is a real fractal flame (Draves & Reckase, 2003 / Electric Sheep):
//   1. An IFS of a few affine xforms, each carrying a blend of nonlinear
//      variations (variations.ts) and a palette colour coordinate.
//   2. Rendered by the CHAOS GAME: a single point wanders the biunit square;
//      each iteration we pick an xform by weight, apply its affine map, sum its
//      weighted variations, average in its colour, and (after a warm-up) plot
//      it into an accumulation buffer.
//   3. TONE-MAPPED by log density: alpha = log(d+1)/log(max+1), then a gamma
//      lift — the innovation that turns a sparse point cloud into a luminous
//      organism.
//
// THE WELD: the numbers that shape the picture are the numbers we sonify. Each
// frame we compute `features[v]` = how dominant sonified variation v is, as the
// hit-weighted average of the *actual* per-xform variation gains used to draw
// every plotted point. flame.ts returns that vector; audio.ts turns it into the
// amplitudes of Just-Intonation partials. So the shape you see IS the chord.
//
// Determinism: all randomness is mulberry32 seeded from a fixed constant.

import { variationByName, type VarCtx, type Vec2 } from "./variations";

/** Deterministic PRNG (mulberry32). The only source of randomness. */
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

// The 8 variations welded to the 8 Just-Intonation partials, in partial order.
// This ordering is also the order of the returned feature vector.
export const SONIFIED = [
  "linear",
  "spherical",
  "swirl",
  "horseshoe",
  "handkerchief",
  "disc",
  "spiral",
  "julia",
] as const;

const NV = SONIFIED.length; // 8

interface Xform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  weight: number;
  color: number; // palette coordinate in [0,1]
  base: Float32Array; // base variation blend over the 8 sonified variations
  gain: Float32Array; // live (pitch/energy-modulated) blend, per frame
}

export interface Drive {
  pitch: number; // 0..1 — from voice or idle carrier
  energy: number; // 0..1 — loudness / excitation
  reduced: boolean; // prefers-reduced-motion
}

// A fixed cast of xforms. Every visual variation is one of the 8 sonified ones,
// so the weld is total: nothing you see is unheard.
function makeXforms(): Xform[] {
  const defs: Array<{
    aff: [number, number, number, number, number, number];
    weight: number;
    color: number;
    blend: Partial<Record<(typeof SONIFIED)[number], number>>;
  }> = [
    {
      aff: [0.62, -0.2, 0.18, 0.2, 0.62, 0.0],
      weight: 1.0,
      color: 0.05,
      blend: { linear: 0.55, spherical: 0.45 },
    },
    {
      aff: [0.5, 0.36, -0.24, -0.36, 0.5, 0.12],
      weight: 0.85,
      color: 0.38,
      blend: { swirl: 0.6, spiral: 0.4 },
    },
    {
      aff: [-0.42, 0.5, 0.2, 0.5, 0.42, -0.16],
      weight: 0.8,
      color: 0.63,
      blend: { horseshoe: 0.55, handkerchief: 0.45 },
    },
    {
      aff: [0.34, -0.55, -0.1, 0.55, 0.34, 0.2],
      weight: 0.7,
      color: 0.92,
      blend: { disc: 0.5, julia: 0.5 },
    },
  ];

  return defs.map((d) => {
    const base = new Float32Array(NV);
    SONIFIED.forEach((name, i) => {
      base[i] = d.blend[name] ?? 0;
    });
    return {
      a: d.aff[0],
      b: d.aff[1],
      c: d.aff[2],
      d: d.aff[3],
      e: d.aff[4],
      f: d.aff[5],
      weight: d.weight,
      color: d.color,
      base,
      gain: new Float32Array(base),
    };
  });
}

export class Flame {
  private w = 0;
  private h = 0;
  private dens: Float32Array = new Float32Array(0);
  private col: Float32Array = new Float32Array(0);
  private runningMax = 1;

  private readonly rng = mulberry32(0x9e3779b9);
  private readonly xforms = makeXforms();
  private readonly cumWeight: number[];
  private readonly totalWeight: number;

  // Resolved variation functions in SONIFIED order (no per-iteration lookup).
  private readonly vfns = SONIFIED.map((n) => variationByName(n).fn);

  // Reused scratch — no allocation in the hot loop.
  private readonly ctx: VarCtx = {
    r: 0,
    r2: 0,
    theta: 0,
    phi: 0,
    rng: this.rng,
  };
  private readonly out: Vec2 = { x: 0, y: 0 };

  // Wandering chaos-game point + its colour, persisted across frames so the
  // organism drifts continuously.
  private px = 0.02;
  private py = -0.03;
  private pc = 0.5;

  private finalAngle = 0;
  private hits = new Float32Array(this.xforms.length);
  private readonly features = new Float32Array(NV);
  private brightness = 1;

  // 256-entry violet -> magenta -> cyan LUT (raw hex lives only here, in the
  // canvas art — never in the chrome).
  private readonly lut = buildPalette();

  constructor() {
    let acc = 0;
    this.cumWeight = this.xforms.map((x) => (acc += x.weight));
    this.totalWeight = acc;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.dens = new Float32Array(w * h);
    this.col = new Float32Array(w * h);
    this.runningMax = 1;
  }

  /** Update the live variation gains + final-xform rotation from the drive.
   *  Pitch sweeps a Gaussian "focus" across the 8 variations; energy sets how
   *  hard that focus swells them. The same gains render the frame AND become
   *  the sound, so morphing the flame morphs the chord. */
  setDrive(drive: Drive) {
    const focus = drive.pitch * (NV - 1);
    const sigma = 1.15;
    const strength = (drive.reduced ? 1.1 : 2.2) * (0.25 + drive.energy);

    for (const xf of this.xforms) {
      let sum = 0;
      for (let v = 0; v < NV; v++) {
        const dd = v - focus;
        const bump = Math.exp(-(dd * dd) / (2 * sigma * sigma));
        // floor keeps every partial faintly alive => the drone always sings.
        const g = xf.base[v] * (1 + bump * strength) + 0.03;
        xf.gain[v] = g;
        sum += g;
      }
      // Normalise per xform so the affine+variation sum stays bounded (stable).
      const inv = sum > 1e-6 ? 1 / sum : 0;
      for (let v = 0; v < NV; v++) xf.gain[v] *= inv;
    }

    const targetAngle = drive.pitch * Math.PI * 2;
    const k = drive.reduced ? 0.02 : 0.06;
    this.finalAngle += (targetAngle - this.finalAngle) * k + 0.0016;

    const targetBright = 0.6 + drive.energy * 0.9;
    this.brightness += (targetBright - this.brightness) * 0.08;
  }

  /** Run one frame of the chaos game, tone-map into `img`, and return the live
   *  feature vector (length 8, in SONIFIED order). */
  renderFrame(img: ImageData, points: number, decay: number): Float32Array {
    const { w, h, dens, col } = this;
    if (w === 0) return this.features;

    // Continuous refresh: decay the accumulation so the organism keeps morphing.
    for (let i = 0; i < dens.length; i++) {
      dens[i] *= decay;
      col[i] *= decay;
    }
    this.runningMax *= decay;

    const ca = Math.cos(this.finalAngle);
    const sa = Math.sin(this.finalAngle);
    // Camera: fit roughly [-1.6,1.6] into the shorter axis.
    const scale = Math.min(w, h) / 3.2;
    const cx = w * 0.5;
    const cy = h * 0.5;

    let px = this.px;
    let py = this.py;
    let pc = this.pc;
    const hits = this.hits;
    hits.fill(0);
    const warm = 20;

    for (let it = 0; it < points; it++) {
      // Pick an xform by weight.
      const rw = this.rng() * this.totalWeight;
      let xi = 0;
      while (xi < this.cumWeight.length - 1 && rw > this.cumWeight[xi]) xi++;
      const xf = this.xforms[xi];

      // Affine map.
      const ax = xf.a * px + xf.b * py + xf.c;
      const ay = xf.d * px + xf.e * py + xf.f;

      // Nonlinear variation blend (the flame's soul).
      const c = this.ctx;
      c.r2 = ax * ax + ay * ay;
      c.r = Math.sqrt(c.r2);
      c.theta = Math.atan2(ay, ax);
      c.phi = Math.atan2(ax, ay);
      let vx = 0;
      let vy = 0;
      const gain = xf.gain;
      for (let v = 0; v < NV; v++) {
        const g = gain[v];
        if (g < 1e-4) continue;
        this.vfns[v](ax, ay, c, this.out);
        vx += g * this.out.x;
        vy += g * this.out.y;
      }

      // Final xform: a rotation the voice steers.
      px = vx * ca - vy * sa;
      py = vx * sa + vy * ca;

      // Average in the colour coordinate.
      pc = (pc + xf.color) * 0.5;

      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        // Rare blow-up — reseed near the origin, keep going.
        px = (this.rng() - 0.5) * 0.1;
        py = (this.rng() - 0.5) * 0.1;
        continue;
      }

      if (it < warm) continue;
      hits[xi]++;

      const sx = (px * scale + cx) | 0;
      const sy = (py * scale + cy) | 0;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const idx = sy * w + sx;
      const nd = dens[idx] + 1;
      dens[idx] = nd;
      col[idx] += pc;
      if (nd > this.runningMax) this.runningMax = nd;
    }

    this.px = px;
    this.py = py;
    this.pc = pc;

    this.tonemap(img);
    this.computeFeatures(hits);
    return this.features;
  }

  /** Log-density tone-map (Draves): alpha = log(d+1)/log(max+1), gamma lift. */
  private tonemap(img: ImageData) {
    const { dens, col, lut } = this;
    const data = img.data;
    const logMax = Math.log(this.runningMax + 1);
    const invLog = logMax > 1e-6 ? 1 / logMax : 0;
    const invGamma = 1 / 2.6;
    const bright = this.brightness;

    for (let i = 0, p = 0; i < dens.length; i++, p += 4) {
      const d = dens[i];
      if (d <= 0) {
        // Deep near-black background (not pure black — a faint violet floor).
        data[p] = 4;
        data[p + 1] = 2;
        data[p + 2] = 9;
        data[p + 3] = 255;
        continue;
      }
      let a = Math.log(d + 1) * invLog; // 0..1
      a = Math.pow(a, invGamma);
      const t = Math.min(1, Math.max(0, col[i] / d));
      const li = (t * 255) | 0;
      const lp = li * 3;
      const m = a * bright;
      data[p] = Math.min(255, 4 + lut[lp] * m);
      data[p + 1] = Math.min(255, 2 + lut[lp + 1] * m);
      data[p + 2] = Math.min(255, 9 + lut[lp + 2] * m);
      data[p + 3] = 255;
    }
  }

  /** features[v] = hit-weighted average of the live gain of variation v across
   *  xforms — literally "how much of what you see is variation v". */
  private computeFeatures(hits: Float32Array) {
    let total = 0;
    for (let i = 0; i < hits.length; i++) total += hits[i];
    const inv = total > 0 ? 1 / total : 0;
    let fmax = 1e-6;
    for (let v = 0; v < NV; v++) {
      let acc = 0;
      for (let i = 0; i < this.xforms.length; i++) {
        acc += hits[i] * inv * this.xforms[i].gain[v];
      }
      this.features[v] = acc;
      if (acc > fmax) fmax = acc;
    }
    // Normalise so the loudest partial sits near 1 — the chord tracks *shape*,
    // not absolute density.
    const fn = 1 / fmax;
    for (let v = 0; v < NV; v++) this.features[v] *= fn;
    return this.features;
  }
}

// violet -> magenta -> cyan psychedelic LUT (256 * 3 bytes).
function buildPalette(): Uint8Array {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [40, 8, 74]], // deep violet
    [0.32, [124, 58, 237]], // violet (primary)
    [0.58, [224, 17, 157]], // magenta
    [0.8, [138, 92, 246]], // violet-blue
    [1.0, [34, 211, 238]], // cyan
  ];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [t0, c0] = stops[s];
    const [t1, c1] = stops[s + 1];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    const g = Math.min(1, Math.max(0, f));
    lut[i * 3] = (c0[0] + (c1[0] - c0[0]) * g) | 0;
    lut[i * 3 + 1] = (c0[1] + (c1[1] - c0[1]) * g) | 0;
    lut[i * 3 + 2] = (c0[2] + (c1[2] - c0[2]) * g) | 0;
  }
  return lut;
}
