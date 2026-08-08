// Raw WebGL2 renderer for the thunder sheet — a real deforming quad mesh, not a
// point cloud and not three.js. The vertex shader displaces a subdivided plane
// by summing the plate mode shapes (product-of-sines standing waves) weighted by
// their live energies, and derives the surface normal analytically. The fragment
// shader shades it as copper/bronze metal over a deep storm-blue ground, with a
// localized white-hot "crack" highlight that rises with storm energy. A Canvas2D
// fallback keeps the sheet visible where WebGL2 is unavailable.

import { buildModes, NM, HIGH_START, type PlateMode } from "./modes";

// ── art palette (hex/vec only lives inside the WebGL, per house rules) ────────
const GRID_X = 130;
const GRID_Y = 88;

export type SheetFrame = {
  time: number; // seconds
  energies: Float32Array; // per-mode
  heat: number; // 0..1 smoothed storm glow
  tiltX: number; // device/pointer tilt
  tiltY: number;
  zScale: number; // amplitude scale (reduced-motion aware)
};

// ── tiny mat4 / mat3 helpers ──────────────────────────────────────────────────
function makePerspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function rotX(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotY(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function translate(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}
function mat3FromRot(m: Float32Array): Float32Array {
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

// ── shaders ────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aUv;

uniform mat4 uMvp;
uniform mat3 uNormal;
uniform float uTime;
uniform float uZScale;
uniform float uEnergy[${NM}];
uniform float uNx[${NM}];
uniform float uNy[${NM}];
uniform float uAmp[${NM}];
uniform float uOmega[${NM}];
uniform float uPhase[${NM}];

out vec3 vNormal;
out float vHot;
out vec2 vUv;
out float vZ;

const float PI = 3.14159265;

void main() {
  vec2 uv = aUv;                 // 0..1
  vec2 p = uv * 2.0 - 1.0;       // -1..1
  p.x *= 1.4;                    // wider than tall (a hanging sheet)

  float z = 0.0;
  float dzdx = 0.0;
  float dzdy = 0.0;
  float hot = 0.0;

  for (int i = 0; i < ${NM}; i++) {
    float e = uEnergy[i];
    float ax = uNx[i] * PI;
    float ay = uNy[i] * PI;
    float sx = sin(ax * uv.x);
    float sy = sin(ay * uv.y);
    float ph = cos(uPhase[i] + uOmega[i] * uTime);
    float w = e * uAmp[i] * sx * sy * ph;
    z += w;
    // analytic partials (chain rule; uv = (p*0.5+0.5), so d uv/d p = 0.5, and
    // x carries the 1.4 stretch -> divide by 1.4)
    dzdx += e * uAmp[i] * (ax * cos(ax * uv.x)) * sy * ph * (0.5 / 1.4);
    dzdy += e * uAmp[i] * sx * (ay * cos(ay * uv.y)) * ph * 0.5;
    if (i >= ${HIGH_START}) hot += e * abs(sx * sy);
  }

  z *= uZScale;
  dzdx *= uZScale;
  dzdy *= uZScale;

  vec3 pos = vec3(p.x, p.y, z);
  vec3 nrm = normalize(vec3(-dzdx, -dzdy, 1.0));

  vNormal = normalize(uNormal * nrm);
  vHot = clamp(hot * 1.3, 0.0, 1.6);
  vUv = uv;
  vZ = z;
  gl_Position = uMvp * vec4(pos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vHot;
in vec2 vUv;
in float vZ;
out vec4 outColor;

uniform float uHeat;   // global storm glow 0..1

void main() {
  vec3 N = normalize(vNormal);
  // light from upper-left-front, in view space
  vec3 L = normalize(vec3(-0.4, 0.7, 0.75));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float diff = clamp(dot(N, L), 0.0, 1.0);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 42.0);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

  vec3 bronzeDark = vec3(0.16, 0.09, 0.05);
  vec3 copper     = vec3(0.74, 0.44, 0.22);
  vec3 stormBlue  = vec3(0.05, 0.08, 0.16);
  vec3 whiteHot   = vec3(1.0, 0.96, 0.86);

  // base metal: dark bronze in the troughs, bright copper toward the light
  vec3 col = mix(bronzeDark, copper, diff);
  // storm-blue ambient rim where it faces away
  col = mix(col, stormBlue, fres * 0.6);
  // copper sheen
  col += copper * spec * 1.1;

  // the CRACK: localized white-hot highlight driven by high-mode curvature,
  // gated by global storm heat. Smooth uHeat (set in JS) means no strobing.
  float crack = clamp(vHot - 0.55, 0.0, 1.0);
  col += whiteHot * crack * uHeat * 1.4;
  // a gentle overall warm-up as the storm builds
  col += vec3(0.10, 0.05, 0.02) * uHeat;

  // subtle vignette by uv
  vec2 c = vUv - 0.5;
  float vig = 1.0 - dot(c, c) * 0.7;
  col *= vig;

  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export class GlSheet {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private ibo: WebGLBuffer;
  private indexCount: number;
  private modes: PlateMode[];
  private u: Record<string, WebGLUniformLocation | null> = {};
  private nx: Float32Array;
  private ny: Float32Array;
  private amp: Float32Array;
  private omega: Float32Array;
  private phase: Float32Array;

  static isSupported(canvas: HTMLCanvasElement): boolean {
    try {
      return !!canvas.getContext("webgl2");
    } catch {
      return false;
    }
  }

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("webgl2 unavailable");
    this.gl = gl;
    this.modes = buildModes();

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      throw new Error("link failed: " + log);
    }
    this.prog = prog;

    // build grid of uv vertices
    const verts: number[] = [];
    for (let y = 0; y <= GRID_Y; y++) {
      for (let x = 0; x <= GRID_X; x++) {
        verts.push(x / GRID_X, y / GRID_Y);
      }
    }
    const idx: number[] = [];
    const stride = GRID_X + 1;
    for (let y = 0; y < GRID_Y; y++) {
      for (let x = 0; x < GRID_X; x++) {
        const a = y * stride + x;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.indexCount = idx.length;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint32Array(idx),
      gl.STATIC_DRAW
    );
    gl.bindVertexArray(null);

    // cache uniform locations
    const names = [
      "uMvp", "uNormal", "uTime", "uZScale", "uHeat",
      "uEnergy", "uNx", "uNy", "uAmp", "uOmega", "uPhase",
    ];
    for (const n of names) this.u[n] = gl.getUniformLocation(prog, n);

    // static per-mode uniform arrays
    this.nx = new Float32Array(this.modes.map((m) => m.nx));
    this.ny = new Float32Array(this.modes.map((m) => m.ny));
    this.amp = new Float32Array(this.modes.map((m) => m.amp));
    this.omega = new Float32Array(this.modes.map((m) => m.omega));
    this.phase = new Float32Array(this.modes.map((m) => m.phase));

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.02, 0.035, 0.075, 1.0); // deep storm-blue ground
  }

  resize(w: number, h: number, dpr: number) {
    const cw = Math.max(1, Math.floor(w * dpr));
    const ch = Math.max(1, Math.floor(h * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.gl.viewport(0, 0, cw, ch);
  }

  draw(f: SheetFrame) {
    const gl = this.gl;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    const proj = makePerspective((46 * Math.PI) / 180, aspect, 0.1, 100);
    // tilt the sheet back so we look across it, then nudge by device/pointer tilt
    const model = multiply(
      rotY(f.tiltX * 0.5),
      rotX(-0.92 + f.tiltY * 0.35)
    );
    const view = translate(0, 0.05, -3.15);
    const mv = multiply(view, model);
    const mvp = multiply(proj, mv);

    gl.uniformMatrix4fv(this.u.uMvp, false, mvp);
    gl.uniformMatrix3fv(this.u.uNormal, false, mat3FromRot(model));
    gl.uniform1f(this.u.uTime, f.time);
    gl.uniform1f(this.u.uZScale, f.zScale);
    gl.uniform1f(this.u.uHeat, f.heat);
    gl.uniform1fv(this.u.uEnergy, f.energies);
    gl.uniform1fv(this.u.uNx, this.nx);
    gl.uniform1fv(this.u.uNy, this.ny);
    gl.uniform1fv(this.u.uAmp, this.amp);
    gl.uniform1fv(this.u.uOmega, this.omega);
    gl.uniform1fv(this.u.uPhase, this.phase);

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ibo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.prog);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }
}

// ── Canvas2D fallback: displaced copper profile lines on a storm-blue ground ──
export class Canvas2dSheet {
  private ctx: CanvasRenderingContext2D;
  private modes: PlateMode[];
  private w = 1;
  private h = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d unavailable");
    this.ctx = c;
    this.modes = buildModes();
  }

  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  draw(f: SheetFrame) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.fillStyle = "#050c1a";
    ctx.fillRect(0, 0, w, h);

    const rows = 46;
    const cols = 90;
    const cx = w / 2;
    const cy = h / 2;
    const sw = Math.min(w * 0.86, h * 1.3);
    const sh = h * 0.5;

    for (let r = 0; r < rows; r++) {
      const v = r / (rows - 1);
      ctx.beginPath();
      for (let cIdx = 0; cIdx <= cols; cIdx++) {
        const uxRaw = cIdx / cols;
        let z = 0;
        for (let i = 0; i < NM; i++) {
          const m = this.modes[i];
          z +=
            f.energies[i] *
            m.amp *
            Math.sin(m.nx * Math.PI * uxRaw) *
            Math.sin(m.ny * Math.PI * v) *
            Math.cos(m.phase + m.omega * f.time);
        }
        z *= f.zScale;
        // fake perspective: rows further back are higher & compressed
        const depth = 0.4 + v * 0.6;
        const px = cx + (uxRaw - 0.5) * sw * depth;
        const py =
          cy + (v - 0.5) * sh - z * 40 * depth;
        if (cIdx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const shade = 0.35 + v * 0.45;
      const heat = f.heat * 0.6;
      const rr = Math.floor((0.74 * shade + heat) * 255);
      const gg = Math.floor((0.44 * shade + heat * 0.9) * 255);
      const bb = Math.floor((0.22 * shade + heat * 0.8) * 255);
      ctx.strokeStyle = `rgb(${Math.min(255, rr)},${Math.min(255, gg)},${Math.min(255, bb)})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  dispose() {
    /* nothing to free for 2d */
  }
}
