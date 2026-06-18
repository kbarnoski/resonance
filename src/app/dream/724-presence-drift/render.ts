/// <reference types="@webgpu/types" />
// ── Presence Drift · particle renderer ───────────────────────────────────────
// Tens of thousands of GPU particles advected by a velocity field; each
// persistent voice is an ATTRACTOR particles gather around and bloom from.
// Additive render. If WebGPU is absent or init throws, we silently fall through
// to a first-class Canvas2D particle field with the SAME accreting behaviour.
//
// vs 710: each attractor also carries `head` (0..1) — how far its read-head has
// drifted through Karel's recording — which warms its colour as it moves through
// his performance, so the visible architecture re-tints itself over minutes.

export interface Attractor {
  x: number; // world-ish coords, see scale below
  y: number;
  z: number;
  level: number; // 0..1 loudness
  pulse: number; // 0..1.4 grain-fire burst
  head: number; // 0..1 read-head position through the recording's timeline
}

export interface Renderer {
  readonly kind: "webgpu" | "canvas2d";
  // attractors: up to N; energy 0..1; t seconds; dt seconds
  frame(attractors: Attractor[], energy: number, t: number, dt: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

const MAX_ATTRACTORS = 28;
// Project a 3D-ish point to screen. Listener at origin looks down -z; we map
// x,y to screen and use z for a parallax/scale cue so nearer = larger/brighter.
function projectAttractor(
  a: Attractor,
  w: number,
  h: number,
): { sx: number; sy: number; near: number } {
  const cx = w / 2;
  const cy = h / 2;
  // z in audio space roughly [-5..3]; nearer (larger z) → bigger.
  const near = clamp01((a.z + 5) / 8);
  const scale = Math.min(w, h) * 0.16;
  const sx = cx + a.x * scale;
  const sy = cy - a.y * scale;
  return { sx, sy, near };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

// ───────────────────────────── WebGPU renderer ──────────────────────────────
const PARTICLE_COUNT = 60000;

const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: vec2<f32> };
struct Attractor { sx: f32, sy: f32, level: f32, pulse: f32 };
struct Params {
  count: u32,
  attrCount: u32,
  w: f32,
  h: f32,
  energy: f32,
  dt: f32,
  t: f32,
  _pad: f32,
};

@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<storage, read> attrs: array<Attractor>;
@group(0) @binding(2) var<uniform> P: Params;

fn hash2(p: vec2<f32>) -> vec2<f32> {
  let k = vec2<f32>(127.1, 311.7);
  let n = sin(dot(p, k)) * 43758.5453;
  return fract(vec2<f32>(n, n * 1.7));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var pr = parts[i];
  var p = pr.pos;
  var v = pr.vel;

  // Curl-ish ambient drift so the field is always alive.
  let n = (hash2(p * 0.004 + vec2<f32>(P.t * 0.05, P.t * 0.04)) - 0.5);
  v += n * (12.0 + P.energy * 26.0) * P.dt;

  // Gravitate toward attractors; nearer + louder attractors pull harder.
  var k: u32 = 0u;
  loop {
    if (k >= P.attrCount) { break; }
    let a = attrs[k];
    let d = vec2<f32>(a.sx, a.sy) - p;
    let dist = max(8.0, length(d));
    let pull = (a.level * 1.2 + a.pulse * 2.0) * 1400.0 / (dist * dist);
    v += normalize(d) * pull * P.dt;
    // Orbital component so particles swirl into a luminous shell, not a dot.
    let tang = vec2<f32>(-d.y, d.x) / dist;
    v += tang * (a.level * 60.0) / (dist * 0.02 + 1.0) * P.dt;
    k = k + 1u;
  }

  v *= 0.94; // damping
  p += v * P.dt;

  // Soft wrap at edges so particles recirculate.
  if (p.x < 0.0) { p.x += P.w; }
  if (p.x > P.w) { p.x -= P.w; }
  if (p.y < 0.0) { p.y += P.h; }
  if (p.y > P.h) { p.y -= P.h; }

  parts[i].pos = p;
  parts[i].vel = v;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: vec2<f32> };
struct RParams { w: f32, h: f32, energy: f32, t: f32 };
@group(0) @binding(0) var<storage, read> parts: array<Particle>;
@group(0) @binding(1) var<uniform> RP: RParams;

struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  // Quad corners for a soft point sprite.
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let pr = parts[ii];
  let speed = length(pr.vel);
  let size = 1.4 + clamp(speed * 0.02, 0.0, 3.0);
  let c = corners[vi];
  let px = pr.pos + c * size;
  // To clip space.
  let ndc = vec2<f32>(px.x / RP.w * 2.0 - 1.0, 1.0 - px.y / RP.h * 2.0);
  var o: VOut;
  o.clip = vec4<f32>(ndc, 0.0, 1.0);
  o.uv = c;
  // Cool→warm gradient by speed; brighter with energy. Violet→amber: the warm
  // grain-corpus palette of the lab's concatenative-piano work.
  let warm = clamp(speed * 0.012, 0.0, 1.0);
  let base = mix(vec3<f32>(0.42, 0.34, 0.95), vec3<f32>(1.0, 0.72, 0.30), warm);
  o.color = base * (0.18 + RP.energy * 0.5 + warm * 0.5);
  return o;
}

@fragment
fn fs(o: VOut) -> @location(0) vec4<f32> {
  let r = length(o.uv);
  let a = smoothstep(1.0, 0.0, r);
  return vec4<f32>(o.color * a, a);
}
`;

class WebGPURenderer implements Renderer {
  readonly kind = "webgpu" as const;
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private partBuf: GPUBuffer;
  private attrBuf: GPUBuffer;
  private paramBuf: GPUBuffer;
  private rparamBuf: GPUBuffer;
  private computePipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private computeBind: GPUBindGroup;
  private renderBind: GPUBindGroup;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private destroyed = false;

  constructor(
    device: GPUDevice,
    ctx: GPUCanvasContext,
    format: GPUTextureFormat,
    w: number,
    h: number,
    dpr: number,
  ) {
    this.device = device;
    this.ctx = ctx;
    this.format = format;
    this.w = w;
    this.h = h;
    this.dpr = dpr;

    // Particle storage: pos(2) vel(2) seed(2) = 6 floats.
    const stride = 6;
    const init = new Float32Array(PARTICLE_COUNT * stride);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * stride;
      init[o] = Math.random() * w;
      init[o + 1] = Math.random() * h;
      init[o + 2] = 0;
      init[o + 3] = 0;
      init[o + 4] = Math.random();
      init[o + 5] = Math.random();
    }
    this.partBuf = device.createBuffer({
      size: init.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.partBuf, 0, init);

    // Attractors: sx,sy,level,pulse per attractor.
    this.attrBuf = device.createBuffer({
      size: MAX_ATTRACTORS * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Compute params (8 u32/f32 = 32 bytes).
    this.paramBuf = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Render params (4 f32 = 16 bytes).
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
        { binding: 1, resource: { buffer: this.attrBuf } },
        { binding: 2, resource: { buffer: this.paramBuf } },
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
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one",
                operation: "add",
              },
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

  frame(attractors: Attractor[], energy: number, t: number, dt: number) {
    if (this.destroyed) return;
    const device = this.device;
    const pw = this.w * this.dpr;
    const ph = this.h * this.dpr;

    // Pack attractors (projected to pixel space).
    const aData = new Float32Array(MAX_ATTRACTORS * 4);
    const n = Math.min(attractors.length, MAX_ATTRACTORS);
    for (let i = 0; i < n; i++) {
      const a = attractors[i];
      const p = projectAttractor(a, pw, ph);
      aData[i * 4] = p.sx;
      aData[i * 4 + 1] = p.sy;
      aData[i * 4 + 2] = a.level * (0.5 + p.near);
      aData[i * 4 + 3] = a.pulse;
    }
    device.queue.writeBuffer(this.attrBuf, 0, aData);

    // Compute params.
    const cp = new ArrayBuffer(32);
    const u32 = new Uint32Array(cp);
    const f32 = new Float32Array(cp);
    u32[0] = PARTICLE_COUNT;
    u32[1] = n;
    f32[2] = pw;
    f32[3] = ph;
    f32[4] = energy;
    f32[5] = Math.min(0.05, dt);
    f32[6] = t;
    f32[7] = 0;
    device.queue.writeBuffer(this.paramBuf, 0, cp);

    const rp = new Float32Array([pw, ph, energy, t]);
    device.queue.writeBuffer(this.rparamBuf, 0, rp);

    const enc = device.createCommandEncoder();
    // Compute.
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.computePipe);
      pass.setBindGroup(0, this.computeBind);
      pass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 64));
      pass.end();
    }
    // Render with a faint dark clear (additive over near-black).
    {
      const view = this.ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.012, g: 0.013, b: 0.028, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.renderPipe);
      pass.setBindGroup(0, this.renderBind);
      pass.draw(6, PARTICLE_COUNT);
      pass.end();
    }
    device.queue.submit([enc.finish()]);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.partBuf.destroy();
      this.attrBuf.destroy();
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
// A complete, beautiful experience: a few thousand particles with the same
// accreting-attractor behaviour, additive blending, trailing fade. Each
// attractor's halo warms with its read-head position so the field re-tints as
// the heads drift through Karel's recording over minutes.
const FB_COUNT = 3600;

class Canvas2DRenderer implements Renderer {
  readonly kind = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private destroyed = false;

  constructor(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number,
  ) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.px = new Float32Array(FB_COUNT);
    this.py = new Float32Array(FB_COUNT);
    this.vx = new Float32Array(FB_COUNT);
    this.vy = new Float32Array(FB_COUNT);
    for (let i = 0; i < FB_COUNT; i++) {
      this.px[i] = Math.random() * w * dpr;
      this.py[i] = Math.random() * h * dpr;
    }
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  frame(attractors: Attractor[], energy: number, t: number, dt: number) {
    if (this.destroyed) return;
    const ctx = this.ctx;
    const pw = this.w * this.dpr;
    const ph = this.h * this.dpr;
    const step = Math.min(0.05, dt);

    // Trailing fade → motion smears into luminous filaments.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3, 4, 8, 0.16)";
    ctx.fillRect(0, 0, pw, ph);

    // Project attractors once.
    const n = Math.min(attractors.length, MAX_ATTRACTORS);
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const al = new Float32Array(n);
    const ap = new Float32Array(n);
    const ah = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = projectAttractor(attractors[i], pw, ph);
      ax[i] = p.sx;
      ay[i] = p.sy;
      al[i] = attractors[i].level * (0.5 + p.near);
      ap[i] = attractors[i].pulse;
      ah[i] = attractors[i].head;
      // Soft glow halo at each attractor so the architecture reads even when
      // particles are sparse. Hue warms violet→amber as the read-head drifts.
      const g = al[i] * 0.5 + ap[i] * 0.4;
      if (g > 0.02) {
        const rad = 40 + p.near * 120 + ap[i] * 80;
        const grd = ctx.createRadialGradient(
          ax[i],
          ay[i],
          0,
          ax[i],
          ay[i],
          rad,
        );
        const warmth = Math.min(1, al[i] * 0.5 + ah[i]);
        grd.addColorStop(
          0,
          `rgba(${110 + warmth * 145}, ${110 + warmth * 90}, ${
            230 - warmth * 150
          }, ${Math.min(0.5, g * 0.55)})`,
        );
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(ax[i], ay[i], rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < FB_COUNT; i++) {
      let x = this.px[i];
      let y = this.py[i];
      let vx = this.vx[i];
      let vy = this.vy[i];

      // Ambient swirl.
      const ang = Math.sin(x * 0.004 + t * 0.05) + Math.cos(y * 0.004 - t * 0.04);
      vx += Math.cos(ang) * (10 + energy * 22) * step;
      vy += Math.sin(ang) * (10 + energy * 22) * step;

      for (let k = 0; k < n; k++) {
        const dx = ax[k] - x;
        const dy = ay[k] - y;
        const dist = Math.max(10, Math.hypot(dx, dy));
        const pull = ((al[k] * 1.2 + ap[k] * 2.0) * 900) / (dist * dist);
        const inv = 1 / dist;
        vx += dx * inv * pull * step;
        vy += dy * inv * pull * step;
        // Orbit.
        vx += -dy * inv * (al[k] * 40) * inv * 60 * step;
        vy += dx * inv * (al[k] * 40) * inv * 60 * step;
      }

      vx *= 0.93;
      vy *= 0.93;
      x += vx * step;
      y += vy * step;
      if (x < 0) x += pw;
      else if (x > pw) x -= pw;
      if (y < 0) y += ph;
      else if (y > ph) y -= ph;

      this.px[i] = x;
      this.py[i] = y;
      this.vx[i] = vx;
      this.vy[i] = vy;

      const speed = Math.hypot(vx, vy);
      const warm = Math.min(1, speed * 0.012);
      const bri = 0.3 + energy * 0.5 + warm * 0.5;
      const r = Math.floor((100 + warm * 155) * bri);
      const g = Math.floor((90 + warm * 110) * bri);
      const b = Math.floor((240 - warm * 150) * bri);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const size = 1 + warm * 1.8;
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
  w: number,
  h: number,
): Promise<Renderer> {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  // Try WebGPU first.
  const nav = navigator as Navigator & { gpu?: GPU };
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (ctx) {
          const format = nav.gpu.getPreferredCanvasFormat();
          ctx.configure({ device, format, alphaMode: "opaque" });
          return new WebGPURenderer(device, ctx, format, w, h, dpr);
        }
      }
    } catch {
      // fall through to Canvas2D
    }
  }

  const c2d = canvas.getContext("2d");
  if (!c2d) throw new Error("no 2d context");
  return new Canvas2DRenderer(c2d, w, h, dpr);
}
