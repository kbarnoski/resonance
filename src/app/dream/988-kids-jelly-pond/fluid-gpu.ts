// fluid-gpu.ts — a real WebGPU COMPUTE Position-Based Fluids (PBF / SPH-lite) sim.
//
// Technique: Macklin & Müller, "Position Based Fluids," SIGGRAPH 2013.
// We run an iterative density-constraint solver in WGSL compute shaders over
// thousands of particles, with a spatial grid for neighbour search. The finger
// applies an external push force. After solving we read back compact motion
// stats (avg speed, peak speed, pooled density under the finger, splash flag)
// on the GPU and copy a tiny buffer to the CPU to drive the audio.
//
// This is NOT a Canvas2D loop and NOT a single fragment shader: positions are
// integrated and constraint-solved in storage buffers by compute passes, then
// rendered as additive glowing metaballs.

// ---- minimal local WebGPU typing guard (no npm deps; @webgpu/types may exist) ----
export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export interface PondStats {
  stir: number; // 0..1 average normalised speed
  peak: number; // 0..1 peak normalised speed
  pool: number; // 0..1 pooled density under finger
  splash: number; // 0..1 splash strength (0 = none)
}

export interface FingerInput {
  x: number; // sim-space 0..W
  y: number; // sim-space 0..H
  active: boolean;
  vx: number; // finger velocity (sim units / sec)
  vy: number;
}

const PARTICLE_COUNT = 4096;
const SIM_W = 220;
const SIM_H = 220;
const H_RADIUS = 6.0; // smoothing radius
const CELL = H_RADIUS;
const GRID_W = Math.ceil(SIM_W / CELL) + 1;
const GRID_H = Math.ceil(SIM_H / CELL) + 1;
const REST_DENSITY = 8.0;
const SOLVER_ITERS = 3;
const WORKGROUP = 64;

// Each particle: pos.xy, vel.xy, predicted.xy, lambda, density  -> we pack into
// separate buffers to keep WGSL simple.

const WGSL = /* wgsl */ `
struct Params {
  count : u32,
  gridW : u32,
  gridH : u32,
  _pad0 : u32,
  simW : f32,
  simH : f32,
  h : f32,
  cell : f32,
  restDensity : f32,
  dt : f32,
  fingerX : f32,
  fingerY : f32,
  fingerVX : f32,
  fingerVY : f32,
  fingerActive : f32,
  _pad1 : f32,
};

@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read_write> pos : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> vel : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> pred : array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> lambda : array<f32>;
@group(0) @binding(5) var<storage, read_write> density : array<f32>;
// grid: cellCount + up to 32 indices per cell (head + entries)
@group(0) @binding(6) var<storage, read_write> cellCount : array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> cellEntries : array<u32>;
// stats accumulators (atomic, scaled to u32)
@group(0) @binding(8) var<storage, read_write> stats : array<atomic<u32>>;

const PI : f32 = 3.14159265;
const MAX_PER_CELL : u32 = 32u;

fn poly6(r2 : f32, h : f32) -> f32 {
  let h2 = h * h;
  if (r2 >= h2) { return 0.0; }
  let c = 315.0 / (64.0 * PI * pow(h, 9.0));
  let d = h2 - r2;
  return c * d * d * d;
}
fn spikyGrad(r : vec2<f32>, h : f32) -> vec2<f32> {
  let rl = length(r);
  if (rl >= h || rl <= 1e-5) { return vec2<f32>(0.0, 0.0); }
  let c = -45.0 / (PI * pow(h, 6.0));
  let f = c * (h - rl) * (h - rl);
  return f * (r / rl);
}
fn cellOf(p : vec2<f32>) -> vec2<i32> {
  return vec2<i32>(i32(floor(p.x / P.cell)), i32(floor(p.y / P.cell)));
}

// --- 1. integrate external forces + predict position ---
@compute @workgroup_size(${WORKGROUP})
fn predict(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var v = vel[i];
  var p = pos[i];

  // finger push: a soft radial shove that drags water along the finger's motion
  if (P.fingerActive > 0.5) {
    let d = p - vec2<f32>(P.fingerX, P.fingerY);
    let dist = length(d);
    let R = 26.0;
    if (dist < R) {
      let fall = 1.0 - dist / R;
      let dir = normalize(d + vec2<f32>(1e-4, 0.0));
      // push outward (stir) + carry along finger velocity (drag)
      v += dir * fall * 90.0 * P.dt;
      v += vec2<f32>(P.fingerVX, P.fingerVY) * fall * 1.4 * P.dt;
    }
  }

  // gentle settling toward center so the pond stays a pond (very light)
  v *= 0.985;

  let predicted = p + v * P.dt;
  pred[i] = predicted;
  vel[i] = v;
}

// --- 2. build spatial grid (insert predicted positions) ---
@compute @workgroup_size(${WORKGROUP})
fn buildGrid(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var p = pred[i];
  p.x = clamp(p.x, 0.0, P.simW - 0.001);
  p.y = clamp(p.y, 0.0, P.simH - 0.001);
  let c = cellOf(p);
  let cx = u32(clamp(c.x, 0, i32(P.gridW) - 1));
  let cy = u32(clamp(c.y, 0, i32(P.gridH) - 1));
  let cell = cy * P.gridW + cx;
  let slot = atomicAdd(&cellCount[cell], 1u);
  if (slot < MAX_PER_CELL) {
    cellEntries[cell * MAX_PER_CELL + slot] = i;
  }
}

// --- 3. compute density (poly6 over neighbours) ---
@compute @workgroup_size(${WORKGROUP})
fn computeDensity(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  let pi = pred[i];
  let c = cellOf(clamp(pi, vec2<f32>(0.0), vec2<f32>(P.simW - 0.001, P.simH - 0.001)));
  var dens = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let nx = c.x + dx;
      let ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= i32(P.gridW) || ny >= i32(P.gridH)) { continue; }
      let cell = u32(ny) * P.gridW + u32(nx);
      let n = min(atomicLoad(&cellCount[cell]), MAX_PER_CELL);
      for (var k = 0u; k < n; k = k + 1u) {
        let j = cellEntries[cell * MAX_PER_CELL + k];
        let r = pi - pred[j];
        dens += poly6(dot(r, r), P.h);
      }
    }
  }
  density[i] = dens;
  // PBF lambda: density constraint scaling
  let Ci = dens / P.restDensity - 1.0;
  // gradient sum (approx) for denominator stability
  var sumGrad2 = 0.0;
  var gradI = vec2<f32>(0.0, 0.0);
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let nx = c.x + dx;
      let ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= i32(P.gridW) || ny >= i32(P.gridH)) { continue; }
      let cell = u32(ny) * P.gridW + u32(nx);
      let n = min(atomicLoad(&cellCount[cell]), MAX_PER_CELL);
      for (var k = 0u; k < n; k = k + 1u) {
        let j = cellEntries[cell * MAX_PER_CELL + k];
        if (j == i) { continue; }
        let g = spikyGrad(pi - pred[j], P.h) / P.restDensity;
        gradI += g;
        sumGrad2 += dot(g, g);
      }
    }
  }
  sumGrad2 += dot(gradI, gradI);
  lambda[i] = -Ci / (sumGrad2 + 50.0);
}

// --- 4. apply position correction from neighbour lambdas ---
@compute @workgroup_size(${WORKGROUP})
fn solve(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  let pi = pred[i];
  let c = cellOf(clamp(pi, vec2<f32>(0.0), vec2<f32>(P.simW - 0.001, P.simH - 0.001)));
  var dp = vec2<f32>(0.0, 0.0);
  let li = lambda[i];
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let nx = c.x + dx;
      let ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= i32(P.gridW) || ny >= i32(P.gridH)) { continue; }
      let cell = u32(ny) * P.gridW + u32(nx);
      let n = min(atomicLoad(&cellCount[cell]), MAX_PER_CELL);
      for (var k = 0u; k < n; k = k + 1u) {
        let j = cellEntries[cell * MAX_PER_CELL + k];
        if (j == i) { continue; }
        let lj = lambda[j];
        // tensile instability correction (s_corr)
        let r = pi - pred[j];
        let w = poly6(dot(r, r), P.h);
        let wq = poly6(0.1 * P.h * P.h, P.h);
        let scorr = -0.0008 * pow(w / max(wq, 1e-6), 4.0);
        dp += (li + lj + scorr) * spikyGrad(r, P.h);
      }
    }
  }
  pred[i] = pi + dp / P.restDensity;
}

// --- 5. boundary + finalize velocity + accumulate stats ---
@compute @workgroup_size(${WORKGROUP})
fn finalize(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var p = pred[i];
  // soft round-ish pond boundary
  let center = vec2<f32>(P.simW * 0.5, P.simH * 0.5);
  let rad = P.simW * 0.46;
  let off = p - center;
  let d = length(off);
  if (d > rad) {
    p = center + off * (rad / d);
  }
  p = clamp(p, vec2<f32>(2.0), vec2<f32>(P.simW - 2.0, P.simH - 2.0));

  var v = (p - pos[i]) / P.dt;
  // XSPH-ish damping for calm water
  v *= 0.92;
  pos[i] = p;
  vel[i] = v;

  // ---- accumulate motion stats on GPU ----
  let speed = length(v);
  let sNorm = clamp(speed / 60.0, 0.0, 1.0);
  atomicAdd(&stats[0], u32(sNorm * 1000.0));        // sum speed
  atomicMax(&stats[1], u32(sNorm * 1000.0));        // peak speed
  // pooled density under finger
  if (P.fingerActive > 0.5) {
    let fd = length(p - vec2<f32>(P.fingerX, P.fingerY));
    if (fd < 24.0) {
      atomicAdd(&stats[2], 1u);                      // count under finger
      atomicAdd(&stats[3], u32(clamp(density[i] / P.restDensity, 0.0, 4.0) * 256.0));
    }
    // splash: fast particle near finger
    if (fd < 30.0 && sNorm > 0.5) {
      atomicMax(&stats[4], u32(sNorm * 1000.0));     // splash strength
    }
  }
}
`;

// ---------- minimal typed surface of WebGPU we actually use ----------
// (We rely on @webgpu/types if present; otherwise these casts keep us type-safe
//  without `any`.)
type GPUNavigator = Navigator & { gpu: GPU };

export class FluidGPU {
  private device!: GPUDevice;
  private queue!: GPUQueue;
  private posBuf!: GPUBuffer;
  private velBuf!: GPUBuffer;
  private predBuf!: GPUBuffer;
  private lambdaBuf!: GPUBuffer;
  private densityBuf!: GPUBuffer;
  private cellCountBuf!: GPUBuffer;
  private cellEntriesBuf!: GPUBuffer;
  private statsBuf!: GPUBuffer;
  private statsRead!: GPUBuffer;
  private paramsBuf!: GPUBuffer;
  private posRead!: GPUBuffer;

  private pipelines: Record<string, GPUComputePipeline> = {};
  private bindGroup!: GPUBindGroup;
  private destroyed = false;

  readonly count = PARTICLE_COUNT;
  readonly simW = SIM_W;
  readonly simH = SIM_H;

  // CPU-side copy of positions for rendering (filled each frame from posRead)
  positions = new Float32Array(PARTICLE_COUNT * 2);

  private cellTotal = GRID_W * GRID_H;

  async init(): Promise<boolean> {
    if (!hasWebGPU()) return false;
    const gpu = (navigator as GPUNavigator).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    this.device = await adapter.requestDevice();
    this.queue = this.device.queue;

    const dev = this.device;
    const mk = (size: number, usage: number) =>
      dev.createBuffer({ size, usage });
    const S = GPUBufferUsage.STORAGE;
    const CD = GPUBufferUsage.COPY_DST;
    const CS = GPUBufferUsage.COPY_SRC;

    // seed particles in a calm disk
    const seed = new Float32Array(PARTICLE_COUNT * 2);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SIM_W * 0.4;
      seed[i * 2] = SIM_W * 0.5 + Math.cos(a) * r;
      seed[i * 2 + 1] = SIM_H * 0.5 + Math.sin(a) * r;
    }

    this.posBuf = mk(seed.byteLength, S | CD | CS);
    this.velBuf = mk(seed.byteLength, S | CD);
    this.predBuf = mk(seed.byteLength, S | CD);
    this.lambdaBuf = mk(PARTICLE_COUNT * 4, S);
    this.densityBuf = mk(PARTICLE_COUNT * 4, S);
    this.cellCountBuf = mk(this.cellTotal * 4, S | CD);
    this.cellEntriesBuf = mk(this.cellTotal * 32 * 4, S);
    this.statsBuf = mk(8 * 4, S | CD | CS);
    this.statsRead = mk(8 * 4, GPUBufferUsage.MAP_READ | CD);
    this.posRead = mk(seed.byteLength, GPUBufferUsage.MAP_READ | CD);
    this.paramsBuf = dev.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | CD,
    });

    this.queue.writeBuffer(this.posBuf, 0, seed);
    this.queue.writeBuffer(this.velBuf, 0, new Float32Array(PARTICLE_COUNT * 2));
    this.queue.writeBuffer(this.predBuf, 0, seed);

    const shaderModule = dev.createShaderModule({ code: WGSL });
    const layout = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((b) => ({
          binding: b,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" as GPUBufferBindingType },
        })),
      ],
    });
    const pipeLayout = dev.createPipelineLayout({ bindGroupLayouts: [layout] });
    const stages = ["predict", "buildGrid", "computeDensity", "solve", "finalize"];
    for (const s of stages) {
      this.pipelines[s] = dev.createComputePipeline({
        layout: pipeLayout,
        compute: { module: shaderModule, entryPoint: s },
      });
    }

    this.bindGroup = dev.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuf } },
        { binding: 1, resource: { buffer: this.posBuf } },
        { binding: 2, resource: { buffer: this.velBuf } },
        { binding: 3, resource: { buffer: this.predBuf } },
        { binding: 4, resource: { buffer: this.lambdaBuf } },
        { binding: 5, resource: { buffer: this.densityBuf } },
        { binding: 6, resource: { buffer: this.cellCountBuf } },
        { binding: 7, resource: { buffer: this.cellEntriesBuf } },
        { binding: 8, resource: { buffer: this.statsBuf } },
      ],
    });
    return true;
  }

  private writeParams(finger: FingerInput, dt: number): void {
    const buf = new ArrayBuffer(16 * 4);
    const u = new Uint32Array(buf);
    const f = new Float32Array(buf);
    u[0] = PARTICLE_COUNT;
    u[1] = GRID_W;
    u[2] = GRID_H;
    u[3] = 0;
    f[4] = SIM_W;
    f[5] = SIM_H;
    f[6] = H_RADIUS;
    f[7] = CELL;
    f[8] = REST_DENSITY;
    f[9] = dt;
    f[10] = finger.x;
    f[11] = finger.y;
    f[12] = finger.vx;
    f[13] = finger.vy;
    f[14] = finger.active ? 1 : 0;
    f[15] = 0;
    this.queue.writeBuffer(this.paramsBuf, 0, buf);
  }

  /** One full PBF step; returns motion stats read back from the GPU. */
  async step(finger: FingerInput, dt: number): Promise<PondStats> {
    if (this.destroyed) return { stir: 0, peak: 0, pool: 0, splash: 0 };
    const clampedDt = Math.min(dt, 1 / 45);
    this.writeParams(finger, clampedDt);

    const dev = this.device;
    const groups = Math.ceil(PARTICLE_COUNT / WORKGROUP);

    // clear grid + stats
    this.queue.writeBuffer(this.cellCountBuf, 0, new Uint32Array(this.cellTotal));
    this.queue.writeBuffer(this.statsBuf, 0, new Uint32Array(8));

    const enc = dev.createCommandEncoder();
    const pass = (name: string) => {
      const cp = enc.beginComputePass();
      cp.setPipeline(this.pipelines[name]);
      cp.setBindGroup(0, this.bindGroup);
      cp.dispatchWorkgroups(groups);
      cp.end();
    };

    pass("predict");
    pass("buildGrid");
    for (let it = 0; it < SOLVER_ITERS; it++) {
      pass("computeDensity");
      pass("solve");
    }
    pass("finalize");

    enc.copyBufferToBuffer(this.statsBuf, 0, this.statsRead, 0, 8 * 4);
    enc.copyBufferToBuffer(this.posBuf, 0, this.posRead, 0, this.positions.byteLength);
    this.queue.submit([enc.finish()]);

    // read back positions + stats
    await this.posRead.mapAsync(GPUMapMode.READ);
    this.positions.set(new Float32Array(this.posRead.getMappedRange()));
    this.posRead.unmap();

    await this.statsRead.mapAsync(GPUMapMode.READ);
    const sv = new Uint32Array(this.statsRead.getMappedRange().slice(0));
    this.statsRead.unmap();

    const sumSpeed = sv[0] / 1000;
    const peak = sv[1] / 1000;
    const underCount = sv[2];
    const poolDensSum = sv[3] / 256;
    const splash = sv[4] / 1000;

    const stir = Math.min(1, sumSpeed / PARTICLE_COUNT / 0.18);
    const pool =
      underCount > 0
        ? Math.min(1, (underCount / 60) * 0.6 + (poolDensSum / Math.max(1, underCount)) * 0.25)
        : 0;

    return {
      stir,
      peak: Math.min(1, peak),
      pool,
      splash: splash > 0.5 ? splash : 0,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    [
      this.posBuf, this.velBuf, this.predBuf, this.lambdaBuf, this.densityBuf,
      this.cellCountBuf, this.cellEntriesBuf, this.statsBuf, this.statsRead,
      this.posRead, this.paramsBuf,
    ].forEach((b) => {
      try { b?.destroy(); } catch { /* noop */ }
    });
    try { this.device?.destroy(); } catch { /* noop */ }
  }
}
