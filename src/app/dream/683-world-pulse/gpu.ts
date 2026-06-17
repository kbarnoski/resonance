// World Pulse — WebGPU compute-driven particle nebula.
// A few×10k particles advected by a curl flow whose turbulence rises with
// volatility. Trades inject impulses at a price-mapped x. Momentum tints the
// whole field warm (up) <-> cool (down). Additive, luminous — an aurora.
//
// Feature-detected by the caller (navigator.gpu). init() may throw / return
// false; the caller then uses the Canvas2D fallback.

import type { MarketState } from './market'

// WebGPU global types are provided by @webgpu/types in this project.

const PARTICLES = 60000
// per-particle: pos.xy, vel.xy, life, seed, hue, pad = 8 floats
const STRIDE = 8

interface Injection {
  x: number
  count: number
  hueWarm: number // 0..1 (1 = buy/warm)
  spread: number
}

export class GpuNebula {
  private canvas: HTMLCanvasElement
  private device!: GPUDevice
  private context!: GPUCanvasContext
  private format!: GPUTextureFormat
  private computePipe!: GPUComputePipeline
  private renderPipe!: GPURenderPipeline
  private particleBuf!: GPUBuffer
  private paramBuf!: GPUBuffer
  private injectBuf!: GPUBuffer
  private computeBind!: GPUBindGroup
  private renderBind!: GPUBindGroup
  private raf: number | null = null
  private last = 0
  private state: MarketState | null = null
  private running = false
  private dpr = 1
  private pendingInjections: Injection[] = []
  private destroyed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  setState(s: MarketState) {
    this.state = s
  }

  async init(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false
    let adapter: GPUAdapter | null
    try {
      adapter = await navigator.gpu.requestAdapter()
    } catch {
      return false
    }
    if (!adapter) return false
    try {
      this.device = await adapter.requestDevice()
    } catch {
      return false
    }
    if (this.destroyed) {
      this.device.destroy()
      return false
    }

    const ctx = this.canvas.getContext('webgpu') as GPUCanvasContext | null
    if (!ctx) return false
    this.context = ctx
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.resize()
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    })

    this.buildBuffers()
    this.buildPipelines()
    return true
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * this.dpr))
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * this.dpr))
    this.canvas.width = w
    this.canvas.height = h
  }

  private buildBuffers() {
    const data = new Float32Array(PARTICLES * STRIDE)
    for (let i = 0; i < PARTICLES; i++) {
      const o = i * STRIDE
      data[o + 0] = Math.random() * 2 - 1 // pos.x  (-1..1 clip space)
      data[o + 1] = Math.random() * 2 - 1 // pos.y
      data[o + 2] = (Math.random() - 0.5) * 0.02 // vel.x
      data[o + 3] = (Math.random() - 0.5) * 0.02 // vel.y
      data[o + 4] = Math.random() // life
      data[o + 5] = Math.random() * 1000 // seed
      data[o + 6] = Math.random() // hue 0..1
      data[o + 7] = 0
    }
    this.particleBuf = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.device.queue.writeBuffer(this.particleBuf, 0, data)

    // params: dt, time, momentum, volatility, aspect, pulse, _, _
    this.paramBuf = this.device.createBuffer({
      size: 8 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // injection: x, count, hueWarm, spread  (one accumulated impulse per frame)
    this.injectBuf = this.device.createBuffer({
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  }

  private buildPipelines() {
    const computeMod = this.device.createShaderModule({ code: COMPUTE_WGSL })
    const renderMod = this.device.createShaderModule({ code: RENDER_WGSL })

    this.computePipe = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeMod, entryPoint: 'main' },
    })
    this.computeBind = this.device.createBindGroup({
      layout: this.computePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuf } },
        { binding: 1, resource: { buffer: this.paramBuf } },
        { binding: 2, resource: { buffer: this.injectBuf } },
      ],
    })

    this.renderPipe = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderMod, entryPoint: 'vs' },
      fragment: {
        module: renderMod,
        entryPoint: 'fs',
        targets: [
          {
            format: this.format,
            blend: {
              // additive glow
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
    this.renderBind = this.device.createBindGroup({
      layout: this.renderPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuf } },
        { binding: 1, resource: { buffer: this.paramBuf } },
      ],
    })
  }

  inject(priceNorm: number, size01: number, sell: boolean) {
    this.pendingInjections.push({
      x: priceNorm * 2 - 1,
      count: 40 + size01 * 600,
      hueWarm: sell ? 0 : 1,
      spread: 0.02 + size01 * 0.08,
    })
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.frame(dt, now / 1000)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private frame(dt: number, time: number) {
    const s = this.state
    const w = this.canvas.width
    const h = this.canvas.height
    const aspect = w / Math.max(1, h)
    const mom = s ? s.momentum : 0
    const vol = s ? s.volatility : 0.1
    const pulse = s ? s.pulse : 0

    this.device.queue.writeBuffer(
      this.paramBuf,
      0,
      new Float32Array([dt, time, mom, vol, aspect, pulse, 0, 0]),
    )

    // collapse pending injections into one accumulated impulse this frame
    let ix = 0
    let icount = 0
    let ihue = 0.5
    let ispread = 0.05
    if (this.pendingInjections.length) {
      let totalC = 0
      let wx = 0
      let wh = 0
      let ws = 0
      for (const inj of this.pendingInjections) {
        totalC += inj.count
        wx += inj.x * inj.count
        wh += inj.hueWarm * inj.count
        ws += inj.spread * inj.count
      }
      ix = wx / totalC
      icount = Math.min(totalC, 1500)
      ihue = wh / totalC
      ispread = ws / totalC
      this.pendingInjections.length = 0
    }
    this.device.queue.writeBuffer(
      this.injectBuf,
      0,
      new Float32Array([ix, icount, ihue, ispread]),
    )

    const enc = this.device.createCommandEncoder()

    const cpass = enc.beginComputePass()
    cpass.setPipeline(this.computePipe)
    cpass.setBindGroup(0, this.computeBind)
    cpass.dispatchWorkgroups(Math.ceil(PARTICLES / 64))
    cpass.end()

    const view = this.context.getCurrentTexture().createView()
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.012, g: 0.01, b: 0.022, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })
    rpass.setPipeline(this.renderPipe)
    rpass.setBindGroup(0, this.renderBind)
    // 6 verts (a quad) per particle, expanded in the vertex shader
    rpass.draw(6, PARTICLES, 0, 0)
    rpass.end()

    this.device.queue.submit([enc.finish()])
  }

  stop() {
    this.running = false
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  destroy() {
    this.destroyed = true
    this.stop()
    try {
      this.device?.destroy()
    } catch {
      // ignore
    }
  }
}

// --------------------------- WGSL ------------------------------------------

const COMPUTE_WGSL = /* wgsl */ `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  seed: f32,
  hue: f32,
  pad: f32,
};
struct Params {
  dt: f32, time: f32, momentum: f32, volatility: f32,
  aspect: f32, pulse: f32, p6: f32, p7: f32,
};
struct Inject { x: f32, count: f32, hueWarm: f32, spread: f32 };

@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<uniform> P: Params;
@group(0) @binding(2) var<uniform> I: Inject;

fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

// cheap curl-ish flow field
fn flow(p: vec2<f32>, t: f32) -> vec2<f32> {
  let a = sin(p.y * 2.3 + t) + cos(p.x * 1.7 - t * 0.7);
  let b = cos(p.x * 2.1 - t * 0.9) + sin(p.y * 1.9 + t * 1.1);
  return vec2<f32>(a, b);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&parts)) { return; }
  var pt = parts[i];

  let turb = 0.4 + P.volatility * 3.0;
  let f = flow(pt.pos * 2.5, P.time * (0.3 + P.volatility * 1.2));
  // up-momentum gives gentle buoyancy, down-momentum a sinking drift
  let buoy = P.momentum * 0.04;
  pt.vel = pt.vel + (f * turb * 0.02 + vec2<f32>(0.0, buoy)) * P.dt * 60.0;
  pt.vel = pt.vel * 0.96;
  pt.pos = pt.pos + pt.vel * P.dt;

  pt.life = pt.life - P.dt * (0.12 + P.volatility * 0.15);

  // respawn dead / off-screen particles into the ambient field
  let off = pt.pos.x < -1.15 || pt.pos.x > 1.15 || pt.pos.y < -1.15 || pt.pos.y > 1.15;
  if (pt.life <= 0.0 || off) {
    let r1 = hash(pt.seed + P.time);
    let r2 = hash(pt.seed * 1.7 + P.time * 0.3);
    pt.pos = vec2<f32>(r1 * 2.0 - 1.0, r2 * 2.0 - 1.0);
    pt.vel = vec2<f32>((hash(pt.seed + 3.0) - 0.5) * 0.02, (hash(pt.seed + 7.0) - 0.5) * 0.02);
    pt.life = 0.5 + hash(pt.seed + 11.0) * 0.5;
    pt.seed = pt.seed + 13.0;
  }

  // injection: a fraction of particles get reborn at the trade's x
  if (I.count > 0.5) {
    let prob = I.count / f32(arrayLength(&parts)) * 12.0;
    if (hash(pt.seed + P.time * 2.7 + f32(i) * 0.001) < prob) {
      let ang = hash(pt.seed * 2.3) * 6.2831853;
      let rad = hash(pt.seed * 3.1) * I.spread;
      pt.pos = vec2<f32>(I.x + cos(ang) * rad, -0.2 + sin(ang) * rad * 1.5);
      let sp = 0.4 + hash(pt.seed * 5.0) * 1.2;
      pt.vel = vec2<f32>(cos(ang), sin(ang)) * sp * 0.03;
      pt.life = 0.7 + hash(pt.seed * 4.0) * 0.6;
      pt.hue = I.hueWarm * 0.12 + 0.55 * (1.0 - I.hueWarm) + hash(pt.seed) * 0.06;
    }
  }

  parts[i] = pt;
}
`

const RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  seed: f32,
  hue: f32,
  pad: f32,
};
struct Params {
  dt: f32, time: f32, momentum: f32, volatility: f32,
  aspect: f32, pulse: f32, p6: f32, p7: f32,
};
@group(0) @binding(0) var<storage, read> parts: array<Particle>;
@group(0) @binding(1) var<uniform> P: Params;

struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) col: vec3<f32>,
  @location(2) alpha: f32,
};

// momentum-tinted palette: warm (up) <-> cool (down)
fn palette(h: f32, mom: f32) -> vec3<f32> {
  // base hue h in 0..1; bend toward amber/rose for up, cyan/indigo for down
  let warm = vec3<f32>(1.0, 0.55, 0.25);
  let cool = vec3<f32>(0.35, 0.55, 1.0);
  let mid  = vec3<f32>(0.7, 0.5, 0.95);
  let t = clamp(mom * 0.5 + 0.5, 0.0, 1.0);
  let baseCol = mix(cool, warm, t);
  let tint = mix(mid, baseCol, 0.65);
  // slight per-particle variance via h
  return tint * (0.7 + h * 0.6);
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VOut {
  let pt = parts[iid];
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  );
  let c = corners[vid];
  // particle point size grows slightly with volatility
  let sz = (0.006 + P.volatility * 0.01) * (0.6 + pt.life);
  var out: VOut;
  let p = pt.pos + vec2<f32>(c.x / P.aspect, c.y) * sz;
  out.clip = vec4<f32>(p, 0.0, 1.0);
  out.uv = c;
  out.col = palette(pt.hue, P.momentum);
  // brightness pulses subtly with global market pulse
  let life = clamp(pt.life, 0.0, 1.0);
  out.alpha = life * (0.10 + P.pulse * 0.05);
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let d = dot(in.uv, in.uv);
  if (d > 1.0) { discard; }
  // soft gaussian-ish falloff for a glowing dot
  let g = exp(-d * 3.2);
  let c = in.col * g * in.alpha;
  return vec4<f32>(c, g * in.alpha);
}
`
