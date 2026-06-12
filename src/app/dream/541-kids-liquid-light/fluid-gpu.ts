/// <reference types="@webgpu/types" />
// fluid-gpu.ts — Real-time stable-fluids solver on WebGPU compute shaders (WGSL).
// Reference: Jos Stam, "Stable Fluids", SIGGRAPH 1999.
// Pipeline per frame: add forces (finger impulse + dye) -> advect velocity ->
//   compute divergence -> Jacobi pressure solve (N iters) -> subtract gradient ->
//   advect dye. A render pipeline samples the dye texture (luminous / additive look).
//
// Fields are stored as r32float / rgba16float storage textures on a GRID x GRID grid.
// Graceful init: returns null if WebGPU is unavailable or device creation fails.

export interface FluidPointer {
  // normalized 0..1 grid coords (x right, y down)
  x: number;
  y: number;
  // normalized velocity impulse (grid units / frame), already scaled by caller
  dx: number;
  dy: number;
  // dye color rgb 0..1
  r: number;
  g: number;
  b: number;
  down: boolean;
}

const GRID = 192;
const PRESSURE_ITERS = 28;

// ---- WGSL ----
// We keep velocity in an rg16float texture (xy) and dye in rgba16float.
// Pressure/divergence in r16float textures. Ping-pong pairs for advection & jacobi.

const WGSL = /* wgsl */ `
struct Params {
  grid : f32,
  dt : f32,
  // pointer
  px : f32,
  py : f32,
  pdx : f32,
  pdy : f32,
  pr : f32,
  pg : f32,
  pb : f32,
  pdown : f32,
  radius : f32,
  dissipation : f32, // dye fade
  velFade : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
};

@group(0) @binding(0) var<uniform> P : Params;

// Bindings reused across pipelines; each pipeline declares what it needs.
@group(0) @binding(1) var velIn  : texture_2d<f32>;
@group(0) @binding(2) var velOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var dyeIn  : texture_2d<f32>;
@group(0) @binding(4) var dyeOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var prsIn  : texture_2d<f32>;
@group(0) @binding(6) var prsOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var divOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(8) var divIn  : texture_2d<f32>;
@group(0) @binding(9) var samp   : sampler;

fn clampi(v : vec2<i32>) -> vec2<i32> {
  let m = i32(P.grid) - 1;
  return clamp(v, vec2<i32>(0,0), vec2<i32>(m,m));
}

fn sampleVel(uv : vec2<f32>) -> vec2<f32> {
  return textureSampleLevel(velIn, samp, uv, 0.0).xy;
}
fn sampleDye(uv : vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(dyeIn, samp, uv, 0.0);
}

// 1) Add forces: inject velocity + dye near the pointer; gentle global fade.
@compute @workgroup_size(8, 8)
fn addForces(@builtin(global_invocation_id) gid : vec3<u32>) {
  let g = i32(P.grid);
  if (i32(gid.x) >= g || i32(gid.y) >= g) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = (vec2<f32>(coord) + vec2<f32>(0.5)) / P.grid;

  var vel = textureLoad(velIn, coord, 0).xy * P.velFade;
  var dye = textureLoad(dyeIn, coord, 0) * P.dissipation;

  if (P.pdown > 0.5) {
    let d = vec2<f32>(uv.x - P.px, uv.y - P.py);
    let dist2 = dot(d, d);
    let r = P.radius;
    let fall = exp(-dist2 / (r * r));
    vel += vec2<f32>(P.pdx, P.pdy) * fall;
    dye += vec4<f32>(P.pr, P.pg, P.pb, 1.0) * fall;
  }

  textureStore(velOut, coord, vec4<f32>(vel, 0.0, 0.0));
  textureStore(dyeOut, coord, dye);
}

// 2) Advect velocity (semi-Lagrangian backtrace).
@compute @workgroup_size(8, 8)
fn advectVel(@builtin(global_invocation_id) gid : vec3<u32>) {
  let g = i32(P.grid);
  if (i32(gid.x) >= g || i32(gid.y) >= g) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = (vec2<f32>(coord) + vec2<f32>(0.5)) / P.grid;
  let v = sampleVel(uv);
  let back = uv - P.dt * v / P.grid;
  let prev = sampleVel(back);
  textureStore(velOut, coord, vec4<f32>(prev, 0.0, 0.0));
}

// 3) Divergence of velocity field.
@compute @workgroup_size(8, 8)
fn divergence(@builtin(global_invocation_id) gid : vec3<u32>) {
  let g = i32(P.grid);
  if (i32(gid.x) >= g || i32(gid.y) >= g) { return; }
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  let l = textureLoad(velIn, clampi(c + vec2<i32>(-1,0)), 0).x;
  let r = textureLoad(velIn, clampi(c + vec2<i32>( 1,0)), 0).x;
  let b = textureLoad(velIn, clampi(c + vec2<i32>(0,-1)), 0).y;
  let t = textureLoad(velIn, clampi(c + vec2<i32>(0, 1)), 0).y;
  let div = 0.5 * (r - l + t - b);
  textureStore(divOut, c, vec4<f32>(div, 0.0, 0.0, 0.0));
}

// 4) Jacobi pressure iteration: prsOut = (sum(neighbors) - div) / 4
@compute @workgroup_size(8, 8)
fn jacobi(@builtin(global_invocation_id) gid : vec3<u32>) {
  let g = i32(P.grid);
  if (i32(gid.x) >= g || i32(gid.y) >= g) { return; }
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  let l = textureLoad(prsIn, clampi(c + vec2<i32>(-1,0)), 0).x;
  let r = textureLoad(prsIn, clampi(c + vec2<i32>( 1,0)), 0).x;
  let b = textureLoad(prsIn, clampi(c + vec2<i32>(0,-1)), 0).x;
  let t = textureLoad(prsIn, clampi(c + vec2<i32>(0, 1)), 0).x;
  let div = textureLoad(divIn, c, 0).x;
  let p = (l + r + b + t - div) * 0.25;
  textureStore(prsOut, c, vec4<f32>(p, 0.0, 0.0, 0.0));
}

// 5) Subtract pressure gradient from velocity -> divergence-free.
@compute @workgroup_size(8, 8)
fn subtractGradient(@builtin(global_invocation_id) gid : vec3<u32>) {
  let g = i32(P.grid);
  if (i32(gid.x) >= g || i32(gid.y) >= g) { return; }
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  let l = textureLoad(prsIn, clampi(c + vec2<i32>(-1,0)), 0).x;
  let r = textureLoad(prsIn, clampi(c + vec2<i32>( 1,0)), 0).x;
  let b = textureLoad(prsIn, clampi(c + vec2<i32>(0,-1)), 0).x;
  let t = textureLoad(prsIn, clampi(c + vec2<i32>(0, 1)), 0).x;
  var v = textureLoad(velIn, c, 0).xy;
  v -= 0.5 * vec2<f32>(r - l, t - b);
  textureStore(velOut, c, vec4<f32>(v, 0.0, 0.0));
}

// 6) Advect dye by the (now divergence-free) velocity field.
@compute @workgroup_size(8, 8)
fn advectDye(@builtin(global_invocation_id) gid : vec3<u32>) {
  let g = i32(P.grid);
  if (i32(gid.x) >= g || i32(gid.y) >= g) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = (vec2<f32>(coord) + vec2<f32>(0.5)) / P.grid;
  let v = sampleVel(uv);
  let back = uv - P.dt * v / P.grid;
  let prev = sampleDye(back);
  textureStore(dyeOut, coord, prev);
}

// ---- Render: full-screen triangle sampling the dye texture (luminous look) ----
struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vi : u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out : VSOut;
  let xy = p[vi];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  // flip Y so grid-down maps to screen-down
  out.uv = vec2<f32>((xy.x + 1.0) * 0.5, 1.0 - (xy.y + 1.0) * 0.5);
  return out;
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let dye = textureSampleLevel(dyeIn, samp, in.uv, 0.0);
  let col = dye.rgb;
  // luminous tone-map: gentle, glowing, dark background
  let glow = col * 1.3;
  let mapped = glow / (glow + vec3<f32>(0.6));
  return vec4<f32>(mapped, 1.0);
}
`;

interface Tex {
  tex: GPUTexture;
  view: GPUTextureView;
}

function makeTex(device: GPUDevice, size: number): Tex {
  const tex = device.createTexture({
    size: [size, size],
    format: "rgba16float",
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });
  return { tex, view: tex.createView() };
}

export class GpuFluid {
  readonly grid = GRID;
  private device!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private sampler!: GPUSampler;
  private uniformBuf!: GPUBuffer;

  private vel0!: Tex;
  private vel1!: Tex;
  private dye0!: Tex;
  private dye1!: Tex;
  private prs0!: Tex;
  private prs1!: Tex;
  private div!: Tex;

  private pipelines: Record<string, GPUComputePipeline> = {};
  private renderPipeline!: GPURenderPipeline;
  private bgLayout!: GPUBindGroupLayout;
  private disposed = false;

  // CPU-side velocity readback proxy: we track the last injected impulse so the
  // audio engine has a swirl estimate even without a (slow) GPU readback.
  private lastSpeed = 0;

  static async create(canvas: HTMLCanvasElement): Promise<GpuFluid | null> {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    let adapter: GPUAdapter | null = null;
    try {
      adapter = await navigator.gpu.requestAdapter();
    } catch {
      return null;
    }
    if (!adapter) return null;
    let device: GPUDevice;
    try {
      device = await adapter.requestDevice();
    } catch {
      return null;
    }
    const ctx = canvas.getContext("webgpu");
    if (!ctx) return null;
    const f = new GpuFluid();
    try {
      f.init(device, ctx as GPUCanvasContext);
    } catch {
      return null;
    }
    return f;
  }

  private init(device: GPUDevice, ctx: GPUCanvasContext): void {
    this.device = device;
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });

    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.uniformBuf = device.createBuffer({
      size: 16 * 4, // 16 f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.vel0 = makeTex(device, GRID);
    this.vel1 = makeTex(device, GRID);
    this.dye0 = makeTex(device, GRID);
    this.dye1 = makeTex(device, GRID);
    this.prs0 = makeTex(device, GRID);
    this.prs1 = makeTex(device, GRID);
    this.div = makeTex(device, GRID);

    const shaderModule = device.createShaderModule({ code: WGSL });

    // One shared bind group layout covering every binding the shaders mention.
    this.bgLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.bgLayout] });

    const mkCompute = (entry: string) =>
      device.createComputePipeline({
        layout,
        compute: { module: shaderModule, entryPoint: entry },
      });

    for (const name of [
      "addForces",
      "advectVel",
      "divergence",
      "jacobi",
      "subtractGradient",
      "advectDye",
    ]) {
      this.pipelines[name] = mkCompute(name);
    }

    this.renderPipeline = device.createRenderPipeline({
      layout,
      vertex: { module: shaderModule, entryPoint: "vsMain" },
      fragment: {
        module: shaderModule,
        entryPoint: "fsMain",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  // Build a bind group; absent textures are filled with a placeholder view
  // (the shader entrypoint just won't read them).
  private makeBind(opts: {
    velIn?: Tex;
    velOut?: Tex;
    dyeIn?: Tex;
    dyeOut?: Tex;
    prsIn?: Tex;
    prsOut?: Tex;
    divOut?: Tex;
    divIn?: Tex;
  }): GPUBindGroup {
    const ph = this.div; // any texture works as a placeholder
    return this.device.createBindGroup({
      layout: this.bgLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: (opts.velIn ?? ph).view },
        { binding: 2, resource: (opts.velOut ?? ph).view },
        { binding: 3, resource: (opts.dyeIn ?? ph).view },
        { binding: 4, resource: (opts.dyeOut ?? ph).view },
        { binding: 5, resource: (opts.prsIn ?? ph).view },
        { binding: 6, resource: (opts.prsOut ?? ph).view },
        { binding: 7, resource: (opts.divOut ?? ph).view },
        { binding: 8, resource: (opts.divIn ?? ph).view },
        { binding: 9, resource: this.sampler },
      ],
    });
  }

  private writeUniforms(p: FluidPointer, dt: number): void {
    const data = new Float32Array(16);
    data[0] = GRID;
    data[1] = dt;
    data[2] = p.x;
    data[3] = p.y;
    data[4] = p.dx;
    data[5] = p.dy;
    data[6] = p.r;
    data[7] = p.g;
    data[8] = p.b;
    data[9] = p.down ? 1 : 0;
    data[10] = 0.06; // radius (normalized)
    data[11] = 0.992; // dye dissipation
    data[12] = 0.996; // velocity fade
    this.device.queue.writeBuffer(this.uniformBuf, 0, data);
    this.lastSpeed = Math.min(1, Math.hypot(p.dx, p.dy) * 6) * (p.down ? 1 : 0);
  }

  getSpeed(): number {
    return this.lastSpeed;
  }

  private dispatch(
    enc: GPUCommandEncoder,
    name: string,
    bind: GPUBindGroup,
  ): void {
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipelines[name]);
    pass.setBindGroup(0, bind);
    const groups = Math.ceil(GRID / 8);
    pass.dispatchWorkgroups(groups, groups);
    pass.end();
  }

  step(p: FluidPointer, dt: number): void {
    if (this.disposed) return;
    this.writeUniforms(p, dt);
    const enc = this.device.createCommandEncoder();

    // 1) add forces: vel0,dye0 -> vel1,dye1
    this.dispatch(
      enc,
      "addForces",
      this.makeBind({ velIn: this.vel0, velOut: this.vel1, dyeIn: this.dye0, dyeOut: this.dye1 }),
    );
    // swap so latest is in *0
    [this.vel0, this.vel1] = [this.vel1, this.vel0];
    [this.dye0, this.dye1] = [this.dye1, this.dye0];

    // 2) advect velocity: vel0 -> vel1
    this.dispatch(enc, "advectVel", this.makeBind({ velIn: this.vel0, velOut: this.vel1 }));
    [this.vel0, this.vel1] = [this.vel1, this.vel0];

    // 3) divergence: vel0 -> div
    this.dispatch(enc, "divergence", this.makeBind({ velIn: this.vel0, divOut: this.div }));

    // clear pressure to 0 by writing it via jacobi seed (prs0 starts whatever; iterate)
    // 4) jacobi iterations: prs0/prs1 ping-pong using div
    for (let i = 0; i < PRESSURE_ITERS; i++) {
      this.dispatch(
        enc,
        "jacobi",
        this.makeBind({ prsIn: this.prs0, prsOut: this.prs1, divIn: this.div }),
      );
      [this.prs0, this.prs1] = [this.prs1, this.prs0];
    }

    // 5) subtract gradient: vel0 (+prs0) -> vel1
    this.dispatch(
      enc,
      "subtractGradient",
      this.makeBind({ velIn: this.vel0, prsIn: this.prs0, velOut: this.vel1 }),
    );
    [this.vel0, this.vel1] = [this.vel1, this.vel0];

    // 6) advect dye: dye0 by vel0 -> dye1
    this.dispatch(
      enc,
      "advectDye",
      this.makeBind({ velIn: this.vel0, dyeIn: this.dye0, dyeOut: this.dye1 }),
    );
    [this.dye0, this.dye1] = [this.dye1, this.dye0];

    // ---- render dye0 to canvas ----
    const view = this.ctx.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(this.renderPipeline);
    rpass.setBindGroup(0, this.makeBind({ dyeIn: this.dye0 }));
    rpass.draw(3);
    rpass.end();

    this.device.queue.submit([enc.finish()]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of [this.vel0, this.vel1, this.dye0, this.dye1, this.prs0, this.prs1, this.div]) {
      try {
        t.tex.destroy();
      } catch {
        /* ignore */
      }
    }
    try {
      this.device.destroy();
    } catch {
      /* ignore */
    }
  }
}
