/// <reference types="@webgpu/types" />
// render.ts — Paths Grainfield · GPU compute particle field.
//
// Every grain of Karel's recording is ONE particle. Its HOME is its descriptor
// position (x = time-through-piece, y = brightness). A compute pass lets each
// particle drift on a slow curl noise and orbit-spring back toward home, and
// swell/brighten when the cursor passes near — so dragging through the cloud
// lights up the region you re-sound. Additive, luminous, cosmic.
//
// Degrades FIRST-CLASS to a Canvas2D field with the SAME particle behavior if
// WebGPU is unavailable. Never throws unhandled.

export interface GrainPoint {
  /** home position in NDC-ish 0..1 descriptor space */
  hx: number;
  hy: number;
  /** loudness 0..1 (size/brightness weight) */
  rms: number;
  /** brightness 0..1 (hue) */
  bright: number;
}

export interface CursorState {
  /** cursor in 0..1 field space */
  x: number;
  y: number;
  /** 0..1 how strongly the cursor is exciting the field right now */
  excite: number;
  active: boolean;
}

export interface Renderer {
  readonly kind: "webgpu" | "canvas2d";
  frame(cursor: CursorState, t: number, dt: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

// Field space (0..1) is mapped into screen with a margin so the cloud floats.
const MARGIN = 0.08;
function fieldToScreen(fx: number, fy: number, w: number, h: number) {
  const sx = (MARGIN + fx * (1 - 2 * MARGIN)) * w;
  // invert y so bright (high) grains sit toward the top
  const sy = (MARGIN + (1 - fy) * (1 - 2 * MARGIN)) * h;
  return { sx, sy };
}

// ───────────────────────────── WebGPU renderer ──────────────────────────────

const COMPUTE_WGSL = /* wgsl */ `
struct Particle {
  pos: vec2<f32>,   // current screen px
  vel: vec2<f32>,
  home: vec2<f32>,  // screen px home (descriptor position)
  meta: vec2<f32>,  // x = rms, y = brightness
  glow: vec2<f32>,  // x = excitation glow 0..1, y = seed
};
struct Params {
  count: u32,
  _p0: u32,
  w: f32,
  h: f32,
  curX: f32,
  curY: f32,
  excite: f32,
  dt: f32,
  t: f32,
  active: f32,
  _p1: f32,
  _p2: f32,
};
@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<uniform> P: Params;

fn hash2(p: vec2<f32>) -> vec2<f32> {
  let k = vec2<f32>(127.1, 311.7);
  let n = sin(dot(p, k)) * 43758.5453;
  return fract(vec2<f32>(n, n * 1.7)) - 0.5;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var pr = parts[i];
  var p = pr.pos;
  var v = pr.vel;
  let dt = min(0.05, P.dt);

  // Slow cosmic drift around home (curl-ish noise keyed on home + time).
  let n = hash2(pr.home * 0.01 + vec2<f32>(P.t * 0.06, P.t * 0.05));
  v += n * 30.0 * dt;

  // Spring back toward descriptor home so the cloud keeps its shape.
  let toHome = pr.home - p;
  v += toHome * 2.2 * dt;

  // Cursor excitation: nearer particles get pushed/brightened.
  let cur = vec2<f32>(P.curX, P.curY);
  let d = p - cur;
  let dist = max(8.0, length(d));
  let reach = 0.16 * min(P.w, P.h);
  var g = pr.glow.x;
  if (P.active > 0.5) {
    let near = clamp(1.0 - dist / reach, 0.0, 1.0);
    // gentle outward ripple so the region you sound visibly blooms
    v += normalize(d) * near * (60.0 + P.excite * 220.0) * dt;
    g = max(g, near * (0.4 + P.excite * 0.8));
  }
  g = g * exp(-dt * 2.4); // glow decays

  v *= 0.90; // damping
  p += v * dt;

  parts[i].pos = p;
  parts[i].vel = v;
  parts[i].glow = vec2<f32>(clamp(g, 0.0, 1.4), pr.glow.y);
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  home: vec2<f32>,
  meta: vec2<f32>,
  glow: vec2<f32>,
};
struct RParams { w: f32, h: f32, t: f32, _p: f32 };
@group(0) @binding(0) var<storage, read> parts: array<Particle>;
@group(0) @binding(1) var<uniform> RP: RParams;

struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) alpha: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let pr = parts[ii];
  let rms = pr.meta.x;
  let bright = pr.meta.y;
  let glow = pr.glow.x;
  let size = 1.1 + rms * 2.2 + glow * 4.0;
  let c = corners[vi];
  let px = pr.pos + c * size;
  let ndc = vec2<f32>(px.x / RP.w * 2.0 - 1.0, 1.0 - px.y / RP.h * 2.0);
  var o: VOut;
  o.clip = vec4<f32>(ndc, 0.0, 1.0);
  o.uv = c;
  // Aurora palette: deep violet (dark grains) -> emerald/teal (bright grains).
  let violet = vec3<f32>(0.55, 0.38, 0.95);
  let teal = vec3<f32>(0.30, 0.95, 0.78);
  var base = mix(violet, teal, bright);
  // Excited grains flare toward luminous white-violet.
  base = mix(base, vec3<f32>(0.92, 0.85, 1.0), clamp(glow, 0.0, 1.0));
  let lum = 0.10 + rms * 0.35 + glow * 0.9;
  o.color = base * lum;
  o.alpha = 0.12 + rms * 0.20 + glow * 0.5;
  return o;
}

@fragment
fn fs(o: VOut) -> @location(0) vec4<f32> {
  let r = length(o.uv);
  let a = smoothstep(1.0, 0.0, r) * o.alpha;
  return vec4<f32>(o.color * a, a);
}
`;

const PART_STRIDE = 10; // floats per particle (5 vec2)

class WebGPURenderer implements Renderer {
  readonly kind = "webgpu" as const;
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private partBuf: GPUBuffer;
  private paramBuf: GPUBuffer;
  private rparamBuf: GPUBuffer;
  private computePipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private computeBind: GPUBindGroup;
  private renderBind: GPUBindGroup;
  private count: number;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private destroyed = false;

  constructor(
    device: GPUDevice,
    ctx: GPUCanvasContext,
    format: GPUTextureFormat,
    grains: GrainPoint[],
    w: number,
    h: number,
    dpr: number,
  ) {
    this.device = device;
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.count = grains.length;

    const pw = w * dpr;
    const ph = h * dpr;
    const init = new Float32Array(this.count * PART_STRIDE);
    for (let i = 0; i < this.count; i++) {
      const g = grains[i];
      const { sx, sy } = fieldToScreen(g.hx, g.hy, pw, ph);
      const o = i * PART_STRIDE;
      // start slightly scattered around home so it settles in (alive on load)
      init[o] = sx + (Math.random() - 0.5) * pw * 0.4;
      init[o + 1] = sy + (Math.random() - 0.5) * ph * 0.4;
      init[o + 2] = 0;
      init[o + 3] = 0;
      init[o + 4] = sx;
      init[o + 5] = sy;
      init[o + 6] = g.rms;
      init[o + 7] = g.bright;
      init[o + 8] = 0;
      init[o + 9] = Math.random();
    }
    this.partBuf = device.createBuffer({
      size: init.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.partBuf, 0, init);

    this.paramBuf = device.createBuffer({
      size: 48, // 12 * 4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.rparamBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const computeMod = device.createShaderModule({ code: COMPUTE_WGSL });
    this.computePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: computeMod, entryPoint: "main" },
    });
    this.computeBind = device.createBindGroup({
      layout: this.computePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.partBuf } },
        { binding: 1, resource: { buffer: this.paramBuf } },
      ],
    });

    const renderMod = device.createShaderModule({ code: RENDER_WGSL });
    this.renderPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderMod, entryPoint: "vs" },
      fragment: {
        module: renderMod,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    this.renderBind = device.createBindGroup({
      layout: this.renderPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.partBuf } },
        { binding: 1, resource: { buffer: this.rparamBuf } },
      ],
    });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  frame(cursor: CursorState, t: number, dt: number) {
    if (this.destroyed) return;
    const device = this.device;
    const pw = this.w * this.dpr;
    const ph = this.h * this.dpr;
    const { sx, sy } = fieldToScreen(cursor.x, cursor.y, pw, ph);

    const cp = new ArrayBuffer(48);
    const u32 = new Uint32Array(cp);
    const f32 = new Float32Array(cp);
    u32[0] = this.count;
    u32[1] = 0;
    f32[2] = pw;
    f32[3] = ph;
    f32[4] = sx;
    f32[5] = sy;
    f32[6] = cursor.excite;
    f32[7] = Math.min(0.05, dt);
    f32[8] = t;
    f32[9] = cursor.active ? 1 : 0;
    device.queue.writeBuffer(this.paramBuf, 0, cp);

    const rp = new Float32Array([pw, ph, t, 0]);
    device.queue.writeBuffer(this.rparamBuf, 0, rp);

    const enc = device.createCommandEncoder();
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.computePipe);
      pass.setBindGroup(0, this.computeBind);
      pass.dispatchWorkgroups(Math.ceil(this.count / 64));
      pass.end();
    }
    {
      const view = this.ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.008, g: 0.01, b: 0.022, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.renderPipe);
      pass.setBindGroup(0, this.renderBind);
      pass.draw(6, this.count);
      pass.end();
    }
    device.queue.submit([enc.finish()]);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.partBuf.destroy();
      this.paramBuf.destroy();
      this.rparamBuf.destroy();
    } catch {
      /* noop */
    }
    try {
      this.device.destroy();
    } catch {
      /* noop */
    }
  }
}

// ──────────────────────── Canvas2D fallback renderer ─────────────────────────
// Same field behavior: each grain is a particle springing to its descriptor
// home, drifting on noise, blooming under the cursor. Trailing fade for
// luminous filaments. Subsamples grains so it stays smooth on the CPU.

class Canvas2DRenderer implements Renderer {
  readonly kind = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private n: number;
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private hx: Float32Array;
  private hy: Float32Array;
  private rms: Float32Array;
  private bright: Float32Array;
  private glow: Float32Array;
  private destroyed = false;

  constructor(
    ctx: CanvasRenderingContext2D,
    grains: GrainPoint[],
    w: number,
    h: number,
    dpr: number,
  ) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.dpr = dpr;

    // Subsample to keep the CPU loop smooth, but still a dense cloud.
    const CAP = 5000;
    const stepF = grains.length > CAP ? grains.length / CAP : 1;
    this.n = Math.min(CAP, grains.length);
    this.px = new Float32Array(this.n);
    this.py = new Float32Array(this.n);
    this.vx = new Float32Array(this.n);
    this.vy = new Float32Array(this.n);
    this.hx = new Float32Array(this.n);
    this.hy = new Float32Array(this.n);
    this.rms = new Float32Array(this.n);
    this.bright = new Float32Array(this.n);
    this.glow = new Float32Array(this.n);

    const pw = w * dpr;
    const ph = h * dpr;
    for (let i = 0; i < this.n; i++) {
      const g = grains[Math.floor(i * stepF)];
      const { sx, sy } = fieldToScreen(g.hx, g.hy, pw, ph);
      this.hx[i] = sx;
      this.hy[i] = sy;
      this.px[i] = sx + (Math.random() - 0.5) * pw * 0.4;
      this.py[i] = sy + (Math.random() - 0.5) * ph * 0.4;
      this.rms[i] = g.rms;
      this.bright[i] = g.bright;
    }
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  frame(cursor: CursorState, t: number, dt: number) {
    if (this.destroyed) return;
    const ctx = this.ctx;
    const pw = this.w * this.dpr;
    const ph = this.h * this.dpr;
    const step = Math.min(0.05, dt);
    const { sx: cuX, sy: cuY } = fieldToScreen(cursor.x, cursor.y, pw, ph);
    const reach = 0.16 * Math.min(pw, ph);

    // Trailing fade over deep space.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(2, 3, 6, 0.22)";
    ctx.fillRect(0, 0, pw, ph);

    // Cursor halo so the region you sound reads even when sparse.
    if (cursor.active) {
      const rad = reach * (0.6 + cursor.excite * 0.8);
      const grd = ctx.createRadialGradient(cuX, cuY, 0, cuX, cuY, rad);
      grd.addColorStop(0, `rgba(180,150,255,${0.12 + cursor.excite * 0.25})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cuX, cuY, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.n; i++) {
      let x = this.px[i];
      let y = this.py[i];
      let vx = this.vx[i];
      let vy = this.vy[i];

      const ang = Math.sin(this.hx[i] * 0.01 + t * 0.06) +
        Math.cos(this.hy[i] * 0.01 - t * 0.05);
      vx += Math.cos(ang) * 22 * step;
      vy += Math.sin(ang) * 22 * step;

      // spring home
      vx += (this.hx[i] - x) * 2.2 * step;
      vy += (this.hy[i] - y) * 2.2 * step;

      let g = this.glow[i];
      if (cursor.active) {
        const dx = x - cuX;
        const dy = y - cuY;
        const dist = Math.max(8, Math.hypot(dx, dy));
        const near = Math.max(0, 1 - dist / reach);
        if (near > 0) {
          const inv = 1 / dist;
          const push = near * (60 + cursor.excite * 220);
          vx += dx * inv * push * step;
          vy += dy * inv * push * step;
          g = Math.max(g, near * (0.4 + cursor.excite * 0.8));
        }
      }
      g *= Math.exp(-step * 2.4);

      vx *= 0.9;
      vy *= 0.9;
      x += vx * step;
      y += vy * step;

      this.px[i] = x;
      this.py[i] = y;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.glow[i] = g;

      const b = this.bright[i];
      const lum = 0.18 + this.rms[i] * 0.4 + g * 0.9;
      // violet -> teal by brightness, flare to white-violet under excitation
      const r = Math.floor((140 * (1 - b) + 80 * b + g * 120) * lum);
      const gg = Math.floor((100 * (1 - b) + 240 * b + g * 90) * lum);
      const bl = Math.floor((245 * (1 - b) + 200 * b + g * 110) * lum);
      ctx.fillStyle = `rgb(${Math.min(255, r)},${Math.min(255, gg)},${Math.min(255, bl)})`;
      const size = 1 + this.rms[i] * 1.8 + g * 3;
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  destroy() {
    this.destroyed = true;
  }
}

// ────────────────────────────── factory ─────────────────────────────────────

export async function makeRenderer(
  canvas: HTMLCanvasElement,
  grains: GrainPoint[],
  w: number,
  h: number,
): Promise<Renderer> {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  const nav = navigator as Navigator & { gpu?: GPU };
  if (nav.gpu && grains.length > 0) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (ctx) {
          const format = nav.gpu.getPreferredCanvasFormat();
          ctx.configure({ device, format, alphaMode: "opaque" });
          return new WebGPURenderer(device, ctx, format, grains, w, h, dpr);
        }
      }
    } catch {
      // fall through to Canvas2D
    }
  }

  const c2d = canvas.getContext("2d");
  if (!c2d) throw new Error("no 2d context");
  return new Canvas2DRenderer(c2d, grains, w, h, dpr);
}
