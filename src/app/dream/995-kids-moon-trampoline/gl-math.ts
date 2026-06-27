// Minimal column-major mat4 + vec3 helpers (hand-written; no three.js).
// Column-major to match WebGL's gl.uniformMatrix4fv(..., false, m) convention.

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function makeMat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function makePerspective(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Right-handed lookAt (eye -> center), up vector. Column-major output.
export function makeLookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, center)); // forward (points away from target)
  const x = normalize(cross(up, z)); // right
  const y = cross(z, x); // true up
  const m = new Float32Array(16);
  m[0] = x[0];
  m[1] = y[0];
  m[2] = z[0];
  m[3] = 0;
  m[4] = x[1];
  m[5] = y[1];
  m[6] = z[1];
  m[7] = 0;
  m[8] = x[2];
  m[9] = y[2];
  m[10] = z[2];
  m[11] = 0;
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}

// out = a * b (both column-major). Allocates a new matrix.
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += a[k * 4 + r] * b[c * 4 + k];
      }
      out[c * 4 + r] = s;
    }
  }
  return out;
}
