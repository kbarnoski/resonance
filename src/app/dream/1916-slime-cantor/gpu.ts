// gpu.ts — the genuine agent-based Physarum sim, in WGSL compute shaders.
//
// This is the "wow": thousands–hundreds of thousands of agents living in a GPU
// storage buffer. Each frame, in order:
//
//   1. move   — each agent senses trail density at 3 sensor offsets
//               (left / centre / right), rotates toward the strongest, steps
//               forward, and atomically deposits into a fixed-point buffer.
//               (Jones 2010 deposit/sense/rotate agent model.)
//   2. diffuse— a 3×3 blur + decay of the trail field, plus a stationary
//               chemoattractant glow at each food node, ping-ponged between two
//               storage buffers. Because agents chase the glow, veins route
//               *between* food nodes — the Tero 2010 optimal-transport
//               behaviour, emergent rather than scripted.
//   3. edges  — sample the freshest trail along each node-pair segment and
//               write the mean density into a tiny 8×8 buffer for readback:
//               this is what the graph-Laplacian harmony is built from.
//   4. render — a fullscreen pass paints the trail as luminous amber/gold veins
//               over a deep teal agar, with coral food seeds.
//
// Determinism: agents are seeded from a mulberry32 stream on the CPU. No
// Math.random / Date.now anywhere.

import { mulberry32, MAX_NODES, type FoodNode } from "./graph";

const EDGE_SAMPLES = 24; // points sampled along each node-pair segment
const DEPOSIT_FIXED = 300.0; // agent deposit in fixed-point atomic units
const DEPOSIT_SCALE = 1024.0; // fixed-point → float divisor

export interface SimOptions {
  reducedMotion: boolean;
}

const PARAM_FLOATS = 16; // std140-ish padded uniform block

// ── WGSL ─────────────────────────────────────────────────────────────────────

const COMMON = /* wgsl */ `
struct Params {
  res: f32, agentCount: f32, time: f32, decay: f32,
  sensorAngle: f32, sensorDist: f32, rotAngle: f32, stepSize: f32,
  foodCount: f32, foodSigma: f32, foodStrength: f32, drift: f32,
  p0: f32, p1: f32, p2: f32, p3: f32,
};
struct Agent { x: f32, y: f32, ang: f32, pad: f32 };

fn hash11(p: f32) -> f32 {
  var h = fract(p * 0.1031);
  h = h * (h + 33.33);
  h = h * (h + h);
  return fract(h);
}
`;

const MOVE_WGSL =
  COMMON +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> trail: array<f32>;
@group(0) @binding(2) var<storage, read_write> deposit: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> agents: array<Agent>;

fn sampleTrail(px: f32, py: f32) -> f32 {
  let R = P.res;
  let x = clamp(px, 0.0, R - 1.0);
  let y = clamp(py, 0.0, R - 1.0);
  let idx = u32(y) * u32(R) + u32(x);
  return trail[idx];
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(P.agentCount)) { return; }
  var ag = agents[i];
  let R = P.res;

  let sd = P.sensorDist;
  let sa = P.sensorAngle;
  let cx = ag.x + cos(ag.ang) * sd;
  let cy = ag.y + sin(ag.ang) * sd;
  let lx = ag.x + cos(ag.ang - sa) * sd;
  let ly = ag.y + sin(ag.ang - sa) * sd;
  let rx = ag.x + cos(ag.ang + sa) * sd;
  let ry = ag.y + sin(ag.ang + sa) * sd;

  let c = sampleTrail(cx, cy);
  let l = sampleTrail(lx, ly);
  let r = sampleTrail(rx, ry);

  let rnd = hash11(f32(i) + P.time * 13.0);
  if (c > l && c > r) {
    // keep heading
  } else if (l > r) {
    ag.ang = ag.ang - P.rotAngle;
  } else if (r > l) {
    ag.ang = ag.ang + P.rotAngle;
  } else {
    ag.ang = ag.ang + (rnd - 0.5) * 2.0 * P.rotAngle;
  }

  ag.x = ag.x + cos(ag.ang) * P.stepSize;
  ag.y = ag.y + sin(ag.ang) * P.stepSize;

  // Toroidal wrap keeps the colony dense and edge-free.
  ag.x = (ag.x + R) % R;
  ag.y = (ag.y + R) % R;

  let ix = u32(clamp(ag.x, 0.0, R - 1.0));
  let iy = u32(clamp(ag.y, 0.0, R - 1.0));
  atomicAdd(&deposit[iy * u32(R) + ix], u32(${DEPOSIT_FIXED}));

  agents[i] = ag;
}
`;

const DIFFUSE_WGSL =
  COMMON +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> trailIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> trailOut: array<f32>;
@group(0) @binding(3) var<storage, read_write> deposit: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read> food: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let R = u32(P.res);
  if (gid.x >= R || gid.y >= R) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let ri = i32(R);

  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let sx = (x + dx + ri) % ri;
      let sy = (y + dy + ri) % ri;
      sum = sum + trailIn[u32(sy) * R + u32(sx)];
    }
  }
  let blur = sum / 9.0;

  let idx = gid.y * R + gid.x;
  let dep = f32(atomicLoad(&deposit[idx])) / ${DEPOSIT_SCALE};
  atomicStore(&deposit[idx], 0u); // reset for next frame

  // Stationary chemoattractant at each food node.
  var glow = 0.0;
  let fc = i32(P.foodCount);
  let sig2 = 2.0 * P.foodSigma * P.foodSigma;
  for (var k = 0; k < fc; k = k + 1) {
    let f = food[k];
    let d2 = (f.x - f32(gid.x)) * (f.x - f32(gid.x)) +
             (f.y - f32(gid.y)) * (f.y - f32(gid.y));
    glow = glow + P.foodStrength * exp(-d2 / sig2);
  }

  var v = (blur + dep + glow) * P.decay;
  v = min(v, 8.0); // clamp to keep the field bounded
  trailOut[idx] = v;
}
`;

const EDGE_WGSL =
  COMMON +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> trail: array<f32>;
@group(0) @binding(2) var<storage, read_write> edges: array<f32>;
@group(0) @binding(3) var<storage, read> food: array<vec4f>;

fn sampleTrail(px: f32, py: f32) -> f32 {
  let R = P.res;
  let x = clamp(px, 0.0, R - 1.0);
  let y = clamp(py, 0.0, R - 1.0);
  return trail[u32(y) * u32(R) + u32(x)];
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let k = gid.x;
  let N = u32(${MAX_NODES});
  if (k >= N * N) { return; }
  let i = k / N;
  let j = k % N;
  let fc = u32(P.foodCount);
  if (i >= fc || j >= fc || i >= j) { edges[k] = -1.0; return; }

  let a = food[i].xy;
  let b = food[j].xy;
  var s = 0.0;
  let steps = ${EDGE_SAMPLES};
  for (var t = 1; t < steps; t = t + 1) {
    let f = f32(t) / f32(steps);
    let p = mix(a, b, f);
    s = s + sampleTrail(p.x, p.y);
  }
  edges[k] = s / f32(steps - 1);
}
`;

const RENDER_WGSL =
  COMMON +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> trail: array<f32>;
@group(0) @binding(2) var<storage, read> food: array<vec4f>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Fullscreen triangle.
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VSOut;
  let xy = p[vi];
  out.pos = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

fn sampleBilinear(uv: vec2f) -> f32 {
  let R = P.res;
  let fx = clamp(uv.x * R - 0.5, 0.0, R - 1.0);
  let fy = clamp(uv.y * R - 0.5, 0.0, R - 1.0);
  let x0 = floor(fx); let y0 = floor(fy);
  let x1 = min(x0 + 1.0, R - 1.0); let y1 = min(y0 + 1.0, R - 1.0);
  let tx = fx - x0; let ty = fy - y0;
  let ri = u32(R);
  let a = trail[u32(y0) * ri + u32(x0)];
  let b = trail[u32(y0) * ri + u32(x1)];
  let c = trail[u32(y1) * ri + u32(x0)];
  let d = trail[u32(y1) * ri + u32(x1)];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let raw = sampleBilinear(in.uv);
  // Tone-map density → 0..1 intensity.
  let v = 1.0 - exp(-raw * 1.6);

  // Deep saturated teal agar ground (dark-field microscopy), never pure black.
  let ground = vec3f(0.017, 0.145, 0.125);
  // Luminous vein ramp: ground → chartreuse → amber/gold → hot pale core.
  let chartreuse = vec3f(0.541, 0.804, 0.298); // ~#8acc4c
  let amber = vec3f(0.957, 0.757, 0.306);      // ~#f4c14e
  let hot = vec3f(1.0, 0.953, 0.769);          // ~#fff3c4

  var col = ground;
  col = mix(col, chartreuse, smoothstep(0.02, 0.30, v));
  col = mix(col, amber, smoothstep(0.30, 0.62, v));
  col = mix(col, hot, smoothstep(0.72, 0.98, v) * 0.85);

  // Food seeds: small vermilion/coral markers with a soft halo.
  let fc = i32(P.foodCount);
  let pix = vec2f(in.uv.x * P.res, in.uv.y * P.res);
  for (var k = 0; k < fc; k = k + 1) {
    let f = food[k];
    let dist = length(pix - f.xy);
    let core = 1.0 - smoothstep(2.0, 6.0, dist);
    let halo = (1.0 - smoothstep(6.0, 22.0, dist)) * 0.35;
    let seed = vec3f(1.0, 0.42, 0.28); // coral / vermilion
    col = mix(col, seed, clamp(core + halo, 0.0, 1.0));
  }

  // Slow, safe global luminance drift (no strobe).
  let drift = 0.92 + 0.08 * sin(P.time * 0.15);
  col = col * drift;
  // Never allow a pure-white full-frame flash.
  col = min(col, vec3f(0.93, 0.93, 0.9));
  return vec4f(col, 1.0);
}
`;

// ── the sim class ──────────────────────────────────────────────────────────

export class SlimeGPU {
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;

  private res: number;
  private agentCount: number;
  private reducedMotion: boolean;

  private trail: [GPUBuffer, GPUBuffer];
  private deposit: GPUBuffer;
  private agents: GPUBuffer;
  private food: GPUBuffer;
  private edges: GPUBuffer;
  private edgeStaging: GPUBuffer;
  private params: GPUBuffer;

  private movePipe: GPUComputePipeline;
  private diffusePipe: GPUComputePipeline;
  private edgePipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;

  // Two bind groups each for ping-pong (parity 0 reads trail[0], writes trail[1]).
  private moveBG: [GPUBindGroup, GPUBindGroup];
  private diffuseBG: [GPUBindGroup, GPUBindGroup];
  private edgeBG: [GPUBindGroup, GPUBindGroup];
  private renderBG: [GPUBindGroup, GPUBindGroup];

  private parity = 0;
  private mapping = false;
  private foodData = new Float32Array(MAX_NODES * 4);
  private foodCount = 0;
  private lost = false;

  private constructor(
    device: GPUDevice,
    ctx: GPUCanvasContext,
    format: GPUTextureFormat,
    res: number,
    agentCount: number,
    reducedMotion: boolean,
  ) {
    this.device = device;
    this.ctx = ctx;
    this.format = format;
    this.res = res;
    this.agentCount = agentCount;
    this.reducedMotion = reducedMotion;

    const cells = res * res;
    const mk = (bytes: number, usage: GPUBufferUsageFlags) =>
      device.createBuffer({ size: bytes, usage });

    this.trail = [
      mk(cells * 4, GPUBufferUsage.STORAGE),
      mk(cells * 4, GPUBufferUsage.STORAGE),
    ];
    this.deposit = mk(cells * 4, GPUBufferUsage.STORAGE);
    this.agents = mk(
      agentCount * 16,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.food = mk(
      MAX_NODES * 16,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.edges = mk(
      MAX_NODES * MAX_NODES * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    );
    this.edgeStaging = mk(
      MAX_NODES * MAX_NODES * 4,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );
    this.params = mk(
      PARAM_FLOATS * 4,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );

    // Seed agents deterministically.
    const rng = mulberry32(0x51_1e5eed);
    const seed = new Float32Array(agentCount * 4);
    for (let i = 0; i < agentCount; i++) {
      // Bias half the agents toward the centre so the colony coheres fast.
      const centred = rng() < 0.5;
      const rx = centred ? 0.5 + (rng() - 0.5) * 0.4 : rng();
      const ry = centred ? 0.5 + (rng() - 0.5) * 0.4 : rng();
      seed[i * 4 + 0] = rx * res;
      seed[i * 4 + 1] = ry * res;
      seed[i * 4 + 2] = rng() * Math.PI * 2;
      seed[i * 4 + 3] = 0;
    }
    device.queue.writeBuffer(this.agents, 0, seed);

    // Pipelines.
    this.movePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: MOVE_WGSL }), entryPoint: "main" },
    });
    this.diffusePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: DIFFUSE_WGSL }), entryPoint: "main" },
    });
    this.edgePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: EDGE_WGSL }), entryPoint: "main" },
    });
    const renderMod = device.createShaderModule({ code: RENDER_WGSL });
    this.renderPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderMod, entryPoint: "vs" },
      fragment: { module: renderMod, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });

    // Bind groups for both parities.
    const mkBG = (
      pipe: GPUComputePipeline | GPURenderPipeline,
      entries: GPUBindGroupEntry[],
    ) => device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });

    this.moveBG = [0, 1].map((p) =>
      mkBG(this.movePipe, [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.trail[p] } },
        { binding: 2, resource: { buffer: this.deposit } },
        { binding: 3, resource: { buffer: this.agents } },
      ]),
    ) as [GPUBindGroup, GPUBindGroup];

    this.diffuseBG = [0, 1].map((p) =>
      mkBG(this.diffusePipe, [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.trail[p] } },
        { binding: 2, resource: { buffer: this.trail[1 - p] } },
        { binding: 3, resource: { buffer: this.deposit } },
        { binding: 4, resource: { buffer: this.food } },
      ]),
    ) as [GPUBindGroup, GPUBindGroup];

    // After diffuse with parity p, the freshest trail is trail[1-p].
    this.edgeBG = [0, 1].map((p) =>
      mkBG(this.edgePipe, [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.trail[1 - p] } },
        { binding: 2, resource: { buffer: this.edges } },
        { binding: 3, resource: { buffer: this.food } },
      ]),
    ) as [GPUBindGroup, GPUBindGroup];

    this.renderBG = [0, 1].map((p) =>
      mkBG(this.renderPipe, [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.trail[1 - p] } },
        { binding: 2, resource: { buffer: this.food } },
      ]),
    ) as [GPUBindGroup, GPUBindGroup];

    device.lost.then((info) => {
      this.lost = true;
      this.onLost?.(info.message || "device lost");
    });
  }

  onLost?: (msg: string) => void;

  static async create(
    canvas: HTMLCanvasElement,
    opts: SimOptions,
  ): Promise<SlimeGPU | null> {
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
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });

    const res = opts.reducedMotion ? 512 : 1024;
    const agentCount = opts.reducedMotion ? 60_000 : 260_000;
    return new SlimeGPU(device, ctx, format, res, agentCount, opts.reducedMotion);
  }

  get isLost(): boolean {
    return this.lost;
  }

  setFood(nodes: FoodNode[]): void {
    this.foodCount = Math.min(nodes.length, MAX_NODES);
    this.foodData.fill(0);
    for (let i = 0; i < this.foodCount; i++) {
      this.foodData[i * 4 + 0] = nodes[i].x * this.res;
      this.foodData[i * 4 + 1] = nodes[i].y * this.res;
      this.foodData[i * 4 + 2] = 1;
      this.foodData[i * 4 + 3] = 1;
    }
    this.device.queue.writeBuffer(this.food, 0, this.foodData);
  }

  private writeParams(time: number): void {
    const p = new Float32Array(PARAM_FLOATS);
    const rm = this.reducedMotion;
    p[0] = this.res;
    p[1] = this.agentCount;
    p[2] = time;
    p[3] = rm ? 0.965 : 0.955; // decay (kept < 1)
    p[4] = 0.55; // sensorAngle (rad)
    p[5] = this.res / 100; // sensorDist (px)
    p[6] = 0.42; // rotAngle (rad)
    p[7] = rm ? 0.7 : 1.0; // stepSize (px)
    p[8] = this.foodCount;
    p[9] = this.res / 26; // foodSigma (px)
    p[10] = 1.1; // foodStrength
    p[11] = 0; // drift (unused reserve)
    this.device.queue.writeBuffer(this.params, 0, p);
  }

  /** Advance the sim one frame and render. Runs `substeps` sim iterations. */
  step(time: number): void {
    if (this.lost) return;
    this.writeParams(time);
    const dev = this.device;
    const enc = dev.createCommandEncoder();
    const substeps = this.reducedMotion ? 1 : 2;
    const agentGroups = Math.ceil(this.agentCount / 64);
    const diffGroups = Math.ceil(this.res / 8);

    for (let s = 0; s < substeps; s++) {
      const p = this.parity;
      // move
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(this.movePipe);
        pass.setBindGroup(0, this.moveBG[p]);
        pass.dispatchWorkgroups(agentGroups);
        pass.end();
      }
      // diffuse (reads trail[p], writes trail[1-p])
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(this.diffusePipe);
        pass.setBindGroup(0, this.diffuseBG[p]);
        pass.dispatchWorkgroups(diffGroups, diffGroups);
        pass.end();
      }
      this.parity = 1 - p;
    }

    // edges from the freshest trail (parity flipped; edgeBG[p] reads trail[1-p])
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.edgePipe);
      pass.setBindGroup(0, this.edgeBG[1 - this.parity]);
      pass.dispatchWorkgroups(1);
      pass.end();
    }

    // render
    {
      const view = this.ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.017, g: 0.145, b: 0.125, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.renderPipe);
      pass.setBindGroup(0, this.renderBG[1 - this.parity]);
      pass.draw(3);
      pass.end();
    }

    dev.queue.submit([enc.finish()]);
  }

  /**
   * Copy the tiny edge buffer to the CPU. Returns a flat MAX_NODES² matrix of
   * mean segment densities, or null if a readback is already in flight.
   */
  async readEdges(): Promise<Float32Array | null> {
    if (this.lost || this.mapping) return null;
    this.mapping = true;
    try {
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(
        this.edges,
        0,
        this.edgeStaging,
        0,
        MAX_NODES * MAX_NODES * 4,
      );
      this.device.queue.submit([enc.finish()]);
      await this.edgeStaging.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(this.edgeStaging.getMappedRange()).slice();
      this.edgeStaging.unmap();
      return out;
    } catch {
      return null;
    } finally {
      this.mapping = false;
    }
  }

  destroy(): void {
    try {
      this.trail[0].destroy();
      this.trail[1].destroy();
      this.deposit.destroy();
      this.agents.destroy();
      this.food.destroy();
      this.edges.destroy();
      this.edgeStaging.destroy();
      this.params.destroy();
      this.device.destroy();
    } catch {
      /* best effort */
    }
  }
}
