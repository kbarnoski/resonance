/* ── 1450-supershape-bloom · WebGL2 renderer + tiny inline mat4 math ──────────
 *
 *  Pure WebGL2. Renders the supershape as a lit two-sided shaded surface, then
 *  overlays a subsampled wireframe as an additive "engraved radiolaria" sheen.
 *  Positions + normals are re-uploaded every frame from superformula.ts.
 *
 *  The matrix helpers are hand-rolled column-major mat4s — no npm dependency,
 *  no three.js. Everything the draw needs is here.
 */

import type { Mesh } from "./superformula";

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const [ex, ey, ez] = eye;
  let zx = ex - center[0];
  let zy = ey - center[1];
  let zz = ez - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[12] = -(xx * ex + xy * ey + xz * ez);
  m[13] = -(yx * ex + yy * ey + yz * ez);
  m[14] = -(zx * ex + zy * ey + zz * ez);
  m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function mat4RotateY(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = mat4Identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function mat4RotateX(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = mat4Identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function mat4Scale(s: number): Mat4 {
  const m = mat4Identity();
  m[0] = m[5] = m[10] = s;
  return m;
}

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
uniform mat4 u_mvp;
uniform mat4 u_model;
out vec3 v_nrm;
out vec3 v_wpos;
void main() {
  v_wpos = (u_model * vec4(a_pos, 1.0)).xyz;
  v_nrm = mat3(u_model) * a_nrm;
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  gl_PointSize = 2.0;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec3 v_nrm;
in vec3 v_wpos;
uniform vec3 u_light;
uniform vec3 u_eye;
uniform float u_hue;
uniform float u_bloom;
uniform float u_glow;
uniform float u_wire;
uniform float u_alpha;
out vec4 frag;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 N = normalize(v_nrm);
  vec3 V = normalize(u_eye - v_wpos);
  // two-sided: flip the normal toward the viewer
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(u_light);
  float diff = max(dot(N, L), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4);

  float h = fract(u_hue + 0.14 * v_wpos.z + 0.06 * length(v_wpos.xy));
  vec3 base = hsv2rgb(vec3(h, 0.55 + 0.2 * u_bloom, 1.0));

  if (u_wire > 0.5) {
    vec3 wcol = mix(base, vec3(1.0), 0.55);
    frag = vec4(wcol, u_alpha);
    return;
  }

  vec3 col = base * (0.16 + 0.95 * diff);
  col += rim * vec3(0.55, 0.75, 1.0) * (0.35 + 0.5 * u_bloom);
  col += base * u_glow * 0.35;
  frag = vec4(col, u_alpha);
}`;

export interface DrawOpts {
  proj: Mat4;
  view: Mat4;
  model: Mat4;
  eye: Vec3;
  light: Vec3;
  hue: number;
  bloom: number;
  glow: number;
}

export interface Rig {
  gl: WebGL2RenderingContext;
  resize(w: number, h: number, dpr: number): void;
  upload(positions: Float32Array, normals: Float32Array): void;
  draw(o: DrawOpts): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("supershape shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeRig(canvas: HTMLCanvasElement, mesh: Mesh): Rig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("supershape link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const u = {
    mvp: gl.getUniformLocation(program, "u_mvp"),
    model: gl.getUniformLocation(program, "u_model"),
    light: gl.getUniformLocation(program, "u_light"),
    eye: gl.getUniformLocation(program, "u_eye"),
    hue: gl.getUniformLocation(program, "u_hue"),
    bloom: gl.getUniformLocation(program, "u_bloom"),
    glow: gl.getUniformLocation(program, "u_glow"),
    wire: gl.getUniformLocation(program, "u_wire"),
    alpha: gl.getUniformLocation(program, "u_alpha"),
  };

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const nrmBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.triIndices, gl.STATIC_DRAW);
  const triCount = mesh.triIndices.length;

  const lineBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.lineIndices, gl.STATIC_DRAW);
  const lineCount = mesh.lineIndices.length;

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  let dpr = 1;

  return {
    gl,
    resize(w: number, h: number, deviceRatio: number) {
      dpr = deviceRatio;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    upload(positions: Float32Array, normals: Float32Array) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
      gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals);
    },
    draw(o: DrawOpts) {
      const mvp = mat4Multiply(mat4Multiply(o.proj, o.view), o.model);
      gl.clearColor(0.02, 0.02, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(u.mvp, false, mvp);
      gl.uniformMatrix4fv(u.model, false, o.model);
      gl.uniform3fv(u.light, o.light);
      gl.uniform3fv(u.eye, o.eye);
      gl.uniform1f(u.hue, o.hue);
      gl.uniform1f(u.bloom, o.bloom);
      gl.uniform1f(u.glow, o.glow);

      // solid fill
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.uniform1f(u.wire, 0);
      gl.uniform1f(u.alpha, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuf);
      gl.drawElements(gl.TRIANGLES, triCount, gl.UNSIGNED_SHORT, 0);

      // additive wireframe sheen
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.uniform1f(u.wire, 1);
      gl.uniform1f(u.alpha, 0.11);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf);
      gl.drawElements(gl.LINES, lineCount, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(nrmBuf);
      gl.deleteBuffer(triBuf);
      gl.deleteBuffer(lineBuf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
