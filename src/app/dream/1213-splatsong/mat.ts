// ─────────────────────────────────────────────────────────────────────────────
// mat.ts — tiny column-major mat4 / vec helpers (gl-matrix conventions), so the
// prototype stays self-contained (no external math dep). Column-major so the
// arrays feed straight into gl.uniformMatrix4fv with transpose = false.
// ─────────────────────────────────────────────────────────────────────────────

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Perspective projection (OpenGL clip space, -z forward). */
export function perspective(
  out: Mat4,
  fovy: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/** Right-handed lookAt view matrix (camera looks down -z toward center). */
export function lookAt(out: Mat4, eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  let z0 = eye[0] - center[0];
  let z1 = eye[1] - center[1];
  let z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len;
  z1 /= len;
  z2 /= len;

  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (!len) {
    x0 = x1 = x2 = 0;
  } else {
    len = 1 / len;
    x0 *= len;
    x1 *= len;
    x2 *= len;
  }

  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

/** View-space z of a world point given a column-major view matrix (for sorting). */
export function viewZ(view: Mat4, x: number, y: number, z: number): number {
  return view[2] * x + view[6] * y + view[10] * z + view[14];
}

export interface Projected {
  sx: number; // screen x (px)
  sy: number; // screen y (px)
  w: number; // clip w (positive when in front)
  behind: boolean;
}

/** Project a world point to screen pixels through proj·view. */
export function projectToScreen(
  proj: Mat4,
  view: Mat4,
  p: Vec3,
  width: number,
  height: number,
): Projected {
  // view * p
  const vx = view[0] * p[0] + view[4] * p[1] + view[8] * p[2] + view[12];
  const vy = view[1] * p[0] + view[5] * p[1] + view[9] * p[2] + view[13];
  const vz = view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14];
  const vw = view[3] * p[0] + view[7] * p[1] + view[11] * p[2] + view[15];
  // proj * (view*p)
  const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw;
  const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw;
  const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;
  const behind = cw <= 0.0001;
  const iw = 1 / (behind ? 1 : cw);
  const ndcX = cx * iw;
  const ndcY = cy * iw;
  return {
    sx: (ndcX * 0.5 + 0.5) * width,
    sy: (1 - (ndcY * 0.5 + 0.5)) * height,
    w: cw,
    behind,
  };
}
