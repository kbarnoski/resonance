// renderer.ts — raw WebGL2 additive point-sprite rendering for Pulse Mirror.
//
// Three families of soft glowing sprites drawn with ADDITIVE blending over a
// near-black field:
//   • CALLER (amber, left)  — blooms on each detected onset (your side).
//   • ANSWER (violet/rose, right) — blooms on each scheduled answer note.
//   • BEAT RING — an expanding ring pulses on each beat.
// Plus a slow sub-3 Hz background "breath". All blooms are eased (no hard
// flashes); nothing modulates faster than ~3 Hz.
//
// If WebGL2 is unavailable, drawFallback() paints an equivalent Canvas2D scene
// so the piece still reads (and audio keeps running regardless).

import type { EngineSnapshot } from "./engine";

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;      // clip-space center
layout(location=1) in vec4 a_color;    // rgb + alpha
layout(location=2) in float a_size;    // point size in px
out vec4 v_color;
void main(){
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main(){
  // Soft radial falloff — a luminous blob, not a hard disc.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.2);
  outColor = vec4(v_color.rgb * v_color.a * a, v_color.a * a);
}`;

interface Sprite {
  x: number; // clip -1..1
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
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

/** Eased bloom envelope: fast rise, slow luminous decay. Returns 0..1. */
function bloomEnv(age: number, life: number): number {
  if (age < 0 || age > life) return 0;
  const t = age / life;
  const rise = Math.min(1, t / 0.12);
  const fall = Math.pow(1 - t, 1.6);
  return rise * fall;
}

export interface Renderer {
  frame(snap: EngineSnapshot, tMs: number): void;
  resize(): void;
  dispose(): void;
  readonly usingGL: boolean;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (gl) {
    try {
      return new GLRenderer(canvas, gl);
    } catch {
      /* fall through to Canvas2D */
    }
  }
  return new Canvas2DRenderer(canvas);
}

class GLRenderer implements Renderer {
  readonly usingGL = true;
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buffer: WebGLBuffer;
  private capacity = 4096;
  private data: Float32Array;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    this.program = prog;

    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    if (!vao || !buf) throw new Error("buffer alloc failed");
    this.vao = vao;
    this.buffer = buf;
    this.data = new Float32Array(this.capacity * 7);

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive
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

  frame(snap: EngineSnapshot, tMs: number): void {
    const sprites = buildSprites(snap, tMs);
    const gl = this.gl;

    // Near-black background with a slow breath in the blue-violet.
    const breath = 0.5 + 0.5 * Math.sin((tMs / 1000) * Math.PI * 2 * 0.12);
    gl.clearColor(0.015, 0.012, 0.02 + 0.01 * breath, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const n = Math.min(sprites.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const s = sprites[i];
      const o = i * 7;
      this.data[o] = s.x;
      this.data[o + 1] = s.y;
      this.data[o + 2] = s.r;
      this.data[o + 3] = s.g;
      this.data[o + 4] = s.b;
      this.data[o + 5] = s.a;
      this.data[o + 6] = s.size;
    }
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, n * 7));
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteBuffer(this.buffer);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.program);
    } catch {
      /* context lost */
    }
  }
}

// Shared scene description → sprite list, reused by both renderers.
function buildSprites(snap: EngineSnapshot, tMs: number): Sprite[] {
  const out: Sprite[] = [];
  const now = snap.now;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = dpr;

  // Background breath: a broad, dim central glow pulsing < 3 Hz.
  const breath = 0.5 + 0.5 * Math.sin((tMs / 1000) * Math.PI * 2 * 0.18);
  out.push({
    x: 0,
    y: 0,
    r: 0.09,
    g: 0.06,
    b: 0.12,
    a: 0.5 + 0.3 * breath,
    size: 520 * scale,
  });

  // Caller family (amber, left half). Blooms on onsets.
  for (const ev of snap.onsets) {
    const age = now - ev.time;
    const env = bloomEnv(age, 1.4);
    if (env <= 0.001) continue;
    const jx = -0.55 + (hash(ev.time) - 0.5) * 0.5;
    const jy = (hash(ev.time * 1.7) - 0.5) * 1.1;
    const a = env * (0.35 + 0.5 * ev.strength);
    out.push({
      x: jx,
      y: jy,
      r: 1.0 * a,
      g: 0.62 * a,
      b: 0.18 * a,
      a: a,
      size: (30 + 90 * ev.strength) * env * scale,
    });
  }

  // Answer family (violet/rose, right half). Blooms as each scheduled note
  // reaches its time; anticipated (future) notes show a faint pre-glow.
  for (const ev of snap.answers) {
    const age = now - ev.time;
    // Pre-glow: notes scheduled slightly ahead shimmer before they land.
    let env = bloomEnv(age, 1.6);
    if (age < 0 && age > -0.14) {
      env = Math.max(env, 0.25 * (1 + age / 0.14));
    }
    if (env <= 0.001) continue;
    const pitch = Math.log2(ev.ratio); // 0..1 across the ladder octave
    const jx = 0.55 + (hash(ev.time * 2.1) - 0.5) * 0.5;
    const jy = 0.6 - pitch * 1.2;
    const a = env * (0.4 + 0.5 * ev.strength);
    // Violet→rose blend with pitch height.
    out.push({
      x: jx,
      y: jy,
      r: (0.7 + 0.3 * pitch) * a,
      g: 0.3 * a,
      b: (0.95 - 0.35 * pitch) * a,
      a: a,
      size: (34 + 80 * ev.strength) * env * scale,
    });
  }

  // Beat ring: an expanding ring on the beat, rendered as a circle of sprites.
  const period = snap.tempo.period;
  if (period > 0 && snap.tempo.confidence > 0.1) {
    const phase = snap.tempo.phase; // 0..1 into the beat
    const ringEnv = Math.pow(1 - phase, 1.4); // brightest just after the beat
    const radius = 0.2 + phase * 0.7;
    const count = 40;
    const a = ringEnv * (0.12 + 0.3 * snap.tempo.confidence);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      out.push({
        x: Math.cos(ang) * radius * 0.9,
        y: Math.sin(ang) * radius,
        r: 0.55 * a,
        g: 0.5 * a,
        b: 0.75 * a,
        a: a,
        size: 14 * scale,
      });
    }
  }

  return out;
}

// Deterministic per-event jitter so blooms hold a stable position while alive.
function hash(x: number): number {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

class Canvas2DRenderer implements Renderer {
  readonly usingGL = false;
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
  }

  frame(snap: EngineSnapshot, tMs: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#040308";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const sprites = buildSprites(snap, tMs);
    for (const s of sprites) {
      const px = (s.x * 0.5 + 0.5) * w;
      const py = (0.5 - s.y * 0.5) * h;
      const rad = Math.max(1, s.size * 0.5);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
      const cr = Math.min(255, Math.floor((s.r / Math.max(0.001, s.a)) * 255));
      const cg = Math.min(255, Math.floor((s.g / Math.max(0.001, s.a)) * 255));
      const cb = Math.min(255, Math.floor((s.b / Math.max(0.001, s.a)) * 255));
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${Math.min(1, s.a)})`);
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
