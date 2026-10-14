// ─────────────────────────────────────────────────────────────────────────────
// depth-collide.ts — PHASE D: motes that live IN the imagery (?collide=1).
//
// Depth occlusion (branch worktree-agent-ae44a39de2fd4c1f4, depth-occlusion.ts)
// hides a mote behind the picture's nearer material — a LIGHT effect. This is
// its MOTION twin: the still's depth map is a surface in front of the camera;
// a free mote that drifts into it is eased back out toward the camera and
// slides along it — motes settle on ridges, stream around a trunk, pool in the
// valleys of the picture. The screen → still → depth maths is the occlusion
// branch's (coverRect, screenToStillUv, moteDepth, the blurred depth field),
// copied here verbatim so the two agree on where the surface is; when that
// branch lands, both read the same OcclusionDriver slots.
//
// LAWS (depth-collide.test.ts):
//  · MOTION ONLY — a velocity change, never light, never a position jump.
//  · BOUNDED + EASED — the push is a spring on the penetration capped at
//    MAX_ACC; slot weights glide (GLIDE_SEC); a slot's map only swaps at ~0.
//  · FREE FIELD ONLY — image forms / emblems (Snowflake's flakes, Ghost's
//    angel and blossoms) are never pushed: gated by (1 − image form).
//  · OFF by default (?collide=1) until Karel sees film; every journey incl.
//    Snowflake + Ghost then, with a strength knob (Ghost has no depth pack yet).
// ─────────────────────────────────────────────────────────────────────────────

export const COLLIDE_LAWS = {
  /** default calibration — the occlusion branch's (focal plane at mid depth) */
  PLANE: 0.5,
  SPAN: 1.0,
  /** the surface sits this far (depth units) behind where occlusion starts */
  LEAD: 0.05,
  /** spring on the penetration (u/s² per world unit inside the material) */
  PUSH: 6,
  /** the push never exceeds this (u/s²) — never a lunge */
  MAX_ACC: 3,
  /** share of the INTO-the-surface velocity removed per second (eased) */
  NORMAL_DAMP: 4,
  /** tangential friction per second while touching (motes slide, slowly) */
  FRICTION: 0.6,
  /** slot weights glide (s) */
  GLIDE_SEC: 0.6,
  /** a slot's map may only change below this shown weight */
  SWAP_EPS: 0.002,
  /** the worker's sample width (px) + blur passes — the occlusion branch's */
  SAMPLE_W: 96,
  BLUR_PASSES: 4,
} as const;

export interface CollideCal { plane: number; span: number; lead: number }
export const DEFAULT_CAL: CollideCal = { plane: COLLIDE_LAWS.PLANE, span: COLLIDE_LAWS.SPAN, lead: COLLIDE_LAWS.LEAD };

export function collideRequested(search?: string): boolean {
  try { return new URLSearchParams(search ?? (typeof location !== "undefined" ? location.search : "")).get("collide") === "1"; } catch { return false; }
}

// ── the occlusion branch's maths (verbatim) ─────────────────────────────────
export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
export type Rect = [number, number, number, number];
export function coverRect(imgAspect: number, scrAspect: number, scale = 1, panX = 0, panY = 0): Rect {
  const ia = imgAspect > 0 ? imgAspect : 1;
  const sa = scrAspect > 0 ? scrAspect : 1;
  const bw = ia > sa ? ia / sa : 1;
  const bh = ia > sa ? 1 : sa / ia;
  const w = bw * scale, h = bh * scale;
  return [(1 - w) / 2 + panX, (1 - h) / 2 + panY, w, h];
}
export function screenToStillUv(sx: number, sy: number, r: Readonly<Rect>): [number, number] {
  return [(sx - r[0]) / Math.max(1e-6, r[2]), (sy - r[1]) / Math.max(1e-6, r[3])];
}
export function ndcToScreen(nx: number, ny: number): [number, number] {
  return [nx * 0.5 + 0.5, 0.5 - ny * 0.5];
}
export function moteDepth(viewDist: number, focusDist: number, cal: CollideCal): number {
  return clamp01(cal.plane + cal.span * (focusDist - viewDist) / Math.max(0.1, focusDist));
}
export function blurDepthField(src: ArrayLike<number>, w: number, h: number, passes: number): Float32Array {
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = src[i];
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
      b[y * w + x] = s / n;
    }
    const c = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += b[yy * w + x]; n++; } }
      c[y * w + x] = s / n;
    }
    a = c;
  }
  return a;
}

// ── the collision (CPU mirror of collide-wgsl.ts) ───────────────────────────

/** Penetration into the picture's material, in WORLD units along the view
 *  axis (> 0 = inside: the surface is nearer the camera than the mote). */
export function penetration(viewDist: number, focusDist: number, stillD: number, cal: CollideCal = DEFAULT_CAL): number {
  const md = moteDepth(viewDist, focusDist, cal);
  const pen = stillD - cal.lead - md;
  return pen > 0 ? (pen * Math.max(0.1, focusDist)) / Math.max(1e-3, cal.span) : 0;
}

/** The velocity after one step: a capped spring out of the material toward
 *  the camera (`eye`: unit vector toward it), the into-surface velocity damped
 *  and the rest slowed by friction — all × k (slot weight × strength × the
 *  free-field gate). Motion only. */
export function collideVelocity(v: readonly number[], eye: readonly number[], pen: number, k: number, dt: number): [number, number, number] {
  const out: [number, number, number] = [v[0], v[1], v[2]];
  if (pen <= 0 || k <= 0) return out;
  const L = COLLIDE_LAWS;
  const acc = Math.min(L.MAX_ACC, L.PUSH * pen) * k;
  const vn = v[0] * eye[0] + v[1] * eye[1] + v[2] * eye[2];
  const into = Math.min(0, vn); // moving away from the camera = deeper in
  const dampN = 1 - Math.exp(-L.NORMAL_DAMP * dt * k);
  const fric = Math.exp(-L.FRICTION * dt * k);
  for (let i = 0; i < 3; i++) {
    const vt = v[i] - vn * eye[i];
    out[i] = vt * fric + (vn - into * dampN) * eye[i] + eye[i] * acc * dt;
  }
  return out;
}
