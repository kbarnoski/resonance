// ─────────────────────────────────────────────────────────────────────────────
// 4360 · Cymatic — WebGPU compute-shader particle backend (shipped-primary path).
//
//   • a @compute @workgroup_size(64) pass integrates N≈100k "sand" particles,
//     each doing a damped Newton descent onto the plate's nodal set A(p)=0 plus a
//     displacement-proportional jitter (sand bounces where the plate moves);
//   • the eigenmode field A(p)=Σ w_k Φ_k and its gradient are evaluated in-shader
//     from a modes uniform, identical to evalField() in modes.ts;
//   • a render pass draws the particles as additive points on the violet ramp.
//
// All WGSL lives in string literals; every navigator.gpu / adapter / device call
// is guarded so a headless production build never touches the GPU. On any failure
// the caller falls back to the Canvas2D backend in cpu.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { MODES, N_MODES } from "./modes";

export interface StepOpts {
  weights: Float32Array; // length N_MODES, normalised
  jitter: number; // sand-bounce amplitude
  rate: number; // Newton descent rate
  time: number; // seconds (for the jitter hash)
  scaleX: number; // clip-space half-extent of the plate square (x)
  scaleY: number; // clip-space half-extent of the plate square (y)
}

export interface Backend {
  kind: "webgpu" | "cpu";
  step(o: StepOpts): void;
  destroy(): void;
}

export const GPU_PARTICLES = 100_000;

// ── WGSL ──────────────────────────────────────────────────────────────────────

const PARAMS = /* wgsl */ `
struct Params {
  nParts: u32, nModes: u32, frame: u32, _pad: u32,
  jitter: f32, rate: f32, scaleX: f32, scaleY: f32,
};
`;

// modes uniform: each vec4 = (m, n, s, w)
const FIELD_FN = /* wgsl */ `
const PI = 3.14159265359;

struct FieldOut { A: f32, gx: f32, gy: f32 };

fn evalField(x: f32, y: f32, modes: ptr<function, array<vec4f, ${N_MODES}>>, nModes: u32) -> FieldOut {
  var A = 0.0; var gx = 0.0; var gy = 0.0;
  for (var k = 0u; k < nModes; k = k + 1u) {
    let md = (*modes)[k];
    let wk = md.w;
    if (wk < 1e-4) { continue; }
    let mp = md.x * PI;
    let np = md.y * PI;
    let s = md.z;
    let cmx = cos(mp * x); let cny = cos(np * y);
    let cnx = cos(np * x); let cmy = cos(mp * y);
    let smx = sin(mp * x); let sny = sin(np * y);
    let snx = sin(np * x); let smy = sin(mp * y);
    A  = A  + wk * (cmx * cny + s * cnx * cmy);
    gx = gx + wk * (-mp * smx * cny - s * np * snx * cmy);
    gy = gy + wk * (-np * cmx * sny - s * mp * cnx * smy);
  }
  return FieldOut(A, gx, gy);
}

fn hash11(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }
`;

const COMPUTE_WGSL = /* wgsl */ `
${PARAMS}
${FIELD_FN}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> Modes: array<vec4f, ${N_MODES}>;
@group(0) @binding(2) var<storage, read_write> parts: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nParts) { return; }
  var pt = parts[i];
  var x = pt.x; var y = pt.y;
  var modes = Modes;

  let fo = evalField(x, y, &modes, P.nModes);
  let g2 = fo.gx * fo.gx + fo.gy * fo.gy + 1e-3;

  // damped Newton step toward the nearest nodal line (root of A along the gradient)
  var stepx = P.rate * fo.A * fo.gx / g2;
  var stepy = P.rate * fo.A * fo.gy / g2;
  let sl = sqrt(stepx * stepx + stepy * stepy);
  let maxStep = 0.05;
  if (sl > maxStep) { let k = maxStep / sl; stepx = stepx * k; stepy = stepy * k; }
  x = x - stepx;
  y = y - stepy;

  // sand bounces where the plate is displaced: jitter ∝ |A| (zero on the node)
  let mag = abs(fo.A);
  let seed = pt.w;
  let r1 = hash11(seed * 71.0 + f32(P.frame) * 0.013);
  let r2 = hash11(seed * 113.0 + f32(P.frame) * 0.017 + 5.0);
  let ang = r1 * 6.2831853;
  let amp = P.jitter * mag * r2;
  x = x + cos(ang) * amp;
  y = y + sin(ang) * amp;

  // reflect at the plate edges
  if (x < 0.0) { x = -x; } else if (x > 1.0) { x = 2.0 - x; }
  if (y < 0.0) { y = -y; } else if (y > 1.0) { y = 2.0 - y; }
  x = clamp(x, 0.0, 1.0);
  y = clamp(y, 0.0, 1.0);

  // settledness for colour: bright on the node (|A| small), dim on the antinodes
  let settle = clamp(1.0 - mag / 0.6, 0.0, 1.0);

  parts[i] = vec4f(x, y, settle, seed);
}
`;

const RENDER_WGSL = /* wgsl */ `
${PARAMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> parts: array<vec4f>;

struct VO { @builtin(position) pos: vec4f, @location(0) settle: f32 };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let pt = parts[vi];
  let cx = (pt.x * 2.0 - 1.0) * P.scaleX;
  let cy = (pt.y * 2.0 - 1.0) * P.scaleY;
  return VO(vec4f(cx, -cy, 0.0, 1.0), pt.z);
}

// violet ramp  #4c1d95 → #8b5cf6 → #ede9fe
fn rampV(t: f32) -> vec3f {
  let deep  = vec3f(0.298, 0.114, 0.584);
  let mid   = vec3f(0.545, 0.361, 0.965);
  let light = vec3f(0.929, 0.914, 0.996);
  let u = clamp(t, 0.0, 1.0);
  if (u < 0.5) { return mix(deep, mid, u / 0.5); }
  return mix(mid, light, (u - 0.5) / 0.5);
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let s = v.settle;
  let col = rampV(s) * (0.20 + 0.75 * s);
  return vec4f(col, 1.0);
}
`;

// ── Backend ───────────────────────────────────────────────────────────────────

export async function makeGpuBackend(
  canvas: HTMLCanvasElement,
  rng: () => number,
): Promise<Backend> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("no navigator.gpu");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();

  device.pushErrorScope("validation");

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no webgpu context");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const N = GPU_PARTICLES;

  // seed the sand scattered uniformly across the plate (deterministic)
  const pdata = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    pdata[i * 4 + 0] = rng();
    pdata[i * 4 + 1] = rng();
    pdata[i * 4 + 2] = 0;
    pdata[i * 4 + 3] = rng(); // static per-particle seed
  }
  const partBuf = device.createBuffer({
    size: pdata.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(partBuf, 0, pdata.buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const modesBuf = device.createBuffer({
    size: N_MODES * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod,
      entryPoint: "fs",
      targets: [
        {
          format: fmt,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "point-list" },
  });

  const scopeErr = await device.popErrorScope();
  if (scopeErr) throw new Error("WGSL validation: " + scopeErr.message);

  let frame = 0;
  const modeArr = new Float32Array(N_MODES * 4);

  const step = (o: StepOpts) => {
    frame += 1;

    const pbuf = new ArrayBuffer(32);
    const pu = new Uint32Array(pbuf);
    const pf = new Float32Array(pbuf);
    pu[0] = N;
    pu[1] = N_MODES;
    pu[2] = frame;
    pf[4] = o.jitter;
    pf[5] = o.rate;
    pf[6] = o.scaleX;
    pf[7] = o.scaleY;
    device.queue.writeBuffer(paramsBuf, 0, pbuf);

    for (let k = 0; k < N_MODES; k++) {
      modeArr[k * 4 + 0] = MODES[k].m;
      modeArr[k * 4 + 1] = MODES[k].n;
      modeArr[k * 4 + 2] = MODES[k].s;
      modeArr[k * 4 + 3] = o.weights[k];
    }
    device.queue.writeBuffer(modesBuf, 0, modeArr.buffer as ArrayBuffer);

    const enc = device.createCommandEncoder();
    {
      const bg = device.createBindGroup({
        layout: computePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: modesBuf } },
          { binding: 2, resource: { buffer: partBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(computePl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(N / 64));
      pass.end();
    }
    {
      const bg = device.createBindGroup({
        layout: renderPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: partBuf } },
        ],
      });
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.02, g: 0.014, b: 0.035, a: 1 },
          },
        ],
      });
      pass.setPipeline(renderPl);
      pass.setBindGroup(0, bg);
      pass.draw(N);
      pass.end();
    }
    device.queue.submit([enc.finish()]);
  };

  const destroy = () => {
    try {
      partBuf.destroy();
      paramsBuf.destroy();
      modesBuf.destroy();
      device.destroy();
    } catch {
      /* already gone */
    }
  };

  return { kind: "webgpu", step, destroy };
}
