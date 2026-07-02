// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — WebGPU device/pipeline/buffer setup for the cortical neural field.
//
// Encapsulates the whole compute stack behind a small class:
//   - two array<vec2f> storage buffers ping-ponged by the reaction step
//   - a splat pass (inject excitation), a render pass (log-polar warp → texture),
//     a blit pipeline (texture → swap chain), and a reduce pass (field stats)
//   - a NON-BLOCKING async stats readback (copy → MAP_READ staging → mapAsync)
//     so audio gets live field statistics without stalling the GPU each frame.
// All GPU objects are owned here and freed in dispose().
// ─────────────────────────────────────────────────────────────────────────────

import {
  WGSL_STEP,
  WGSL_SPLAT,
  WGSL_RENDER,
  WGSL_REDUCE,
  BLIT_VERT,
  BLIT_FRAG,
} from "./shaders";

export interface Splat {
  gx: number;
  gy: number;
  rad: number;
  amp: number;
}

export interface RenderParams {
  uMin: number;
  uSpan: number;
  drift: number;
  vrot: number;
  bright: number;
  tint: number;
}

export interface FieldStats {
  mean: number;
  energy: number;
  density: number;
}

export interface GpuInit {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

/** Acquire a WebGPU device + configured canvas context, or null if unavailable. */
export async function requestGpu(canvas: HTMLCanvasElement): Promise<GpuInit | null> {
  if (!navigator.gpu) return null;
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

function packStep(grid: number, feed: number, kill: number, du: number, dv: number, dt: number): ArrayBuffer {
  const ab = new ArrayBuffer(32);
  new Uint32Array(ab, 0, 1)[0] = grid;
  new Float32Array(ab, 8, 6).set([feed, kill, du, dv, dt, 0]);
  return ab;
}

function packRender(
  grid: number,
  outW: number,
  outH: number,
  p: RenderParams,
): ArrayBuffer {
  const ab = new ArrayBuffer(48);
  const u = new Uint32Array(ab, 0, 4);
  u[0] = grid;
  u[1] = outW;
  u[2] = outH;
  u[3] = 0;
  new Float32Array(ab, 16, 8).set([p.uMin, p.uSpan, p.drift, p.vrot, p.bright, p.tint, 0, 0]);
  return ab;
}

export class GpuField {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private grid: number;

  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private stepParams: GPUBuffer;
  private splatParams: GPUBuffer;
  private renderParams: GPUBuffer;
  private reduceParams: GPUBuffer;
  private statsBuf: GPUBuffer;
  private statsStaging: GPUBuffer;

  private stepPipe: GPUComputePipeline;
  private splatPipe: GPUComputePipeline;
  private renderPipe: GPUComputePipeline;
  private reducePipe: GPUComputePipeline;
  private blitPipe: GPURenderPipeline;
  private sampler: GPUSampler;

  private outTex: GPUTexture;
  private outW = 2;
  private outH = 2;
  private dpr: number;
  private canvas: HTMLCanvasElement;

  private statsPending = false;
  private disposed = false;

  constructor(init: GpuInit, canvas: HTMLCanvasElement, grid: number, seed: Float32Array<ArrayBuffer>) {
    this.device = init.device;
    this.context = init.context;
    this.format = init.format;
    this.grid = grid;
    this.canvas = canvas;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    const cells = grid * grid;
    const dev = this.device;
    const mkField = () =>
      dev.createBuffer({
        size: cells * 8,
        usage:
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
    this.bufA = mkField();
    this.bufB = mkField();
    dev.queue.writeBuffer(this.bufA, 0, seed);

    this.stepParams = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.splatParams = dev.createBuffer({ size: 16 + 16 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.renderParams = dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.reduceParams = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(this.reduceParams, 0, new Uint32Array([grid, 0, 0, 0]));

    this.statsBuf = dev.createBuffer({
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.statsStaging = dev.createBuffer({
      size: 32,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.stepPipe = dev.createComputePipeline({
      layout: "auto",
      compute: { module: dev.createShaderModule({ code: WGSL_STEP }), entryPoint: "main" },
    });
    this.splatPipe = dev.createComputePipeline({
      layout: "auto",
      compute: { module: dev.createShaderModule({ code: WGSL_SPLAT }), entryPoint: "main" },
    });
    this.renderPipe = dev.createComputePipeline({
      layout: "auto",
      compute: { module: dev.createShaderModule({ code: WGSL_RENDER }), entryPoint: "main" },
    });
    this.reducePipe = dev.createComputePipeline({
      layout: "auto",
      compute: { module: dev.createShaderModule({ code: WGSL_REDUCE }), entryPoint: "main" },
    });
    this.blitPipe = dev.createRenderPipeline({
      layout: "auto",
      vertex: { module: dev.createShaderModule({ code: BLIT_VERT }), entryPoint: "vs" },
      fragment: {
        module: dev.createShaderModule({ code: BLIT_FRAG }),
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-strip" },
    });
    this.sampler = dev.createSampler({ magFilter: "linear", minFilter: "linear" });

    this.outTex = this.makeOutTex(2, 2);
    this.resize();
  }

  private makeOutTex(w: number, h: number): GPUTexture {
    return this.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  resize(): void {
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * this.dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * this.dpr));
    if (w === this.outW && h === this.outH && this.canvas.width === w) return;
    this.outW = w;
    this.outH = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.outTex.destroy();
    this.outTex = this.makeOutTex(w, h);
  }

  /** Run `substeps` reaction iterations, ping-ponging the two field buffers. */
  step(feed: number, kill: number, du: number, dv: number, dt: number, substeps: number): void {
    if (this.disposed) return;
    const dev = this.device;
    dev.queue.writeBuffer(this.stepParams, 0, packStep(this.grid, feed, kill, du, dv, dt));
    const enc = dev.createCommandEncoder();
    const wg = Math.ceil(this.grid / 8);
    for (let s = 0; s < substeps; s++) {
      const bg = dev.createBindGroup({
        layout: this.stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.bufA } },
          { binding: 1, resource: { buffer: this.bufB } },
          { binding: 2, resource: { buffer: this.stepParams } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(this.stepPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg);
      pass.end();
      const t = this.bufA;
      this.bufA = this.bufB;
      this.bufB = t;
    }
    dev.queue.submit([enc.finish()]);
  }

  /** Inject up to 16 excitation nuclei into the current field buffer. */
  splat(spots: Splat[]): void {
    if (this.disposed || spots.length === 0) return;
    const dev = this.device;
    const batch = spots.slice(0, 16);
    const ab = new ArrayBuffer(16 + 16 * 16);
    const u = new Uint32Array(ab, 0, 2);
    u[0] = this.grid;
    u[1] = batch.length;
    const f = new Float32Array(ab, 16);
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i];
      f[i * 4 + 0] = s.gx;
      f[i * 4 + 1] = s.gy;
      f[i * 4 + 2] = s.rad;
      f[i * 4 + 3] = s.amp;
    }
    dev.queue.writeBuffer(this.splatParams, 0, ab);
    const bg = dev.createBindGroup({
      layout: this.splatPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bufA } },
        { binding: 1, resource: { buffer: this.splatParams } },
      ],
    });
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.splatPipe);
    pass.setBindGroup(0, bg);
    const wg = Math.ceil(this.grid / 8);
    pass.dispatchWorkgroups(wg, wg);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  /** Render the field through the log-polar warp and blit to the canvas. */
  render(p: RenderParams): void {
    if (this.disposed) return;
    this.resize();
    const dev = this.device;
    dev.queue.writeBuffer(this.renderParams, 0, packRender(this.grid, this.outW, this.outH, p));
    const enc = dev.createCommandEncoder();

    const rbg = dev.createBindGroup({
      layout: this.renderPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bufA } },
        { binding: 1, resource: this.outTex.createView() },
        { binding: 2, resource: { buffer: this.renderParams } },
      ],
    });
    const rpass = enc.beginComputePass();
    rpass.setPipeline(this.renderPipe);
    rpass.setBindGroup(0, rbg);
    rpass.dispatchWorkgroups(Math.ceil(this.outW / 8), Math.ceil(this.outH / 8));
    rpass.end();

    const view = this.context.getCurrentTexture().createView();
    const blitBg = dev.createBindGroup({
      layout: this.blitPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.outTex.createView() },
      ],
    });
    const bpass = enc.beginRenderPass({
      colorAttachments: [
        { view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } },
      ],
    });
    bpass.setPipeline(this.blitPipe);
    bpass.setBindGroup(0, blitBg);
    bpass.draw(4);
    bpass.end();
    dev.queue.submit([enc.finish()]);
  }

  /**
   * Kick a reduce pass and, if no readback is in flight, copy the stats to a
   * mappable buffer and map it asynchronously. `onStats` fires later, off the
   * hot path — never awaited in the render loop, so the GPU never stalls.
   */
  readStats(onStats: (s: FieldStats) => void): void {
    if (this.disposed) return;
    const dev = this.device;
    const enc = dev.createCommandEncoder();
    const bg = dev.createBindGroup({
      layout: this.reducePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bufA } },
        { binding: 1, resource: { buffer: this.statsBuf } },
        { binding: 2, resource: { buffer: this.reduceParams } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.reducePipe);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(1);
    pass.end();
    if (!this.statsPending) {
      enc.copyBufferToBuffer(this.statsBuf, 0, this.statsStaging, 0, 32);
    }
    dev.queue.submit([enc.finish()]);

    if (this.statsPending) return;
    this.statsPending = true;
    this.statsStaging
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (this.disposed) return;
        const arr = new Float32Array(this.statsStaging.getMappedRange().slice(0));
        this.statsStaging.unmap();
        onStats({ mean: arr[0], energy: arr[1], density: arr[2] });
      })
      .catch(() => {
        /* device lost / closing */
      })
      .finally(() => {
        this.statsPending = false;
      });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.outTex.destroy();
      this.bufA.destroy();
      this.bufB.destroy();
      this.stepParams.destroy();
      this.splatParams.destroy();
      this.renderParams.destroy();
      this.reduceParams.destroy();
      this.statsBuf.destroy();
      this.statsStaging.destroy();
      this.device.destroy();
    } catch {
      /* ignore */
    }
  }
}
