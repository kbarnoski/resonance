/**
 * gpu.ts — WebGPU MLS-MPM sand simulation
 *
 * Uses compute shaders to run the full MLS-MPM pipeline on the GPU:
 *   1. clearGrid compute pass
 *   2. p2g (particle-to-grid scatter)
 *   3. gridUpdate (gravity + boundary conditions)
 *   4. g2p (grid-to-particle gather + plasticity)
 *   5. renderParticles (render pass: point sprites with desert colour palette)
 *
 * Grid: 128×128 cells
 * Particles: 6000
 *
 * References:
 *   Hu, Fang, Ge, Qu, Stomakhin, Jiang — MLS-MPM (SIGGRAPH 2018)
 *   taichi mpm88 / mpm99
 */

/// <reference types="@webgpu/types" />

export const GPU_GRID = 128;
export const GPU_N = 6000;
const WG_SIZE = 64;

/* ── WGSL: shared structs ───────────────────────────────────────────────────── */

const STRUCT_WGSL = /* wgsl */ `
struct Particle {
  pos   : vec2f,    // [0,1]²
  vel   : vec2f,
  F     : mat2x2f,  // deformation gradient (col0, col1)
  C     : mat2x2f,  // APIC affine momentum
  Jp    : f32,      // volume change
  pad0  : f32,
  pad1  : f32,
  pad2  : f32,
  // stride = 64 bytes = 16 f32 (matches JS layout)
}

struct GridNode {
  vel  : vec2f,
  mass : f32,
  pad  : f32,
}

struct Uniforms {
  gravX   : f32,
  gravY   : f32,
  dt      : f32,
  nPart   : u32,
  gridN   : u32,
  p0 : f32, p1 : f32, p2 : f32,
}
`;

/* ── WGSL: clear grid ──────────────────────────────────────────────────────── */

const CLEAR_WGSL = /* wgsl */ `
${STRUCT_WGSL}
@group(0) @binding(1) var<storage, read_write> grid: array<GridNode>;
@group(0) @binding(2) var<uniform> u: Uniforms;

@compute @workgroup_size(${WG_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.gridN * u.gridN) { return; }
  grid[i].vel  = vec2f(0.0);
  grid[i].mass = 0.0;
  grid[i].pad  = 0.0;
}`;

/* ── WGSL: P2G scatter ─────────────────────────────────────────────────────── */

const P2G_WGSL = /* wgsl */ `
${STRUCT_WGSL}
@group(0) @binding(0) var<storage, read>       parts: array<Particle>;
@group(0) @binding(1) var<storage, read_write> grid:  array<GridNode>;
@group(0) @binding(2) var<uniform>             u:     Uniforms;

// mpm88-style quadratic B-spline weights: fx = particle_pos*inv - base_index, fx in [0.5,1.5]
// Returns w[0..2] for nodes base, base+1, base+2.
fn mpm_weights(fx: f32) -> vec3f {
  return vec3f(
    0.5 * (1.5 - fx) * (1.5 - fx),
    0.75 - (fx - 1.0) * (fx - 1.0),
    0.5 * (fx - 0.5) * (fx - 0.5)
  );
}

@compute @workgroup_size(${WG_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= u.nPart) { return; }

  let p   = parts[pi];
  let gN  = f32(u.gridN);
  let inv = gN;
  let dx  = 1.0 / gN;
  let E   = 400.0;
  let nu  = 0.2;
  let mu0 = E / (2.0 * (1.0 + nu));
  let lam = E * nu / ((1.0 + nu) * (1.0 - 2.0 * nu));

  let J  = max(0.2, determinant(p.F));
  let lJ = log(J);

  // Simplified neo-Hookean Piola-Kirchhoff stress
  // P ≈ 2μ(F-I) + λ log(J) I
  let I2  = mat2x2f(1.0, 0.0, 0.0, 1.0);
  let P   = 2.0 * mu0 * (p.F - I2) + lam * lJ * I2;
  let K   = -u.dt * 4.0 * inv * inv * 0.5 * dx * dx * P;

  let base_f = p.pos * inv - 0.5;
  let base_i = vec2i(i32(base_f.x), i32(base_f.y));
  // fx, fy: fractional offset into [0.5, 1.5]
  let fx  = base_f.x - f32(base_i.x) + 0.5;
  let fy  = base_f.y - f32(base_i.y) + 0.5;
  let wx  = mpm_weights(fx);
  let wy  = mpm_weights(fy);

  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      let ni = base_i + vec2i(i, j);
      if (ni.x < 0 || ni.x >= i32(u.gridN) || ni.y < 0 || ni.y >= i32(u.gridN)) { continue; }

      let nf   = vec2f(f32(ni.x), f32(ni.y));
      let w    = wx[i] * wy[j];
      let dpos = (nf - p.pos * inv) * dx;

      let affine_v = p.vel + p.C * dpos;
      let stress_v = K * dpos;

      let gIdx = u32(ni.y) * u.gridN + u32(ni.x);

      // Note: racy f32 adds (no atomics in WebGPU for f32) — acceptable for MPM.
      grid[gIdx].mass += w;
      grid[gIdx].vel  += w * (affine_v + stress_v);
    }
  }
}`;

/* ── WGSL: grid update (gravity + boundary) ────────────────────────────────── */

const GRID_WGSL = /* wgsl */ `
${STRUCT_WGSL}
@group(0) @binding(1) var<storage, read_write> grid: array<GridNode>;
@group(0) @binding(2) var<uniform> u: Uniforms;

@compute @workgroup_size(${WG_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let gN = u.gridN;
  if (i >= gN * gN) { return; }
  let m = grid[i].mass;
  if (m < 1e-8) { return; }

  var v = grid[i].vel / m;
  v.x += u.gravX * u.dt * 80.0;
  v.y += u.gravY * u.dt * 80.0;

  // Boundary: 2-cell margin
  let ix = i32(i % gN);
  let iy = i32(i / gN);
  let mg = 2;
  if (ix < mg)               { v.x = max(0.0, v.x); }
  if (ix >= i32(gN) - mg)    { v.x = min(0.0, v.x); }
  if (iy < mg)               { v.y = max(0.0, v.y); }
  if (iy >= i32(gN) - mg)    { v.y = min(0.0, v.y); }

  grid[i].vel = v;
}`;

/* ── WGSL: G2P gather + plasticity ─────────────────────────────────────────── */

const G2P_WGSL = /* wgsl */ `
${STRUCT_WGSL}
@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<storage, read>       grid:  array<GridNode>;
@group(0) @binding(2) var<uniform>             u:     Uniforms;

fn mpm_weights(fx: f32) -> vec3f {
  return vec3f(
    0.5 * (1.5 - fx) * (1.5 - fx),
    0.75 - (fx - 1.0) * (fx - 1.0),
    0.5 * (fx - 0.5) * (fx - 0.5)
  );
}

// Polar decomposition 2×2: returns R (rotation part)
fn polar_R(F: mat2x2f) -> mat2x2f {
  // F[col][row] in WGSL column-major
  let x   = F[0][0] + F[1][1];
  let y   = F[1][0] - F[0][1];
  let sc  = sqrt(x * x + y * y);
  let c   = select(x / sc, 1.0, sc < 1e-8);
  let s   = select(y / sc, 0.0, sc < 1e-8);
  // R = [[c,-s],[s,c]] → col0=(c,s), col1=(-s,c) in WGSL column-major
  return mat2x2f(c, s, -s, c);
}

@compute @workgroup_size(${WG_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= u.nPart) { return; }

  var p    = parts[pi];
  let gN   = u.gridN;
  let inv  = f32(gN);
  let dx   = 1.0 / f32(gN);

  let base_f = p.pos * inv - 0.5;
  let base_i = vec2i(i32(base_f.x), i32(base_f.y));
  let fx     = base_f.x - f32(base_i.x) + 0.5;
  let fy     = base_f.y - f32(base_i.y) + 0.5;
  let wx     = mpm_weights(fx);
  let wy     = mpm_weights(fy);

  var newV  = vec2f(0.0);
  var newC  = mat2x2f(0.0, 0.0, 0.0, 0.0);

  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      let ni = base_i + vec2i(i, j);
      if (ni.x < 0 || ni.x >= i32(gN) || ni.y < 0 || ni.y >= i32(gN)) { continue; }

      let nf   = vec2f(f32(ni.x), f32(ni.y));
      let w    = wx[i] * wy[j];
      let gIdx = u32(ni.y) * gN + u32(ni.x);
      let gv   = grid[gIdx].vel;

      newV += w * gv;

      let dpos = (nf - p.pos * inv) * dx;
      newC += 4.0 * inv * inv * w * mat2x2f(
        gv.x * dpos.x, gv.x * dpos.y,
        gv.y * dpos.x, gv.y * dpos.y
      );
    }
  }

  p.vel = newV;
  p.C   = newC;
  p.pos = clamp(p.pos + newV * u.dt, vec2f(0.01), vec2f(0.99));

  // Update F: F_new = (I + dt*C) * F
  let I_plus_C = mat2x2f(
    1.0 + u.dt * newC[0][0], u.dt * newC[0][1],
    u.dt * newC[1][0],       1.0 + u.dt * newC[1][1]
  );
  var newF = I_plus_C * p.F;

  // Drucker-Prager plasticity (simplified)
  let sinPhi = 0.5;  // sin(30°) ≈ 0.5
  let alpha  = 0.8165 * sinPhi / sqrt(3.0 - sinPhi * sinPhi);
  let J      = max(0.2, determinant(newF));
  let logJ   = log(J);
  let R      = polar_R(newF);
  // Shear strain ~ ||F - R||
  let diff   = newF - R;
  let shear  = sqrt(diff[0][0]*diff[0][0] + diff[0][1]*diff[0][1]
                  + diff[1][0]*diff[1][0] + diff[1][1]*diff[1][1]);
  let yld    = shear + alpha * logJ;

  if (yld > 0.0 && logJ < 0.0) {
    let sc = 1.0 - min(0.3, yld * 0.12);
    newF = R + sc * (newF - R);
    p.Jp = clamp(p.Jp * max(0.95, 1.0 - yld * 0.04), 0.8, 1.2);
  }

  p.F = newF;
  parts[pi] = p;
}`;

/* ── WGSL: render particles (point sprites) ─────────────────────────────────── */

const VERT_WGSL = /* wgsl */ `
${STRUCT_WGSL}
struct RenderUni {
  width:  f32,
  height: f32,
  psize:  f32,
  pad:    f32,
}

@group(0) @binding(0) var<storage, read> parts: array<Particle>;
@group(0) @binding(3) var<uniform>       ru:    RenderUni;

struct VO {
  @builtin(position) pos : vec4f,
  @location(0) speed     : f32,
  @location(1) height    : f32,
  @location(2) uv        : vec2f,
}

const OFFSETS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0)
);

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let pi  = vi / 6u;
  let ci  = vi % 6u;
  let p   = parts[pi];

  // NDC position (flip y so y=0 is bottom)
  let ndc = vec2f(p.pos.x * 2.0 - 1.0, p.pos.y * 2.0 - 1.0);
  let off = OFFSETS[ci];

  // Pixel size of sprite
  let ps  = ru.psize;
  let ndcOff = vec2f(off.x * ps / ru.width, off.y * ps / ru.height);

  let spd = length(p.vel);

  var o: VO;
  o.pos    = vec4f(ndc + ndcOff, 0.0, 1.0);
  o.speed  = clamp(spd * 2.0, 0.0, 1.0);
  o.height = p.pos.y;
  o.uv     = off;
  return o;
}`;

const FRAG_WGSL = /* wgsl */ `
@fragment fn fs(
  @location(0) speed  : f32,
  @location(1) height : f32,
  @location(2) uv     : vec2f,
) -> @location(0) vec4f {
  let d = length(uv);
  if (d > 1.0) { discard; }
  let a = 1.0 - smoothstep(0.5, 1.0, d);

  // Desert dusk palette: deep umber (base) → amber → pale gold (highlights)
  // Low: rgb(72,38,18) → Mid: rgb(180,100,30) → High: rgb(240,200,120)
  let low  = vec3f(0.282, 0.149, 0.071);  // deep umber
  let mid  = vec3f(0.706, 0.392, 0.118);  // amber
  let high = vec3f(0.941, 0.784, 0.471);  // pale gold

  // Colour by height (base to tip) + speed highlight on slip face
  let h01  = clamp(height * 1.4 - 0.1, 0.0, 1.0);
  var col  = select(mix(low, mid, h01 * 2.0), mix(mid, high, (h01 - 0.5) * 2.0), h01 > 0.5);

  // Speed → brighter / whiter during avalanche
  col = mix(col, vec3f(0.98, 0.92, 0.78), speed * 0.55);

  return vec4f(col, a * 0.88);
}`;

/* ── GPU State ──────────────────────────────────────────────────────────────── */

export interface GpuDune {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  particleBuf: GPUBuffer;
  gridBuf: GPUBuffer;
  uniformBuf: GPUBuffer;
  renderUniBuf: GPUBuffer;
  clearPipeline: GPUComputePipeline;
  p2gPipeline: GPUComputePipeline;
  gridPipeline: GPUComputePipeline;
  g2pPipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  computeBG: GPUBindGroup;
  renderBG: GPUBindGroup;
  // Audio readback
  readbackBuf: GPUBuffer;
  statsFromLastFrame: Float32Array;
}

function buildInitialParticles(): Float32Array {
  // Each particle: pos(2) + vel(2) + F(4, mat2x2) + C(4, mat2x2) + Jp(1) + pad(1) = 14 f32 → pad to 16
  const FLOATS_PER = 16;
  const data = new Float32Array(GPU_N * FLOATS_PER);
  const cx = 0.5;

  for (let i = 0; i < GPU_N; i++) {
    const t = i / GPU_N;
    const layer = Math.floor(t * 40);
    const layerT = t * 40 - layer;
    const halfW = 0.23 * (1 - layer / 40) + 0.01;
    const px = cx + (layerT - 0.5) * 2 * halfW + (Math.random() - 0.5) * 0.006;
    const py = 0.05 + (layer / 40) * 0.42 + (Math.random() - 0.5) * 0.006;

    const base = i * FLOATS_PER;
    data[base + 0] = Math.max(0.02, Math.min(0.98, px)); // pos.x
    data[base + 1] = Math.max(0.02, Math.min(0.95, py)); // pos.y
    data[base + 2] = 0; // vel.x
    data[base + 3] = 0; // vel.y
    // F (identity mat2x2): col0=(1,0), col1=(0,1)
    data[base + 4] = 1; data[base + 5] = 0; // F col0
    data[base + 6] = 0; data[base + 7] = 1; // F col1
    // C = zero
    data[base + 8] = 0; data[base + 9] = 0;
    data[base + 10] = 0; data[base + 11] = 0;
    data[base + 12] = 1; // Jp
    data[base + 13] = 0; // pad
    // 14,15 unused pad
  }
  return data;
}

export async function buildGpuDune(canvas: HTMLCanvasElement): Promise<GpuDune> {
  if (!navigator.gpu) throw new Error("WebGPU not available");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("No WebGPU canvas context");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const FLOATS_PER_PARTICLE = 16;
  const particleBuf = device.createBuffer({
    size: GPU_N * FLOATS_PER_PARTICLE * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const initData = buildInitialParticles();
  device.queue.writeBuffer(particleBuf, 0, initData as unknown as Float32Array<ArrayBuffer>);

  // Grid: (GridNode = vec2f vel + f32 mass + f32 pad) = 4 floats
  const FLOATS_PER_NODE = 4;
  const gridBuf = device.createBuffer({
    size: GPU_GRID * GPU_GRID * FLOATS_PER_NODE * 4,
    usage: GPUBufferUsage.STORAGE,
  });

  // Uniforms: gravX, gravY, dt, nPart, gridN, pad×3
  const uniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Render uniforms: width, height, psize, pad
  const renderUniBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Readback buffer (first 64 particles' positions + velocities for audio)
  const READBACK_PARTICLES = 64;
  const readbackBuf = device.createBuffer({
    size: READBACK_PARTICLES * FLOATS_PER_PARTICLE * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // ── Pipelines ─────────────────────────────────────────────────────────────
  const clearPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: CLEAR_WGSL }), entryPoint: "main" },
  });

  const p2gPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: P2G_WGSL }), entryPoint: "main" },
  });

  const gridPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: GRID_WGSL }), entryPoint: "main" },
  });

  const g2pPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: G2P_WGSL }), entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: VERT_WGSL }), entryPoint: "vs" },
    fragment: {
      module: device.createShaderModule({ code: FRAG_WGSL }),
      entryPoint: "fs",
      targets: [{
        format: fmt,
        blend: {
          color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "zero" },
        },
      }],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = device.createBindGroup({
    layout: p2gPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: uniformBuf } },
    ],
  });

  const clearBG = device.createBindGroup({
    layout: clearPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: uniformBuf } },
    ],
  });

  const gridBG = device.createBindGroup({
    layout: gridPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: uniformBuf } },
    ],
  });

  const g2pBG = device.createBindGroup({
    layout: g2pPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: uniformBuf } },
    ],
  });

  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 3, resource: { buffer: renderUniBuf } },
    ],
  });

  // Attach clearBG and gridBG as properties for use in stepGpu
  // (We'll use an extended interface trick — just close over them)
  const bgExtra = { clearBG, gridBG, g2pBG };

  const gpuDune: GpuDune & { _bg: typeof bgExtra } = {
    device,
    ctx,
    particleBuf,
    gridBuf,
    uniformBuf,
    renderUniBuf,
    clearPipeline,
    p2gPipeline,
    gridPipeline,
    g2pPipeline,
    renderPipeline,
    computeBG,
    renderBG,
    readbackBuf,
    statsFromLastFrame: new Float32Array(3),
    _bg: bgExtra,
  };

  return gpuDune as GpuDune;
}

interface GpuDuneInternal extends GpuDune {
  _bg: {
    clearBG: GPUBindGroup;
    gridBG: GPUBindGroup;
    g2pBG: GPUBindGroup;
  };
}

export function stepGpuDune(
  gpuRaw: GpuDune,
  gravX: number,
  gravY: number,
  width: number,
  height: number,
  substeps = 3
): void {
  const gpu = gpuRaw as GpuDuneInternal;
  const { device } = gpu;

  // Write uniforms
  const uni = new Float32Array(8);
  uni[0] = gravX;
  uni[1] = gravY;
  uni[2] = 1 / 120;  // dt per substep
  // Write nPart and gridN as uint32
  const uniU32 = new Uint32Array(uni.buffer);
  uniU32[3] = GPU_N;
  uniU32[4] = GPU_GRID;
  device.queue.writeBuffer(gpu.uniformBuf, 0, uni as unknown as Float32Array<ArrayBuffer>);

  // Write render uniforms
  const ru = new Float32Array([width, height, 3.5, 0]);
  device.queue.writeBuffer(gpu.renderUniBuf, 0, ru as unknown as Float32Array<ArrayBuffer>);

  const cmd = device.createCommandEncoder();

  for (let s = 0; s < substeps; s++) {
    // 1. Clear grid
    const cp1 = cmd.beginComputePass();
    cp1.setPipeline(gpu.clearPipeline);
    cp1.setBindGroup(0, gpu._bg.clearBG);
    cp1.dispatchWorkgroups(Math.ceil((GPU_GRID * GPU_GRID) / WG_SIZE));
    cp1.end();

    // 2. P2G
    const cp2 = cmd.beginComputePass();
    cp2.setPipeline(gpu.p2gPipeline);
    cp2.setBindGroup(0, gpu.computeBG);
    cp2.dispatchWorkgroups(Math.ceil(GPU_N / WG_SIZE));
    cp2.end();

    // 3. Grid update
    const cp3 = cmd.beginComputePass();
    cp3.setPipeline(gpu.gridPipeline);
    cp3.setBindGroup(0, gpu._bg.gridBG);
    cp3.dispatchWorkgroups(Math.ceil((GPU_GRID * GPU_GRID) / WG_SIZE));
    cp3.end();

    // 4. G2P
    const cp4 = cmd.beginComputePass();
    cp4.setPipeline(gpu.g2pPipeline);
    cp4.setBindGroup(0, gpu._bg.g2pBG);
    cp4.dispatchWorkgroups(Math.ceil(GPU_N / WG_SIZE));
    cp4.end();
  }

  // 5. Render pass
  const rp = cmd.beginRenderPass({
    colorAttachments: [{
      view: gpu.ctx.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0.04, g: 0.027, b: 0.016, a: 1 },
      storeOp: "store",
    }],
  });
  rp.setPipeline(gpu.renderPipeline);
  rp.setBindGroup(0, gpu.renderBG);
  rp.draw(GPU_N * 6);
  rp.end();

  // Copy first 64 particles for audio analysis
  cmd.copyBufferToBuffer(
    gpu.particleBuf, 0,
    gpu.readbackBuf, 0,
    Math.min(64 * 16 * 4, gpu.readbackBuf.size)
  );

  device.queue.submit([cmd.finish()]);
}

/** Read back particle stats for audio synthesis (async, non-blocking) */
export async function readGpuStats(gpu: GpuDune): Promise<Float32Array> {
  const { readbackBuf } = gpu;
  if (readbackBuf.mapState !== "unmapped") return gpu.statsFromLastFrame;

  await readbackBuf.mapAsync(GPUMapMode.READ, 0, readbackBuf.size);
  const data = new Float32Array(readbackBuf.getMappedRange().slice(0));
  readbackBuf.unmap();

  // Compute aggregate stats from sampled particles
  const nSampled = data.length / 16;
  let totalKE = 0;
  let totalShear = 0;
  let maxAvalanche = 0;

  for (let i = 0; i < nSampled; i++) {
    const base = i * 16;
    const vx = data[base + 2];
    const vy = data[base + 3];
    const speed2 = vx * vx + vy * vy;
    totalKE += speed2;
    // C matrix shear: C[0][1] and C[1][0]
    const cxy = data[base + 9];
    const cyx = data[base + 10];
    totalShear += Math.abs(cxy) + Math.abs(cyx);
    if (speed2 > 0.5) maxAvalanche = Math.max(maxAvalanche, Math.sqrt(speed2) - 0.7);
  }

  const norm = 1 / nSampled;
  const result = new Float32Array([
    Math.min(1, totalKE * norm * 0.8),
    Math.min(1, totalShear * norm * 3),
    Math.min(1, maxAvalanche * 0.4),
  ]);

  gpu.statsFromLastFrame = result;
  return result;
}
