// ─────────────────────────────────────────────────────────────────────────────
// camera.ts — pure column-major 4×4 matrix math (no DOM, no React).
//
//   The listener stands at the origin and only TURNS: a yaw (heading) and a small
//   pitch. forwardFromAngles gives the look direction; makeViewProjection builds
//   the WebGL clip-space (z ∈ [-1,1]) view-projection matrix uploaded to the
//   renderer and reused by the Canvas2D fallback via projectPoint.
//
//   Convention: yaw 0 looks down -z (toward the apse). forward =
//   (sin·cos, sin(pitch), -cos·cos). This matches the audio bearing math so eye
//   and ear turn together.
// ─────────────────────────────────────────────────────────────────────────────

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

/** Unit look direction for a heading yaw + pitch (radians). */
export function forwardFromAngles(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

/** Perspective projection, column-major, clip z ∈ [-1, 1]. */
export function perspective(
  fovyRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Right-handed lookAt, column-major. */
export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const f = normalize([
    center[0] - eye[0],
    center[1] - eye[1],
    center[2] - eye[2],
  ]);
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  const m = new Float32Array(16);
  m[0] = s[0];
  m[1] = u[0];
  m[2] = -f[0];
  m[4] = s[1];
  m[5] = u[1];
  m[6] = -f[1];
  m[8] = s[2];
  m[9] = u[2];
  m[10] = -f[2];
  m[12] = -dot(s, eye);
  m[13] = -dot(u, eye);
  m[14] = dot(f, eye);
  m[15] = 1;
  return m;
}

/** a · b, both column-major. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** View-projection for a listener at the origin turning by (yaw, pitch). */
export function makeViewProjection(
  yaw: number,
  pitch: number,
  aspect: number,
): Mat4 {
  const eye: Vec3 = [0, 0, 0];
  const fwd = forwardFromAngles(yaw, pitch);
  const center: Vec3 = [fwd[0], fwd[1], fwd[2]];
  const view = lookAt(eye, center, [0, 1, 0]);
  const proj = perspective((72 * Math.PI) / 180, aspect, 0.1, 120);
  return multiply(proj, view);
}

export interface Projected {
  x: number; // pixel x
  y: number; // pixel y
  visible: boolean;
}

/** Project a world point to pixel coords for the Canvas2D fallback. */
export function projectPoint(
  vp: Mat4,
  px: number,
  py: number,
  pz: number,
  width: number,
  height: number,
): Projected {
  const x = vp[0] * px + vp[4] * py + vp[8] * pz + vp[12];
  const y = vp[1] * px + vp[5] * py + vp[9] * pz + vp[13];
  const w = vp[3] * px + vp[7] * py + vp[11] * pz + vp[15];
  if (w <= 0.0001) return { x: 0, y: 0, visible: false };
  const ndcx = x / w;
  const ndcy = y / w;
  if (ndcx < -1.3 || ndcx > 1.3 || ndcy < -1.3 || ndcy > 1.3) {
    return { x: 0, y: 0, visible: false };
  }
  return {
    x: (ndcx * 0.5 + 0.5) * width,
    y: (1 - (ndcy * 0.5 + 0.5)) * height,
    visible: true,
  };
}
