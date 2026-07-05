// ════════════════════════════════════════════════════════════════════════════
// core.ts — CoreRenderer: a WebGL2 fragment-shader Earth CROSS-SECTION.
//
// A single full-screen triangle draws a cutaway of the planet: concentric bands
// for inner core / outer core / mantle / crust, rendered BRIGHT (rice-paper /
// cream ground that never goes near-black; bronze / amber / ochre layers; a
// faint ink graticule of depth-rings). Outside the planet circle = warm paper.
//
// Live earthquakes ring INSIDE the earth: each "bloom" is placed at an azimuth
// (from longitude) and a radius from center = surfaceRadius * (1 - depth/700),
// so deep quakes ring near the core and shallow ones near the crust. Each bloom
// is a bright additive flash plus 1–3 expanding concentric depth-rings that grow
// with age and fade — a slow luminance decay, NO strobe.
//
// Fallbacks: no WebGL2 → a Canvas2D version of the same cross-section. Context
// loss is handled (preventDefault + restore). Full dispose on teardown.
// prefers-reduced-motion slows the ring drift.
// ════════════════════════════════════════════════════════════════════════════

import type { Quake } from "./feeds";

const MAX_BLOOMS = 24;

interface Bloom {
  az: number; // radians, from longitude
  radius: number; // 0..1 (fraction of surface radius from center)
  age: number; // seconds since strike
  mag: number;
}

function bloomLife(mag: number): number {
  return 3.0 + mag * 0.4 + 0.75; // include ring-stagger tail
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform float uReduced;   // 1.0 normal, <1 calmer
uniform int uBloomCount;
uniform vec4 uBlooms[${MAX_BLOOMS}]; // (azimuth, radiusNorm, age, mag)

vec3 layerColor(float r) {
  // r: 0 at center → 1 at surface
  vec3 innerCore = vec3(0.99, 0.87, 0.62);
  vec3 outerCore = vec3(0.92, 0.72, 0.40);
  vec3 mantleHi  = vec3(0.84, 0.63, 0.36);
  vec3 mantleLo  = vec3(0.70, 0.48, 0.27);
  vec3 crust     = vec3(0.52, 0.39, 0.26);

  vec3 col;
  if (r < 0.19) {
    col = mix(innerCore, outerCore, smoothstep(0.0, 0.19, r));
  } else if (r < 0.55) {
    col = mix(outerCore, mantleHi, smoothstep(0.19, 0.55, r));
  } else if (r < 0.94) {
    col = mix(mantleHi, mantleLo, smoothstep(0.55, 0.94, r));
  } else {
    col = mix(mantleLo, crust, smoothstep(0.94, 1.0, r));
  }
  return col;
}

void main() {
  vec2 center = uResolution * 0.5;
  float R = min(uResolution.x, uResolution.y) * 0.42; // surface radius (px)
  vec2 pn = (gl_FragCoord.xy - center) / R;           // normalized (unit disk = planet)
  float r = length(pn);

  vec3 paper = vec3(0.93, 0.89, 0.79);
  vec3 col;

  if (r > 1.0) {
    // warm paper outside the planet, faint radial vignette toward edges
    float v = smoothstep(1.0, 2.4, r);
    col = mix(paper, paper * 0.92, v);
  } else {
    col = layerColor(r);

    // soft interior lighting: a gentle brightening toward upper-left
    float lightDir = dot(normalize(pn + vec2(0.0001)), normalize(vec2(-0.5, 0.6)));
    col *= 0.92 + 0.10 * clamp(lightDir, 0.0, 1.0);

    // faint ink graticule: thin dark depth-rings every 0.1 of radius
    float g = abs(fract(r * 10.0) - 0.5);
    float grat = smoothstep(0.5, 0.46, g);
    col = mix(col, col * 0.72, grat * 0.28);

    // crisp boundary lines between the four layers
    for (int i = 0; i < 3; i++) {
      float edge = (i == 0) ? 0.19 : (i == 1) ? 0.55 : 0.94;
      float d = abs(r - edge);
      col = mix(col, col * 0.6, smoothstep(0.012, 0.0, d) * 0.5);
    }
  }

  // ── Live quake blooms (only meaningful inside/near the planet) ──
  vec3 warm = vec3(1.0, 0.86, 0.55);
  float glow = 0.0;
  for (int i = 0; i < ${MAX_BLOOMS}; i++) {
    if (i >= uBloomCount) break;
    vec4 b = uBlooms[i];
    float az = b.x;
    float br = b.y;
    float age = b.z;
    float mag = b.w;

    vec2 bp = vec2(cos(az), sin(az)) * br;
    float d = distance(pn, bp);

    // central flash — bright at strike, slow luminance decay
    float flashLife = clamp(1.0 - age / (2.2 + mag * 0.4), 0.0, 1.0);
    float flash = exp(-d * d * (140.0 / (1.0 + mag))) * flashLife * (0.35 + mag * 0.14);
    glow += flash;

    // 1–3 expanding concentric depth-rings
    for (int k = 0; k < 3; k++) {
      float ringAge = age - float(k) * 0.28;
      if (ringAge < 0.0) continue;
      float speed = (0.16 + mag * 0.022) * uReduced;
      float rr = ringAge * speed;
      float ringLife = clamp(1.0 - ringAge / (2.8 + mag * 0.4), 0.0, 1.0);
      float edge = (d - rr) * 44.0;
      float ring = exp(-edge * edge) * ringLife * (0.22 + mag * 0.07);
      glow += ring;
    }
  }

  glow = clamp(glow, 0.0, 1.4);
  col += warm * glow;
  col = clamp(col, 0.0, 1.0);

  fragColor = vec4(col, 1.0);
}`;

type Mode = "webgl2" | "canvas2d";

export class CoreRenderer {
  private canvas: HTMLCanvasElement;
  private mode: Mode = "webgl2";
  private blooms: Bloom[] = [];
  private reduced = 1.0;
  private time = 0;
  private disposed = false;

  // WebGL2 state
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uRes: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uReduced: WebGLUniformLocation | null = null;
  private uCount: WebGLUniformLocation | null = null;
  private uBlooms: WebGLUniformLocation | null = null;
  private bloomData = new Float32Array(MAX_BLOOMS * 4);

  // Canvas2D fallback state
  private ctx2d: CanvasRenderingContext2D | null = null;

  private onLost = (e: Event) => {
    e.preventDefault();
  };
  private onRestored = () => {
    if (!this.disposed) this.initGL();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    if (typeof window !== "undefined" && window.matchMedia) {
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0.45
        : 1.0;
    }
    canvas.addEventListener("webglcontextlost", this.onLost, false);
    canvas.addEventListener("webglcontextrestored", this.onRestored, false);

    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      this.gl = gl;
      this.mode = "webgl2";
      if (!this.initGL()) {
        this.mode = "canvas2d";
        this.gl = null;
      }
    }
    if (!this.gl) {
      this.mode = "canvas2d";
      this.ctx2d = canvas.getContext("2d");
    }
    this.resize();
  }

  get rendererMode(): Mode {
    return this.mode;
  }

  private compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private initGL(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    const vs = this.compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return false;
    }
    this.program = prog;
    this.vao = gl.createVertexArray();
    this.uRes = gl.getUniformLocation(prog, "uResolution");
    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uReduced = gl.getUniformLocation(prog, "uReduced");
    this.uCount = gl.getUniformLocation(prog, "uBloomCount");
    this.uBlooms = gl.getUniformLocation(prog, "uBlooms");
    return true;
  }

  /** Match the drawing buffer to the element size (DPR capped at 1.75). */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(1.75, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const w = Math.max(1, Math.floor((rect.width || this.canvas.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.floor((rect.height || this.canvas.clientHeight || 1) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.gl) this.gl.viewport(0, 0, w, h);
  }

  /** Add a bloom for a quake. */
  spawn(q: Quake): void {
    const az = ((q.lon + 180) / 360) * Math.PI * 2;
    const radius = Math.max(0.05, Math.min(1.0, 1 - q.depth / 700));
    const mag = Math.max(0, Math.min(7, q.mag));
    this.blooms.push({ az, radius, age: 0, mag });
    if (this.blooms.length > MAX_BLOOMS) this.blooms.shift();
  }

  /** Age blooms, drop expired, upload uniforms, draw one frame. */
  frame(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    for (const b of this.blooms) b.age += dt;
    this.blooms = this.blooms.filter((b) => b.age < bloomLife(b.mag));

    if (this.mode === "webgl2") this.drawGL();
    else this.draw2D();
  }

  private drawGL(): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const n = Math.min(this.blooms.length, MAX_BLOOMS);
    for (let i = 0; i < n; i++) {
      const b = this.blooms[i];
      this.bloomData[i * 4 + 0] = b.az;
      this.bloomData[i * 4 + 1] = b.radius;
      this.bloomData[i * 4 + 2] = b.age;
      this.bloomData[i * 4 + 3] = b.mag;
    }

    if (this.uRes) gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    if (this.uTime) gl.uniform1f(this.uTime, this.time);
    if (this.uReduced) gl.uniform1f(this.uReduced, this.reduced);
    if (this.uCount) gl.uniform1i(this.uCount, n);
    if (this.uBlooms) gl.uniform4fv(this.uBlooms, this.bloomData);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // ── Canvas2D fallback: same cross-section + fading ripple arcs ──
  private draw2D(): void {
    const cx = this.ctx2d;
    if (!cx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cxp = w / 2;
    const cyp = h / 2;
    const R = Math.min(w, h) * 0.42;

    // warm paper ground
    cx.fillStyle = "#eee3cb";
    cx.fillRect(0, 0, w, h);

    // concentric layer bands (outer → inner so inner draws on top)
    const bands: [number, string][] = [
      [1.0, "#856548"], // crust
      [0.94, "#b47f47"], // mantle
      [0.55, "#e8b866"], // outer core
      [0.19, "#fcdd9e"], // inner core
    ];
    for (const [rr, color] of bands) {
      cx.beginPath();
      cx.arc(cxp, cyp, R * rr, 0, Math.PI * 2);
      cx.fillStyle = color;
      cx.fill();
    }

    // faint ink graticule depth-rings
    cx.strokeStyle = "rgba(60,40,20,0.16)";
    cx.lineWidth = 1;
    for (let k = 1; k <= 9; k++) {
      cx.beginPath();
      cx.arc(cxp, cyp, R * (k / 10), 0, Math.PI * 2);
      cx.stroke();
    }

    // ripple arcs per bloom
    for (const b of this.blooms) {
      const bx = cxp + Math.cos(b.az) * b.radius * R;
      const by = cyp + Math.sin(b.az) * b.radius * R;
      const life = bloomLife(b.mag);
      const t = b.age / life;
      const alpha = Math.max(0, 1 - t);

      // flash core
      const flashR = 4 + b.mag * 2.5;
      const grad = cx.createRadialGradient(bx, by, 0, bx, by, flashR * 3);
      grad.addColorStop(0, `rgba(255,232,170,${alpha * 0.9})`);
      grad.addColorStop(1, "rgba(255,232,170,0)");
      cx.fillStyle = grad;
      cx.beginPath();
      cx.arc(bx, by, flashR * 3, 0, Math.PI * 2);
      cx.fill();

      // expanding rings
      for (let k = 0; k < 3; k++) {
        const ringAge = b.age - k * 0.28;
        if (ringAge < 0) continue;
        const speed = (0.16 + b.mag * 0.022) * this.reduced;
        const rr = ringAge * speed * R;
        const ringAlpha = Math.max(0, 1 - ringAge / (2.8 + b.mag * 0.4)) * 0.6;
        cx.strokeStyle = `rgba(180,90,30,${ringAlpha})`;
        cx.lineWidth = 1.5 + b.mag * 0.3;
        cx.beginPath();
        cx.arc(bx, by, rr, 0, Math.PI * 2);
        cx.stroke();
      }
    }
  }

  /** Full teardown. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.vao) gl.deleteVertexArray(this.vao);
      this.program = null;
      this.vao = null;
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
    this.gl = null;
    this.blooms = [];
  }
}
