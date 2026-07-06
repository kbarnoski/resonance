// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — procedural "resonant cairn" of anisotropic 3D Gaussians + the
// SonicGauss-inspired material inference.
//
// Each cluster is a blob of Gaussian splats (position, 3-scale, rotation
// quaternion → covariance Σ = R·S·Sᵀ·Rᵀ, colour, opacity). After a cluster is
// built we DERIVE its material purely from splat statistics (size / tightness /
// luminance / hue / anisotropy), the way SonicGauss (arXiv 2507.19835) reads a
// material off a Gaussian field — no ML, just a scored heuristic.
// ─────────────────────────────────────────────────────────────────────────────

export type MaterialId = "GLASS" | "STONE" | "METAL" | "WOOD";

export interface Material {
  id: MaterialId;
  label: string;
  ratios: number[]; // modal partial frequency ratios (fundamental = 1)
  decays: number[]; // per-partial decay time (s) at unit strike
  brightness: number; // 0..1 spectral tilt toward upper partials
  ringLabel: string; // human blurb for the notes panel
}

// Four modal presets. Ratios + decays define the impact timbre; the fundamental
// comes from cluster size at strike-time (bigger cluster ⇒ lower pitch).
export const MATERIALS: Record<MaterialId, Material> = {
  GLASS: {
    id: "GLASS",
    label: "glass",
    // near-harmonic, slightly stretched — bright and long
    ratios: [1, 2.001, 3.011, 4.03, 5.06, 6.1, 7.2],
    decays: [3.0, 2.6, 2.2, 1.8, 1.4, 1.1, 0.9],
    brightness: 0.95,
    ringLabel: "high · bright near-harmonic · ~3 s ring",
  },
  STONE: {
    id: "STONE",
    label: "stone",
    // low, inharmonic, quickly damped
    ratios: [1, 1.47, 1.98, 2.61, 3.3, 4.15],
    decays: [0.55, 0.42, 0.34, 0.27, 0.2, 0.16],
    brightness: 0.3,
    ringLabel: "low · inharmonic · short ~0.5 s",
  },
  METAL: {
    id: "METAL",
    label: "metal bar",
    // free-free bar modes (1, 2.756, 5.404, 8.933, 13.34...) — bright, long
    ratios: [1, 2.756, 5.404, 8.933, 13.34, 18.64],
    decays: [4.2, 3.6, 3.0, 2.4, 1.8, 1.3],
    brightness: 0.85,
    ringLabel: "bright inharmonic bar · long ~4 s ring",
  },
  WOOD: {
    id: "WOOD",
    label: "wood",
    // woody bar-ish, mid, medium-fast damping
    ratios: [1, 2.09, 3.72, 5.24, 6.8],
    decays: [0.42, 0.34, 0.26, 0.2, 0.15],
    brightness: 0.5,
    ringLabel: "woody · mid · short ~0.4 s",
  },
};

export interface Cluster {
  center: [number, number, number];
  radius: number; // characteristic size (drives pitch)
  material: MaterialId;
  color: [number, number, number]; // representative colour
  start: number; // first splat index
  count: number; // number of splats
  fundamental: number; // Hz, derived from radius + material
}

export interface Scene {
  count: number;
  positions: Float32Array; // n*3
  cov: Float32Array; // n*6 (Σ00,Σ01,Σ02,Σ11,Σ12,Σ22)
  colors: Float32Array; // n*3 linear-ish 0..1
  opacity: Float32Array; // n
  clusterId: Uint16Array; // n
  clusters: Cluster[];
}

// deterministic PRNG so the sculpture is stable across reloads
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// two independent unit normals (Box–Muller)
function gauss2(rnd: () => number): [number, number] {
  const u = Math.max(1e-6, rnd());
  const v = rnd();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

// quaternion → row-major 3×3 rotation
function quatToR(x: number, y: number, z: number, w: number): number[] {
  const n = Math.hypot(x, y, z, w) || 1;
  x /= n;
  y /= n;
  z /= n;
  w /= n;
  const xx = x * x,
    yy = y * y,
    zz = z * z;
  const xy = x * y,
    xz = x * z,
    yz = y * z;
  const wx = w * x,
    wy = w * y,
    wz = w * z;
  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
  ];
}

// Σ = (R·S)·(R·S)ᵀ, returns upper triangle [Σ00,Σ01,Σ02,Σ11,Σ12,Σ22]
function covFromScaleQuat(
  s: [number, number, number],
  q: [number, number, number, number],
): [number, number, number, number, number, number] {
  const r = quatToR(q[0], q[1], q[2], q[3]);
  // M[i][j] = R[i][j] * s[j]
  const m = [
    r[0] * s[0],
    r[1] * s[1],
    r[2] * s[2],
    r[3] * s[0],
    r[4] * s[1],
    r[5] * s[2],
    r[6] * s[0],
    r[7] * s[1],
    r[8] * s[2],
  ];
  const s00 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  const s01 = m[0] * m[3] + m[1] * m[4] + m[2] * m[5];
  const s02 = m[0] * m[6] + m[1] * m[7] + m[2] * m[8];
  const s11 = m[3] * m[3] + m[4] * m[4] + m[5] * m[5];
  const s12 = m[3] * m[6] + m[4] * m[7] + m[5] * m[8];
  const s22 = m[6] * m[6] + m[7] * m[7] + m[8] * m[8];
  return [s00, s01, s02, s11, s12, s22];
}

// RGB → hue (deg) & saturation for the classifier
function hueSat(r: number, g: number, b: number): { hue: number; sat: number } {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let hue = 0;
  if (d > 1e-5) {
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const sat = mx <= 1e-5 ? 0 : d / mx;
  return { hue, sat };
}

// ── Blueprint for each cluster of the cairn: shape params only. The material is
// NOT stored here — it is inferred after generation, honouring the brief. ──
interface Blueprint {
  center: [number, number, number];
  spread: [number, number, number]; // positional stddev per axis
  scale: [number, number, number]; // mean splat scale per axis (anisotropy)
  color: [number, number, number];
  colorJitter: number;
  opacity: number;
  count: number;
  seed: number;
}

// A stacked / floating cairn: glass shard aloft, brass bar leaning, wood block,
// slate boulder at the base, plus a small high glass pebble and a stone pebble.
const BLUEPRINTS: Blueprint[] = [
  {
    // 0 — glass shard, small + tight + bright cool, floating high
    center: [-0.15, 1.72, 0.1],
    spread: [0.16, 0.26, 0.16],
    scale: [0.05, 0.09, 0.05],
    color: [0.5, 0.86, 0.92],
    colorJitter: 0.06,
    opacity: 0.62,
    count: 640,
    seed: 101,
  },
  {
    // 1 — brass metal bar, strongly elongated, leaning mid-height
    center: [0.62, 0.72, -0.1],
    spread: [0.1, 0.5, 0.1],
    scale: [0.05, 0.2, 0.05],
    color: [0.85, 0.63, 0.28],
    colorJitter: 0.05,
    opacity: 0.66,
    count: 720,
    seed: 202,
  },
  {
    // 2 — wood block, medium warm, mid
    center: [-0.66, 0.36, 0.16],
    spread: [0.28, 0.22, 0.24],
    scale: [0.12, 0.12, 0.12],
    color: [0.6, 0.4, 0.22],
    colorJitter: 0.07,
    opacity: 0.7,
    count: 700,
    seed: 303,
  },
  {
    // 3 — slate stone boulder, large + diffuse + dark + desaturated, base
    center: [0.05, -0.62, 0.0],
    spread: [0.5, 0.34, 0.44],
    scale: [0.19, 0.17, 0.19],
    color: [0.42, 0.47, 0.56],
    colorJitter: 0.05,
    opacity: 0.72,
    count: 900,
    seed: 404,
  },
  {
    // 4 — small high glass pebble (higher pitch), floating off to a side
    center: [0.78, 1.42, 0.22],
    spread: [0.12, 0.14, 0.12],
    scale: [0.045, 0.06, 0.045],
    color: [0.55, 0.9, 0.88],
    colorJitter: 0.06,
    opacity: 0.6,
    count: 460,
    seed: 505,
  },
  {
    // 5 — small slate pebble resting on the boulder
    center: [-0.5, -0.12, -0.2],
    spread: [0.22, 0.18, 0.2],
    scale: [0.11, 0.1, 0.11],
    color: [0.46, 0.5, 0.58],
    colorJitter: 0.05,
    opacity: 0.7,
    count: 560,
    seed: 606,
  },
];

// Score a built cluster's stats into one of the four materials (SonicGauss-style).
function inferMaterial(stats: {
  meanScale: number;
  spread: number;
  anisotropy: number;
  luminance: number;
  sat: number;
  hue: number;
}): MaterialId {
  const cool = stats.hue >= 150 && stats.hue <= 260;
  // metal: dominated by anisotropy (an elongated bar), warm-ish metallic hue
  if (stats.anisotropy > 2.0 && stats.sat > 0.2 && !cool) return "METAL";
  // glass: small + tight + bright + cool
  if (stats.meanScale < 0.09 && stats.spread < 0.42 && stats.luminance > 0.6 && cool)
    return "GLASS";
  // stone: large + diffuse + dark + desaturated
  if (stats.meanScale > 0.1 && stats.luminance < 0.55 && stats.sat < 0.3) return "STONE";
  // wood: everything mid + warm
  return "WOOD";
}

// pitch: bigger cluster ⇒ lower fundamental, then nudged into the material's register
function fundamentalFor(material: MaterialId, radius: number): number {
  // radius roughly 0.1 (small glass) .. 0.6 (boulder)
  const t = Math.min(1, Math.max(0, (radius - 0.08) / 0.55)); // 0 small → 1 large
  const sizeHz = 660 - t * 560; // 660 Hz small … 100 Hz large
  const bias: Record<MaterialId, number> = {
    GLASS: 1.35,
    METAL: 1.05,
    WOOD: 0.85,
    STONE: 0.65,
  };
  return Math.max(70, sizeHz * bias[material]);
}

export function buildScene(): Scene {
  let total = 0;
  for (const b of BLUEPRINTS) total += b.count;

  const positions = new Float32Array(total * 3);
  const cov = new Float32Array(total * 6);
  const colors = new Float32Array(total * 3);
  const opacity = new Float32Array(total);
  const clusterId = new Uint16Array(total);
  const clusters: Cluster[] = [];

  let cursor = 0;
  for (let ci = 0; ci < BLUEPRINTS.length; ci++) {
    const b = BLUEPRINTS[ci];
    const rnd = mulberry32(b.seed);
    const start = cursor;

    // accumulators for material inference
    let accScale = 0;
    let accSpread = 0;
    let accAniso = 0;
    let accR = 0;
    let accG = 0;
    let accBc = 0;

    for (let i = 0; i < b.count; i++) {
      const [g0, g1] = gauss2(rnd);
      const [g2] = gauss2(rnd);
      const px = b.center[0] + g0 * b.spread[0];
      const py = b.center[1] + g1 * b.spread[1];
      const pz = b.center[2] + g2 * b.spread[2];
      positions[cursor * 3] = px;
      positions[cursor * 3 + 1] = py;
      positions[cursor * 3 + 2] = pz;

      // per-splat scale with mild jitter around the blueprint anisotropy
      const jitter = () => 0.7 + rnd() * 0.6;
      const sx = b.scale[0] * jitter();
      const sy = b.scale[1] * jitter();
      const sz = b.scale[2] * jitter();

      // random orientation (elongated splats then point every which way,
      // giving the fibrous, volumetric look)
      const q: [number, number, number, number] = [
        rnd() * 2 - 1,
        rnd() * 2 - 1,
        rnd() * 2 - 1,
        rnd() * 2 - 1,
      ];
      const c = covFromScaleQuat([sx, sy, sz], q);
      cov[cursor * 6] = c[0];
      cov[cursor * 6 + 1] = c[1];
      cov[cursor * 6 + 2] = c[2];
      cov[cursor * 6 + 3] = c[3];
      cov[cursor * 6 + 4] = c[4];
      cov[cursor * 6 + 5] = c[5];

      const jc = () => (rnd() * 2 - 1) * b.colorJitter;
      const cr = Math.min(1, Math.max(0, b.color[0] + jc()));
      const cg = Math.min(1, Math.max(0, b.color[1] + jc()));
      const cb = Math.min(1, Math.max(0, b.color[2] + jc()));
      colors[cursor * 3] = cr;
      colors[cursor * 3 + 1] = cg;
      colors[cursor * 3 + 2] = cb;
      opacity[cursor] = b.opacity * (0.8 + rnd() * 0.4);
      clusterId[cursor] = ci;

      accScale += (sx + sy + sz) / 3;
      accSpread += Math.hypot(px - b.center[0], py - b.center[1], pz - b.center[2]);
      const mx = Math.max(sx, sy, sz);
      const mn = Math.min(sx, sy, sz);
      accAniso += mx / Math.max(1e-4, mn);
      accR += cr;
      accG += cg;
      accBc += cb;
      cursor++;
    }

    const n = b.count;
    const meanScale = accScale / n;
    const spread = accSpread / n;
    const anisotropy = accAniso / n;
    const mr = accR / n;
    const mg = accG / n;
    const mb = accBc / n;
    const luminance = 0.299 * mr + 0.587 * mg + 0.114 * mb;
    const { hue, sat } = hueSat(mr, mg, mb);

    const material = inferMaterial({
      meanScale,
      spread,
      anisotropy,
      luminance,
      sat,
      hue,
    });
    // characteristic radius from positional spread + mean splat size
    const radius = spread + meanScale;
    const fundamental = fundamentalFor(material, radius);

    clusters.push({
      center: [...b.center],
      radius,
      material,
      color: [mr, mg, mb],
      start,
      count: n,
      fundamental,
    });
  }

  return { count: total, positions, cov, colors, opacity, clusterId, clusters };
}
