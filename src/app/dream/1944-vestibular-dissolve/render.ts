/// <reference types="@webgpu/types" />
/**
 * The volumetric cosmos — a slowly-advecting nebula / infinite membrane whose
 * "up" is the CURRENT (melting) gravity vector. Tilt reorients the whole field
 * and the horizon dissolves: the membrane slab is thin and defined when "down"
 * is anchored, and thickens toward a uniform boundless fog as it melts.
 *
 * Warm-cool cosmic gradient (teal → magenta → gold) runs ALONG the up axis, so
 * the colour of the cosmos itself rotates as you tilt. Motion is slow and
 * drifty — dissolution, not a game — and all luminance modulation is a soft,
 * high-floor multiplier (routed through safeFlicker on the page side).
 *
 * Honest backend chain, feature-detected, never blank:
 *   WebGPU raymarch  →  WebGL2 raymarch  →  Canvas2D procedural nebula.
 */

export type RenderBackend = "webgpu" | "webgl2" | "canvas2d";

export interface FieldUniforms {
  /** Unit up vector of the cosmos. */
  up: [number, number, number];
  /** 0 (anchored) .. 1 (boundless). */
  dissolve: number;
  /** Seconds (performance.now based). */
  time: number;
  /** Soft luminance multiplier from safeFlicker, ~[floor,1]. */
  flick: number;
  /** 1 when prefers-reduced-motion, else 0 (reduces advection). */
  reduced: number;
}

export interface FieldRenderer {
  readonly backend: RenderBackend;
  render(u: FieldUniforms): void;
  dispose(): void;
}

const MAX_W = 1280;
const DPR_CAP = 1.5;

/** Size a canvas's drawing buffer to its client box (capped). Returns whether it changed. */
function resizeCanvas(canvas: HTMLCanvasElement): boolean {
  const dpr = Math.min(DPR_CAP, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const cw = canvas.clientWidth || 640;
  const ch = canvas.clientHeight || 320;
  let w = Math.round(cw * dpr);
  let h = Math.round(ch * dpr);
  if (w > MAX_W) {
    const s = MAX_W / w;
    w = MAX_W;
    h = Math.round(h * s);
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared shader math, expressed once per language.
// ─────────────────────────────────────────────────────────────────────────────

const WGSL = /* wgsl */ `
struct U {
  a : vec4<f32>,   // res.x, res.y, time, dissolve
  b : vec4<f32>,   // up.x, up.y, up.z, flick
  c : vec4<f32>,   // reduced, aspect, pad, pad
};
@group(0) @binding(0) var<uniform> U : U;

fn hash13(p3 : vec3<f32>) -> f32 {
  var p = fract(p3 * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
fn vnoise(x : vec3<f32>) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash13(i + vec3<f32>(0.0, 0.0, 0.0));
  let n100 = hash13(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash13(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash13(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash13(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash13(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash13(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash13(i + vec3<f32>(1.0, 1.0, 1.0));
  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
}
fn fbm(p0 : vec3<f32>) -> f32 {
  var p = p0;
  var a = 0.5;
  var s = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    s = s + a * vnoise(p);
    p = p * 2.02 + vec3<f32>(11.1, 3.7, 5.3);
    a = a * 0.5;
  }
  return s;
}

@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc : vec4<f32>) -> @location(0) vec4<f32> {
  let res = U.a.xy;
  let time = U.a.z;
  let dissolve = U.a.w;
  let up = normalize(U.b.xyz);
  let flick = U.b.w;
  let reduced = U.c.x;
  let aspect = U.c.y;

  var uv = (fc.xy / res) * 2.0 - 1.0;
  uv.x = uv.x * aspect;
  uv.y = -uv.y;

  let rd = normalize(vec3<f32>(uv, 1.4));
  let adv = time * 0.03 * (1.0 - 0.7 * reduced);
  let ro = vec3<f32>(0.0, 0.0, -3.0 + sin(time * 0.02) * 0.4);

  let teal = vec3<f32>(0.05, 0.55, 0.55);
  let magenta = vec3<f32>(0.75, 0.12, 0.60);
  let gold = vec3<f32>(0.95, 0.70, 0.20);

  var acc = vec3<f32>(0.0);
  var trans = 1.0;
  var t = 0.2;
  for (var i = 0; i < 42; i = i + 1) {
    let p = ro + rd * t;
    let h = dot(p, up);
    let slabHalf = 0.55 + dissolve * 3.0;
    let slab = exp(-(h * h) / (slabHalf * slabHalf));
    let membrane = mix(slab, 0.65, dissolve * 0.85);
    let n = fbm(p * 0.7 + vec3<f32>(adv, adv * 0.4, -adv * 0.6));
    let dens = smoothstep(0.42, 0.95, n) * membrane;

    let hn = clamp(h * 0.22 + 0.5, 0.0, 1.0);
    var col = select(mix(magenta, gold, (hn - 0.5) * 2.0), mix(teal, magenta, hn * 2.0), hn < 0.5);
    col = col * (0.6 + 0.7 * n);

    let a = dens * 0.16 * 2.4;
    acc = acc + trans * a * col;
    trans = trans * exp(-a * 1.3);
    t = t + 0.16;
    if (trans < 0.02) { break; }
  }

  let bgH = clamp(dot(normalize(vec3<f32>(uv, 1.0)), up) * 0.5 + 0.5, 0.0, 1.0);
  let bg = mix(vec3<f32>(0.02, 0.03, 0.06), vec3<f32>(0.06, 0.02, 0.05), bgH);
  var outc = bg + acc;
  outc = vec3<f32>(1.0) - exp(-outc * 1.6);
  outc = outc * flick;
  let vig = 1.0 - 0.09 * dot(uv, uv);
  outc = outc * vig;
  return vec4<f32>(clamp(outc, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

const GLSL_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const GLSL_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uDissolve;
uniform vec3 uUp;
uniform float uFlick;
uniform float uReduced;
uniform float uAspect;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec3(11.1, 3.7, 5.3);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uAspect;
  uv.y = -uv.y;

  vec3 up = normalize(uUp);
  vec3 rd = normalize(vec3(uv, 1.4));
  float adv = uTime * 0.03 * (1.0 - 0.7 * uReduced);
  vec3 ro = vec3(0.0, 0.0, -3.0 + sin(uTime * 0.02) * 0.4);

  vec3 teal = vec3(0.05, 0.55, 0.55);
  vec3 magenta = vec3(0.75, 0.12, 0.60);
  vec3 gold = vec3(0.95, 0.70, 0.20);

  vec3 acc = vec3(0.0);
  float trans = 1.0;
  float t = 0.2;
  for (int i = 0; i < 42; i++) {
    vec3 p = ro + rd * t;
    float h = dot(p, up);
    float slabHalf = 0.55 + uDissolve * 3.0;
    float slab = exp(-(h * h) / (slabHalf * slabHalf));
    float membrane = mix(slab, 0.65, uDissolve * 0.85);
    float n = fbm(p * 0.7 + vec3(adv, adv * 0.4, -adv * 0.6));
    float dens = smoothstep(0.42, 0.95, n) * membrane;

    float hn = clamp(h * 0.22 + 0.5, 0.0, 1.0);
    vec3 col = hn < 0.5 ? mix(teal, magenta, hn * 2.0) : mix(magenta, gold, (hn - 0.5) * 2.0);
    col *= (0.6 + 0.7 * n);

    float a = dens * 0.16 * 2.4;
    acc += trans * a * col;
    trans *= exp(-a * 1.3);
    t += 0.16;
    if (trans < 0.02) break;
  }

  float bgH = clamp(dot(normalize(vec3(uv, 1.0)), up) * 0.5 + 0.5, 0.0, 1.0);
  vec3 bg = mix(vec3(0.02, 0.03, 0.06), vec3(0.06, 0.02, 0.05), bgH);
  vec3 outc = bg + acc;
  outc = vec3(1.0) - exp(-outc * 1.6);
  outc *= uFlick;
  float vig = 1.0 - 0.09 * dot(uv, uv);
  outc *= vig;
  outColor = vec4(clamp(outc, vec3(0.0), vec3(1.0)), 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU backend
// ─────────────────────────────────────────────────────────────────────────────

class GpuRenderer implements FieldRenderer {
  readonly backend = "webgpu" as const;
  private device: GPUDevice;
  private canvas: HTMLCanvasElement;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private pipe: GPURenderPipeline;
  private ubuf: GPUBuffer;
  private bind: GPUBindGroup;
  private u = new Float32Array(12);

  constructor(device: GPUDevice, canvas: HTMLCanvasElement, format: GPUTextureFormat) {
    this.device = device;
    this.canvas = canvas;
    this.format = format;
    resizeCanvas(canvas);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.ctx.configure({ device, format, alphaMode: "opaque" });

    const mod = device.createShaderModule({ code: WGSL });
    this.pipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: mod, entryPoint: "vs" },
      fragment: { module: mod, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.ubuf = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bind = device.createBindGroup({
      layout: this.pipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.ubuf } }],
    });
  }

  render(u: FieldUniforms): void {
    resizeCanvas(this.canvas);
    const w = this.canvas.width;
    const h = this.canvas.height;
    const arr = this.u;
    arr[0] = w;
    arr[1] = h;
    arr[2] = u.time;
    arr[3] = u.dissolve;
    arr[4] = u.up[0];
    arr[5] = u.up[1];
    arr[6] = u.up[2];
    arr[7] = u.flick;
    arr[8] = u.reduced;
    arr[9] = h > 0 ? w / h : 1;
    arr[10] = 0;
    arr[11] = 0;
    this.device.queue.writeBuffer(this.ubuf, 0, arr);

    const enc = this.device.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(this.pipe);
    pass.setBindGroup(0, this.bind);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  dispose(): void {
    try {
      this.ubuf.destroy();
      this.ctx.unconfigure();
      this.device.destroy();
    } catch {
      /* noop */
    }
  }
}

async function createGpu(canvas: HTMLCanvasElement): Promise<FieldRenderer | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;
  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const format = nav.gpu.getPreferredCanvasFormat();
  return new GpuRenderer(device, canvas, format);
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 backend
// ─────────────────────────────────────────────────────────────────────────────

class GlRenderer implements FieldRenderer {
  readonly backend = "webgl2" as const;
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    resizeCanvas(canvas);
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("shader compile failed: " + info);
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, GLSL_VS);
    const fs = compile(gl.FRAGMENT_SHADER, GLSL_FS);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("program link failed: " + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;
    for (const name of ["uRes", "uTime", "uDissolve", "uUp", "uFlick", "uReduced", "uAspect"]) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }
  }

  render(u: FieldUniforms): void {
    resizeCanvas(this.canvas);
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.uniform2f(this.loc.uRes, w, h);
    gl.uniform1f(this.loc.uTime, u.time);
    gl.uniform1f(this.loc.uDissolve, u.dissolve);
    gl.uniform3f(this.loc.uUp, u.up[0], u.up[1], u.up[2]);
    gl.uniform1f(this.loc.uFlick, u.flick);
    gl.uniform1f(this.loc.uReduced, u.reduced);
    gl.uniform1f(this.loc.uAspect, h > 0 ? w / h : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    try {
      this.gl.deleteProgram(this.prog);
      const ext = this.gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {
      /* noop */
    }
  }
}

function createGl(canvas: HTMLCanvasElement): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;
  try {
    return new GlRenderer(canvas, gl);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas2D backend — procedural nebula (honest, never blank)
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Blob {
  bx: number; // base position, 0..1
  by: number;
  fx: number; // wander freq
  fy: number;
  px: number; // phase
  py: number;
  hue: number; // 0..1 along palette
  size: number; // 0..1
}

class Canvas2DRenderer implements FieldRenderer {
  readonly backend = "canvas2d" as const;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private blobs: Blob[] = [];

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    resizeCanvas(canvas);
    const rng = mulberry32(0x1944_face);
    for (let i = 0; i < 9; i++) {
      this.blobs.push({
        bx: 0.15 + rng() * 0.7,
        by: 0.15 + rng() * 0.7,
        fx: 0.02 + rng() * 0.05,
        fy: 0.02 + rng() * 0.05,
        px: rng() * Math.PI * 2,
        py: rng() * Math.PI * 2,
        hue: rng(),
        size: 0.25 + rng() * 0.5,
      });
    }
  }

  private paletteAt(hn: number): [number, number, number] {
    const teal: [number, number, number] = [13, 140, 140];
    const magenta: [number, number, number] = [191, 31, 153];
    const gold: [number, number, number] = [242, 179, 51];
    const lerp = (
      a: [number, number, number],
      b: [number, number, number],
      f: number,
    ): [number, number, number] => [
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    ];
    return hn < 0.5 ? lerp(teal, magenta, hn * 2) : lerp(magenta, gold, (hn - 0.5) * 2);
  }

  render(u: FieldUniforms): void {
    resizeCanvas(this.canvas);
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const time = u.time * (u.reduced > 0.5 ? 0.25 : 1);
    const flick = u.flick;

    // Screen direction of "up" (world +y points up on screen ⇒ negate y).
    const ux = u.up[0];
    const uy = -u.up[1];
    const ul = Math.hypot(ux, uy) || 1;
    const dirx = ux / ul;
    const diry = uy / ul;

    // Cosmic gradient along the up axis.
    const cx = w / 2;
    const cy = h / 2;
    const span = Math.hypot(w, h) * 0.6;
    const gx0 = cx - dirx * span;
    const gy0 = cy - diry * span;
    const gx1 = cx + dirx * span;
    const gy1 = cy + diry * span;
    const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    const down = this.paletteAt(0.08);
    const mid = this.paletteAt(0.5);
    const upc = this.paletteAt(0.92);
    const dim = 0.12 * flick;
    grad.addColorStop(0, `rgb(${down[0] * dim},${down[1] * dim},${down[2] * dim})`);
    grad.addColorStop(0.5, `rgb(${mid[0] * dim},${mid[1] * dim},${mid[2] * dim})`);
    grad.addColorStop(1, `rgb(${upc[0] * dim},${upc[1] * dim},${upc[2] * dim})`);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#05060c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Additive drifting nebula blobs; spread + soften as "down" dissolves.
    ctx.globalCompositeOperation = "lighter";
    const spread = 0.12 + u.dissolve * 0.4;
    for (const b of this.blobs) {
      const wanderX = Math.sin(time * b.fx + b.px) * spread;
      const wanderY = Math.cos(time * b.fy + b.py) * spread;
      // Drift biased along the up axis so tilting shears the field.
      const px = (b.bx + wanderX + dirx * u.dissolve * 0.15) * w;
      const py = (b.by + wanderY + diry * u.dissolve * 0.15) * h;
      const r = b.size * Math.min(w, h) * (0.35 + u.dissolve * 0.6);
      const col = this.paletteAt((b.hue + u.dissolve * 0.2) % 1);
      const alpha = 0.16 * flick * (0.7 + 0.3 * Math.sin(time * 0.1 + b.px));
      const rg = ctx.createRadialGradient(px, py, 0, px, py, r);
      rg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
      rg.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    /* nothing to release */
  }
}

function createCanvas2D(canvas: HTMLCanvasElement): FieldRenderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D unavailable — cannot render the field.");
  return new Canvas2DRenderer(canvas, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public factory — feature-detect the best available backend.
// ─────────────────────────────────────────────────────────────────────────────

export async function createFieldRenderer(canvas: HTMLCanvasElement): Promise<FieldRenderer> {
  try {
    const gpu = await createGpu(canvas);
    if (gpu) return gpu;
  } catch {
    /* fall through */
  }
  try {
    const gl = createGl(canvas);
    if (gl) return gl;
  } catch {
    /* fall through */
  }
  return createCanvas2D(canvas);
}
