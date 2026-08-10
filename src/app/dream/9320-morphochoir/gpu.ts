// gpu.ts — the Gray-Scott field on WebGPU compute shaders.
//
// Two chemicals U and V live in an rgba16float texture (U in .r, V in .g). A
// compute pass steps the classic Gray-Scott equations with a 9-point Laplacian
// and toroidal (wrapping) boundaries — Turing's morphogenesis, on the GPU, in a
// ping-pong pair of storage textures. Seeding a note injects a small disk of V.
//
// A second compute pass reads the eight ring probes and writes their local
// [V, gradientMagnitude, Vavg] into a storage buffer, which is copied to a
// mappable buffer and read back asynchronously so the choir can listen.
//
// A render pass samples the field and paints it as a warm bioluminescent
// surface: near-black ground rising through amber and gold to pale cream.

import {
  DU,
  DV,
  type Field,
  mulberry32,
  PROBE_COUNT,
  PROBE_POS,
  REGIMES,
  SEED,
  type Seed,
} from "./field";

const RES = 256; // field is RES x RES
const STEPS = 10; // sim iterations per rendered frame — morphology forms in ~1s
const SIM_DT = 1.0;
const MAX_SEEDS = 8;

// ── compute: one Gray-Scott step (src -> dst) ───────────────────────────────
const SIM_WGSL = /* wgsl */ `
struct Sim {
  du: f32, dv: f32, feed: f32, kill: f32,
  dt: f32, w: f32, h: f32, seedCount: f32,
  seeds: array<vec4f, ${MAX_SEEDS}>,   // xy = pos, z = radius, w = strength
};
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> u: Sim;

fn ld(ix: i32, iy: i32) -> vec2f {
  let W = i32(u.w); let H = i32(u.h);
  let x = (ix + W) % W;
  let y = (iy + H) % H;
  return textureLoad(src, vec2i(x, y), 0).xy;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = i32(u.w); let H = i32(u.h);
  let x = i32(gid.x); let y = i32(gid.y);
  if (x >= W || y >= H) { return; }

  let c = ld(x, y);
  let U = c.x; let V = c.y;

  // 9-point weighted Laplacian (orthogonal 0.2, diagonal 0.05, centre -1)
  let lap =
      ld(x - 1, y) * 0.2 + ld(x + 1, y) * 0.2
    + ld(x, y - 1) * 0.2 + ld(x, y + 1) * 0.2
    + ld(x - 1, y - 1) * 0.05 + ld(x + 1, y - 1) * 0.05
    + ld(x - 1, y + 1) * 0.05 + ld(x + 1, y + 1) * 0.05
    + c * (-1.0);

  let uvv = U * V * V;
  var nU = U + (u.du * lap.x - uvv + u.feed * (1.0 - U)) * u.dt;
  var nV = V + (u.dv * lap.y + uvv - (u.feed + u.kill) * V) * u.dt;

  // seed injection — a soft disk of V (a "note" dropped into the field)
  let uv = vec2f((f32(x) + 0.5) / u.w, (f32(y) + 0.5) / u.h);
  let n = u32(u.seedCount);
  for (var i = 0u; i < n; i = i + 1u) {
    let s = u.seeds[i];
    let d = distance(uv, s.xy);
    if (d < s.z) {
      let f = (1.0 - d / s.z) * s.w;
      nV = nV + f;
      nU = nU - f * 0.5;
    }
  }

  nU = clamp(nU, 0.0, 1.0);
  nV = clamp(nV, 0.0, 1.0);
  textureStore(dst, vec2i(x, y), vec4f(nU, nV, 0.0, 1.0));
}`;

// ── compute: sample the eight probes ────────────────────────────────────────
const PROBE_WGSL = /* wgsl */ `
struct PU {
  count: f32, w: f32, h: f32, _pad: f32,
  probes: array<vec4f, ${PROBE_COUNT}>,  // xy = pos
};
@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> outBuf: array<vec4f, ${PROBE_COUNT}>;
@group(0) @binding(2) var<uniform> u: PU;

fn sampleV(px: i32, py: i32) -> f32 {
  let W = i32(u.w); let H = i32(u.h);
  let x = (px + W) % W;
  let y = (py + H) % H;
  return textureLoad(field, vec2i(x, y), 0).y;
}

@compute @workgroup_size(${PROBE_COUNT})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(u.count)) { return; }
  let p = u.probes[i];
  let cx = i32(p.x * u.w);
  let cy = i32(p.y * u.h);

  let vc = sampleV(cx, cy);
  let vl = sampleV(cx - 1, cy);
  let vr = sampleV(cx + 1, cy);
  let vu = sampleV(cx, cy - 1);
  let vd = sampleV(cx, cy + 1);
  let gx = (vr - vl) * 0.5;
  let gy = (vd - vu) * 0.5;
  let grad = sqrt(gx * gx + gy * gy);
  let vavg = (vc + vl + vr + vu + vd) * 0.2;

  outBuf[i] = vec4f(vc, grad, vavg, 0.0);
}`;

// ── compute: initialise the field (U=1, V=0 + a seeded central bloom) ───────
const INIT_WGSL = /* wgsl */ `
struct IU { w: f32, h: f32, sx: f32, sy: f32 };
@group(0) @binding(0) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> u: IU;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = i32(u.w); let H = i32(u.h);
  let x = i32(gid.x); let y = i32(gid.y);
  if (x >= W || y >= H) { return; }
  let uv = vec2f((f32(x) + 0.5) / u.w, (f32(y) + 0.5) / u.h);
  var V = 0.0;
  let d = distance(uv, vec2f(u.sx, u.sy));
  if (d < 0.06) { V = 0.9; }
  textureStore(dst, vec2i(x, y), vec4f(1.0, V, 0.0, 1.0));
}`;

// ── render: warm bioluminescent surface ─────────────────────────────────────
const RENDER_WGSL = /* wgsl */ `
struct RU { bright: f32, _a: f32, _b: f32, _c: f32 };
@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u: RU;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = p[vi];
  var o: VO;
  o.pos = vec4f(xy, 0.0, 1.0);
  var uv = xy * 0.5 + vec2f(0.5, 0.5);
  uv.y = 1.0 - uv.y;
  o.uv = uv;
  return o;
}

@fragment
fn fmain(v: VO) -> @location(0) vec4f {
  let f = textureSample(field, samp, v.uv);
  let V = f.y;

  let ground = vec3f(0.020, 0.012, 0.008);
  let amber  = vec3f(0.85, 0.34, 0.07);
  let gold   = vec3f(1.00, 0.72, 0.24);
  let cream  = vec3f(1.00, 0.95, 0.82);

  var col = mix(ground, amber, smoothstep(0.05, 0.22, V));
  col = mix(col, gold, smoothstep(0.22, 0.45, V));
  col = mix(col, cream, smoothstep(0.45, 0.72, V));
  // bioluminescent bloom at the crests
  col = col + gold * pow(V, 3.0) * 0.45;
  col = col * u.bright;
  return vec4f(col, 1.0);
}`;

export async function createGpuField(canvas: HTMLCanvasElement): Promise<Field> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("no-adapter");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const maybeCtx = canvas.getContext("webgpu");
  if (!maybeCtx) throw new Error("no-context");
  const cctx: GPUCanvasContext = maybeCtx;
  cctx.configure({ device, format: fmt, alphaMode: "opaque" });

  // two ping-pong field textures
  const texUsage =
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
  const tex = [0, 1].map(() =>
    device.createTexture({
      size: { width: RES, height: RES },
      format: "rgba16float",
      usage: texUsage,
    }),
  );
  const view = tex.map((t) => t.createView());

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  // ── pipelines ──────────────────────────────────────────────────────────────
  const initPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: INIT_WGSL }), entryPoint: "main" },
  });
  const simPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: SIM_WGSL }), entryPoint: "main" },
  });
  const probePipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: PROBE_WGSL }), entryPoint: "main" },
  });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vmain" },
    fragment: { module: renderModule, entryPoint: "fmain", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  // ── buffers ────────────────────────────────────────────────────────────────
  // sim uniform: 8 scalars + MAX_SEEDS vec4 = 32 + 128 bytes
  const simUni = device.createBuffer({
    size: 32 + MAX_SEEDS * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const simArr = new Float32Array(simUni.size / 4);

  // probe uniform: 4 scalars + PROBE_COUNT vec4
  const probeUni = device.createBuffer({
    size: 16 + PROBE_COUNT * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  {
    const a = new Float32Array(probeUni.size / 4);
    a[0] = PROBE_COUNT;
    a[1] = RES;
    a[2] = RES;
    for (let i = 0; i < PROBE_COUNT; i++) {
      a[4 + i * 4] = PROBE_POS[i][0];
      a[4 + i * 4 + 1] = PROBE_POS[i][1];
    }
    device.queue.writeBuffer(probeUni, 0, a);
  }

  const probeStorage = device.createBuffer({
    size: PROBE_COUNT * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const probeReadback = device.createBuffer({
    size: PROBE_COUNT * 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const renderUni = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const initUni = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── bind groups (two orientations for ping-pong) ────────────────────────────
  // sim: reads tex[p], writes tex[1-p]
  const simBG = [0, 1].map((p) =>
    device.createBindGroup({
      layout: simPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: view[p] },
        { binding: 1, resource: view[1 - p] },
        { binding: 2, resource: { buffer: simUni } },
      ],
    }),
  );
  // probe + render: read tex[k]
  const probeBG = [0, 1].map((k) =>
    device.createBindGroup({
      layout: probePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: view[k] },
        { binding: 1, resource: { buffer: probeStorage } },
        { binding: 2, resource: { buffer: probeUni } },
      ],
    }),
  );
  const renderBG = [0, 1].map((k) =>
    device.createBindGroup({
      layout: renderPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: view[k] },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: renderUni } },
      ],
    }),
  );

  // ── initialise tex[0] with a seeded central bloom ──────────────────────────
  const rnd = mulberry32(SEED);
  {
    const initBG = device.createBindGroup({
      layout: initPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: view[0] },
        { binding: 1, resource: { buffer: initUni } },
      ],
    });
    const ia = new Float32Array(4);
    ia[0] = RES;
    ia[1] = RES;
    ia[2] = 0.5;
    ia[3] = 0.5;
    device.queue.writeBuffer(initUni, 0, ia);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(initPipe);
    pass.setBindGroup(0, initBG);
    pass.dispatchWorkgroups(Math.ceil(RES / 8), Math.ceil(RES / 8));
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  // ── mutable state ──────────────────────────────────────────────────────────
  let parity = 0; // sim reads tex[parity]
  let regime = 0;
  const seeds: Seed[] = [];
  const latestProbes = new Float32Array(PROBE_COUNT * 4);
  let readbackBusy = false;
  let destroyed = false;

  function addSeed(x: number, y: number, strength: number): void {
    if (seeds.length >= MAX_SEEDS) seeds.shift();
    // a hair of deterministic jitter so repeated same-key drops aren't identical
    const j = (rnd() - 0.5) * 0.01;
    seeds.push({
      x: Math.min(0.97, Math.max(0.03, x + j)),
      y: Math.min(0.97, Math.max(0.03, y - j)),
      strength,
      radius: 0.028,
      life: 0.35,
    });
  }

  function setRegime(index: number): void {
    regime = ((index % REGIMES.length) + REGIMES.length) % REGIMES.length;
  }

  function packSim(): void {
    const r = REGIMES[regime];
    simArr[0] = DU;
    simArr[1] = DV;
    simArr[2] = r.feed;
    simArr[3] = r.kill;
    simArr[4] = SIM_DT;
    simArr[5] = RES;
    simArr[6] = RES;
    simArr[7] = Math.min(MAX_SEEDS, seeds.length);
    for (let i = 0; i < MAX_SEEDS; i++) {
      const base = 8 + i * 4;
      const s = seeds[i];
      if (s) {
        simArr[base] = s.x;
        simArr[base + 1] = s.y;
        simArr[base + 2] = s.radius;
        simArr[base + 3] = s.strength;
      } else {
        simArr[base] = 0;
        simArr[base + 1] = 0;
        simArr[base + 2] = 0;
        simArr[base + 3] = 0;
      }
    }
    device.queue.writeBuffer(simUni, 0, simArr);
  }

  function step(dtSec: number, timeSec: number, reduce: boolean): void {
    if (destroyed) return;

    // age seeds
    for (let i = seeds.length - 1; i >= 0; i--) {
      seeds[i].life -= dtSec;
      if (seeds[i].life <= 0) seeds.splice(i, 1);
    }
    packSim();

    // slow luminance drift (never a strobe); damped under reduced motion
    const amp = reduce ? 0.02 : 0.06;
    const bright = 0.95 + amp * Math.sin(timeSec * 0.35);
    const ru = new Float32Array(4);
    ru[0] = bright;
    device.queue.writeBuffer(renderUni, 0, ru);

    const enc = device.createCommandEncoder();

    for (let s = 0; s < STEPS; s++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(simPipe);
      pass.setBindGroup(0, simBG[parity]);
      pass.dispatchWorkgroups(Math.ceil(RES / 8), Math.ceil(RES / 8));
      pass.end();
      parity = 1 - parity; // now tex[parity] holds the freshest field
    }

    // probes read the freshest field
    const ppass = enc.beginComputePass();
    ppass.setPipeline(probePipe);
    ppass.setBindGroup(0, probeBG[parity]);
    ppass.dispatchWorkgroups(1);
    ppass.end();

    // render the freshest field to the canvas
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: cctx.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.012, b: 0.008, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipe);
    rpass.setBindGroup(0, renderBG[parity]);
    rpass.draw(3);
    rpass.end();

    if (!readbackBusy) {
      enc.copyBufferToBuffer(probeStorage, 0, probeReadback, 0, PROBE_COUNT * 16);
    }

    device.queue.submit([enc.finish()]);

    if (!readbackBusy) {
      readbackBusy = true;
      probeReadback
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (destroyed) return;
          const data = new Float32Array(probeReadback.getMappedRange());
          latestProbes.set(data.subarray(0, PROBE_COUNT * 4));
          probeReadback.unmap();
          readbackBusy = false;
        })
        .catch(() => {
          readbackBusy = false;
        });
    }
  }

  function probes(): Float32Array {
    return latestProbes;
  }

  function resize(w: number, h: number): void {
    // the field is fixed-resolution; the canvas backing store follows the box
    canvas.width = w;
    canvas.height = h;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    try {
      tex[0].destroy();
      tex[1].destroy();
      simUni.destroy();
      probeUni.destroy();
      probeStorage.destroy();
      probeReadback.destroy();
      renderUni.destroy();
      initUni.destroy();
    } catch {
      /* device may already be gone */
    }
    device.destroy();
  }

  return { backend: "GPU", step, addSeed, setRegime, probes, resize, destroy };
}
