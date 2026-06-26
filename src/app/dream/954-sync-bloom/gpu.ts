// gpu.ts — raw WebGPU. The whole point of the piece lives here: a WGSL
// @compute shader integrates the Kuramoto field on the GPU, a render pass
// paints it as a glowing phase-field, and we async-mapAsync the phases back to
// the CPU every few frames so harmony can be read off the locked clusters.
//
// We use the global @webgpu/types (referenced via _shared/webgpu.d.ts), so
// GPUDevice / GPUBufferUsage / etc. are real ambient types — no `any`.
//
// Pipeline per frame:
//   1. reduce pass   : sum cos(theta), sin(theta) over the field -> order param
//   2. advance pass  : theta_i += (omega_i + K_i * r * sin(psi - theta_i)) * dt
//   3. render pass   : full-screen-ish instanced points, hue = phase, glow = r
// Readback (every few frames): copy phase buffer -> staging -> mapAsync.

import type { FieldConfig } from "./kuramoto";

const WG = 64;

// ── uniforms ─────────────────────────────────────────────────────────────────
// SimU (compute): dt, kGlobal, n, time, orderR, orderPsi, pad, pad  (8 floats? mixed)
// We pack as floats; n is read as u32 via bitcast-free separate field.

// ── reduce shader: partial sums of cos/sin per workgroup ─────────────────────
const REDUCE_WGSL = /* wgsl */ `
struct SimU { dt: f32, kGlobal: f32, n: f32, time: f32, orderR: f32, orderPsi: f32, p0: f32, p1: f32 }
@group(0) @binding(0) var<storage, read> phase: array<f32>;
@group(0) @binding(1) var<storage, read_write> partial: array<vec2f>; // per-workgroup (sumCos,sumSin)
@group(0) @binding(2) var<uniform> u: SimU;

var<workgroup> sc: array<vec2f, ${WG}>;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u) {
  let i = gid.x;
  let n = u32(u.n);
  var v = vec2f(0.0, 0.0);
  if (i < n) {
    let th = phase[i];
    v = vec2f(cos(th), sin(th));
  }
  sc[lid.x] = v;
  workgroupBarrier();
  // tree reduction within the workgroup
  var stride = ${WG}u / 2u;
  loop {
    if (stride == 0u) { break; }
    if (lid.x < stride) {
      sc[lid.x] = sc[lid.x] + sc[lid.x + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }
  if (lid.x == 0u) {
    partial[wid.x] = sc[0];
  }
}`;

// ── advance shader: each phase steps toward the mean field ───────────────────
const ADVANCE_WGSL = /* wgsl */ `
struct SimU { dt: f32, kGlobal: f32, n: f32, time: f32, orderR: f32, orderPsi: f32, p0: f32, p1: f32 }
@group(0) @binding(0) var<storage, read_write> phase: array<f32>;
@group(0) @binding(1) var<storage, read> omega: array<f32>;
@group(0) @binding(2) var<storage, read> kLocal: array<f32>;
@group(0) @binding(3) var<uniform> u: SimU;

const TWO_PI = 6.28318530718;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let n = u32(u.n);
  if (i >= n) { return; }
  let th = phase[i];
  let k = u.kGlobal * (1.0 + kLocal[i]);
  let dtheta = omega[i] + k * u.orderR * sin(u.orderPsi - th);
  var p = th + dtheta * u.dt;
  p = p - floor(p / TWO_PI) * TWO_PI; // wrap [0,2pi)
  phase[i] = p;
}`;

// ── render shader: instanced glowing points, hue = phase, brightness = lock ──
// Each oscillator is a soft point sprite on the grid. Its hue encodes phase;
// when neighbours share phase, contiguous bands read as coherent colour. The
// global order parameter r drives an overall bloom/contrast.
const RENDER_WGSL = /* wgsl */ `
struct RenderU { gridW: f32, gridH: f32, aspect: f32, orderR: f32, time: f32, pointSize: f32, p0: f32, p1: f32 }
@group(0) @binding(0) var<storage, read> phase: array<f32>;
@group(0) @binding(1) var<storage, read> omega: array<f32>;
@group(0) @binding(2) var<uniform> u: RenderU;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) ph: f32,
  @location(2) om: f32,
};

const OFF = array<vec2f, 6>(
  vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0),
  vec2f(-1.0,1.0),  vec2f(1.0,-1.0), vec2f(1.0,1.0)
);

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let gw = u32(u.gridW);
  let gx = f32(pi % gw);
  let gy = f32(pi / gw);
  // grid -> clip space, centred, with a small margin
  let nx = (gx + 0.5) / u.gridW;
  let ny = (gy + 0.5) / u.gridH;
  var cx = (nx * 2.0 - 1.0) * 0.94;
  var cy = (ny * 2.0 - 1.0) * 0.94;
  // aspect-correct so the field stays square
  if (u.aspect > 1.0) { cx = cx / u.aspect; } else { cy = cy * u.aspect; }
  let o = OFF[ci];
  let sz = u.pointSize;
  var vo: VO;
  vo.pos = vec4f(cx + o.x * sz, cy + o.y * sz, 0.0, 1.0);
  vo.uv = o;
  vo.ph = phase[pi];
  vo.om = omega[pi];
  return vo;
}

// hsv-ish: map phase (0..2pi) to a luminous hue
fn phaseColor(ph: f32) -> vec3f {
  let h = ph / 6.28318530718; // 0..1
  // bioluminescent palette: teal -> violet -> rose -> amber around the wheel
  let a = vec3f(0.10, 0.85, 0.80); // teal
  let b = vec3f(0.45, 0.30, 0.95); // violet
  let c = vec3f(0.98, 0.35, 0.62); // rose
  let d = vec3f(1.00, 0.72, 0.40); // amber
  let t = h * 4.0;
  if (t < 1.0) { return mix(a, b, t); }
  else if (t < 2.0) { return mix(b, c, t - 1.0); }
  else if (t < 3.0) { return mix(c, d, t - 2.0); }
  else { return mix(d, a, t - 3.0); }
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  let glow = pow(1.0 - d, 1.8);
  let col = phaseColor(in.ph);
  // brighter and more saturated as the field locks (orderR high)
  let lock = u.orderR;
  let bright = (0.35 + 0.9 * lock);
  let a = glow * (0.18 + 0.42 * lock);
  return vec4f(col * bright * glow, a);
}`;

export interface SyncGpu {
  readonly kind: "webgpu";
  step(dt: number, kGlobal: number, time: number): void;
  render(time: number, pointSize: number): void;
  /** request an async phase readback; resolves with a copy or null if busy. */
  readback(): Promise<Float32Array | null>;
  /** upload the per-oscillator coupling brush field. */
  writeKLocal(kLocal: Float32Array): void;
  resize(): void;
  dispose(): void;
}

export async function initSyncGpu(
  canvas: HTMLCanvasElement,
  cfg: FieldConfig,
  phase0: Float32Array,
  omega: Float32Array,
): Promise<SyncGpu | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;
  let device: GPUDevice;
  try {
    const adapter = await nav.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = nav.gpu.getPreferredCanvasFormat();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  sizeCanvas();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const n = cfg.n;
  const numGroups = Math.ceil(n / WG);

  const U = GPUBufferUsage;

  // storage buffers
  const phaseBuf = device.createBuffer({
    size: n * 4,
    usage: U.STORAGE | U.COPY_SRC | U.COPY_DST,
  });
  device.queue.writeBuffer(phaseBuf, 0, phase0.buffer as ArrayBuffer);

  const omegaBuf = device.createBuffer({
    size: n * 4,
    usage: U.STORAGE | U.COPY_DST,
  });
  device.queue.writeBuffer(omegaBuf, 0, omega.buffer as ArrayBuffer);

  const kLocalBuf = device.createBuffer({
    size: n * 4,
    usage: U.STORAGE | U.COPY_DST,
  });
  device.queue.writeBuffer(kLocalBuf, 0, new Float32Array(n));

  // per-workgroup partial sums (vec2 each)
  const partialBuf = device.createBuffer({
    size: numGroups * 2 * 4,
    usage: U.STORAGE | U.COPY_SRC,
  });
  // staging to read partial sums back (small) — we reduce final on CPU
  const partialStaging = device.createBuffer({
    size: numGroups * 2 * 4,
    usage: U.COPY_DST | U.MAP_READ,
  });

  // uniforms
  const simU = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST }); // 8 floats
  const renderU = device.createBuffer({
    size: 32,
    usage: U.UNIFORM | U.COPY_DST,
  });

  // staging for phase readback (chord detection)
  const phaseStaging = device.createBuffer({
    size: n * 4,
    usage: U.COPY_DST | U.MAP_READ,
  });

  // pipelines
  const reducePipe = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: REDUCE_WGSL }),
      entryPoint: "main",
    },
  });
  const advancePipe = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: ADVANCE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const reduceBG = device.createBindGroup({
    layout: reducePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: phaseBuf } },
      { binding: 1, resource: { buffer: partialBuf } },
      { binding: 2, resource: { buffer: simU } },
    ],
  });
  const advanceBG = device.createBindGroup({
    layout: advancePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: phaseBuf } },
      { binding: 1, resource: { buffer: omegaBuf } },
      { binding: 2, resource: { buffer: kLocalBuf } },
      { binding: 3, resource: { buffer: simU } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: phaseBuf } },
      { binding: 1, resource: { buffer: omegaBuf } },
      { binding: 2, resource: { buffer: renderU } },
    ],
  });

  const simArr = new Float32Array(8);
  const renderArr = new Float32Array(8);

  // CPU-side cache of the latest order parameter (from partial-sum readback)
  let orderR = 0;
  let orderPsi = 0;
  let reduceBusy = false;
  let readBusy = false;

  // async: fold partial sums each call to keep r/psi current for the next step
  const foldOrder = async (groups: number) => {
    if (reduceBusy) return;
    reduceBusy = true;
    try {
      await partialStaging.mapAsync(GPUMapMode.READ);
      const data = new Float32Array(partialStaging.getMappedRange().slice(0));
      partialStaging.unmap();
      let sc = 0;
      let ss = 0;
      for (let g = 0; g < groups; g++) {
        sc += data[g * 2];
        ss += data[g * 2 + 1];
      }
      const mc = sc / n;
      const ms = ss / n;
      orderR = Math.sqrt(mc * mc + ms * ms);
      orderPsi = Math.atan2(ms, mc);
    } catch {
      /* keep previous order */
    } finally {
      reduceBusy = false;
    }
  };

  return {
    kind: "webgpu",
    step(dt: number, kGlobal: number, time: number) {
      simArr[0] = dt;
      simArr[1] = kGlobal;
      simArr[2] = n;
      simArr[3] = time;
      simArr[4] = orderR;
      simArr[5] = orderPsi;
      device.queue.writeBuffer(simU, 0, simArr);

      const enc = device.createCommandEncoder();
      // reduce -> partial sums
      const rp = enc.beginComputePass();
      rp.setPipeline(reducePipe);
      rp.setBindGroup(0, reduceBG);
      rp.dispatchWorkgroups(numGroups);
      rp.end();
      // copy partials to staging (so foldOrder can read them)
      if (!reduceBusy) {
        enc.copyBufferToBuffer(
          partialBuf,
          0,
          partialStaging,
          0,
          numGroups * 2 * 4,
        );
      }
      // advance using the order parameter cached from the PREVIOUS frame's fold
      const ap = enc.beginComputePass();
      ap.setPipeline(advancePipe);
      ap.setBindGroup(0, advanceBG);
      ap.dispatchWorkgroups(numGroups);
      ap.end();
      device.queue.submit([enc.finish()]);

      // kick off async fold for next frame
      void foldOrder(numGroups);
    },

    render(time: number, pointSize: number) {
      sizeCanvas();
      const aspect = canvas.width / Math.max(1, canvas.height);
      renderArr[0] = cfg.gridW;
      renderArr[1] = cfg.gridH;
      renderArr[2] = aspect;
      renderArr[3] = orderR;
      renderArr[4] = time;
      renderArr[5] = pointSize;
      device.queue.writeBuffer(renderU, 0, renderArr);

      const enc = device.createCommandEncoder();
      const view = ctx.getCurrentTexture().createView();
      const bg = 0.015 + orderR * 0.01;
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: bg, g: bg * 0.9, b: bg * 1.2, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(renderPipe);
      pass.setBindGroup(0, renderBG);
      pass.draw(n * 6);
      pass.end();
      device.queue.submit([enc.finish()]);
    },

    async readback(): Promise<Float32Array | null> {
      if (readBusy) return null;
      readBusy = true;
      try {
        const enc = device.createCommandEncoder();
        enc.copyBufferToBuffer(phaseBuf, 0, phaseStaging, 0, n * 4);
        device.queue.submit([enc.finish()]);
        await phaseStaging.mapAsync(GPUMapMode.READ);
        const copy = new Float32Array(phaseStaging.getMappedRange().slice(0));
        phaseStaging.unmap();
        return copy;
      } catch {
        return null;
      } finally {
        readBusy = false;
      }
    },

    writeKLocal(kLocal: Float32Array) {
      device.queue.writeBuffer(kLocalBuf, 0, kLocal.buffer as ArrayBuffer);
    },

    resize() {
      sizeCanvas();
    },

    dispose() {
      const bufs = [
        phaseBuf,
        omegaBuf,
        kLocalBuf,
        partialBuf,
        partialStaging,
        simU,
        renderU,
        phaseStaging,
      ];
      for (const b of bufs) {
        try {
          b.destroy();
        } catch {
          /* noop */
        }
      }
      try {
        ctx.unconfigure();
      } catch {
        /* noop */
      }
      try {
        device.destroy();
      } catch {
        /* noop */
      }
    },
  };
}
