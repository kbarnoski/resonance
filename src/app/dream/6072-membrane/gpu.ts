// WebGPU gaussian-splat renderer for 6072-membrane.
//
// A @compute pass relaxes every gaussian onto the audio-driven metaball
// iso-surface, flattens its 3D covariance tangent to the surface (thin disc
// splats hugging a skin), projects that covariance to a 2D screen-space
// gaussian (EWA-style), and writes a camera-facing quad instance. The render
// pass composites the quads ADDITIVELY — a deliberate simplification that
// gives a glowing, order-independent skin and avoids a per-frame depth sort
// (see README). Throws if WebGPU is unavailable so the caller can fall back.

import { makeRng, SEED } from "./prng";
import { METABALL_COUNT } from "./mat";

const GAUSSIAN_COUNT = 20000;
const WORKGROUP = 64;

const COMPUTE_WGSL = /* wgsl */ `
struct Splat {
  center : vec2f,
  a1     : vec2f,
  a2     : vec2f,
  pad    : vec2f,
  col    : vec4f,
};
struct Uni {
  view      : mat4x4f,
  proj      : mat4x4f,
  metaballs : array<vec4f, ${METABALL_COUNT}>,
  params    : vec4f, // time, focal, iso, dt
  screen    : vec4f, // width, height, paletteRot, count
  audio     : vec4f, // low, mid, high, overall
};

@group(0) @binding(0) var<uniform> U : Uni;
@group(0) @binding(1) var<storage, read_write> gauss : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> splats : array<Splat>;

fn outer3(a : vec3f, b : vec3f) -> mat3x3f {
  return mat3x3f(a * b.x, a * b.y, a * b.z);
}

// field value + gradient at p
fn fieldGrad(p : vec3f) -> vec4f {
  var f = 0.0;
  var g = vec3f(0.0);
  for (var i = 0u; i < ${METABALL_COUNT}u; i = i + 1u) {
    let m = U.metaballs[i];
    let d = p - m.xyz;
    let r2 = dot(d, d) + 0.08;
    let wr = m.w / r2;
    f = f + wr;
    g = g + (-2.0 * m.w / (r2 * r2)) * d;
  }
  return vec4f(g, f);
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let idx = gid.x;
  let count = u32(U.screen.w);
  if (idx >= count) { return; }

  let time = U.params.x;
  let focal = U.params.y;
  let iso = U.params.z;
  let width = U.screen.x;
  let height = U.screen.y;
  let overall = U.audio.w;
  let hi = U.audio.z;

  var st = gauss[idx];
  var p = st.xyz;
  let seed = st.w;

  // tangential shimmer so points don't clump — wander before relaxing
  var fg = fieldGrad(p);
  var n = normalize(fg.xyz + vec3f(1e-5));
  let hlp = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(n.y) > 0.99);
  var t1 = normalize(cross(hlp, n));
  var t2 = cross(n, t1);
  let wob = 0.05 * (0.4 + overall);
  p = p + t1 * sin(time * 0.7 + seed * 40.0) * wob
        + t2 * cos(time * 0.9 + seed * 57.0) * wob;

  // Newton relaxation onto iso-surface f = iso
  for (var k = 0; k < 4; k = k + 1) {
    fg = fieldGrad(p);
    let gg = dot(fg.xyz, fg.xyz) + 1e-6;
    p = p - ((fg.w - iso) / gg) * fg.xyz;
  }
  // keep bounded
  let pl = length(p);
  if (pl > 3.5) { p = p * (3.5 / pl); }

  fg = fieldGrad(p);
  let residual = abs(fg.w - iso);
  let gLen = length(fg.xyz) + 1e-5;
  n = -fg.xyz / gLen;              // outward normal
  let curv = clamp(gLen * 0.12, 0.0, 1.5);

  // store relaxed position back
  gauss[idx] = vec4f(p, seed);

  // rebuild tangent frame on the outward normal
  let hlp2 = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(n.y) > 0.99);
  t1 = normalize(cross(hlp2, n));
  t2 = cross(n, t1);

  // tangent-flattened covariance: broad in-plane, thin along the normal
  let sv = fract(seed * 91.7);
  let disc = (0.055 + 0.05 * sv) * (0.7 + overall * 0.9 + hi * 0.7);
  let st2 = disc * disc;
  let sn2 = (disc * 0.13) * (disc * 0.13);
  let cov3 = st2 * (outer3(t1, t1) + outer3(t2, t2)) + sn2 * outer3(n, n);

  // world -> camera
  let W = mat3x3f(U.view[0].xyz, U.view[1].xyz, U.view[2].xyz);
  let tc = (U.view * vec4f(p, 1.0)).xyz;
  let covCam = W * cov3 * transpose(W);

  var out : Splat;
  out.pad = vec2f(0.0);

  let depth = -tc.z;
  if (depth < 0.05) {
    out.col = vec4f(0.0);
    out.center = vec2f(2.0, 2.0);
    out.a1 = vec2f(0.0);
    out.a2 = vec2f(0.0);
    splats[idx] = out;
    return;
  }

  // EWA Jacobian of the perspective projection at tc
  let jl = focal / depth;
  let jr0 = vec3f(jl, 0.0, focal * tc.x / (depth * depth));
  let jr1 = vec3f(0.0, jl, focal * tc.y / (depth * depth));
  let c0 = covCam * jr0;
  let c1 = covCam * jr1;
  var ca = dot(jr0, c0) + 0.3;
  let cb = dot(jr0, c1);
  var cd = dot(jr1, c1) + 0.3;

  // eigendecomposition of the 2x2 screen covariance
  let tr = ca + cd;
  let det = ca * cd - cb * cb;
  let disc2 = sqrt(max(tr * tr * 0.25 - det, 0.0));
  let l1 = tr * 0.5 + disc2;
  let l2 = max(tr * 0.5 - disc2, 0.0);
  var ev = vec2f(cb, l1 - ca);
  if (dot(ev, ev) < 1e-8) { ev = vec2f(1.0, 0.0); }
  ev = normalize(ev);
  let ev2 = vec2f(-ev.y, ev.x);
  let rad1 = min(3.0 * sqrt(l1), height * 0.35);
  let rad2 = min(3.0 * sqrt(l2), height * 0.35);
  let toNdc = vec2f(2.0 / width, 2.0 / height);
  out.a1 = (ev * rad1) * toNdc;
  out.a2 = (ev2 * rad2) * toNdc;

  // projected center
  let clip = U.proj * vec4f(p, 1.0);
  if (clip.w <= 0.0) {
    out.col = vec4f(0.0);
    out.center = vec2f(2.0, 2.0);
    splats[idx] = out;
    return;
  }
  out.center = clip.xy / clip.w;

  // iridescent color from a rotating cosine palette (art zone — vivid ok)
  let rot = U.screen.z;
  let hue = fract(rot + n.y * 0.13 + curv * 0.25 + sv * 0.5);
  let pal = vec3f(0.55, 0.35, 0.62)
          + vec3f(0.45, 0.4, 0.48)
          * cos(6.2831853 * (hue + vec3f(0.0, 0.16, 0.36)));

  // fresnel rim from facing in camera space
  let nCam = normalize(W * n);
  let facing = abs(dot(nCam, normalize(-tc)));
  let rim = pow(1.0 - facing, 2.0);
  let color = pal * (0.55 + facing * 0.7) + vec3f(0.35, 0.28, 0.55) * rim * 0.9;

  let fade = exp(-residual * 1.1);
  let op = (0.10 + overall * 0.16 + hi * 0.10) * fade * (0.5 + facing * 0.6);
  out.col = vec4f(color * (1.0 + overall * 0.8), clamp(op, 0.0, 0.9));
  splats[idx] = out;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Splat {
  center : vec2f,
  a1     : vec2f,
  a2     : vec2f,
  pad    : vec2f,
  col    : vec4f,
};
@group(0) @binding(0) var<storage, read> splats : array<Splat>;

struct VOut {
  @builtin(position) pos : vec4f,
  @location(0) local : vec2f,
  @location(1) col : vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32,
      @builtin(instance_index) ii : u32) -> VOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),  vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let c = corners[vi];
  let s = splats[ii];
  var o : VOut;
  let p = s.center + c.x * s.a1 + c.y * s.a2;
  o.pos = vec4f(p, 0.0, 1.0);
  o.local = c;
  o.col = s.col;
  return o;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4f {
  let d2 = dot(in.local, in.local);
  if (d2 > 1.0) { discard; }
  let g = exp(-0.5 * 9.0 * d2);
  let a = g * in.col.a;
  return vec4f(in.col.rgb * a, a);
}
`;

export interface FrameInputs {
  view: Float32Array;
  proj: Float32Array;
  metaballs: Float32Array; // METABALL_COUNT * vec4
  time: number;
  focal: number;
  iso: number;
  dt: number;
  width: number;
  height: number;
  paletteRot: number;
  audioLow: number;
  audioMid: number;
  audioHigh: number;
  audioOverall: number;
}

export class MembraneGPU {
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private uniformBuf: GPUBuffer;
  private uniformArr: Float32Array<ArrayBuffer>;
  private computePipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private computeBind: GPUBindGroup;
  private renderBind: GPUBindGroup;
  readonly count = GAUSSIAN_COUNT;

  private constructor(
    device: GPUDevice,
    ctx: GPUCanvasContext,
    format: GPUTextureFormat,
  ) {
    this.device = device;
    this.ctx = ctx;
    this.format = format;

    // 304-byte uniform (view 64 + proj 64 + metaballs 128 + 3*vec4 48)
    this.uniformArr = new Float32Array(76);
    this.uniformBuf = device.createBuffer({
      size: this.uniformArr.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // seeded gaussian state: positions on a jittered sphere
    const rng = makeRng(SEED ^ 0x3c9d);
    const state = new Float32Array(GAUSSIAN_COUNT * 4);
    for (let i = 0; i < GAUSSIAN_COUNT; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const rad = 1.1 + rng() * 0.5;
      state[i * 4] = Math.cos(th) * r * rad;
      state[i * 4 + 1] = u * rad;
      state[i * 4 + 2] = Math.sin(th) * r * rad;
      state[i * 4 + 3] = rng();
    }
    const gaussBuf = device.createBuffer({
      size: state.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(gaussBuf, 0, state);

    const splatBuf = device.createBuffer({
      size: GAUSSIAN_COUNT * 48, // sizeof(Splat)
      usage: GPUBufferUsage.STORAGE,
    });

    const computeMod = device.createShaderModule({ code: COMPUTE_WGSL });
    const renderMod = device.createShaderModule({ code: RENDER_WGSL });

    const computeLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });
    this.computePipe = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeLayout],
      }),
      compute: { module: computeMod, entryPoint: "main" },
    });
    this.computeBind = device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: { buffer: gaussBuf } },
        { binding: 2, resource: { buffer: splatBuf } },
      ],
    });

    const renderLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });
    this.renderPipe = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [renderLayout],
      }),
      vertex: { module: renderMod, entryPoint: "vs" },
      fragment: {
        module: renderMod,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    this.renderBind = device.createBindGroup({
      layout: renderLayout,
      entries: [{ binding: 0, resource: { buffer: splatBuf } }],
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<MembraneGPU> {
    if (!navigator.gpu) throw new Error("navigator.gpu unavailable");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no WebGPU adapter");
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("no webgpu canvas context");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });
    return new MembraneGPU(device, ctx, format);
  }

  frame(f: FrameInputs): void {
    const u = this.uniformArr;
    u.set(f.view, 0);
    u.set(f.proj, 16);
    u.set(f.metaballs.subarray(0, METABALL_COUNT * 4), 32);
    u[64] = f.time;
    u[65] = f.focal;
    u[66] = f.iso;
    u[67] = f.dt;
    u[68] = f.width;
    u[69] = f.height;
    u[70] = f.paletteRot;
    u[71] = this.count;
    u[72] = f.audioLow;
    u[73] = f.audioMid;
    u[74] = f.audioHigh;
    u[75] = f.audioOverall;
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);

    const enc = this.device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(this.computePipe);
    cp.setBindGroup(0, this.computeBind);
    cp.dispatchWorkgroups(Math.ceil(this.count / WORKGROUP));
    cp.end();

    const view = this.ctx.getCurrentTexture().createView();
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.016, g: 0.008, b: 0.03, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(this.renderPipe);
    rp.setBindGroup(0, this.renderBind);
    rp.draw(6, this.count);
    rp.end();

    this.device.queue.submit([enc.finish()]);
  }

  destroy(): void {
    this.device.destroy();
  }
}
