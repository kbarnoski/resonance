// Path geometry helpers for the phosphor oscilloscope.
// A "shape" is a closed loop of 2D points, normalised to roughly [-0.9, 0.9].
// We resample any drawn / preset path into N points spaced by constant
// arc-length, so the audio buffer (X = left, Y = right) traces the loop at a
// perceptually even rate — the same array drives both sound and the scope.

export type Pt = { x: number; y: number };

/** Number of points in a resampled shape — also the audio buffer base length. */
export const SHAPE_N = 1024;

/**
 * Resample a closed polyline into `n` points equally spaced by arc length.
 * Input points may be in any pixel range; output preserves the input units.
 * The path is treated as a closed loop (last point connects back to first).
 */
export function resampleClosed(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) {
    // Degenerate: replicate the single point.
    const p = pts[0] ?? { x: 0, y: 0 };
    return Array.from({ length: n }, () => ({ ...p }));
  }

  // Build cumulative arc-length around the closed loop.
  const loop = [...pts, pts[0]];
  const cum: number[] = [0];
  for (let i = 1; i < loop.length; i++) {
    const dx = loop[i].x - loop[i - 1].x;
    const dy = loop[i].y - loop[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];
  if (total <= 1e-9) {
    const p = pts[0];
    return Array.from({ length: n }, () => ({ ...p }));
  }

  const out: Pt[] = new Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total; // i/n keeps the loop seamless (no dup endpoint)
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const t = segLen > 1e-9 ? (target - cum[seg]) / segLen : 0;
    out[i] = {
      x: loop[seg].x + (loop[seg + 1].x - loop[seg].x) * t,
      y: loop[seg].y + (loop[seg + 1].y - loop[seg].y) * t,
    };
  }
  return out;
}

/**
 * Centre a shape on its centroid and scale so the largest extent fills
 * `scale` (default 0.9) of the [-1, 1] box. Returns a fresh array.
 */
export function normalizeShape(pts: Pt[], scale = 0.9): Pt[] {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  let maxR = 1e-9;
  for (const p of pts) {
    maxR = Math.max(maxR, Math.abs(p.x - cx), Math.abs(p.y - cy));
  }
  const k = scale / maxR;
  return pts.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }));
}

/** Lightly smooth a closed loop (moving average) to tame hand jitter. */
export function smoothClosed(pts: Pt[], passes = 2): Pt[] {
  let cur = pts;
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    const next: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n];
      const b = cur[i];
      const c = cur[(i + 1) % n];
      next[i] = {
        x: (a.x + 2 * b.x + c.x) / 4,
        y: (a.y + 2 * b.y + c.y) / 4,
      };
    }
    cur = next;
  }
  return cur;
}

// ── Preset shapes ───────────────────────────────────────────────────────────
// All return normalised closed loops in [-0.9, 0.9]. Generated densely then
// resampled by the caller so arc-length spacing is uniform.

function circle(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9 };
  });
}

function square(n: number): Pt[] {
  // Trace the 4 sides of a square as a dense polyline.
  const corners: Pt[] = [
    { x: -0.9, y: -0.9 },
    { x: 0.9, y: -0.9 },
    { x: 0.9, y: 0.9 },
    { x: -0.9, y: 0.9 },
  ];
  const out: Pt[] = [];
  const per = Math.floor(n / 4);
  for (let s = 0; s < 4; s++) {
    const a = corners[s];
    const b = corners[(s + 1) % 4];
    for (let i = 0; i < per; i++) {
      const t = i / per;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function star(n: number, points = 5): Pt[] {
  const out: Pt[] = [];
  const outer = 0.9;
  const inner = 0.38;
  const verts = points * 2;
  for (let v = 0; v < verts; v++) {
    const a = (v / verts) * Math.PI * 2 - Math.PI / 2;
    const r = v % 2 === 0 ? outer : inner;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  // Densify each edge so resampling is well-conditioned.
  return densify(out, n);
}

function lissajous(n: number): Pt[] {
  // A 3:2 figure-eight-ish Lissajous — closed and audibly rich.
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: Math.sin(3 * t) * 0.9, y: Math.sin(2 * t) * 0.9 };
  });
}

function figure8(n: number): Pt[] {
  // Classic ∞ (lemniscate-style) — one of the most iconic scope shapes.
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: Math.sin(t) * 0.9, y: Math.sin(t) * Math.cos(t) * 1.6 };
  });
}

function heart(n: number): Pt[] {
  const raw = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    return { x, y };
  });
  return normalizeShape(raw, 0.9);
}

/** Linearly densify a polyline of vertices into ~n points. */
function densify(verts: Pt[], n: number): Pt[] {
  const loop = [...verts, verts[0]];
  const per = Math.max(2, Math.floor(n / verts.length));
  const out: Pt[] = [];
  for (let s = 0; s < verts.length; s++) {
    const a = loop[s];
    const b = loop[s + 1];
    for (let i = 0; i < per; i++) {
      const t = i / per;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export type PresetId = "circle" | "square" | "star" | "lissajous" | "figure8" | "heart";

export const PRESET_IDS: PresetId[] = [
  "figure8",
  "circle",
  "square",
  "star",
  "lissajous",
  "heart",
];

export const PRESET_LABELS: Record<PresetId, string> = {
  circle: "circle",
  square: "square",
  star: "star",
  lissajous: "lissajous",
  figure8: "figure-8",
  heart: "heart",
};

/** Build a preset, already resampled to SHAPE_N by uniform arc length. */
export function buildPreset(id: PresetId): Pt[] {
  const dense = 2048;
  let raw: Pt[];
  switch (id) {
    case "circle":
      raw = circle(dense);
      break;
    case "square":
      raw = square(dense);
      break;
    case "star":
      raw = star(dense);
      break;
    case "lissajous":
      raw = lissajous(dense);
      break;
    case "figure8":
      raw = figure8(dense);
      break;
    case "heart":
      raw = heart(dense);
      break;
  }
  return resampleClosed(normalizeShape(raw, 0.9), SHAPE_N);
}
