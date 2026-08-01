// gpu.ts — the planetary energy field on the GPU, forced by THREE streams.
//
// One equirectangular world field is simulated as a 2D elastic wave equation on
// a WebGPU compute shader (ping-pong storage buffers):
//     u_next = 2u − u_prev + c²·∇²u        (× damping ≈ 0.9994)
// Longitude wraps; latitude reflects at the poles; damping is near-1 so ripples
// ACCUMULATE — genuine long-form memory, minute 5 ≠ minute 1.
//
// Into that ONE field, three heterogeneous real-time streams inject in three
// distinct ways so the planet and its star play as a single instrument:
//   • Earthquakes → sharp localized Gaussian impulses at a (lon,lat) cell.
//   • Solar wind  → a slow global undulation that advects across the world and
//                   raises the field's energy floor (a sustained pressure).
//   • Geomagnetic → a shimmering polar-band bloom near top/bottom that
//                   intensifies with Kp.
// A render pass paints |u| as a violet height/energy ramp. Slow-drift only —
// one physics step per frame, no strobe (photosensitive-safe).

import {
  GRID_W,
  GRID_H,
  POLE_BAND_FRAC,
  windAmpFor,
  windPhaseStep,
  auroraAmpFor,
  auroraPhaseStep,
  type FieldForcing,
  type WaveField,
} from "./field";

const WGX = 8;
const WGY = 8;
const MAX_IMP = 32;

// ── compute shader ────────────────────────────────────────────────────────────
const COMPUTE_WGSL = /* wgsl */ `
struct U {
  c2: f32, damping: f32, gw: u32, gh: u32,
  impCount: u32, windAmp: f32, windKx: f32, windKy: f32,
  windPhase: f32, auroraAmp: f32, auroraKx: f32, auroraPhase: f32,
  poleBand: f32, p0: f32, p1: f32, p2: f32,
  imp: array<vec4f, ${MAX_IMP}>,
}
@group(0) @binding(0) var<storage, read> src: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(2) var<uniform> u: U;

fn idx(x: i32, y: i32) -> u32 {
  let gw = i32(u.gw);
  let gh = i32(u.gh);
  var xx = ((x % gw) + gw) % gw;      // longitude wraps
  var yy = y;
  if (yy < 0) { yy = 0; }             // poles reflect softly
  if (yy > gh - 1) { yy = gh - 1; }
  return u32(yy) * u.gw + u32(xx);
}

@compute @workgroup_size(${WGX}, ${WGY})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (gid.x >= u.gw || gid.y >= u.gh) { return; }

  let c = src[idx(x, y)];
  let uc = c.x;
  let uprev = c.y;

  let l = src[idx(x - 1, y)].x;
  let r = src[idx(x + 1, y)].x;
  let up = src[idx(x, y - 1)].x;
  let dn = src[idx(x, y + 1)].x;
  let lap = l + r + up + dn - 4.0 * uc;

  var un = (2.0 * uc - uprev + u.c2 * lap) * u.damping;

  let fx = f32(x);
  let fy = f32(y);
  let gwf = f32(u.gw);
  let ghf = f32(u.gh);

  // ── STREAM 1: earthquakes — sharp localized Gaussian impulses ──────────────
  for (var i: u32 = 0u; i < u.impCount; i = i + 1u) {
    let e = u.imp[i];
    var ddx = abs(fx - e.x);
    ddx = min(ddx, gwf - ddx);        // wrap distance in longitude
    let ddy = fy - e.y;
    let r2 = e.w * e.w;
    let d2 = ddx * ddx + ddy * ddy;
    if (d2 < r2 * 9.0) {
      un = un + e.z * exp(-d2 / (2.0 * r2));
    }
  }

  // ── STREAM 2: solar wind — a slow global undulation advecting across the
  //    world; oscillatory (net-zero DC) so it lifts the energy floor without
  //    biasing the field. Amplitude tracks plasma density, phase advects with
  //    plasma speed (updated on the CPU each frame). ──────────────────────────
  un = un + u.windAmp * sin(u.windKx * fx + u.windKy * fy - u.windPhase);

  // ── STREAM 3: geomagnetic Kp — a shimmering bloom in the polar bands ───────
  let dpole = min(fy, ghf - 1.0 - fy);
  if (dpole < u.poleBand) {
    let s = u.poleBand * 0.5;
    let band = exp(-(dpole * dpole) / (2.0 * s * s));
    un = un + u.auroraAmp * band * sin(u.auroraKx * fx + u.auroraPhase);
  }

  un = clamp(un, -12.0, 12.0);        // soft clamp so nothing blows up
  dst[idx(x, y)] = vec2f(un, uc);
}`;

// ── render shader (fullscreen triangle) ───────────────────────────────────────
const RENDER_WGSL = /* wgsl */ `
struct RU { gw: u32, gh: u32, cw: f32, ch: f32, gain: f32, p0: f32, p1: f32, p2: f32 }
@group(0) @binding(0) var<storage, read> field: array<vec2f>;
@group(0) @binding(1) var<uniform> u: RU;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VO;
  let xy = p[vi];
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5); // y down
  return o;
}

fn dreamPalette(t0: f32) -> vec3f {
  let t = clamp(t0, 0.0, 1.0);
  let deep    = vec3f(0.043, 0.027, 0.075);
  let indigo  = vec3f(0.388, 0.400, 0.945);
  let violet  = vec3f(0.545, 0.361, 0.965);
  let magenta = vec3f(0.690, 0.263, 0.878);
  let light   = vec3f(0.769, 0.710, 0.992);
  if (t < 0.33) { return mix(deep, indigo, t / 0.33); }
  if (t < 0.66) { return mix(indigo, violet, (t - 0.33) / 0.33); }
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}

@fragment fn fmain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let cx = min(u.gw - 1u, u32(uv.x * f32(u.gw)));
  let cy = min(u.gh - 1u, u32(uv.y * f32(u.gh)));
  let val = field[cy * u.gw + cx].x;

  let t = 0.5 + val * u.gain;
  var col = dreamPalette(t);

  // faint graticule every 30° so the world reads as a world
  let lon = uv.x * 360.0;
  let lat = uv.y * 180.0;
  let glon = abs(fract(lon / 30.0) - 0.5);
  let glat = abs(fract(lat / 30.0) - 0.5);
  let grid = smoothstep(0.49, 0.5, max(glon, glat));
  col = mix(col, col + vec3f(0.06, 0.05, 0.10), grid * 0.5);

  let d = distance(uv, vec2f(0.5, 0.5));
  col = col * (1.0 - smoothstep(0.55, 0.95, d) * 0.5);

  return vec4f(col, 1.0);
}`;

interface Impulse {
  x: number;
  y: number;
  amp: number;
  radius: number;
}

export async function makeGpuField(canvas: HTMLCanvasElement): Promise<WaveField> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const maybeCtx = canvas.getContext("webgpu");
  if (!maybeCtx) throw new Error("no-webgpu");
  const ctx: GPUCanvasContext = maybeCtx;
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const cellCount = GRID_W * GRID_H;
  const bufBytes = cellCount * 2 * 4;
  const fieldA = device.createBuffer({
    size: bufBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const fieldB = device.createBuffer({
    size: bufBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // compute uniform: 64 byte header (4 vec4) + MAX_IMP * 16
  const computeUni = device.createBuffer({
    size: 64 + MAX_IMP * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUni = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vmain" },
    fragment: { module: renderModule, entryPoint: "fmain", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = [
    device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldA } },
        { binding: 1, resource: { buffer: fieldB } },
        { binding: 2, resource: { buffer: computeUni } },
      ],
    }),
    device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldB } },
        { binding: 1, resource: { buffer: fieldA } },
        { binding: 2, resource: { buffer: computeUni } },
      ],
    }),
  ];
  const renderBG = [
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldB } },
        { binding: 1, resource: { buffer: renderUni } },
      ],
    }),
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldA } },
        { binding: 1, resource: { buffer: renderUni } },
      ],
    }),
  ];

  const pending: Impulse[] = [];
  let readIsA = true;
  let destroyed = false;

  // continuous forcing state (solar wind + geomagnetic Kp), advanced each frame
  let forcing: FieldForcing = { windSpeed: 0, windDensity: 0, kp: 0 };
  let windPhase = 0;
  let auroraPhase = 0;
  const windKx = (6.2831853 * 3) / GRID_W; // ~3 undulations around the world
  const windKy = (6.2831853 * 1) / GRID_H;
  const auroraKx = (6.2831853 * 9) / GRID_W; // 9 shimmer lobes around a pole
  const poleBand = GRID_H * POLE_BAND_FRAC;

  const uniHeader = new ArrayBuffer(64 + MAX_IMP * 16);
  const uf32 = new Float32Array(uniHeader);
  const uu32 = new Uint32Array(uniHeader);

  function writeComputeUniform(imps: Impulse[]): void {
    uf32[0] = 0.24; // c2 — wave speed (sub-critical for stability)
    uf32[1] = 0.9994; // damping — near 1 → long memory / accumulation
    uu32[2] = GRID_W;
    uu32[3] = GRID_H;
    uu32[4] = imps.length;
    uf32[5] = windAmpFor(forcing);
    uf32[6] = windKx;
    uf32[7] = windKy;
    uf32[8] = windPhase;
    uf32[9] = auroraAmpFor(forcing);
    uf32[10] = auroraKx;
    uf32[11] = auroraPhase;
    uf32[12] = poleBand;
    // 13,14,15 pad
    for (let i = 0; i < imps.length; i++) {
      const o = 16 + i * 4; // imp array starts after the 16-float (64B) header
      uf32[o] = imps[i].x;
      uf32[o + 1] = imps[i].y;
      uf32[o + 2] = imps[i].amp;
      uf32[o + 3] = imps[i].radius;
    }
    device.queue.writeBuffer(computeUni, 0, uniHeader);
  }

  const rBuf = new ArrayBuffer(32);
  const rf32 = new Float32Array(rBuf);
  const ru32 = new Uint32Array(rBuf);
  function writeRenderUniform(): void {
    ru32[0] = GRID_W;
    ru32[1] = GRID_H;
    rf32[2] = canvas.width;
    rf32[3] = canvas.height;
    rf32[4] = 0.08;
    device.queue.writeBuffer(renderUni, 0, rBuf);
  }
  writeRenderUniform();

  function inject(cellX: number, cellY: number, amp: number): void {
    if (pending.length >= MAX_IMP) return;
    pending.push({ x: cellX, y: cellY, amp, radius: 1.7 });
  }

  function setForcing(f: FieldForcing): void {
    forcing = f;
  }

  function frame(): void {
    if (destroyed) return;
    // advance the two sustained forcings' phases (advection tracks the streams)
    windPhase += windPhaseStep(forcing);
    auroraPhase += auroraPhaseStep(forcing);
    const imps = pending.splice(0, MAX_IMP);
    writeComputeUniform(imps);

    const enc = device.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, readIsA ? computeBG[0] : computeBG[1]);
    cpass.dispatchWorkgroups(Math.ceil(GRID_W / WGX), Math.ceil(GRID_H / WGY));
    cpass.end();

    const freshIsB = readIsA;
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.01, b: 0.04, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, freshIsB ? renderBG[0] : renderBG[1]);
    rpass.draw(3);
    rpass.end();

    device.queue.submit([enc.finish()]);
    readIsA = !readIsA;
  }

  function resize(): void {
    writeRenderUniform();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    fieldA.destroy();
    fieldB.destroy();
    computeUni.destroy();
    renderUni.destroy();
    device.destroy();
  }

  return { backend: "GPU", gridW: GRID_W, gridH: GRID_H, inject, setForcing, frame, resize, destroy };
}
