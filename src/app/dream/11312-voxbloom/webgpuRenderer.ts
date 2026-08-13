// ─────────────────────────────────────────────────────────────────────────────
// webgpuRenderer.ts — the primary path: a real WebGPU compute + render pipeline.
//
//   • compute pass  (@compute @workgroup_size(64), dispatchWorkgroups):
//       each point reads its band amplitude and lerps its RADIUS (in a read/write
//       storage buffer) toward `floor + amp²·bloom`. Attack is faster than decay,
//       so loud harmonics bloom out crisply and quiet ones drift back in.
//   • render pass:
//       each point is expanded to a 2-triangle sprite; additive cyan→white
//       phosphor so overlapping shells glow.
// ─────────────────────────────────────────────────────────────────────────────

import {
  NUM_BANDS,
  N_GPU,
  buildDirections,
  buildInitialState,
} from "./geometry";

const WG = 64;

const COMPUTE_WGSL = /* wgsl */ `
struct Vec4 { v: vec4f }
struct CU {
  amps: array<vec4f, 8>,   // NUM_BANDS ≤ 32 amplitudes, packed 4/vec4
  params: vec4f,           // x=dt, y=bloom, z=attackRate, w=decayRate
}

@group(0) @binding(0) var<storage, read> dirs: array<Vec4>;
@group(0) @binding(1) var<storage, read_write> state: array<Vec4>;
@group(0) @binding(2) var<uniform> u: CU;

fn ampAt(b: u32) -> f32 {
  let v = u.amps[b / 4u];
  let c = b % 4u;
  if (c == 0u) { return v.x; }
  if (c == 1u) { return v.y; }
  if (c == 2u) { return v.z; }
  return v.w;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= ${N_GPU}u) { return; }
  let band = u32(dirs[i].v.w);
  let a = ampAt(band);
  let floorR = 0.16 + f32(band) * 0.011;
  let target = floorR + a * a * u.params.y;   // a² for a punchier bloom
  var s = state[i].v;
  let rate = select(u.params.w, u.params.z, target > s.x); // attack when growing
  let kr = clamp(rate * u.params.x, 0.0, 1.0);
  s.x = s.x + (target - s.x) * kr;
  let ki = clamp(7.0 * u.params.x, 0.0, 1.0);
  s.y = s.y + (a - s.y) * ki;
  state[i].v = s;
}`;

const VERT_WGSL = /* wgsl */ `
struct Vec4 { v: vec4f }
struct VU { mvp: mat4x4f, size: f32, p0: f32, p1: f32, p2: f32 }

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) intensity: f32,
  @location(1) uv: vec2f,
}

@group(0) @binding(0) var<storage, read> dirs: array<Vec4>;
@group(0) @binding(1) var<storage, read> state: array<Vec4>;
@group(0) @binding(2) var<uniform> u: VU;

const OFF = array<vec2f, 6>(
  vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(-0.5, 0.5),
  vec2f(-0.5, 0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5)
);

@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let r = state[pi].v.x;
  let dir = dirs[pi].v.xyz;
  let cl = u.mvp * vec4f(dir * r, 1.0);
  let o = OFF[ci];
  let sz = u.size * cl.w;
  var vo: VO;
  vo.pos = cl + vec4f(o.x * sz, o.y * sz, 0.0, 0.0);
  vo.intensity = state[pi].v.y;
  vo.uv = o + 0.5;
  return vo;
}`;

const FRAG_WGSL = /* wgsl */ `
@fragment fn main(
  @location(0) intensity: f32,
  @location(1) uv: vec2f
) -> @location(0) vec4f {
  let d = length(uv - 0.5);
  if (d > 0.5) { discard; }
  let glow = 1.0 - smoothstep(0.06, 0.5, d);
  let cyan = vec3f(0.16, 0.72, 0.95);
  let white = vec3f(0.85, 0.97, 1.0);
  let col = mix(cyan, white, clamp(intensity * 1.7, 0.0, 1.0));
  let a = glow * (0.09 + intensity * 0.6);
  return vec4f(col * a, a);
}`;

export interface GpuHandle {
  render(bands: Float32Array, mvp: Float32Array, dt: number): void;
  destroy(): void;
}

const BLOOM = 1.85;
const ATTACK_RATE = 9.0;
const DECAY_RATE = 2.6;

export async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuHandle> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const dirData = buildDirections(N_GPU);
  const dirBuf = device.createBuffer({
    size: dirData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(dirBuf, 0, dirData.buffer as ArrayBuffer);

  const stateData = buildInitialState(N_GPU);
  const stateBuf = device.createBuffer({
    size: stateData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(stateBuf, 0, stateData.buffer as ArrayBuffer);

  // amps: 8 vec4 (128) + params vec4 (16) = 144 bytes.
  const computeUniBuf = device.createBuffer({
    size: 144,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // mat4 (64) + size + pad×3 (16) = 80 bytes.
  const renderUniBuf = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: VERT_WGSL }), entryPoint: "main" },
    fragment: {
      module: device.createShaderModule({ code: FRAG_WGSL }),
      entryPoint: "main",
      targets: [
        {
          format: fmt,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "zero", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: dirBuf } },
      { binding: 1, resource: { buffer: stateBuf } },
      { binding: 2, resource: { buffer: computeUniBuf } },
    ],
  });

  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: dirBuf } },
      { binding: 1, resource: { buffer: stateBuf } },
      { binding: 2, resource: { buffer: renderUniBuf } },
    ],
  });

  // Reusable scratch buffers.
  const computeUni = new Float32Array(36); // 32 amps + 4 params
  const renderUni = new Float32Array(20); // 16 mat4 + 4

  function render(bands: Float32Array, mvp: Float32Array, dt: number) {
    computeUni.fill(0);
    for (let b = 0; b < NUM_BANDS; b++) computeUni[b] = bands[b];
    computeUni[32] = dt;
    computeUni[33] = BLOOM;
    computeUni[34] = ATTACK_RATE;
    computeUni[35] = DECAY_RATE;
    device.queue.writeBuffer(computeUniBuf, 0, computeUni.buffer as ArrayBuffer);

    renderUni.set(mvp, 0);
    renderUni[16] = 0.004; // point half-size in NDC
    device.queue.writeBuffer(renderUniBuf, 0, renderUni.buffer as ArrayBuffer);

    const cmd = device.createCommandEncoder();

    const cp = cmd.beginComputePass();
    cp.setPipeline(computePipeline);
    cp.setBindGroup(0, computeBG);
    cp.dispatchWorkgroups(Math.ceil(N_GPU / WG));
    cp.end();

    const rp = cmd.beginRenderPass({
      colorAttachments: [
        {
          view: ctx!.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0.008, g: 0.01, b: 0.02, a: 1 },
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(renderPipeline);
    rp.setBindGroup(0, renderBG);
    rp.draw(N_GPU * 6);
    rp.end();

    device.queue.submit([cmd.finish()]);
  }

  return {
    render,
    destroy() {
      device.destroy();
    },
  };
}
