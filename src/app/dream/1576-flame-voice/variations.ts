// variations.ts — the nonlinear "variations" of the fractal flame.
//
// Each variation is one of the standard V_j functions from Scott Draves &
// Erik Reckase, "The Fractal Flame Algorithm" (2003). A flame xform sums a
// weighted blend of these functions applied to the affine-transformed point.
// That nonlinear blend (plus log-density tone-mapping) is exactly what makes a
// flame an *organism* rather than a plain self-affine IFS.
//
// All formulas use r = hypot(x, y), r2 = x*x + y*y, theta = atan2(y, x),
// phi = atan2(x, y). No randomness except `julia`, which draws from the
// caller-supplied deterministic mulberry32 PRNG (never the platform RNG).

export interface VarCtx {
  r: number;
  r2: number;
  theta: number;
  phi: number;
  rng: () => number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type VarFn = (x: number, y: number, c: VarCtx, out: Vec2) => void;

export interface VariationDef {
  name: string;
  fn: VarFn;
}

const PI = Math.PI;

// The full palette of variations available to the engine (21 — well past the
// "~12+" the flame needs to feel alive). The subset actually welded to sound
// is chosen in flame.ts.
export const VARIATIONS: VariationDef[] = [
  {
    name: "linear",
    fn: (x, y, _c, out) => {
      out.x = x;
      out.y = y;
    },
  },
  {
    name: "sinusoidal",
    fn: (x, y, _c, out) => {
      out.x = Math.sin(x);
      out.y = Math.sin(y);
    },
  },
  {
    name: "spherical",
    fn: (x, y, c, out) => {
      const d = 1 / (c.r2 + 1e-9);
      out.x = x * d;
      out.y = y * d;
    },
  },
  {
    name: "swirl",
    fn: (x, y, c, out) => {
      const s = Math.sin(c.r2);
      const co = Math.cos(c.r2);
      out.x = x * s - y * co;
      out.y = x * co + y * s;
    },
  },
  {
    name: "horseshoe",
    fn: (x, y, c, out) => {
      const d = 1 / (c.r + 1e-9);
      out.x = d * ((x - y) * (x + y));
      out.y = d * (2 * x * y);
    },
  },
  {
    name: "polar",
    fn: (_x, _y, c, out) => {
      out.x = c.theta / PI;
      out.y = c.r - 1;
    },
  },
  {
    name: "handkerchief",
    fn: (_x, _y, c, out) => {
      out.x = c.r * Math.sin(c.theta + c.r);
      out.y = c.r * Math.cos(c.theta - c.r);
    },
  },
  {
    name: "disc",
    fn: (_x, _y, c, out) => {
      const t = c.theta / PI;
      const pr = PI * c.r;
      out.x = t * Math.sin(pr);
      out.y = t * Math.cos(pr);
    },
  },
  {
    name: "spiral",
    fn: (_x, _y, c, out) => {
      const d = 1 / (c.r + 1e-9);
      out.x = d * (Math.cos(c.theta) + Math.sin(c.r));
      out.y = d * (Math.sin(c.theta) - Math.cos(c.r));
    },
  },
  {
    name: "hyperbolic",
    fn: (_x, _y, c, out) => {
      const d = 1 / (c.r + 1e-9);
      out.x = Math.sin(c.theta) * d;
      out.y = c.r * Math.cos(c.theta);
    },
  },
  {
    name: "diamond",
    fn: (_x, _y, c, out) => {
      out.x = Math.sin(c.theta) * Math.cos(c.r);
      out.y = Math.cos(c.theta) * Math.sin(c.r);
    },
  },
  {
    name: "julia",
    fn: (_x, _y, c, out) => {
      const omega = c.rng() < 0.5 ? 0 : PI;
      const sr = Math.sqrt(c.r);
      const a = c.theta * 0.5 + omega;
      out.x = sr * Math.cos(a);
      out.y = sr * Math.sin(a);
    },
  },
  {
    name: "waves",
    fn: (x, y, _c, out) => {
      // Self-contained coefficients (classic waves reads them from the affine).
      out.x = x + 0.22 * Math.sin(y / 0.5);
      out.y = y + 0.22 * Math.sin(x / 0.5);
    },
  },
  {
    name: "fisheye",
    fn: (x, y, c, out) => {
      const d = 2 / (c.r + 1);
      out.x = d * y;
      out.y = d * x;
    },
  },
  {
    name: "eyefish",
    fn: (x, y, c, out) => {
      const d = 2 / (c.r + 1);
      out.x = d * x;
      out.y = d * y;
    },
  },
  {
    name: "bent",
    fn: (x, y, _c, out) => {
      let nx = x;
      let ny = y;
      if (x < 0) nx = x * 2;
      if (y < 0) ny = y * 0.5;
      out.x = nx;
      out.y = ny;
    },
  },
  {
    name: "power",
    fn: (_x, _y, c, out) => {
      const st = Math.sin(c.theta);
      const p = Math.pow(c.r, st);
      out.x = p * Math.cos(c.theta);
      out.y = p * st;
    },
  },
  {
    name: "rings",
    fn: (_x, _y, c, out) => {
      const dx = 0.3; // classic rings reads dx from the affine's c coefficient.
      const t = ((c.r + dx) % (2 * dx)) - dx + c.r * (1 - dx);
      out.x = t * Math.cos(c.theta);
      out.y = t * Math.sin(c.theta);
    },
  },
  {
    name: "fan",
    fn: (_x, _y, c, out) => {
      const t = PI * 0.16; // c^2 with c = 0.4
      const f = 0.5; // phase from the affine's f coefficient
      const half = t * 0.5;
      const swap = (c.theta + f) % t > half ? -half : half;
      out.x = c.r * Math.cos(c.theta + swap);
      out.y = c.r * Math.sin(c.theta + swap);
    },
  },
  {
    name: "cylinder",
    fn: (x, y, _c, out) => {
      out.x = Math.sin(x);
      out.y = y;
    },
  },
  {
    name: "ex",
    fn: (_x, _y, c, out) => {
      const p0 = Math.sin(c.theta + c.r);
      const p1 = Math.cos(c.theta - c.r);
      const m0 = p0 * p0 * p0 * c.r;
      const m1 = p1 * p1 * p1 * c.r;
      out.x = m0 + m1;
      out.y = m0 - m1;
    },
  },
];

/** Look a variation up by name (throws in dev if a name is misspelled). */
export function variationByName(name: string): VariationDef {
  const v = VARIATIONS.find((d) => d.name === name);
  if (!v) throw new Error(`unknown variation: ${name}`);
  return v;
}
