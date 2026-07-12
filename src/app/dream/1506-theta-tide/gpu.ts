// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — the WebGPU compute + instanced-render stack for the oscillator lattice.
//
//   • two array<f32> storage buffers of per-cell phase, ping-ponged by WGSL_STEP
//   • an instanced-quad render pipeline (additive) that warps each cortical cell
//     to screen via r = exp(u) and draws a soft breathing point
//
// All GPU objects are owned here and freed in dispose(). No blocking readback —
// audio is driven entirely from the CPU-side WaveEngine, so the GPU never stalls.
// ─────────────────────────────────────────────────────────────────────────────

import { WGSL_STEP, RENDER_WGSL } from "./shaders";
import { GX, GV, U_MIN, U_MAX, EXP_UMAX, NSRC_MAX, type SrcPacked } from "./sim";

export interface GpuInit {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export async function requestGpu(canvas: HTMLCanvasElement): Promise<GpuInit | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    return null;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  return { device, context, format };
}

export interface StepArgs {
  coupling: number;
  forcing: number;
  noise: number;
  dt: number;
  nSrc: number;
  src: SrcPacked; // length NSRC_MAX*4
}

export interface RenderArgs {
  breath: number;
  bright: number;
  hueBase: number;
  satMul: number;
}

export class GpuField {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private canvas: HTMLCanvasElement;
  private dpr: number;

  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private stepU: GPUBuffer;
  private rendU: GPUBuffer;

  private stepPipe: GPUComputePipeline;
  private rendPipe: GPURenderPipeline;

  private stepAB = new ArrayBuffer(144);
  private rendAB = new ArrayBuffer(48);
  private frame = 0;
  private outW = 2;
  private outH = 2;
  private disposed = false;

  constructor(init: GpuInit, canvas: HTMLCanvasElement, seed: Float32Array<ArrayBuffer>) {
    this.device = init.device;
    this.context = init.context;
    this.format = init.format;
    this.canvas = canvas;
    this.dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

    const dev = this.device;
    const cells = GX * GV;
    const mk = () =>
      dev.createBuffer({
        size: cells * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
    this.bufA = mk();
    this.bufB = mk();
    dev.queue.writeBuffer(this.bufA, 0, seed);

    this.stepU = dev.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.rendU = dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    this.stepPipe = dev.createComputePipeline({
      layout: "auto",
      compute: { module: dev.createShaderModule({ code: WGSL_STEP }), entryPoint: "main" },
    });
    this.rendPipe = dev.createRenderPipeline({
      layout: "auto",
      vertex: { module: dev.createShaderModule({ code: RENDER_WGSL }), entryPoint: "vs" },
      fragment: {
        module: dev.createShaderModule({ code: RENDER_WGSL }),
        entryPoint: "fs",
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-strip" },
    });

    this.resize();
  }

  resize(): void {
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * this.dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * this.dpr));
    if (w === this.outW && h === this.outH && this.canvas.width === w) return;
    this.outW = w;
    this.outH = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  step(a: StepArgs, substeps: number): void {
    if (this.disposed) return;
    const dev = this.device;
    const u32 = new Uint32Array(this.stepAB);
    const f32 = new Float32Array(this.stepAB);
    u32[0] = GX;
    u32[1] = GV;
    u32[3] = a.nSrc; // [2] = frame, set per substep
    // scal @16, geo @32, src @48
    f32[4] = a.coupling;
    f32[5] = a.forcing;
    f32[6] = a.noise;
    f32[7] = a.dt;
    f32[8] = U_MIN;
    f32[9] = U_MAX;
    for (let i = 0; i < NSRC_MAX * 4; i++) f32[12 + i] = a.src[i] || 0;

    const enc = dev.createCommandEncoder();
    const wgx = Math.ceil(GX / 8);
    const wgy = Math.ceil(GV / 8);
    for (let s = 0; s < substeps; s++) {
      u32[2] = this.frame++;
      dev.queue.writeBuffer(this.stepU, 0, this.stepAB);
      const bg = dev.createBindGroup({
        layout: this.stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.bufA } },
          { binding: 1, resource: { buffer: this.bufB } },
          { binding: 2, resource: { buffer: this.stepU } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(this.stepPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wgx, wgy);
      pass.end();
      const t = this.bufA;
      this.bufA = this.bufB;
      this.bufB = t;
    }
    dev.queue.submit([enc.finish()]);
  }

  render(a: RenderArgs): void {
    if (this.disposed) return;
    this.resize();
    const dev = this.device;
    const u32 = new Uint32Array(this.rendAB);
    const f32 = new Float32Array(this.rendAB);
    u32[0] = GX;
    u32[1] = GV;
    f32[2] = this.outW;
    f32[3] = this.outH;
    f32[4] = U_MIN;
    f32[5] = U_MAX;
    f32[6] = EXP_UMAX;
    f32[7] = this.dpr;
    f32[8] = a.breath;
    f32[9] = a.bright;
    f32[10] = a.hueBase;
    f32[11] = a.satMul;
    dev.queue.writeBuffer(this.rendU, 0, this.rendAB);

    const enc = dev.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    const bg = dev.createBindGroup({
      layout: this.rendPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bufA } },
        { binding: 1, resource: { buffer: this.rendU } },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view, loadOp: "clear", storeOp: "store", clearValue: { r: 0.01, g: 0.006, b: 0.02, a: 1 } },
      ],
    });
    pass.setPipeline(this.rendPipe);
    pass.setBindGroup(0, bg);
    pass.draw(4, GX * GV);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.bufA.destroy();
      this.bufB.destroy();
      this.stepU.destroy();
      this.rendU.destroy();
      this.device.destroy();
    } catch {
      /* device already lost */
    }
  }
}
