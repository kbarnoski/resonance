// ─────────────────────────────────────────────────────────────────────────────
// 6936-floatdrift · field.ts
//
// Pure, deterministic builders for the entoptic form-constant line-work. Every
// function returns SVG path `d` strings (or mutates a persistent point pool) so
// page.tsx can keep a fixed element pool and only rewrite attributes each frame
// — no per-frame allocation churn, no Math.random.
//
// The three Klüver (1926) form-constant families rendered here:
//   • cobweb  — radial spokes + concentric polygon rings (a spider-web / tunnel)
//   • spiral  — a multi-arm logarithmic-ish spiral
//   • lattice — a honeycomb of small hexagons (the "grating / lattice" constant)
//
// Their coherence is *not* baked in here; page.tsx fades/scales each family by a
// "stillness" scalar so the imagery blooms the quieter the device is held.
// ─────────────────────────────────────────────────────────────────────────────

export const TAU = Math.PI * 2;

/** Seeded PRNG — the ONLY source of randomness in this piece. Seed 0x6936. */
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 0→1 ramp between edges e0 and e1. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// ── cobweb: radial spokes + concentric polygon rings ─────────────────────────
export function cobwebPath(
  cx: number,
  cy: number,
  R: number,
  spokes: number,
  rings: number,
  rot: number,
): string {
  let d = "";
  for (let i = 0; i < spokes; i++) {
    const a = rot + (i / spokes) * TAU;
    d += `M${cx} ${cy}L${(cx + Math.cos(a) * R).toFixed(1)} ${(cy + Math.sin(a) * R).toFixed(1)}`;
  }
  for (let r = 1; r <= rings; r++) {
    const rr = R * (r / rings);
    for (let i = 0; i <= spokes; i++) {
      const a = rot + (i / spokes) * TAU;
      const x = (cx + Math.cos(a) * rr).toFixed(1);
      const y = (cy + Math.sin(a) * rr).toFixed(1);
      d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
    }
  }
  return d;
}

// ── spiral: multi-arm logarithmic-ish spiral ─────────────────────────────────
export function spiralPath(
  cx: number,
  cy: number,
  R: number,
  arms: number,
  turns: number,
  rot: number,
): string {
  const steps = 150;
  let d = "";
  for (let arm = 0; arm < arms; arm++) {
    const base = rot + (arm / arms) * TAU;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const theta = t * turns * TAU;
      const rr = R * Math.pow(t, 0.72);
      const a = base + theta;
      const x = (cx + Math.cos(a) * rr).toFixed(1);
      const y = (cy + Math.sin(a) * rr).toFixed(1);
      d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
    }
  }
  return d;
}

// ── lattice: honeycomb of small hexagons (static geometry, computed once) ─────
export function latticePath(cx: number, cy: number, R: number, cell: number): string {
  let d = "";
  const hexR = cell * 0.56;
  // hex-grid centers within radius R
  const dx = cell * Math.sqrt(3);
  const dy = cell * 1.5;
  const cols = Math.ceil((R * 2) / dx) + 1;
  const rows = Math.ceil((R * 2) / dy) + 1;
  for (let row = -rows; row <= rows; row++) {
    for (let col = -cols; col <= cols; col++) {
      const ox = col * dx + (row & 1 ? dx / 2 : 0);
      const oy = row * dy;
      const dist = Math.hypot(ox, oy);
      if (dist > R * 0.94) continue;
      const hx = cx + ox;
      const hy = cy + oy;
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6;
        const x = (hx + Math.cos(a) * hexR).toFixed(1);
        const y = (hy + Math.sin(a) * hexR).toFixed(1);
        d += k === 0 ? `M${x} ${y}` : `L${x} ${y}`;
      }
    }
  }
  return d;
}

// ── drifting phosphene points (the sparse low-stillness baseline) ────────────
export interface Phosphene {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  seed: number;
}

export function makePhosphenes(n: number, R: number, rng: () => number): Phosphene[] {
  const out: Phosphene[] = [];
  for (let i = 0; i < n; i++) {
    const ang = rng() * TAU;
    const rad = Math.sqrt(rng()) * R;
    const sp = 4 + rng() * 10;
    const dir = rng() * TAU;
    out.push({
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad,
      vx: Math.cos(dir) * sp,
      vy: Math.sin(dir) * sp,
      r: 1.1 + rng() * 2.4,
      seed: rng() * TAU,
    });
  }
  return out;
}
