// cloud.ts — the 3D point-cloud renderer.
//
// A depth grid becomes a cloud of points floating in a dark blue-black volume.
// Projection + slow auto-orbit are computed on the CPU (shared by both render
// paths); each renderer just draws pre-projected additive sprites:
//   • runWebGPUCloud — instanced quads, additive blend (primary path).
//   • runCanvas2DCloud — the same sprites drawn with 2D additive compositing
//     (fallback when WebGPU/WebGL is unavailable).
//
// Palette (raw values, art layer only): near-black indigo ground, cool
// white/pale-blue points, ONE warm amber accent for the live present locus.

import type { MemoryNode, Locus } from "./memory";

export const SPAN = { x: 1.2, y: 0.9, z: 1.35 };

/** Horizontal world position → stereo pan (-1..1). */
export function panForWorldX(worldX: number): number {
  return Math.max(-1, Math.min(1, worldX / SPAN.x));
}

/** Grid cell (nx,ny in 0..1, depth 0..1, 1 = near) → world position. */
export function cellToWorld(
  nx: number,
  ny: number,
  depth: number,
): [number, number, number] {
  return [
    (nx - 0.5) * 2 * SPAN.x,
    (0.5 - ny) * 2 * SPAN.y,
    (depth - 0.5) * 2 * SPAN.z,
  ];
}

export interface Camera {
  yaw: number;
  pitch: number;
  dist: number;
  focal: number;
}

// Packed sprite stride: sx, sy (NDC, y-up), halfSize (NDC-y), r, g, b, a.
const STRIDE = 7;
const BG = { r: 0.02, g: 0.03, b: 0.075 };

interface Projected {
  sx: number;
  sy: number;
  scale: number;
  vis: boolean;
}

function project(
  wx: number,
  wy: number,
  wz: number,
  cam: Camera,
  aspect: number,
  out: Projected,
): void {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = wx * cy + wz * sy;
  const z1 = -wx * sy + wz * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const y2 = wy * cp - z1 * sp;
  const z2 = wy * sp + z1 * cp;
  const zc = cam.dist + z2;
  if (zc < 0.05) {
    out.vis = false;
    return;
  }
  const p = cam.focal / zc;
  out.sx = (x1 * p) / aspect;
  out.sy = y2 * p;
  out.scale = p;
  out.vis = true;
}

export interface FrameInput {
  grid: Float32Array;
  gw: number;
  gh: number;
  nodes: MemoryNode[];
  locus: Locus;
  dwellProgress: number;
  cam: Camera;
  aspect: number;
  t: number;
}

export interface FrameOutput {
  cloud: Float32Array;
  cloudCount: number;
  glow: Float32Array;
  glowCount: number;
}

/** Reusable projector: preallocates buffers, no per-frame GC. */
export function createFrameBuilder(gw: number, gh: number, maxGlow: number) {
  const cloud = new Float32Array(gw * gh * STRIDE);
  const glow = new Float32Array(maxGlow * STRIDE);
  const pr: Projected = { sx: 0, sy: 0, scale: 1, vis: true };

  function build(input: FrameInput): FrameOutput {
    const { grid, cam, aspect } = input;
    let ci = 0;
    for (let gy = 0; gy < gh; gy++) {
      const ny = gy / (gh - 1);
      for (let gx = 0; gx < gw; gx++) {
        const nx = gx / (gw - 1);
        const depth = grid[gy * gw + gx];
        const [wx, wy, wz] = cellToWorld(nx, ny, depth);
        project(wx, wy, wz, cam, aspect, pr);
        if (!pr.vis) continue;
        // depth → cool blue (far) to pale white-blue (near)
        const r = 0.32 + depth * 0.55;
        const g = 0.48 + depth * 0.45;
        const b = 0.82 + depth * 0.18;
        const a = 0.08 + depth * depth * 0.5;
        cloud[ci] = pr.sx;
        cloud[ci + 1] = pr.sy;
        cloud[ci + 2] = 0.006 * pr.scale;
        cloud[ci + 3] = r;
        cloud[ci + 4] = Math.min(1, g);
        cloud[ci + 5] = Math.min(1, b);
        cloud[ci + 6] = a;
        ci += STRIDE;
      }
    }

    let gi = 0;
    const pushGlow = (
      wx: number,
      wy: number,
      wz: number,
      half: number,
      r: number,
      g: number,
      b: number,
      a: number,
    ) => {
      if (gi >= glow.length) return;
      project(wx, wy, wz, cam, aspect, pr);
      if (!pr.vis) return;
      glow[gi] = pr.sx;
      glow[gi + 1] = pr.sy;
      glow[gi + 2] = half * pr.scale;
      glow[gi + 3] = r;
      glow[gi + 4] = g;
      glow[gi + 5] = b;
      glow[gi + 6] = a;
      gi += STRIDE;
    };

    // memory-nodes: pale-blue glow, whitening + swelling with proximity
    for (const n of input.nodes) {
      const s = n.swell;
      const r = 0.55 + s * 0.45;
      const g = 0.75 + s * 0.25;
      const b = 1.0;
      const a = 0.35 + n.glow * 0.6;
      pushGlow(n.x, n.y, n.z, 0.05 + s * 0.05, r, g, b, a);
      // bright core
      pushGlow(n.x, n.y, n.z, 0.014 + s * 0.012, 0.9, 0.96, 1.0, 0.5 + s * 0.4);
    }

    // live present locus: the ONE warm amber accent, pulsing with dwell progress
    const L = input.locus;
    if (L.level > 0.02) {
      const pulse = 0.5 + 0.5 * Math.sin(input.t * 3.0);
      const dwell = input.dwellProgress;
      const half = 0.05 + L.level * 0.05 + dwell * 0.04 * pulse;
      const a = 0.5 + L.level * 0.5;
      pushGlow(L.x, L.y, L.z, half, 1.0, 0.72, 0.34, a);
      pushGlow(L.x, L.y, L.z, 0.016, 1.0, 0.9, 0.7, 0.7);
    }

    return {
      cloud,
      cloudCount: ci / STRIDE,
      glow,
      glowCount: gi / STRIDE,
    };
  }

  return { build };
}

export interface CloudRenderer {
  render(frame: FrameOutput, aspect: number): void;
  dispose(): void;
}

// ── minimal local WebGPU types (no @webgpu/types dep, no `any`) ───────────────
interface GPUBufferT {
  destroy(): void;
}
interface GPUQueueT {
  writeBuffer(b: GPUBufferT, off: number, d: ArrayBufferView): void;
  submit(c: object[]): void;
}
interface GPUPipelineT {
  getBindGroupLayout(i: number): object;
}
interface GPURenderPassT {
  setPipeline(p: object): void;
  setBindGroup(i: number, bg: object): void;
  setVertexBuffer(slot: number, b: GPUBufferT): void;
  draw(v: number, inst?: number): void;
  end(): void;
}
interface GPUEncoderT {
  beginRenderPass(d: object): GPURenderPassT;
  finish(): object;
}
interface GPUDeviceT {
  createBuffer(d: { size: number; usage: number }): GPUBufferT;
  createShaderModule(d: { code: string }): object;
  createRenderPipeline(d: object): GPUPipelineT;
  createBindGroup(d: object): object;
  createCommandEncoder(): GPUEncoderT;
  queue: GPUQueueT;
  destroy(): void;
}
interface GPUAdapterT {
  requestDevice(): Promise<GPUDeviceT>;
}
interface GPUNav {
  requestAdapter(o?: { powerPreference?: string }): Promise<GPUAdapterT | null>;
  getPreferredCanvasFormat(): string;
}
interface GPUCanvasContextT {
  configure(d: object): void;
  getCurrentTexture(): { createView(): object };
  unconfigure(): void;
}

const U_VERTEX = 0x20;
const U_COPY_DST = 0x08;
const U_UNIFORM = 0x40;

const WGSL = /* wgsl */ `
struct U { misc: vec4f };            // x = aspect
@group(0) @binding(0) var<uniform> u: U;
struct VS {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
};
@vertex fn vs(
  @location(0) corner: vec2f,        // unit quad, -1..1
  @location(1) a: vec4f,             // sx, sy, half, r
  @location(2) b: vec3f              // g, b, a
) -> VS {
  let aspect = u.misc.x;
  let off = corner * a.z * vec2f(1.0 / aspect, 1.0);
  var o: VS;
  o.pos = vec4f(a.xy + off, 0.0, 1.0);
  o.uv = corner;
  o.col = vec4f(a.w, b.x, b.y, b.z);
  return o;
}
@fragment fn fs(in: VS) -> @location(0) vec4f {
  let d = length(in.uv);
  let core = smoothstep(1.0, 0.0, d);
  let i = core * core * in.col.a;
  return vec4f(in.col.rgb * i, i);
}
`;

export async function runWebGPUCloud(
  canvas: HTMLCanvasElement,
  maxInstances: number,
): Promise<CloudRenderer | null> {
  const nav = (navigator as unknown as { gpu?: GPUNav }).gpu;
  if (!nav) return null;
  const adapter = await nav.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu") as unknown as GPUCanvasContextT | null;
  if (!ctx) return null;
  const format = nav.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const shaderMod = device.createShaderModule({ code: WGSL });

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const quadBuf = device.createBuffer({
    size: quad.byteLength,
    usage: U_VERTEX | U_COPY_DST,
  });
  device.queue.writeBuffer(quadBuf, 0, quad);

  const instBuf = device.createBuffer({
    size: maxInstances * STRIDE * 4,
    usage: U_VERTEX | U_COPY_DST,
  });
  const uBuf = device.createBuffer({ size: 16, usage: U_UNIFORM | U_COPY_DST });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderMod,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 8,
          stepMode: "vertex",
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: STRIDE * 4,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x4" },
            { shaderLocation: 2, offset: 16, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: {
      module: shaderMod,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uBuf } }],
  });

  const uData = new Float32Array(4);

  return {
    render(frame, aspect) {
      const total = frame.cloudCount + frame.glowCount;
      if (total > maxInstances) return;
      device.queue.writeBuffer(
        instBuf,
        0,
        frame.cloud.subarray(0, frame.cloudCount * STRIDE),
      );
      device.queue.writeBuffer(
        instBuf,
        frame.cloudCount * STRIDE * 4,
        frame.glow.subarray(0, frame.glowCount * STRIDE),
      );
      uData[0] = aspect;
      device.queue.writeBuffer(uBuf, 0, uData);

      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: BG.r, g: BG.g, b: BG.b, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, quadBuf);
      pass.setVertexBuffer(1, instBuf);
      pass.draw(6, total);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    dispose() {
      try {
        quadBuf.destroy();
        instBuf.destroy();
        uBuf.destroy();
        ctx.unconfigure();
        device.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

export function runCanvas2DCloud(canvas: HTMLCanvasElement): CloudRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const drawSprites = (buf: Float32Array, count: number, glowMode: boolean) => {
    const W = canvas.width;
    const H = canvas.height;
    for (let k = 0; k < count; k++) {
      const o = k * STRIDE;
      const px = (buf[o] * 0.5 + 0.5) * W;
      const py = (1 - (buf[o + 1] * 0.5 + 0.5)) * H;
      const rad = Math.max(0.6, buf[o + 2] * H * 0.5);
      const r = (buf[o + 3] * 255) | 0;
      const g = (buf[o + 4] * 255) | 0;
      const b = (buf[o + 5] * 255) | 0;
      const a = buf[o + 6];
      if (glowMode) {
        const grd = ctx.createRadialGradient(px, py, 0, px, py, rad);
        grd.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, a)})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  return {
    render(frame) {
      const W = canvas.width;
      const H = canvas.height;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgb(${(BG.r * 255) | 0},${(BG.g * 255) | 0},${(BG.b * 255) | 0})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      drawSprites(frame.cloud, frame.cloudCount, false);
      drawSprites(frame.glow, frame.glowCount, true);
      ctx.globalCompositeOperation = "source-over";
    },
    dispose() {
      /* nothing to release */
    },
  };
}
