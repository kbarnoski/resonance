// ─────────────────────────────────────────────────────────────────────────────
// WebGPU compute backend — the PRIMARY substrate.
//
// The same Boussinesq Rayleigh–Bénard math as the WebGL2 fallback, but the
// fields (temperature, vorticity, streamfunction) live in storage buffers and
// every stage is a compute pass:
//   csT  — advect + diffuse temperature, reset hot/cold boundary
//   csW  — advect + diffuse vorticity, add buoyancy source
//   csP  — Jacobi Poisson ∇²ψ = −ω (dispatched POISSON_ITERS times)
//   render — full-screen fragment reads the buffers → molten canvas
//   csProbe — coarse reduction copied to a staging buffer, mapAsync for audio
//
// WebGPU is untestable in the build environment (no navigator.gpu), so the
// WebGL2 fallback is the workhorse; this path is written to mirror it exactly.
// Handles are untyped (@webgpu/types is not installed) — one narrow `any` alias.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SIM_W,
  SIM_H,
  POISSON_ITERS,
  PROBE_COLS,
  PROBE_ROWS,
  type Backend,
  type ProbeGrid,
  type SimStep,
} from "./sim";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wgpu = any;

const BUF_UNIFORM = 0x0040;
const BUF_STORAGE = 0x0080;
const BUF_COPY_SRC = 0x0004;
const BUF_COPY_DST = 0x0008;
const BUF_MAP_READ = 0x0001;
const MAP_READ = 0x0001;

// Shared WGSL helpers, parameterised by which storage array they sample. Each
// compute module pastes this after declaring `field` / `psi` bindings.
const HELPERS = /* wgsl */ `
struct Params { dims: vec2<u32>, dt: f32, kappa: f32, nu: f32, buoy: f32, damp: f32, grav: vec2<f32> };
fn widx(x: i32, y: i32) -> u32 {
  let w = i32(P.dims.x); let h = i32(P.dims.y);
  let xx = ((x % w) + w) % w;               // horizontal wrap
  let yy = clamp(y, 0, h - 1);              // vertical clamp
  return u32(yy * w + xx);
}
`;

const CS_T = /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       tin  : array<f32>;
@group(0) @binding(2) var<storage, read>       psi  : array<f32>;
@group(0) @binding(3) var<storage, read_write> tout : array<f32>;
${HELPERS}
fn sampT(px: f32, py: f32) -> f32 {
  let fx = floor(px); let fy = floor(py);
  let ix = i32(fx); let iy = i32(fy);
  let tx = px - fx; let ty = py - fy;
  let a = tin[widx(ix,   iy  )];
  let b = tin[widx(ix+1, iy  )];
  let c = tin[widx(ix,   iy+1)];
  let d = tin[widx(ix+1, iy+1)];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}
fn velAt(x: i32, y: i32) -> vec2<f32> {
  let u =  (psi[widx(x,   y+1)] - psi[widx(x,   y-1)]) * 0.5;
  let v = -(psi[widx(x+1, y  )] - psi[widx(x-1, y  )]) * 0.5;
  return vec2<f32>(u, v);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.dims.x || gid.y >= P.dims.y) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  var vel = velAt(x, y);
  let sp = length(vel); if (sp > 4.0) { vel = vel * (4.0 / sp); }
  let bp = vec2<f32>(f32(x), f32(y)) - P.dt * vel;
  var t = sampT(bp.x, bp.y);
  let lap = tin[widx(x+1,y)] + tin[widx(x-1,y)] + tin[widx(x,y+1)] + tin[widx(x,y-1)] - 4.0 * tin[widx(x,y)];
  t = t + P.kappa * lap;
  if (y == 0) { t = 1.0; }
  if (y == i32(P.dims.y) - 1) { t = 0.0; }
  tout[widx(x, y)] = clamp(t, 0.0, 1.0);
}
`;

const CS_W = /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       win  : array<f32>;
@group(0) @binding(2) var<storage, read>       psi  : array<f32>;
@group(0) @binding(3) var<storage, read>       temp : array<f32>;
@group(0) @binding(4) var<storage, read_write> wout : array<f32>;
${HELPERS}
fn sampW(px: f32, py: f32) -> f32 {
  let fx = floor(px); let fy = floor(py);
  let ix = i32(fx); let iy = i32(fy);
  let tx = px - fx; let ty = py - fy;
  let a = win[widx(ix,   iy  )];
  let b = win[widx(ix+1, iy  )];
  let c = win[widx(ix,   iy+1)];
  let d = win[widx(ix+1, iy+1)];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}
fn velAt(x: i32, y: i32) -> vec2<f32> {
  let u =  (psi[widx(x,   y+1)] - psi[widx(x,   y-1)]) * 0.5;
  let v = -(psi[widx(x+1, y  )] - psi[widx(x-1, y  )]) * 0.5;
  return vec2<f32>(u, v);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.dims.x || gid.y >= P.dims.y) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  var vel = velAt(x, y);
  let sp = length(vel); if (sp > 4.0) { vel = vel * (4.0 / sp); }
  let bp = vec2<f32>(f32(x), f32(y)) - P.dt * vel;
  var w = sampW(bp.x, bp.y);
  let lap = win[widx(x+1,y)] + win[widx(x-1,y)] + win[widx(x,y+1)] + win[widx(x,y-1)] - 4.0 * win[widx(x,y)];
  w = w + P.nu * lap;
  let dTdx = (temp[widx(x+1,y)] - temp[widx(x-1,y)]) * 0.5;
  let dTdy = (temp[widx(x,y+1)] - temp[widx(x,y-1)]) * 0.5;
  w = w + P.dt * P.buoy * (P.grav.x * dTdy - P.grav.y * dTdx);
  w = w * P.damp;
  if (y == 0 || y == i32(P.dims.y) - 1) { w = 0.0; }
  wout[widx(x, y)] = clamp(w, -6.0, 6.0);
}
`;

const CS_P = /* wgsl */ `
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       pin  : array<f32>;
@group(0) @binding(2) var<storage, read>       wsrc : array<f32>;
@group(0) @binding(3) var<storage, read_write> pout : array<f32>;
${HELPERS}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.dims.x || gid.y >= P.dims.y) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  var p = 0.25 * (pin[widx(x+1,y)] + pin[widx(x-1,y)] + pin[widx(x,y+1)] + pin[widx(x,y-1)] + wsrc[widx(x,y)]);
  if (y == 0 || y == i32(P.dims.y) - 1) { p = 0.0; }
  pout[widx(x, y)] = p;
}
`;

const RENDER = /* wgsl */ `
struct R { dims: vec2<u32>, res: vec2<f32> };
@group(0) @binding(0) var<uniform> R0: R;
@group(0) @binding(1) var<storage, read> tin : array<f32>;
@group(0) @binding(2) var<storage, read> psi : array<f32>;
fn widx(x: i32, y: i32) -> u32 {
  let w = i32(R0.dims.x); let h = i32(R0.dims.y);
  let xx = ((x % w) + w) % w;
  let yy = clamp(y, 0, h - 1);
  return u32(yy * w + xx);
}
fn sampT(px: f32, py: f32) -> f32 {
  let fx = floor(px); let fy = floor(py);
  let ix = i32(fx); let iy = i32(fy);
  let tx = px - fx; let ty = py - fy;
  let a = tin[widx(ix,   iy  )];
  let b = tin[widx(ix+1, iy  )];
  let c = tin[widx(ix,   iy+1)];
  let d = tin[widx(ix+1, iy+1)];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}
fn molten(tt: f32) -> vec3<f32> {
  let basalt = vec3<f32>(0.030, 0.016, 0.020);
  let oxblood= vec3<f32>(0.230, 0.045, 0.035);
  let copper = vec3<f32>(0.560, 0.170, 0.055);
  let amber  = vec3<f32>(0.870, 0.410, 0.080);
  let gold   = vec3<f32>(0.980, 0.760, 0.260);
  let white  = vec3<f32>(1.000, 0.960, 0.860);
  let t = clamp(tt, 0.0, 1.0);
  if (t < 0.20) { return mix(basalt,  oxblood, t / 0.20); }
  if (t < 0.42) { return mix(oxblood, copper,  (t - 0.20) / 0.22); }
  if (t < 0.64) { return mix(copper,  amber,   (t - 0.42) / 0.22); }
  if (t < 0.84) { return mix(amber,   gold,    (t - 0.64) / 0.20); }
  return                 mix(gold,    white,   (t - 0.84) / 0.16);
}
struct VOut { @builtin(position) pos: vec4<f32> };
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var out: VOut; out.pos = vec4<f32>(q[vi], 0.0, 1.0); return out;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  // Flip Y so the hot bottom row renders at the bottom of the canvas.
  let uv = vec2<f32>(in.pos.x / R0.res.x, 1.0 - in.pos.y / R0.res.y);
  let p = vec2<f32>(uv.x * f32(R0.dims.x), uv.y * f32(R0.dims.y));
  let t = sampT(p.x, p.y);
  let x = i32(p.x); let y = i32(p.y);
  let u =  (psi[widx(x,   y+1)] - psi[widx(x,   y-1)]) * 0.5;
  let v = -(psi[widx(x+1, y  )] - psi[widx(x-1, y  )]) * 0.5;
  let dTdx = (tin[widx(x+1,y)] - tin[widx(x-1,y)]) * 0.5;
  let dTdy = (tin[widx(x,y+1)] - tin[widx(x,y-1)]) * 0.5;
  var col = molten(t);
  let n = normalize(vec3<f32>(-dTdx * 3.5, -dTdy * 3.5, 1.0));
  let lamb = clamp(dot(n, normalize(vec3<f32>(-0.35, 0.45, 0.82))), 0.0, 1.0);
  col = col * (0.70 + 0.55 * lamb);
  col = col * (1.0 + 0.60 * clamp(v, 0.0, 1.2) * (0.3 + 0.7 * t));
  col = col * (1.0 - 0.40 * clamp(-v, 0.0, 1.2));
  let shear = clamp((abs(dTdx) + abs(dTdy)) * 2.4, 0.0, 1.0);
  col = mix(col, vec3<f32>(0.10, 0.02, 0.02), 0.30 * shear * (1.0 - t));
  let d = uv - vec2<f32>(0.5); col = col * (1.0 - 0.45 * dot(d, d));
  return vec4<f32>(col, 1.0);
}
`;

const CS_PROBE = /* wgsl */ `
struct PP { dims: vec2<u32>, probe: vec2<u32> };
@group(0) @binding(0) var<uniform> PP0: PP;
@group(0) @binding(1) var<storage, read> tin : array<f32>;
@group(0) @binding(2) var<storage, read> psi : array<f32>;
@group(0) @binding(3) var<storage, read_write> probeOut : array<vec4<f32>>;
fn widx(x: i32, y: i32) -> u32 {
  let w = i32(PP0.dims.x); let h = i32(PP0.dims.y);
  let xx = ((x % w) + w) % w;
  let yy = clamp(y, 0, h - 1);
  return u32(yy * w + xx);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= PP0.probe.x || gid.y >= PP0.probe.y) { return; }
  let fx = i32((gid.x * PP0.dims.x) / PP0.probe.x + PP0.dims.x / (2u * PP0.probe.x));
  let fy = i32((gid.y * PP0.dims.y) / PP0.probe.y + PP0.dims.y / (2u * PP0.probe.y));
  let t = tin[widx(fx, fy)];
  let u =  (psi[widx(fx,   fy+1)] - psi[widx(fx,   fy-1)]) * 0.5;
  let v = -(psi[widx(fx+1, fy  )] - psi[widx(fx-1, fy  )]) * 0.5;
  let speed = length(vec2<f32>(u, v));
  probeOut[gid.y * PP0.probe.x + gid.x] = vec4<f32>(t, v, speed, 0.0);
}
`;

export async function makeWebgpuBackend(
  canvas: HTMLCanvasElement,
  seedRng: () => number,
): Promise<Backend | null> {
  const gpu = (navigator as unknown as { gpu?: Wgpu }).gpu;
  if (!gpu) return null;
  let adapter: Wgpu;
  let device: Wgpu;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }
  if (!device) return null;

  const W = SIM_W;
  const H = SIM_H;
  const cells = W * H;
  const fmt = gpu.getPreferredCanvasFormat();

  // Seed temperature (identical scheme to the WebGL path).
  const tSeed = new Float32Array(cells);
  for (let y = 0; y < H; y++) {
    const base = 1.0 - y / (H - 1);
    for (let x = 0; x < W; x++) {
      const noise = (seedRng() - 0.5) * 0.28 * Math.sin((x / W) * Math.PI);
      tSeed[y * W + x] = Math.min(1, Math.max(0, base + noise));
    }
  }

  const mkBuf = (extra = 0) =>
    device.createBuffer({ size: cells * 4, usage: BUF_STORAGE | BUF_COPY_DST | extra });
  const tBuf = [mkBuf(), mkBuf()];
  const wBuf = [mkBuf(), mkBuf()];
  const pBuf = [mkBuf(), mkBuf()];
  device.queue.writeBuffer(tBuf[0], 0, tSeed);
  device.queue.writeBuffer(wBuf[0], 0, new Float32Array(cells));
  device.queue.writeBuffer(pBuf[0], 0, new Float32Array(cells));

  const paramsBuf = device.createBuffer({ size: 48, usage: BUF_UNIFORM | BUF_COPY_DST });
  const rParamsBuf = device.createBuffer({ size: 16, usage: BUF_UNIFORM | BUF_COPY_DST });
  const probeParamsBuf = device.createBuffer({ size: 16, usage: BUF_UNIFORM | BUF_COPY_DST });
  {
    const rp = new ArrayBuffer(16);
    new Uint32Array(rp, 0, 2).set([W, H]);
    new Float32Array(rp, 8, 2).set([canvas.width, canvas.height]);
    device.queue.writeBuffer(rParamsBuf, 0, rp);
    const pp = new ArrayBuffer(16);
    new Uint32Array(pp).set([W, H, PROBE_COLS, PROBE_ROWS]);
    device.queue.writeBuffer(probeParamsBuf, 0, pp);
  }

  const probeCells = PROBE_COLS * PROBE_ROWS;
  const probeBuf = device.createBuffer({ size: probeCells * 16, usage: BUF_STORAGE | BUF_COPY_SRC });
  const probeStaging = device.createBuffer({ size: probeCells * 16, usage: BUF_COPY_DST | BUF_MAP_READ });

  const mod = (code: string) => device.createShaderModule({ code });
  const csT = device.createComputePipeline({ layout: "auto", compute: { module: mod(CS_T), entryPoint: "main" } });
  const csW = device.createComputePipeline({ layout: "auto", compute: { module: mod(CS_W), entryPoint: "main" } });
  const csP = device.createComputePipeline({ layout: "auto", compute: { module: mod(CS_P), entryPoint: "main" } });
  const csProbe = device.createComputePipeline({ layout: "auto", compute: { module: mod(CS_PROBE), entryPoint: "main" } });
  const renderMod = mod(RENDER);
  const renderPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: { module: renderMod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  const ctx = canvas.getContext("webgpu") as Wgpu;
  if (!ctx) return null;
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const groupsX = Math.ceil(W / 8);
  const groupsY = Math.ceil(H / 8);
  const probeGX = Math.ceil(PROBE_COLS / 8);
  const probeGY = Math.ceil(PROBE_ROWS / 8);

  let ti = 0, wi = 0, pi = 0;
  let frame = 0;
  let disposed = false;
  let readPending = false;
  let haveProbe = false;
  const probeData = new Float32Array(probeCells * 3);

  const pbuf = new ArrayBuffer(48);
  const pu = new Uint32Array(pbuf, 0, 2);
  const pf = new Float32Array(pbuf);

  function step(s: SimStep) {
    if (disposed) return;
    frame += 1;
    pu[0] = W; pu[1] = H;
    pf[2] = s.dt;
    pf[3] = 0.11;      // kappa
    pf[4] = 0.13;      // nu
    pf[5] = s.buoy;
    pf[6] = 0.9985;    // damp
    pf[8] = s.gx;      // grav.x (vec2 aligned at offset 32 → index 8)
    pf[9] = s.gy;      // grav.y
    device.queue.writeBuffer(paramsBuf, 0, pbuf);

    const enc = device.createCommandEncoder();

    // 1. Temperature.
    {
      const bg = device.createBindGroup({
        layout: csT.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: tBuf[ti] } },
          { binding: 2, resource: { buffer: pBuf[pi] } },
          { binding: 3, resource: { buffer: tBuf[ti ^ 1] } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(csT); pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(groupsX, groupsY); pass.end();
    }
    ti ^= 1;

    // 2. Vorticity.
    {
      const bg = device.createBindGroup({
        layout: csW.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: wBuf[wi] } },
          { binding: 2, resource: { buffer: pBuf[pi] } },
          { binding: 3, resource: { buffer: tBuf[ti] } },
          { binding: 4, resource: { buffer: wBuf[wi ^ 1] } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(csW); pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(groupsX, groupsY); pass.end();
    }
    wi ^= 1;

    // 3. Poisson (Jacobi ping-pong).
    for (let k = 0; k < POISSON_ITERS; k++) {
      const bg = device.createBindGroup({
        layout: csP.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: pBuf[pi] } },
          { binding: 2, resource: { buffer: wBuf[wi] } },
          { binding: 3, resource: { buffer: pBuf[pi ^ 1] } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(csP); pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(groupsX, groupsY); pass.end();
      pi ^= 1;
    }

    // 4. Render.
    {
      const bg = device.createBindGroup({
        layout: renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: rParamsBuf } },
          { binding: 1, resource: { buffer: tBuf[ti] } },
          { binding: 2, resource: { buffer: pBuf[pi] } },
        ],
      });
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0.02, g: 0.01, b: 0.012, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(renderPipe); pass.setBindGroup(0, bg);
      pass.draw(3); pass.end();
    }

    // 5. Probe reduction → staging (every other frame).
    if (frame % 2 === 0 && !readPending) {
      const bg = device.createBindGroup({
        layout: csProbe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: probeParamsBuf } },
          { binding: 1, resource: { buffer: tBuf[ti] } },
          { binding: 2, resource: { buffer: pBuf[pi] } },
          { binding: 3, resource: { buffer: probeBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(csProbe); pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(probeGX, probeGY); pass.end();
      enc.copyBufferToBuffer(probeBuf, 0, probeStaging, 0, probeCells * 16);
    }

    device.queue.submit([enc.finish()]);

    if (frame % 2 === 0 && !readPending) {
      readPending = true;
      probeStaging.mapAsync(MAP_READ).then(() => {
        if (disposed) { readPending = false; return; }
        const arr = new Float32Array(probeStaging.getMappedRange().slice(0));
        probeStaging.unmap();
        for (let i = 0; i < probeCells; i++) {
          probeData[i * 3] = arr[i * 4];         // t
          probeData[i * 3 + 1] = arr[i * 4 + 1]; // v
          probeData[i * 3 + 2] = arr[i * 4 + 2]; // speed
        }
        haveProbe = true;
        readPending = false;
      }).catch(() => { readPending = false; });
    }
  }

  function probe(): ProbeGrid | null {
    if (!haveProbe) return null;
    return { cols: PROBE_COLS, rows: PROBE_ROWS, data: probeData };
  }

  function destroy() {
    disposed = true;
    try { device.destroy(); } catch { /* already gone */ }
  }

  return { kind: "webgpu", step, probe, destroy };
}
