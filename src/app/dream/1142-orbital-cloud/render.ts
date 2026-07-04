// ─────────────────────────────────────────────────────────────────────────────
// render.ts — the visual layer. A WebGL2 additive point-cloud renderer for the
// probability cloud, plus a dependency-free 4×4 matrix helper and a Canvas2D
// fallback that projects the same point buffer (so a machine with no WebGL2
// still sees the orbital and drives the audio).
//
//   No three.js, no external deps: raw gl.POINTS with additive blending, a soft
//   Gaussian sprite in the fragment shader, and gl_VertexID-based twinkle.
// ─────────────────────────────────────────────────────────────────────────────

export type Vec3 = [number, number, number];

// ── minimal column-major mat4 helpers ───────────────────────────────────────
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) * nf;
  o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}

export function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
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

/** A view matrix: translate back by `dist`, then rotate by pitch (x) and yaw (y). */
export function mat4View(dist: number, pitch: number, yaw: number): Float32Array {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  // R = Rx · Ry (apply yaw then pitch), then translate along -z.
  // Row-major R:
  //   [ cy,      0,    sy    ]
  //   [ sx·sy,   cx,  -sx·cy ]
  //   [-cx·sy,   sx,   cx·cy ]
  // Stored column-major: m[col*4 + row].
  const m = new Float32Array(16);
  m[0] = cy; //       R00
  m[1] = sx * sy; //  R10
  m[2] = -cx * sy; // R20
  m[3] = 0;
  m[4] = 0; //        R01
  m[5] = cx; //       R11
  m[6] = sx; //       R21
  m[7] = 0;
  m[8] = sy; //       R02
  m[9] = -sx * cy; // R12
  m[10] = cx * cy; // R22
  m[11] = 0;
  m[12] = 0;
  m[13] = 0;
  m[14] = -dist;
  m[15] = 1;
  return m;
}

export interface RenderUniforms {
  count: number;
  mvp: Float32Array;
  pointSize: number;
  bright: number;
  colPos: Vec3;
  colNeg: Vec3;
  time: number;
}

export interface CloudRenderer {
  updateBuffers(positions: Float32Array, phase: Float32Array, count: number): void;
  render(u: RenderUniforms): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in float a_phase;
uniform mat4 u_mvp;
uniform float u_pointSize;
uniform float u_time;
out float v_phase;
out float v_tw;
void main(){
  vec4 clip = u_mvp * vec4(a_pos, 1.0);
  gl_Position = clip;
  // per-point twinkle from vertex id, gentle (safe: slow, soft)
  float id = float(gl_VertexID);
  float tw = 0.72 + 0.28 * sin(u_time * 1.3 + id * 0.61);
  v_tw = tw;
  v_phase = a_phase;
  float w = max(clip.w, 0.1);
  gl_PointSize = clamp(u_pointSize / w, 1.0, 42.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_phase;
in float v_tw;
uniform float u_bright;
uniform vec3 u_colPos;
uniform vec3 u_colNeg;
out vec4 frag;
void main(){
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float g = exp(-r2 * 9.0);            // soft Gaussian sprite
  float ph = v_phase * 0.5 + 0.5;       // -1..1 -> 0..1
  vec3 col = mix(u_colNeg, u_colPos, ph);
  float a = g * u_bright * v_tw;
  frag = vec4(col * a, a);              // premultiplied, additive
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("createShader failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader compile: " + log);
  }
  return s;
}

export function createGLRenderer(gl: WebGL2RenderingContext): CloudRenderer {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  const posBuf = gl.createBuffer();
  const phaseBuf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uMvp = gl.getUniformLocation(prog, "u_mvp");
  const uPS = gl.getUniformLocation(prog, "u_pointSize");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uBright = gl.getUniformLocation(prog, "u_bright");
  const uColPos = gl.getUniformLocation(prog, "u_colPos");
  const uColNeg = gl.getUniformLocation(prog, "u_colNeg");

  let curCount = 0;

  return {
    updateBuffers(positions, phase, count) {
      curCount = count;
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
      gl.bufferData(gl.ARRAY_BUFFER, phase, gl.DYNAMIC_DRAW);
    },
    render(u) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // additive
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(uMvp, false, u.mvp);
      gl.uniform1f(uPS, u.pointSize);
      gl.uniform1f(uTime, u.time);
      gl.uniform1f(uBright, u.bright);
      gl.uniform3fv(uColPos, u.colPos);
      gl.uniform3fv(uColNeg, u.colNeg);
      gl.drawArrays(gl.POINTS, 0, Math.min(u.count, curCount));
      gl.bindVertexArray(null);
    },
    resize(w, h) {
      gl.viewport(0, 0, w, h);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(phaseBuf);
      gl.deleteVertexArray(vao);
    },
  };
}

// ── Canvas2D fallback: orthographic projection of the same point buffer ──────
export interface Canvas2DUniforms {
  count: number;
  pitch: number;
  yaw: number;
  scale: number; // world→px
  cx: number;
  cy: number;
  bright: number;
  colPos: Vec3;
  colNeg: Vec3;
  time: number;
}

export interface Canvas2DRenderer {
  render(positions: Float32Array, phase: Float32Array, u: Canvas2DUniforms): void;
}

export function createCanvas2DRenderer(ctx: CanvasRenderingContext2D): Canvas2DRenderer {
  return {
    render(positions, phase, u) {
      const cy = Math.cos(u.yaw);
      const sy = Math.sin(u.yaw);
      const cx = Math.cos(u.pitch);
      const sx = Math.sin(u.pitch);
      ctx.globalCompositeOperation = "lighter";
      const [pr, pg, pb] = u.colPos;
      const [nr, ng, nb] = u.colNeg;
      for (let i = 0; i < u.count; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        // yaw about y, then pitch about x
        const rx = cy * x + sy * z;
        const rz = -sy * x + cy * z;
        const ry = cx * y + sx * rz;
        const sxp = u.cx + rx * u.scale;
        const syp = u.cy - ry * u.scale;
        const ph = phase[i] * 0.5 + 0.5;
        const r = Math.round((nr + (pr - nr) * ph) * 255);
        const g = Math.round((ng + (pg - ng) * ph) * 255);
        const b = Math.round((nb + (pb - nb) * ph) * 255);
        const a = 0.5 * u.bright;
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(sxp, syp, 1.6, 0, 6.283185);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  };
}
