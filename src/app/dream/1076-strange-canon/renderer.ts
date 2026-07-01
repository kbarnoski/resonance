// renderer.ts — raw WebGL2 additive trail of the Thomas attractor trajectory.
//
// The history buffer is projected through an auto-rotating perspective camera and
// drawn as an additive gl.LINE_STRIP whose per-vertex colour is set by the
// instantaneous SPEED along the curve: slow segments read cyan/violet, fast
// segments burn toward gold. Point sprites brighten the newest samples and mark
// each canon voice's read-head. Background is near-black; blending is
// SRC_ALPHA→ONE additive so overlapping strokes bloom (no strobe — luminance
// drifts slowly).
//
// If WebGL2 is unavailable we fall back to a Canvas2D ribbon of the same
// projected trajectory (audio keeps playing regardless).

import type { ThomasAttractor } from "./attractor";
import type { ReadHead } from "./audio";

const VERT = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in float a_speed;   // 0..1 normalised speed
uniform mat4 u_mvp;
uniform float u_pointSize;
out float v_speed;
void main(){
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  gl_PointSize = u_pointSize;
  v_speed = a_speed;
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_speed;
out vec4 outColor;
// Speed → colour ramp: cyan → violet → gold.
vec3 ramp(float s){
  vec3 cyan   = vec3(0.15, 0.85, 0.95);
  vec3 violet = vec3(0.55, 0.30, 0.95);
  vec3 gold   = vec3(1.00, 0.78, 0.25);
  if (s < 0.5) return mix(cyan, violet, s * 2.0);
  return mix(violet, gold, (s - 0.5) * 2.0);
}
void main(){
  outColor = vec4(ramp(clamp(v_speed, 0.0, 1.0)) * 0.9, 0.9);
}`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
in float v_speed;
out vec4 outColor;
vec3 ramp(float s){
  vec3 cyan   = vec3(0.15, 0.85, 0.95);
  vec3 violet = vec3(0.55, 0.30, 0.95);
  vec3 gold   = vec3(1.00, 0.78, 0.25);
  if (s < 0.5) return mix(cyan, violet, s * 2.0);
  return mix(violet, gold, (s - 0.5) * 2.0);
}
void main(){
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.4);
  outColor = vec4(ramp(clamp(v_speed, 0.0, 1.0)) * a, a);
}`;

export interface Renderer {
  frame(attractor: ThomasAttractor, heads: ReadHead[], tMs: number): void;
  resize(): void;
  dispose(): void;
  readonly usingGL: boolean;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (gl) {
    try {
      return new GLRenderer(canvas, gl);
    } catch {
      /* fall through */
    }
  }
  return new Canvas2DRenderer(canvas);
}

// ── math helpers ────────────────────────────────────────────────────────────

/** Column-major 4x4 perspective * view (rotating orbit around origin). */
function makeMVP(tMs: number, aspect: number): Float32Array {
  const fov = (55 * Math.PI) / 180;
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  // Perspective (column-major).
  const p = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];

  // Auto-rotate: slow yaw + gentle pitch nod so the 3D structure reads.
  const yaw = tMs * 0.00013;
  const pitch = 0.42 + 0.18 * Math.sin(tMs * 0.00007);
  const dist = 11.5;

  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // Camera orbit position.
  const eye = [
    dist * cp * sy,
    dist * sp,
    dist * cp * cy,
  ];
  // Look-at origin, up = +Y.
  const zx = eye[0], zy = eye[1], zz = eye[2];
  const zl = Math.hypot(zx, zy, zz);
  const fz = [zx / zl, zy / zl, zz / zl]; // forward (eye→origin is -fz)
  // right = normalize(cross(up, fz))
  const upx = 0, upy = 1, upz = 0;
  let rx = upy * fz[2] - upz * fz[1];
  let ry = upz * fz[0] - upx * fz[2];
  let rz = upx * fz[1] - upy * fz[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // up' = cross(fz, right)
  const ux = fz[1] * rz - fz[2] * ry;
  const uy = fz[2] * rx - fz[0] * rz;
  const uz = fz[0] * ry - fz[1] * rx;

  // View matrix (column-major).
  const view = [
    rx, ux, fz[0], 0,
    ry, uy, fz[1], 0,
    rz, uz, fz[2], 0,
    -(rx * eye[0] + ry * eye[1] + rz * eye[2]),
    -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
    -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]),
    1,
  ];

  return multiply(p, view);
}

function multiply(a: number[], b: number[]): Float32Array {
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

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader alloc failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader compile: " + log);
  }
  return s;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

class GLRenderer implements Renderer {
  readonly usingGL = true;
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private lineProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private spdBuf: WebGLBuffer;
  private headVao: WebGLVertexArrayObject;
  private headPosBuf: WebGLBuffer;
  private headSpdBuf: WebGLBuffer;

  private cap: number;
  private xyz: Float32Array;
  private speeds: Float32Array;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.lineProg = linkProgram(gl, VERT, FRAG);
    this.spriteProg = linkProgram(gl, VERT, SPRITE_FRAG);

    this.cap = 6000;
    this.xyz = new Float32Array(this.cap * 3);
    this.speeds = new Float32Array(this.cap);

    // Trajectory VAO.
    const vao = gl.createVertexArray();
    const pos = gl.createBuffer();
    const spd = gl.createBuffer();
    if (!vao || !pos || !spd) throw new Error("buffer alloc failed");
    this.vao = vao;
    this.posBuf = pos;
    this.spdBuf = spd;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, this.xyz.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, spd);
    gl.bufferData(gl.ARRAY_BUFFER, this.speeds.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Read-head sprite VAO (a handful of points).
    const hvao = gl.createVertexArray();
    const hpos = gl.createBuffer();
    const hspd = gl.createBuffer();
    if (!hvao || !hpos || !hspd) throw new Error("head buffer alloc failed");
    this.headVao = hvao;
    this.headPosBuf = hpos;
    this.headSpdBuf = hspd;
    gl.bindVertexArray(hvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, hpos);
    gl.bufferData(gl.ARRAY_BUFFER, 3 * 16 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, hspd);
    gl.bufferData(gl.ARRAY_BUFFER, 16 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  frame(attractor: ThomasAttractor, heads: ReadHead[], tMs: number): void {
    const gl = this.gl;
    const n = attractor.copyXYZ(this.xyz);

    // Per-vertex speed from consecutive-sample distance.
    let maxSeg = 1e-6;
    for (let i = 1; i < n; i++) {
      const a = i * 3, b = (i - 1) * 3;
      const dx = this.xyz[a] - this.xyz[b];
      const dy = this.xyz[a + 1] - this.xyz[b + 1];
      const dz = this.xyz[a + 2] - this.xyz[b + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.speeds[i] = d;
      if (d > maxSeg) maxSeg = d;
    }
    this.speeds[0] = this.speeds[1] ?? 0;
    // Normalise (with a fixed reference so colour doesn't jump frame-to-frame).
    const ref = Math.max(0.12, maxSeg);
    for (let i = 0; i < n; i++) {
      this.speeds[i] = Math.min(1, this.speeds[i] / ref);
    }

    gl.clearColor(0.01, 0.008, 0.018, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const mvp = makeMVP(tMs, aspect);

    // Draw trajectory as an additive LINE_STRIP.
    gl.useProgram(this.lineProg);
    const loc = gl.getUniformLocation(this.lineProg, "u_mvp");
    gl.uniformMatrix4fv(loc, false, mvp);
    gl.uniform1f(gl.getUniformLocation(this.lineProg, "u_pointSize"), 1);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.xyz.subarray(0, n * 3));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spdBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.speeds.subarray(0, n));
    gl.drawArrays(gl.LINE_STRIP, 0, n);

    // Point sprites over the newest ~600 samples for a comet-like glow head.
    gl.useProgram(this.spriteProg);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.spriteProg, "u_mvp"),
      false,
      mvp,
    );
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    gl.uniform1f(
      gl.getUniformLocation(this.spriteProg, "u_pointSize"),
      2.5 * dpr,
    );
    gl.bindVertexArray(this.vao);
    const tailStart = Math.max(0, n - 600);
    gl.drawArrays(gl.POINTS, tailStart, n - tailStart);

    // Read-head markers (one soft blob per active canon voice).
    const hpos: number[] = [];
    const hspd: number[] = [];
    for (const head of heads) {
      if (!head.point) continue;
      hpos.push(head.point.x, head.point.y, head.point.z);
      hspd.push(head.hue);
    }
    if (hpos.length) {
      gl.uniform1f(
        gl.getUniformLocation(this.spriteProg, "u_pointSize"),
        26 * dpr,
      );
      gl.bindVertexArray(this.headVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.headPosBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(hpos));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.headSpdBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(hspd));
      gl.drawArrays(gl.POINTS, 0, hspd.length);
    }

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteBuffer(this.posBuf);
      gl.deleteBuffer(this.spdBuf);
      gl.deleteBuffer(this.headPosBuf);
      gl.deleteBuffer(this.headSpdBuf);
      gl.deleteVertexArray(this.vao);
      gl.deleteVertexArray(this.headVao);
      gl.deleteProgram(this.lineProg);
      gl.deleteProgram(this.spriteProg);
    } catch {
      /* context lost */
    }
  }
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────

class Canvas2DRenderer implements Renderer {
  readonly usingGL = false;
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private xyz: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.xyz = new Float32Array(6000 * 3);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
  }

  frame(attractor: ThomasAttractor, heads: ReadHead[], tMs: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#030208";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const n = attractor.copyXYZ(this.xyz);
    const yaw = tMs * 0.00013;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const scale = Math.min(w, h) * 0.11;
    const project = (x: number, y: number, z: number): [number, number] => {
      // Simple rotate-about-Y + orthographic-ish tilt.
      const rx = x * cy - z * sy;
      const rz = x * sy + z * cy;
      const px = w / 2 + rx * scale;
      const py = h / 2 - (y * 0.8 + rz * 0.3) * scale;
      return [px, py];
    };

    ctx.lineWidth = Math.max(1, this.canvas.width / 900);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const [px, py] = project(this.xyz[o], this.xyz[o + 1], this.xyz[o + 2]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(90, 150, 230, 0.5)";
    ctx.stroke();

    for (const head of heads) {
      if (!head.point) continue;
      const [px, py] = project(head.point.x, head.point.y, head.point.z);
      const rad = scale * 0.6;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, "rgba(255, 220, 160, 0.8)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    /* nothing to free */
  }
}
