// ─────────────────────────────────────────────────────────────────────────────
// 1418-beat-field — WebGPU compute core (PRIMARY render tier).
//
// A WGSL COMPUTE shader is dispatched over a 256×256 field grid; each invocation
// sums the Gaussian-splatted roughness of the current partial-pair blobs (the
// same math as field.ts::sampleFieldAt) and writes a scalar into an rgba16float
// storage texture. A second render pass blits that field to the canvas with a
// cosmic-ambient → howl palette and an additive glow.
//
// Fails loud-but-clean: create() throws a typed WebGPUUnsupportedError on any
// init problem, and the canvas context is configured LAST so a failure leaves
// the canvas untouched for the WebGL2 / Canvas2D fallbacks.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_BLOBS, type FieldRenderer, type RenderFrame } from "./field";

export class WebGPUUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGPUUnsupportedError";
  }
}

const GRID = 256;
const WORKGROUP = 8;

// FParams byte layout (see writeCompute below): 16-byte header ×2 + 48 vec4.
const FPARAMS_BYTES = 32 + MAX_BLOBS * 16;
const RPARAMS_BYTES = 32;

const COMPUTE_WGSL = /* wgsl */ `
struct FParams {
  gridW     : u32,
  gridH     : u32,
  blobCount : u32,
  _pad0     : u32,
  time      : f32,
  drive     : f32,
  intensity : f32,
  baseGlow  : f32,
  blobs     : array<vec4<f32>, ${MAX_BLOBS}>,  // x, y, r, shimmerHz
};
@group(0) @binding(0) var<uniform> P : FParams;
@group(0) @binding(1) var dst : texture_storage_2d<rgba16float, write>;

const TAU = 6.28318530718;
const RADIUS_GAIN = 6.0;

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= P.gridW || gid.y >= P.gridH) { return; }
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5))
         / vec2<f32>(f32(P.gridW), f32(P.gridH));

  var val = 0.0;
  let count = i32(P.blobCount);
  for (var i = 0; i < count; i = i + 1) {
    let b = P.blobs[i];
    let sigma = 0.03 + 0.05 * min(1.0, b.z * RADIUS_GAIN);
    let d = uv - b.xy;
    let d2 = dot(d, d);
    let shimmer = 0.6 + 0.4 * sin(TAU * b.w * P.time);
    val = val + b.z * shimmer * exp(-d2 / (2.0 * sigma * sigma));
  }

  // A faint drifting nebula so the "lock" reads as dark calm, never dead black.
  let neb = 0.012 * (0.5 + 0.5 * sin(uv.x * 7.0 + P.time * 0.35))
                  * (0.5 + 0.5 * sin(uv.y * 5.0 - P.time * 0.27));
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(val + neb, P.drive, P.intensity, 1.0));
}
`;

const RENDER_WGSL = /* wgsl */ `
struct RParams {
  res       : vec2<f32>,
  time      : f32,
  intensity : f32,
  drive     : f32,
  glow      : f32,
  reduced   : f32,
  _pad      : f32,
};
@group(0) @binding(0) var<uniform> R : RParams;
@group(0) @binding(1) var field : texture_2d<f32>;
@group(0) @binding(2) var samp  : sampler;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0),
  );
  var out : VSOut;
  let xy = p[vi];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = vec2<f32>(xy.x * 0.5 + 0.5, 1.0 - (xy.y * 0.5 + 0.5));
  return out;
}

fn palette(x: f32, drive: f32) -> vec3<f32> {
  // Dark-violet floor (never black) → cool shimmer → warm → hot howl.
  let base = vec3<f32>(0.035, 0.02, 0.07);
  let cool = vec3<f32>(0.36, 0.30, 0.95);
  let warm = vec3<f32>(1.0, 0.52, 0.28);
  let hot  = vec3<f32>(1.0, 0.93, 0.82);
  var c = base;
  c = c + cool * smoothstep(0.0, 0.55, x) * 0.75;
  c = c + warm * smoothstep(0.45, 1.5, x);
  c = c + hot  * smoothstep(1.35, 2.6, x);
  return c * (0.55 + 0.85 * drive);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let raw = textureSampleLevel(field, samp, in.uv, 0.0).r;
  let x = raw * (0.8 + R.intensity * 1.6);
  var col = palette(x, R.drive);

  // Soft ambient radial glow so an idle lock is a calm nebula, not a void.
  let p = in.uv - vec2<f32>(0.5);
  let rr = length(p * vec2<f32>(1.4, 1.0));
  col = col + vec3<f32>(0.05, 0.04, 0.10) * (1.0 - smoothstep(0.0, 0.9, rr));

  // Gentle vignette for depth.
  col = col * (0.4 + 0.6 * (1.0 - smoothstep(0.55, 1.25, rr)));

  // Reduced-motion softens contrast toward the calm floor.
  col = mix(col, vec3<f32>(0.06, 0.045, 0.11) + col * 0.5, R.reduced * 0.5);
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

export async function createBeatFieldGPU(canvas: HTMLCanvasElement): Promise<FieldRenderer> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new WebGPUUnsupportedError("navigator.gpu is unavailable");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new WebGPUUnsupportedError("no WebGPU adapter (GPU/driver blocked)");

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (e) {
    throw new WebGPUUnsupportedError(
      "requestDevice failed: " + (e instanceof Error ? e.message : String(e)),
    );
  }

  let disposed = false;
  let deviceLost = false;
  void device.lost.then((info) => {
    deviceLost = true;
    if (!disposed && info.reason !== "destroyed") {
      console.warn("[beat-field] WebGPU device lost:", info.message);
    }
  });

  try {
    const format = navigator.gpu.getPreferredCanvasFormat();

    // ── field storage texture (compute writes, render samples) ────────────────
    const fieldTex = device.createTexture({
      size: [GRID, GRID],
      format: "rgba16float",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    const fieldView = fieldTex.createView();
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    const fparamsBuf = device.createBuffer({
      size: FPARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const rparamsBuf = device.createBuffer({
      size: RPARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "2d" },
        },
      ],
    });
    const renderLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeLayout] }),
      compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
    });
    const renderModule = device.createShaderModule({ code: RENDER_WGSL });
    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: { module: renderModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });

    const computeBind = device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: fparamsBuf } },
        { binding: 1, resource: fieldView },
      ],
    });
    const renderBind = device.createBindGroup({
      layout: renderLayout,
      entries: [
        { binding: 0, resource: { buffer: rparamsBuf } },
        { binding: 1, resource: fieldView },
        { binding: 2, resource: sampler },
      ],
    });

    // Bind the canvas context LAST — after every pipeline is built — so if any of
    // the above threw, the canvas is left clean for a fallback tier.
    const context = canvas.getContext("webgpu");
    if (!context) throw new WebGPUUnsupportedError("could not get a webgpu canvas context");

    const configure = () => {
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      context.configure({ device, format, alphaMode: "opaque" });
    };
    configure();

    const fData = new ArrayBuffer(FPARAMS_BYTES);
    const fu = new Uint32Array(fData);
    const ff = new Float32Array(fData);
    const rData = new ArrayBuffer(RPARAMS_BYTES);
    const rf = new Float32Array(rData);
    const groups = Math.ceil(GRID / WORKGROUP);

    const render = (frame: RenderFrame, timeSec: number) => {
      if (disposed || deviceLost) return;

      const blobs = frame.blobs;
      const count = Math.min(MAX_BLOBS, blobs.length);
      fu[0] = GRID;
      fu[1] = GRID;
      fu[2] = count;
      fu[3] = 0;
      ff[4] = timeSec;
      ff[5] = frame.drive;
      ff[6] = frame.intensity;
      ff[7] = 0;
      for (let i = 0; i < MAX_BLOBS; i++) {
        const base = 8 + i * 4;
        const b = i < count ? blobs[i] : null;
        ff[base + 0] = b ? b.x : 0;
        ff[base + 1] = b ? b.y : 0;
        ff[base + 2] = b ? b.r : 0;
        ff[base + 3] = b ? b.shimmerHz : 0;
      }
      device.queue.writeBuffer(fparamsBuf, 0, fData);

      rf[0] = canvas.width;
      rf[1] = canvas.height;
      rf[2] = timeSec;
      rf[3] = frame.intensity;
      rf[4] = frame.drive;
      rf[5] = 1;
      rf[6] = frame.reduced ? 1 : 0;
      device.queue.writeBuffer(rparamsBuf, 0, rData);

      const enc = device.createCommandEncoder();
      const cpass = enc.beginComputePass();
      cpass.setPipeline(computePipeline);
      cpass.setBindGroup(0, computeBind);
      cpass.dispatchWorkgroups(groups, groups);
      cpass.end();

      const rpass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.02, g: 0.012, b: 0.04, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rpass.setPipeline(renderPipeline);
      rpass.setBindGroup(0, renderBind);
      rpass.draw(3);
      rpass.end();
      device.queue.submit([enc.finish()]);
    };

    const resize = () => {
      if (disposed || deviceLost) return;
      configure();
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      try {
        context.unconfigure();
      } catch {
        /* ignore */
      }
      fieldTex.destroy();
      fparamsBuf.destroy();
      rparamsBuf.destroy();
      device.destroy();
    };

    return { tier: "webgpu", render, resize, dispose };
  } catch (e) {
    // Any pipeline/creation error → clean up the device and fall back.
    try {
      device.destroy();
    } catch {
      /* ignore */
    }
    if (e instanceof WebGPUUnsupportedError) throw e;
    throw new WebGPUUnsupportedError(
      "WebGPU pipeline init failed: " + (e instanceof Error ? e.message : String(e)),
    );
  }
}
