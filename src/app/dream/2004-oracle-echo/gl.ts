// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — the living light field for 2004-oracle-echo.
//
//   A CPU-advected particle/flow field rendered two ways:
//     • createField() prefers a WebGL2 additive point cloud with feedback
//       trails (preserveDrawingBuffer + a per-frame fade quad).
//     • If WebGL2 is unavailable it degrades to a Canvas2D "lighter"-composited
//       version of the SAME simulation — so there are ALWAYS visuals.
//
//   The field is driven by (valence, arousal, level): valence warms the color
//   from cool-slate (negative) to warm amber (positive); arousal quickens the
//   flow and enlarges the motes; level pulses their brightness. A word
//   "dissolves" by injecting a radial burst of motes carrying its sentiment
//   color — see burst().
//
//   PALETTE NOTE: this is canvas art, so raw hex/rgb is intentional here and is
//   deliberately NOT the violet cosmic house palette (warm↔cool-slate instead).
//   UI chrome stays on the semantic violet tokens (see page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

const N = 4000; // motes
const BURST_COUNT = 130; // motes recycled per word dissolve
const LIFESPAN = 6; // seconds baseline before a mote recycles
const TAU = Math.PI * 2;

export interface RenderDrive {
  valence: number; // 0 dark/minor .. 1 bright/major
  arousal: number; // 0 calm .. 1 energetic
  level: number; // 0..1 loudness pulse
  reduced: boolean; // prefers-reduced-motion
}

export interface FieldRenderer {
  resize(wPx: number, hPx: number): void;
  render(drive: RenderDrive, dt: number, time: number): void;
  /** Inject a word-dissolve burst at normalized coords (0..1, y down). */
  burst(nx: number, ny: number, warmth: number): void;
  dispose(): void;
}

// ── shared simulation ───────────────────────────────────────────────────────

function rand(): number {
  return Math.random();
}

/** Smooth analytic flow angle — cheap layered trig, deterministic, no strobe. */
function flowAngle(x: number, y: number, t: number, spin: number): number {
  const a = Math.sin(x * 3.1 + t * 0.15) + Math.cos(y * 2.7 - t * 0.12);
  const b = Math.sin((x + y) * 2.0 + t * 0.2);
  return (a * 1.25 + b * 0.9) * 1.7 + spin;
}

class ParticleSim {
  px = new Float32Array(N);
  py = new Float32Array(N);
  vx = new Float32Array(N);
  vy = new Float32Array(N);
  life = new Float32Array(N);
  warmth = new Float32Array(N);
  bright = new Float32Array(N);
  /** Interleaved [x, y, warmth, bright] per mote for the GL vertex buffer. */
  buf = new Float32Array(N * 4);
  private cursor = 0;

  constructor() {
    for (let i = 0; i < N; i++) this.reset(i, rand(), 0.5);
  }

  private reset(i: number, warmth: number, bright: number) {
    this.px[i] = rand();
    this.py[i] = rand();
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.life[i] = 0.4 + rand() * 0.6;
    this.warmth[i] = warmth;
    this.bright[i] = bright;
  }

  burst(nx: number, ny: number, warmth: number) {
    for (let k = 0; k < BURST_COUNT; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % N;
      const ang = rand() * TAU;
      const spd = 0.04 + rand() * 0.12;
      this.px[i] = nx + (rand() - 0.5) * 0.02;
      this.py[i] = ny + (rand() - 0.5) * 0.02;
      this.vx[i] = Math.cos(ang) * spd;
      this.vy[i] = Math.sin(ang) * spd;
      this.life[i] = 1;
      this.warmth[i] = warmth;
      this.bright[i] = 1;
    }
  }

  step(d: RenderDrive, dt: number, t: number) {
    const motion = d.reduced ? 0.35 : 1;
    const speed = (0.02 + d.arousal * 0.14) * motion;
    const spin = (d.valence - 0.5) * 1.6; // positive rotates one way, negative the other
    const decay = dt / LIFESPAN;
    const baseBright = 0.18 + d.level * 0.5;
    const buf = this.buf;

    for (let i = 0; i < N; i++) {
      let x = this.px[i];
      let y = this.py[i];
      const ang = flowAngle(x * 3.2, y * 3.2, t, spin);
      const tvx = Math.cos(ang) * speed;
      const tvy = Math.sin(ang) * speed;
      // ease velocity toward the flow, keep burst momentum briefly
      this.vx[i] += (tvx - this.vx[i]) * 0.12;
      this.vy[i] += (tvy - this.vy[i]) * 0.12;
      x += this.vx[i] * dt * 60 * 0.016;
      y += this.vy[i] * dt * 60 * 0.016;
      // toroidal wrap keeps the field seamless
      if (x < 0) x += 1;
      else if (x > 1) x -= 1;
      if (y < 0) y += 1;
      else if (y > 1) y -= 1;
      this.px[i] = x;
      this.py[i] = y;

      let life = this.life[i] - decay;
      // brightness relaxes toward the ambient level; bursts start hot and cool
      let b = this.bright[i] + (baseBright - this.bright[i]) * 0.04;
      if (life <= 0) {
        this.reset(i, d.valence, baseBright);
        life = this.life[i];
        b = this.bright[i];
        x = this.px[i];
        y = this.py[i];
      }
      this.life[i] = life;
      this.bright[i] = b;

      const o = i * 4;
      buf[o] = x;
      buf[o + 1] = y;
      buf[o + 2] = this.warmth[i];
      buf[o + 3] = b * (0.4 + life * 0.6);
    }
  }
}

// ── WebGL2 renderer ─────────────────────────────────────────────────────────

const POINT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in float aWarmth;
layout(location = 2) in float aBright;
uniform float uArousal;
uniform float uDpr;
out float vWarmth;
out float vBright;
void main() {
  vec2 clip = vec2(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = (1.6 + uArousal * 5.0) * (0.5 + aBright) * uDpr;
  vWarmth = aWarmth;
  vBright = aBright;
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
in float vWarmth;
in float vBright;
out vec4 frag;
void main() {
  vec2 dc = gl_PointCoord - 0.5;
  float r = dot(dc, dc) * 4.0;
  float a = exp(-r * 2.3);
  vec3 cool = mix(vec3(0.09, 0.14, 0.26), vec3(0.42, 0.60, 0.86), vBright);
  vec3 warm = mix(vec3(0.28, 0.14, 0.06), vec3(1.0, 0.78, 0.42), vBright);
  vec3 col = mix(cool, warm, vWarmth);
  float e = a * vBright;
  frag = vec4(col * e, e);
}`;

const FADE_VERT = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FADE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 frag;
void main() {
  frag = vec4(uColor, uAlpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

class GLField implements FieldRenderer {
  private sim = new ParticleSim();
  private gl: WebGL2RenderingContext;
  private points: WebGLProgram;
  private fade: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private fadeVao: WebGLVertexArrayObject;
  private uArousal: WebGLUniformLocation | null;
  private uDpr: WebGLUniformLocation | null;
  private uColor: WebGLUniformLocation | null;
  private uAlpha: WebGLUniformLocation | null;
  private dpr = 1;
  private needClear = true;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.points = link(gl, POINT_VERT, POINT_FRAG);
    this.fade = link(gl, FADE_VERT, FADE_FRAG);
    this.uArousal = gl.getUniformLocation(this.points, "uArousal");
    this.uDpr = gl.getUniformLocation(this.points, "uDpr");
    this.uColor = gl.getUniformLocation(this.fade, "uColor");
    this.uAlpha = gl.getUniformLocation(this.fade, "uAlpha");

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("buffer alloc failed");
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.sim.buf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);

    const fvao = gl.createVertexArray();
    if (!fvao) throw new Error("fade vao alloc failed");
    this.fadeVao = fvao;
  }

  resize(wPx: number, hPx: number) {
    const gl = this.gl;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    gl.canvas.width = Math.max(1, Math.floor(wPx));
    gl.canvas.height = Math.max(1, Math.floor(hPx));
    this.needClear = true;
  }

  render(d: RenderDrive, dt: number, time: number) {
    const gl = this.gl;
    this.sim.step(d, dt, time);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.disable(gl.DEPTH_TEST);

    if (this.needClear) {
      gl.clearColor(0.015, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.needClear = false;
    }

    // 1) feedback fade — a dark, slightly valence-tinted veil for trails
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.fade);
    const r = 0.02 + d.valence * 0.03;
    const g = 0.025 + d.valence * 0.01;
    const b = 0.045 - d.valence * 0.02;
    gl.uniform3f(this.uColor, r, g, b);
    gl.uniform1f(this.uAlpha, d.reduced ? 0.16 : 0.1);
    gl.bindVertexArray(this.fadeVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) additive motes
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.points);
    gl.uniform1f(this.uArousal, d.arousal);
    gl.uniform1f(this.uDpr, this.dpr);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sim.buf);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);
  }

  burst(nx: number, ny: number, warmth: number) {
    this.sim.burst(nx, ny, warmth);
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.points);
      gl.deleteProgram(this.fade);
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      gl.deleteVertexArray(this.fadeVao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* noop */
    }
  }
}

// ── Canvas2D fallback (same sim, "lighter" compositing) ──────────────────────

class Canvas2DField implements FieldRenderer {
  private sim = new ParticleSim();
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(wPx: number, hPx: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(wPx));
    this.canvas.height = Math.max(1, Math.floor(hPx));
    this.ctx.fillStyle = "#04050a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(d: RenderDrive, dt: number, time: number) {
    const g = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.sim.step(d, dt, time);

    // trail veil
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(${Math.round((0.02 + d.valence * 0.03) * 255)},${Math.round(
      (0.025 + d.valence * 0.01) * 255,
    )},${Math.round((0.045 - d.valence * 0.02) * 255)},${d.reduced ? 0.16 : 0.1})`;
    g.fillRect(0, 0, w, h);

    g.globalCompositeOperation = "lighter";
    const size = (1.6 + d.arousal * 4.5) * this.dpr;
    const buf = this.sim.buf;
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const bright = buf[o + 3];
      if (bright < 0.05) continue;
      const warm = buf[o + 2];
      const x = buf[o] * w;
      const y = buf[o + 1] * h;
      const rr = Math.round((0.28 + warm * 0.72) * 255 * bright);
      const gg = Math.round((0.4 + warm * 0.38) * 255 * bright);
      const bb = Math.round((0.86 - warm * 0.44) * 255 * bright);
      g.fillStyle = `rgb(${rr},${gg},${bb})`;
      g.beginPath();
      g.arc(x, y, size, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  burst(nx: number, ny: number, warmth: number) {
    this.sim.burst(nx, ny, warmth);
  }

  dispose() {
    /* nothing retained */
  }
}

export function createField(
  canvas: HTMLCanvasElement,
): { renderer: FieldRenderer; mode: "webgl2" | "canvas2d" } {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  if (gl) {
    try {
      return { renderer: new GLField(gl), mode: "webgl2" };
    } catch {
      /* fall through to canvas2d */
    }
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return { renderer: new Canvas2DField(canvas, ctx), mode: "canvas2d" };
}
