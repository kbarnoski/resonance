// WebGPU compute-shader granular field for 2402-sandfall.
//
// GpuSim.create() feature-detects and initialises WebGPU; it throws on ANY
// failure (no navigator.gpu, no adapter/device, pipeline validation error,
// device lost) so the page can fall back to the CPU Canvas2D sim. Every
// value that could throw is inside try/catch at the call site.

import {
  SandSim,
  SimStats,
  WORLD_W,
  WORLD_H,
  DT,
  GRAVITY,
  SEED,
  mulberry32,
  radiusForCount,
  clamp,
} from "./sim";
import { COMPUTE_WGSL, RENDER_WGSL, PARAMS_FLOATS } from "./shaders";

const K_PER_CELL = 8;
const SOLVE_ITERS = 3;
const WG = 64;

const COMPUTE_ENTRIES = [
  "integrate",
  "clearGrid",
  "buildGrid",
  "solve",
  "applyCorr",
  "finalize",
] as const;
type ComputeEntry = (typeof COMPUTE_ENTRIES)[number];

export class GpuSim implements SandSim {
  readonly kind = "gpu" as const;
  readonly max: number;
  count = 0;
  stats: SimStats = { count: 0, energy: 0, flow: 0, fall: 0, contact: 0 };

  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;

  private r: number;
  private cell: number;
  private gx: number;
  private gy: number;
  private numCells: number;

  private paramsBuf: GPUBuffer;
  private particleBuf: GPUBuffer;
  private countsBuf: GPUBuffer;
  private bucketsBuf: GPUBuffer;
  private corrBuf: GPUBuffer;
  private statsBuf: GPUBuffer;
  private staging: GPUBuffer;

  private computeBG: GPUBindGroup;
  private renderBG: GPUBindGroup;
  private pipelines: Record<ComputeEntry, GPUComputePipeline>;
  private renderPipeline: GPURenderPipeline;

  private paramsArr = new Float32Array(PARAMS_FLOATS);
  private rnd = mulberry32(SEED);
  private mapPending = false;
  private impX = 0;
  private impY = 0;
  private impLeft = 0;

  private constructor(
    device: GPUDevice,
    ctx: GPUCanvasContext,
    format: GPUTextureFormat,
    max: number,
  ) {
    this.device = device;
    this.ctx = ctx;
    this.format = format;
    this.max = max;

    this.r = radiusForCount(max);
    this.cell = this.r * 2;
    this.gx = Math.ceil(WORLD_W / this.cell) + 1;
    this.gy = Math.ceil(WORLD_H / this.cell) + 1;
    this.numCells = this.gx * this.gy;

    const B = GPUBufferUsage;
    this.paramsBuf = device.createBuffer({
      size: PARAMS_FLOATS * 4,
      usage: B.UNIFORM | B.COPY_DST,
    });
    this.particleBuf = device.createBuffer({
      size: max * 6 * 4,
      usage: B.STORAGE | B.COPY_DST,
    });
    this.countsBuf = device.createBuffer({
      size: this.numCells * 4,
      usage: B.STORAGE,
    });
    this.bucketsBuf = device.createBuffer({
      size: this.numCells * K_PER_CELL * 4,
      usage: B.STORAGE,
    });
    this.corrBuf = device.createBuffer({
      size: max * 2 * 4,
      usage: B.STORAGE,
    });
    this.statsBuf = device.createBuffer({
      size: 4 * 4,
      usage: B.STORAGE | B.COPY_SRC,
    });
    this.staging = device.createBuffer({
      size: 4 * 4,
      usage: B.MAP_READ | B.COPY_DST,
    });

    // Bind group layouts.
    const st = (
      type: GPUBufferBindingType,
      binding: number,
      vis: number,
    ): GPUBindGroupLayoutEntry => ({
      binding,
      visibility: vis,
      buffer: { type },
    });
    const computeBGL = device.createBindGroupLayout({
      entries: [
        st("uniform", 0, GPUShaderStage.COMPUTE),
        st("storage", 1, GPUShaderStage.COMPUTE),
        st("storage", 2, GPUShaderStage.COMPUTE),
        st("storage", 3, GPUShaderStage.COMPUTE),
        st("storage", 4, GPUShaderStage.COMPUTE),
        st("storage", 5, GPUShaderStage.COMPUTE),
      ],
    });
    const renderBGL = device.createBindGroupLayout({
      entries: [
        st("uniform", 0, GPUShaderStage.VERTEX),
        st("read-only-storage", 1, GPUShaderStage.VERTEX),
      ],
    });

    this.computeBG = device.createBindGroup({
      layout: computeBGL,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuf } },
        { binding: 1, resource: { buffer: this.particleBuf } },
        { binding: 2, resource: { buffer: this.countsBuf } },
        { binding: 3, resource: { buffer: this.bucketsBuf } },
        { binding: 4, resource: { buffer: this.corrBuf } },
        { binding: 5, resource: { buffer: this.statsBuf } },
      ],
    });
    this.renderBG = device.createBindGroup({
      layout: renderBGL,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuf } },
        { binding: 1, resource: { buffer: this.particleBuf } },
      ],
    });

    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
    const renderModule = device.createShaderModule({ code: RENDER_WGSL });
    const computeLayout = device.createPipelineLayout({
      bindGroupLayouts: [computeBGL],
    });

    const pipelines = {} as Record<ComputeEntry, GPUComputePipeline>;
    for (const entry of COMPUTE_ENTRIES) {
      pipelines[entry] = device.createComputePipeline({
        layout: computeLayout,
        compute: { module: computeModule, entryPoint: entry },
      });
    }
    this.pipelines = pipelines;

    this.renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: {
        module: renderModule,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  static async create(
    canvas: HTMLCanvasElement,
    max: number,
  ): Promise<GpuSim> {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      throw new Error("navigator.gpu unavailable");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no WebGPU adapter");
    const device = await adapter.requestDevice();
    if (!device) throw new Error("no WebGPU device");

    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new Error("no webgpu canvas context");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });

    // Surface any pipeline/shader validation errors as a thrown error so the
    // caller can fall back to the CPU path.
    device.pushErrorScope("validation");
    const sim = new GpuSim(device, ctx, format, max);
    const err = await device.popErrorScope();
    if (err) {
      device.destroy();
      throw new Error("WebGPU validation: " + err.message);
    }
    return sim;
  }

  private writeParams() {
    const a = this.paramsArr;
    a[0] = WORLD_W;
    a[1] = WORLD_H;
    a[2] = this.r;
    a[3] = DT;
    a[4] = GRAVITY;
    a[5] = this.cell;
    a[6] = this.gx;
    a[7] = this.gy;
    a[8] = this.count;
    a[9] = K_PER_CELL;
    a[10] = this.impLeft > 0 ? this.impX : 0;
    a[11] = this.impLeft > 0 ? this.impY : 0;
    a[12] = 0.985;
    a[13] = 0;
    this.device.queue.writeBuffer(this.paramsBuf, 0, a);
  }

  pour(x: number, y: number, vx: number, vy: number, n: number) {
    const room = this.max - this.count;
    const emit = Math.min(n, room);
    if (emit <= 0) return;
    const r = this.r;
    const data = new Float32Array(emit * 6);
    for (let k = 0; k < emit; k++) {
      const px = clamp(x + (this.rnd() - 0.5) * r * 6, r, WORLD_W - r);
      const py = clamp(y + (this.rnd() - 0.5) * r * 2, r, WORLD_H - r);
      const pvx = vx + (this.rnd() - 0.5) * 0.15;
      const pvy = vy + 0.35 + this.rnd() * 0.15;
      const o = k * 6;
      data[o] = px;
      data[o + 1] = py;
      data[o + 2] = pvx;
      data[o + 3] = pvy;
      data[o + 4] = px; // prev = pos
      data[o + 5] = py;
    }
    this.device.queue.writeBuffer(
      this.particleBuf,
      this.count * 6 * 4,
      data,
    );
    this.count += emit;
  }

  shake(dir: number) {
    this.impX = dir * 1.35;
    this.impY = -0.25;
    this.impLeft = 3;
  }

  reset() {
    this.count = 0;
    this.stats = { count: 0, energy: 0, flow: 0, fall: 0, contact: 0 };
  }

  step() {
    if (this.impLeft > 0) this.impLeft--;
    this.writeParams();

    const dev = this.device;
    const enc = dev.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setBindGroup(0, this.computeBG);

    const partGroups = Math.ceil(Math.max(this.count, 1) / WG);
    const cellGroups = Math.ceil(this.numCells / WG);

    cpass.setPipeline(this.pipelines.integrate);
    cpass.dispatchWorkgroups(partGroups);

    if (this.count > 0) {
      for (let it = 0; it < SOLVE_ITERS; it++) {
        cpass.setPipeline(this.pipelines.clearGrid);
        cpass.dispatchWorkgroups(cellGroups);
        cpass.setPipeline(this.pipelines.buildGrid);
        cpass.dispatchWorkgroups(partGroups);
        cpass.setPipeline(this.pipelines.solve);
        cpass.dispatchWorkgroups(partGroups);
        cpass.setPipeline(this.pipelines.applyCorr);
        cpass.dispatchWorkgroups(partGroups);
      }
      cpass.setPipeline(this.pipelines.finalize);
      cpass.dispatchWorkgroups(partGroups);
    }
    cpass.end();

    // Encode the render pass on the same command buffer.
    const view = this.ctx.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.04, g: 0.04, b: 0.07, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    if (this.count > 0) {
      rpass.setPipeline(this.renderPipeline);
      rpass.setBindGroup(0, this.renderBG);
      rpass.draw(6, this.count);
    }
    rpass.end();

    let copiedStats = false;
    if (!this.mapPending) {
      enc.copyBufferToBuffer(this.statsBuf, 0, this.staging, 0, 16);
      copiedStats = true;
    }
    dev.queue.submit([enc.finish()]);

    if (copiedStats) {
      this.mapPending = true;
      const staging = this.staging;
      staging
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const raw = new Uint32Array(staging.getMappedRange().slice(0));
          staging.unmap();
          this.mapPending = false;
          this.readStats(raw);
        })
        .catch(() => {
          this.mapPending = false;
        });
    }
  }

  private readStats(raw: Uint32Array) {
    const n = this.count;
    if (n === 0) {
      this.stats = { count: 0, energy: 0, flow: 0, fall: 0, contact: 0 };
      return;
    }
    const speedSum = raw[0] / 4096;
    const fallSum = raw[1] / 4096;
    const moving = raw[2];
    const contactSum = raw[3] / 4096;
    this.stats = {
      count: n,
      energy: speedSum / n,
      flow: moving / n,
      fall: fallSum / n,
      contact: (contactSum / n) * 60,
    };
  }

  render() {
    // Rendering is encoded inside step() (same command buffer).
  }

  destroy() {
    try {
      this.paramsBuf.destroy();
      this.particleBuf.destroy();
      this.countsBuf.destroy();
      this.bucketsBuf.destroy();
      this.corrBuf.destroy();
      this.statsBuf.destroy();
      this.staging.destroy();
      this.device.destroy();
    } catch {
      // Already torn down.
    }
  }
}
