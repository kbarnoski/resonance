// gpu.ts — genuine WebGPU compute particle field.
//
// A @compute @workgroup_size(64) kernel advects each particle in-place by
// curl-noise + attraction/swirl toward the nearest hand point (attractors come
// in as a uniform buffer). A separate render pipeline draws each particle as a
// small additive glowing quad. Positions/velocities live in storage buffers.
//
// Curl-noise reference: Robert Bridson, "Curl-Noise for Procedural Fluid Flow"
// (SIGGRAPH 2007). Aurora-on-dark, additive blending for a luminous cloud.

import { Attractor, MAX_ATTRACTORS } from "./shared";

const PARTICLE_COUNT = 120000;
const WORKGROUP = 64;

// Uniform layout (std140-ish, kept to vec4 alignment):
//   params: vec4<f32>  = (dt, time, count, attractorCount)
//   attractors[MAX]: vec4<f32> = (x, y, strength, swirl)
const UNIFORM_FLOATS = 4 + MAX_ATTRACTORS * 4;

const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, hue: f32, _pad: f32 };

struct Uniforms {
  params: vec4<f32>,                 // dt, time, count, attractorCount
  attractors: array<vec4<f32>, ${MAX_ATTRACTORS}>, // x, y, strength, swirl
};

@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn potential(p: vec2<f32>, t: f32) -> f32 {
  return sin(p.x * 1.7 + t) * cos(p.y * 1.3 - t * 0.7)
       + 0.5 * sin(p.x * 0.7 - p.y * 1.9 + t * 0.4);
}

fn curl(p: vec2<f32>, t: f32) -> vec2<f32> {
  let e = 0.12;
  let n1 = potential(vec2<f32>(p.x, p.y + e), t);
  let n2 = potential(vec2<f32>(p.x, p.y - e), t);
  let n3 = potential(vec2<f32>(p.x + e, p.y), t);
  let n4 = potential(vec2<f32>(p.x - e, p.y), t);
  let dx = (n1 - n2) / (2.0 * e);
  let dy = (n3 - n4) / (2.0 * e);
  return vec2<f32>(dx, -dy);
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let count = u32(u.params.z);
  if (i >= count) { return; }

  let dt = min(u.params.x, 0.05);
  let t = u.params.y;
  var pos = parts[i].pos;
  var vel = parts[i].vel;
  var hue = parts[i].hue;

  var acc = curl(pos * 1.6, t * 0.12) * 0.6;

  // nearest attractor
  let na = u32(u.params.w);
  var bestD = 1e9;
  var bDir = vec2<f32>(0.0, 0.0);
  var bStr = 0.0;
  var bSwirl = 0.0;
  for (var a: u32 = 0u; a < na; a = a + 1u) {
    let at = u.attractors[a];
    let dv = at.xy - pos;
    let d2 = dot(dv, dv) + 0.0001;
    if (d2 < bestD) {
      bestD = d2;
      bDir = dv;
      bStr = at.z;
      bSwirl = at.w;
    }
  }
  if (bStr > 0.0) {
    let d = sqrt(bestD);
    let nrm = bDir / d;
    let pull = (bStr * 0.9) / (1.0 + d * 3.0);
    acc = acc + nrm * pull;
    let swirl = (bSwirl * 0.8) / (1.0 + d * 2.5);
    acc = acc + vec2<f32>(-nrm.y, nrm.x) * swirl;
    hue = hue + (0.62 - hue) * min(1.0, pull) * 0.04;
  }

  vel = (vel + acc * dt) * 0.94;
  pos = pos + vel * dt;

  if (pos.x > 1.05) { pos.x = -1.05; }
  else if (pos.x < -1.05) { pos.x = 1.05; }
  if (pos.y > 1.05) { pos.y = -1.05; }
  else if (pos.y < -1.05) { pos.y = 1.05; }

  parts[i].pos = pos;
  parts[i].vel = vel;
  parts[i].hue = hue;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, hue: f32, _pad: f32 };
@group(0) @binding(0) var<storage, read> parts: array<Particle>;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
};

fn aurora(h: f32) -> vec3<f32> {
  // 5-stop aurora ramp
  let c0 = vec3<f32>(0.25, 0.95, 0.85);
  let c1 = vec3<f32>(0.45, 0.70, 1.00);
  let c2 = vec3<f32>(0.75, 0.55, 1.00);
  let c3 = vec3<f32>(1.00, 0.55, 0.85);
  let c4 = vec3<f32>(0.65, 1.00, 0.70);
  let f = fract(h) * 4.0;
  if (f < 1.0) { return mix(c0, c1, f); }
  if (f < 2.0) { return mix(c1, c2, f - 1.0); }
  if (f < 3.0) { return mix(c2, c3, f - 2.0); }
  return mix(c3, c4, f - 3.0);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> VSOut {
  // two triangles -> quad
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let p = parts[inst];
  let speed = clamp(length(p.vel) * 2.2, 0.0, 1.0);
  let size = 0.004 + speed * 0.006;
  let corner = corners[vi];
  var out: VSOut;
  out.clip = vec4<f32>(p.pos + corner * size, 0.0, 1.0);
  out.uv = corner;
  out.color = aurora(p.hue) * (0.35 + speed * 0.8);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  let glow = smoothstep(1.0, 0.0, r);
  return vec4<f32>(in.color * glow, glow * 0.6);
}
`;

export class GpuField {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private particleBuf!: GPUBuffer;
  private uniformBuf!: GPUBuffer;
  private computePipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;
  private computeBind!: GPUBindGroup;
  private renderBind!: GPUBindGroup;
  private uniformArr = new Float32Array(UNIFORM_FLOATS);
  private canvas: HTMLCanvasElement;
  private dpr = 1;
  private disposed = false;
  public readonly count = PARTICLE_COUNT;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** Returns a ready GpuField, or null if WebGPU is unavailable/fails. */
  static async create(canvas: HTMLCanvasElement): Promise<GpuField | null> {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    try {
      const f = new GpuField(canvas);
      await f.init();
      return f;
    } catch {
      return null;
    }
  }

  private async init() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no adapter");
    this.device = await adapter.requestDevice();

    const ctx = this.canvas.getContext("webgpu");
    if (!ctx) throw new Error("no webgpu context");
    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.resize();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });

    // --- particle storage buffer (pos.xy, vel.xy, hue, pad) = 6 floats ---
    const STRIDE = 6;
    const init = new Float32Array(PARTICLE_COUNT * STRIDE);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * STRIDE;
      init[o] = (Math.random() * 2 - 1) * 0.95;
      init[o + 1] = (Math.random() * 2 - 1) * 0.95;
      init[o + 2] = 0;
      init[o + 3] = 0;
      init[o + 4] = Math.random();
      init[o + 5] = 0;
    }
    this.particleBuf = this.device.createBuffer({
      size: init.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.particleBuf, 0, init);

    this.uniformBuf = this.device.createBuffer({
      size: this.uniformArr.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // --- compute pipeline ---
    const computeModule = this.device.createShaderModule({ code: COMPUTE_WGSL });
    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: computeModule, entryPoint: "main" },
    });
    this.computeBind = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuf } },
        { binding: 1, resource: { buffer: this.uniformBuf } },
      ],
    });

    // --- render pipeline (additive glowing points) ---
    const renderModule = this.device.createShaderModule({ code: RENDER_WGSL });
    this.renderPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: {
        module: renderModule,
        entryPoint: "fs",
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    this.renderBind = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.particleBuf } }],
    });
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
  }

  frame(dt: number, time: number, attractors: Attractor[]) {
    if (this.disposed) return;
    const u = this.uniformArr;
    const na = Math.min(attractors.length, MAX_ATTRACTORS);
    u[0] = dt;
    u[1] = time;
    u[2] = PARTICLE_COUNT;
    u[3] = na;
    for (let i = 0; i < MAX_ATTRACTORS; i++) {
      const o = 4 + i * 4;
      if (i < na) {
        const a = attractors[i];
        u[o] = a.x;
        u[o + 1] = a.y;
        u[o + 2] = a.strength;
        u[o + 3] = a.swirl;
      } else {
        u[o] = u[o + 1] = u[o + 2] = u[o + 3] = 0;
      }
    }
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);

    const enc = this.device.createCommandEncoder();

    // compute pass: advect particles
    const cpass = enc.beginComputePass();
    cpass.setPipeline(this.computePipeline);
    cpass.setBindGroup(0, this.computeBind);
    cpass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WORKGROUP));
    cpass.end();

    // render pass: additive glowing quads on a dark clear
    const view = this.context.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.016, g: 0.024, b: 0.063, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(this.renderPipeline);
    rpass.setBindGroup(0, this.renderBind);
    rpass.draw(6, PARTICLE_COUNT);
    rpass.end();

    this.device.queue.submit([enc.finish()]);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.particleBuf?.destroy();
      this.uniformBuf?.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.context?.unconfigure();
    } catch {
      /* ignore */
    }
    try {
      this.device?.destroy();
    } catch {
      /* ignore */
    }
  }
}
