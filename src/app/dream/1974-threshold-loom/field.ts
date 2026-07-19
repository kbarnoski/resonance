// ─────────────────────────────────────────────────────────────────────────────
// field.ts — the Canvas2D Ganzfeld field + phosphene form-constant blooms.
//
//   A hypnagogic (sleep-onset) visual substrate rendered on a PLAIN 2D canvas
//   (no WebGL / WebGPU / SVG). Two layers:
//
//     1. The GANZFELD ground — a near-uniform luminous fog. At `depth` 0 it is a
//        dim warm-dusk field with a soft vignette (a room at dusk); as `depth`
//        climbs toward the threshold of sleep the vignette dissolves and the
//        ground brightens toward a boundless, near-uniform soft-white — the
//        featureless field in which sensory deprivation lets the visual cortex
//        hallucinate. All luminance change is slow drift (sub-Hz), never a
//        strobe — see the SAFETY note below.
//
//     2. PHOSPHENE BLOOMS — soft geometric "form constants" (Klüver) that bloom
//        and fade at each keystroke: speckle clouds, faint hex LATTICES, and
//        drifting light-SPOTS. Wackermann/Pütz/Allefeld (Cortex 2002) found such
//        form-constants make up ~86% of real hypnagogic imagery. Each bloom uses
//        a smooth sin() envelope (0→1→0) so it swells and fades — it NEVER
//        snap-flashes. As `depth` approaches 1 the blooms lose contrast and
//        dissolve into the boundless ground: language and structure let go.
//
//   SAFETY: every luminance change here is a slow drift (blooms live ~2–5 s;
//   the ground breathes at ~0.05 Hz). Nothing flickers above a few Hz.
//
//   DETERMINISM: all "randomness" comes from a fixed-seed mulberry32 — no
//   Math.random / Date / performance.now anywhere. Given the same keystroke
//   cadence the field is byte-identical every run (so the headless review sees
//   the same piece every morning).
// ─────────────────────────────────────────────────────────────────────────────

/** Tiny fast seeded PRNG (mulberry32). Deterministic — the ONLY source of
 *  "randomness" in this prototype, so the piece is reproducible. */
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

export type BloomKind = "speckle" | "lattice" | "spot";

interface Bloom {
  x: number; // normalized 0..1 across the short axis-centered field
  y: number;
  r: number; // radius as a fraction of min(w,h)
  age: number; // seconds
  life: number; // seconds
  kind: BloomKind;
  warm: number; // 0 = dusky violet, 1 = warm amber
  seed: number; // per-bloom seed for internal placement
  vx: number; // slow drift
  vy: number;
  intensity: number; // 0..1 peak alpha scale
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Ground palette (RGB). Dim warm-dusk violet → boundless soft-white.
const DUSK: [number, number, number] = [24, 18, 32]; // dim violet, warm-leaning
const SOFT: [number, number, number] = [228, 222, 234]; // near-uniform soft-white

// Phosphene tints — muted, never raw-saturated.
const VIOLET: [number, number, number] = [168, 139, 250]; // dusky violet
const AMBER: [number, number, number] = [206, 158, 104]; // soft warm amber

export class ThresholdField {
  private blooms: Bloom[] = [];
  private rnd: () => number;
  private groundSeed: () => number;

  constructor(seed = 0x7104b00d) {
    this.rnd = mulberry32(seed);
    this.groundSeed = mulberry32(seed ^ 0x5eed);
  }

  /** Spawn a phosphene bloom for a keystroke. `depth` deepens toward sleep,
   *  `drowsy` is how slow/steady the triggering keystroke was (0 frantic → 1
   *  languid). Deeper + drowsier keystrokes bloom larger, softer, more organized
   *  (lattice); frantic ones scatter as tight speckle. */
  spawn(depth: number, drowsy: number): void {
    const r = this.rnd;
    // Central bias — the Ganzfeld's imagery gathers near the field's middle.
    const spread = lerp(0.42, 0.24, depth); // field narrows / centralizes deeper
    const x = 0.5 + (r() - 0.5) * spread * 2;
    const y = 0.5 + (r() - 0.5) * spread * 2;

    // Kind: shallow/frantic → speckle grain; mid → drifting spot; deep/steady →
    // organized hex lattice (the classic form-constant).
    const kd = r();
    const organize = clamp01(depth * 0.7 + drowsy * 0.4);
    let kind: BloomKind;
    if (kd < 0.34 - organize * 0.24) kind = "speckle";
    else if (kd < 0.72 - organize * 0.1) kind = "spot";
    else kind = "lattice";

    const size = lerp(0.06, 0.26, clamp01(depth * 0.6 + drowsy * 0.5)) * lerp(0.7, 1.25, r());
    const life = lerp(2.0, 5.2, clamp01(depth * 0.5 + drowsy * 0.6));
    const ang = r() * Math.PI * 2;
    const dspeed = lerp(0.004, 0.016, r()) * (1 - depth * 0.4);

    this.blooms.push({
      x,
      y,
      r: size,
      age: 0,
      life,
      kind,
      warm: r() * 0.5 + (kind === "speckle" ? 0.15 : 0), // mostly violet, some amber
      seed: (r() * 0xffffffff) >>> 0,
      vx: Math.cos(ang) * dspeed,
      vy: Math.sin(ang) * dspeed,
      intensity: lerp(0.5, 1.0, drowsy),
    });

    // Cap the working set so a burst of frantic typing can't grow unbounded.
    if (this.blooms.length > 48) this.blooms.splice(0, this.blooms.length - 48);
  }

  /** Advance bloom ages + drift. `dt` seconds. */
  update(dt: number): void {
    const d = Math.min(0.05, Math.max(0, dt));
    for (const b of this.blooms) {
      b.age += d;
      b.x += b.vx * d * 6;
      b.y += b.vy * d * 6;
    }
    // Drop fully-faded blooms.
    this.blooms = this.blooms.filter((b) => b.age < b.life);
  }

  /** Draw the whole field. `clock` (seconds) drives the slow ground breathing;
   *  `reduced` freezes motion to a calm still field. */
  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    depth: number,
    clock: number,
    reduced: boolean,
  ): void {
    const dep = clamp01(depth);
    const mn = Math.min(w, h);

    // ── Ganzfeld ground ──────────────────────────────────────────────────
    // Very slow "fog breathing": a couple of sub-Hz sinusoids, tiny amplitude.
    const breath = reduced
      ? 0
      : 0.5 * Math.sin(clock * 0.31) + 0.5 * Math.sin(clock * 0.17 + 1.7);
    const lum = clamp01(dep * 0.82 + 0.06 + breath * 0.03 * (0.4 + dep));

    const base: [number, number, number] = [
      lerp(DUSK[0], SOFT[0], lum),
      lerp(DUSK[1], SOFT[1], lum),
      lerp(DUSK[2], SOFT[2], lum),
    ];
    // Vignette strength fades as we approach the threshold → boundless field.
    const vig = lerp(0.72, 0.04, dep);
    const cx = w * (0.5 + (reduced ? 0 : Math.sin(clock * 0.13) * 0.03));
    const cy = h * (0.5 + (reduced ? 0 : Math.cos(clock * 0.11) * 0.03));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, mn * 0.85);
    const inner = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
    const edgeMul = 1 - vig;
    const edge = `rgb(${(base[0] * edgeMul) | 0},${(base[1] * edgeMul) | 0},${(base[2] * edgeMul) | 0})`;
    g.addColorStop(0, inner);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // A faint warm-dusk wash low in the field (the amber horizon of dusk),
    // which recedes as the field goes boundless.
    if (dep < 0.85) {
      const warmA = (1 - smoothstep(0.4, 0.85, dep)) * 0.10;
      const wg = ctx.createLinearGradient(0, h, 0, h * 0.45);
      wg.addColorStop(0, `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${warmA})`);
      wg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = wg;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Phosphene blooms ─────────────────────────────────────────────────
    // Contrast falls as we near the threshold — imagery dissolves into the
    // uniform ground. On the bright deep ground we darken-blend; on the dim
    // shallow ground we glow-blend ("lighter"). Either way it's a soft drift.
    const contrast = 1 - smoothstep(0.72, 1.0, dep) * 0.72;
    const glow = dep < 0.55;
    ctx.save();
    ctx.globalCompositeOperation = glow ? "lighter" : "source-over";
    for (const b of this.blooms) {
      const t = b.age / b.life;
      const env = Math.sin(Math.PI * clamp01(t)); // 0 → 1 → 0, gentle
      if (env <= 0.001) continue;
      const alpha = env * b.intensity * contrast * (glow ? 0.42 : 0.30);
      const px = b.x * w;
      const py = b.y * h;
      const rad = b.r * mn;
      const tint = glow ? mixTint(b.warm) : mixDark(b.warm);
      drawBloom(ctx, b, px, py, rad, alpha, tint);
    }
    ctx.restore();
  }

  clear(): void {
    this.blooms = [];
  }
}

function mixTint(warm: number): [number, number, number] {
  return [
    lerp(VIOLET[0], AMBER[0], warm),
    lerp(VIOLET[1], AMBER[1], warm),
    lerp(VIOLET[2], AMBER[2], warm),
  ];
}
// On the bright deep ground, phosphenes read as soft darker specks.
function mixDark(warm: number): [number, number, number] {
  const t = mixTint(warm);
  return [t[0] * 0.42, t[1] * 0.4, t[2] * 0.5];
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  b: Bloom,
  px: number,
  py: number,
  rad: number,
  alpha: number,
  tint: [number, number, number],
): void {
  const [r, gg, bb] = tint;
  const col = (a: number) => `rgba(${r | 0},${gg | 0},${bb | 0},${a})`;

  if (b.kind === "spot") {
    const rg = ctx.createRadialGradient(px, py, 0, px, py, rad);
    rg.addColorStop(0, col(alpha));
    rg.addColorStop(0.5, col(alpha * 0.4));
    rg.addColorStop(1, col(0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (b.kind === "speckle") {
    const rnd = mulberry32(b.seed);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * rad;
      const dx = px + Math.cos(a) * rr;
      const dy = py + Math.sin(a) * rr;
      const dotR = rad * (0.05 + rnd() * 0.09);
      const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, dotR);
      dg.addColorStop(0, col(alpha * 0.9));
      dg.addColorStop(1, col(0));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // lattice — a soft hexagonal grid of faint points inside a radial falloff.
  const step = rad * 0.34;
  const rows = 5;
  const dotR = step * 0.28;
  for (let iy = -rows; iy <= rows; iy++) {
    const yy = py + iy * step * 0.87;
    const xoff = (iy & 1) === 0 ? 0 : step * 0.5;
    for (let ix = -rows; ix <= rows; ix++) {
      const xx = px + ix * step + xoff;
      const dist = Math.hypot(xx - px, yy - py);
      const fall = 1 - clamp01(dist / rad);
      if (fall <= 0.02) continue;
      const a = alpha * fall * fall * 0.9;
      const dg = ctx.createRadialGradient(xx, yy, 0, xx, yy, dotR);
      dg.addColorStop(0, col(a));
      dg.addColorStop(1, col(0));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(xx, yy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
