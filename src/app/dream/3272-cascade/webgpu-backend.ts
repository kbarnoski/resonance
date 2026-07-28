// Raw-WebGPU backend: a WGSL compute shader integrates + collides ~30k
// particles GPU-side each frame; a WebGPU render pipeline draws them as additive
// point-sprites straight from the same storage buffer. Bar strikes accumulate in
// an atomic storage buffer that is copied back to the CPU (36 bytes/frame) via a
// small ring of mapped staging buffers to drive audio.

import {
  BAR_COUNT,
  GPU_COUNT,
  MAX_DEFLECTORS,
  initState,
  buildComputeWGSL,
  buildRenderWGSL,
  type Backend,
  type SimParams,
} from "./sim";

const HITS_BYTES = BAR_COUNT * 4;
const STAGING_RING = 3;

export class WebGPUBackend implements Backend {
  readonly kind = "webgpu" as const;
  readonly count = GPU_COUNT;
  readonly hits = new Int32Array(BAR_COUNT);

  private constructor(
    private device: GPUDevice,
    private ctx: GPUCanvasContext,
    private canvas: HTMLCanvasElement,
    private computePipeline: GPUComputePipeline,
    private renderPipeline: GPURenderPipeline,
    private computeBG: GPUBindGroup,
    private renderBG: GPUBindGroup,
    private computeUni: GPUBuffer,
    private renderUni: GPUBuffer,
    private hitsBuf: GPUBuffer,
    private staging: GPUBuffer[],
  ) {}

  static async create(canvas: HTMLCanvasElement): Promise<WebGPUBackend> {
    if (!navigator.gpu) throw new Error("no-webgpu");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no-adapter");
    const device = await adapter.requestDevice();

    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("no-context");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });

    const { posvel, meta } = initState(GPU_COUNT);
    const posvelBuf = device.createBuffer({
      size: posvel.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(posvelBuf, 0, posvel);
    const metaBuf = device.createBuffer({
      size: meta.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(metaBuf, 0, meta);

    // compute uniforms: 8 scalars + 6*vec4 = 32 floats
    const computeUni = device.createBuffer({
      size: (8 + MAX_DEFLECTORS * 4) * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // render uniforms: 4 floats
    const renderUni = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const hitsBuf = device.createBuffer({
      size: HITS_BYTES,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const staging: GPUBuffer[] = [];
    for (let i = 0; i < STAGING_RING; i++) {
      staging.push(
        device.createBuffer({
          size: HITS_BYTES,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      );
    }

    const computeModule = device.createShaderModule({ code: buildComputeWGSL() });
    const computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: computeModule, entryPoint: "main" },
    });

    const renderModule = device.createShaderModule({ code: buildRenderWGSL() });
    const renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vmain" },
      fragment: {
        module: renderModule,
        entryPoint: "fmain",
        targets: [
          {
            format,
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
        { binding: 0, resource: { buffer: posvelBuf } },
        { binding: 1, resource: { buffer: metaBuf } },
        { binding: 2, resource: { buffer: computeUni } },
        { binding: 3, resource: { buffer: hitsBuf } },
      ],
    });
    const renderBG = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: posvelBuf } },
        { binding: 1, resource: { buffer: renderUni } },
      ],
    });

    return new WebGPUBackend(
      device,
      ctx,
      canvas,
      computePipeline,
      renderPipeline,
      computeBG,
      renderBG,
      computeUni,
      renderUni,
      hitsBuf,
      staging,
    );
  }

  private disposed = false;
  private busy = new Array<boolean>(STAGING_RING).fill(false);
  private zeros = new Uint32Array(BAR_COUNT);
  private uni = new Float32Array(8 + MAX_DEFLECTORS * 4);

  private syncCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  frame(dt: number, params: SimParams): void {
    if (this.disposed) return;
    this.syncCanvas();
    const device = this.device;

    // compute uniforms
    const u = this.uni;
    const nDef = Math.min(params.deflectors.length, MAX_DEFLECTORS);
    u[0] = Math.min(dt, 0.033);
    u[1] = params.flow;
    u[2] = Math.random() * 1000;
    u[3] = params.emitterX;
    u[4] = nDef;
    u[5] = 0;
    u[6] = 0;
    u[7] = 0;
    for (let k = 0; k < MAX_DEFLECTORS; k++) {
      const o = 8 + k * 4;
      if (k < nDef) {
        const d = params.deflectors[k];
        u[o] = d.cx;
        u[o + 1] = d.cy;
        u[o + 2] = d.angle;
        u[o + 3] = d.halfLen;
      } else {
        u[o] = -9;
        u[o + 1] = -9;
        u[o + 2] = 0;
        u[o + 3] = 0;
      }
    }
    device.queue.writeBuffer(this.computeUni, 0, u);

    // render uniforms — round point sprites regardless of canvas aspect
    const r = 1.6 * Math.min(window.devicePixelRatio || 1, 2);
    const sizeX = (2 * r) / Math.max(1, this.canvas.width);
    const sizeY = (2 * r) / Math.max(1, this.canvas.height);
    device.queue.writeBuffer(
      this.renderUni,
      0,
      new Float32Array([sizeX, sizeY, 3.5, 0]),
    );

    // reset atomic hit tally for this frame
    device.queue.writeBuffer(this.hitsBuf, 0, this.zeros);

    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(this.computePipeline);
    cp.setBindGroup(0, this.computeBG);
    cp.dispatchWorkgroups(Math.ceil(this.count / 64));
    cp.end();

    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(this.renderPipeline);
    rp.setBindGroup(0, this.renderBG);
    rp.draw(this.count * 6);
    rp.end();

    // copy this frame's tally into a free staging buffer for readback
    const slot = this.busy.indexOf(false);
    if (slot !== -1) {
      enc.copyBufferToBuffer(this.hitsBuf, 0, this.staging[slot], 0, HITS_BYTES);
    }
    device.queue.submit([enc.finish()]);

    if (slot !== -1) {
      this.busy[slot] = true;
      const buf = this.staging[slot];
      buf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (this.disposed) return;
          const counts = new Uint32Array(buf.getMappedRange().slice(0));
          for (let j = 0; j < BAR_COUNT; j++) this.hits[j] += counts[j];
          buf.unmap();
          this.busy[slot] = false;
        })
        .catch(() => {
          this.busy[slot] = false;
        });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.device.destroy();
    } catch {
      /* already gone */
    }
  }
}
