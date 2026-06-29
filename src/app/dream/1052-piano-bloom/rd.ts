/**
 * Gray-Scott reaction-diffusion field — the "resonating body" of Piano Bloom.
 *
 * Two chemicals U and V diffuse and react on a grid:
 *   U' = Du*∇²U - U*V² + f*(1-U)
 *   V' = Dv*∇²V + U*V² - (f+k)*V
 * (Pearson 1993 / Gray-Scott; Laplacian via a 3x3 stencil, double-buffered.)
 *
 * Two backends, feature-detected at runtime:
 *   - WebGPU compute shader (preferred) — the simulation step runs on the GPU
 *     in a compute pass with ping-pong storage buffers. This is the whole
 *     point: bring a real WebGPU compute body to the psych lane.
 *   - CPU / typed-array fallback — a smaller grid stepped in JS, rendered to a
 *     Canvas2D ImageData. Runs everywhere, never a blank screen.
 *
 * Both backends expose the same interface: step(), paint(), sample(), render().
 */

export type Backend = "webgpu" | "cpu";

export interface FieldSample {
  /** local V concentration 0..1 (bloom density) */
  v: number;
  /** local U concentration 0..1 */
  u: number;
  /** local gradient magnitude of V (edge / activity) 0..~1 */
  grad: number;
}

export interface RDParams {
  feed: number;
  kill: number;
  du: number;
  dv: number;
}

/** Warm psilocybin ramp: deep ember floor → rust → amber → ochre → moss → gold.
 *  Never cold. Indexed by a 0..1 scalar derived from V. */
export const WARM_RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [14, 8, 6]], // near-black ember floor
  [0.18, [74, 28, 14]], // deep rust
  [0.38, [150, 58, 22]], // burnt orange
  [0.55, [214, 120, 36]], // amber
  [0.7, [232, 168, 60]], // ochre gold
  [0.84, [150, 158, 64]], // moss highlight
  [1.0, [255, 240, 178]], // luminous gold
];

export function rampColor(t: number): [number, number, number] {
  const d = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = WARM_RAMP;
  for (let i = 1; i < s.length; i++) {
    if (d <= s[i][0]) {
      const [t0, c0] = s[i - 1];
      const [t1, c1] = s[i];
      const f = (d - t0) / (t1 - t0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return s[s.length - 1][1];
}

export interface RDField {
  readonly backend: Backend;
  readonly size: number;
  /** Run `n` simulation sub-steps (more = faster evolution). */
  step(n: number): void;
  /** Inject reagent V in a soft disc at grid-normalised (nx, ny) 0..1. */
  paint(nx: number, ny: number, radius: number, amount: number): void;
  /** Read the field at grid-normalised (nx, ny) 0..1. Cheap-ish CPU read. */
  sample(nx: number, ny: number): FieldSample;
  /** Draw the current field to the bound canvas. */
  render(): void;
  /** Re-seed to the resting state (U=1, V=0) plus a couple of seed dots. */
  reset(): void;
  dispose(): void;
}

const DEFAULT_PARAMS: RDParams = {
  feed: 0.037,
  kill: 0.062,
  du: 0.16,
  dv: 0.08,
};

/* ------------------------------------------------------------------ */
/* CPU backend                                                         */
/* ------------------------------------------------------------------ */

class CPUField implements RDField {
  readonly backend: Backend = "cpu";
  readonly size: number;
  private params: RDParams;
  private u: Float32Array;
  private v: Float32Array;
  private u2: Float32Array;
  private v2: Float32Array;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private getParams: () => RDParams;

  constructor(
    canvas: HTMLCanvasElement,
    size: number,
    getParams: () => RDParams,
  ) {
    this.size = size;
    this.getParams = getParams;
    this.params = getParams();
    const n = size * size;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.image = ctx.createImageData(size, size);
    this.reset();
  }

  reset() {
    this.u.fill(1);
    this.v.fill(0);
    const s = this.size;
    // A few seed blooms so the field is already alive on start.
    for (let k = 0; k < 3; k++) {
      const cx = ((k + 1) / 4) * s;
      const cy = (0.4 + 0.2 * Math.sin(k * 2.1)) * s;
      this.paint(cx / s, cy / s, 6 / s, 0.9);
    }
  }

  paint(nx: number, ny: number, radius: number, amount: number) {
    const s = this.size;
    const cx = nx * s;
    const cy = ny * s;
    const r = Math.max(1, radius * s);
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(s - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(s - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const fall = 1 - d2 / r2;
        const i = y * s + x;
        this.v[i] = Math.min(1, this.v[i] + amount * fall);
      }
    }
  }

  private idx(x: number, y: number): number {
    const s = this.size;
    // wrap (toroidal) — keeps blooms from piling at edges
    const xx = x < 0 ? x + s : x >= s ? x - s : x;
    const yy = y < 0 ? y + s : y >= s ? y - s : y;
    return yy * s + xx;
  }

  step(n: number) {
    this.params = this.getParams();
    const { feed, kill, du, dv } = this.params;
    const s = this.size;
    for (let pass = 0; pass < n; pass++) {
      const u = this.u;
      const v = this.v;
      const u2 = this.u2;
      const v2 = this.v2;
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = y * s + x;
          const cu = u[i];
          const cv = v[i];
          // Laplacian, 8-neighbour weighted stencil.
          const lapU =
            0.2 *
              (u[this.idx(x - 1, y)] +
                u[this.idx(x + 1, y)] +
                u[this.idx(x, y - 1)] +
                u[this.idx(x, y + 1)]) +
            0.05 *
              (u[this.idx(x - 1, y - 1)] +
                u[this.idx(x + 1, y - 1)] +
                u[this.idx(x - 1, y + 1)] +
                u[this.idx(x + 1, y + 1)]) -
            cu;
          const lapV =
            0.2 *
              (v[this.idx(x - 1, y)] +
                v[this.idx(x + 1, y)] +
                v[this.idx(x, y - 1)] +
                v[this.idx(x, y + 1)]) +
            0.05 *
              (v[this.idx(x - 1, y - 1)] +
                v[this.idx(x + 1, y - 1)] +
                v[this.idx(x - 1, y + 1)] +
                v[this.idx(x + 1, y + 1)]) -
            cv;
          const uvv = cu * cv * cv;
          let nu = cu + (du * lapU - uvv + feed * (1 - cu));
          let nv = cv + (dv * lapV + uvv - (kill + feed) * cv);
          nu = nu < 0 ? 0 : nu > 1 ? 1 : nu;
          nv = nv < 0 ? 0 : nv > 1 ? 1 : nv;
          u2[i] = nu;
          v2[i] = nv;
        }
      }
      // swap
      this.u = u2;
      this.v = v2;
      this.u2 = u;
      this.v2 = v;
    }
  }

  sample(nx: number, ny: number): FieldSample {
    const s = this.size;
    const x = Math.min(s - 1, Math.max(0, Math.round(nx * s)));
    const y = Math.min(s - 1, Math.max(0, Math.round(ny * s)));
    const i = y * s + x;
    const v = this.v[i];
    const u = this.u[i];
    // gradient of V from neighbours
    const gx = this.v[this.idx(x + 1, y)] - this.v[this.idx(x - 1, y)];
    const gy = this.v[this.idx(x, y + 1)] - this.v[this.idx(x, y - 1)];
    const grad = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 4);
    return { v, u, grad };
  }

  render() {
    const s = this.size;
    const data = this.image.data;
    const v = this.v;
    const u = this.u;
    for (let i = 0; i < s * s; i++) {
      // V drives the warm ramp; mix a little U for body so the floor glows.
      const t = v[i] * 1.6 + (1 - u[i]) * 0.25;
      const [r, g, b] = rampColor(t);
      const j = i * 4;
      data[j] = r;
      data[j + 1] = g;
      data[j + 2] = b;
      data[j + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  dispose() {
    // typed arrays are GC'd; nothing to release.
  }
}

/* ------------------------------------------------------------------ */
/* WebGPU backend                                                      */
/* ------------------------------------------------------------------ */

const RD_SHADER = /* wgsl */ `
struct Params {
  feed : f32,
  kill : f32,
  du : f32,
  dv : f32,
  size : u32,
  _pad0 : u32,
  _pad1 : u32,
  _pad2 : u32,
};

@group(0) @binding(0) var<storage, read> srcU : array<f32>;
@group(0) @binding(1) var<storage, read> srcV : array<f32>;
@group(0) @binding(2) var<storage, read_write> dstU : array<f32>;
@group(0) @binding(3) var<storage, read_write> dstV : array<f32>;
@group(0) @binding(4) var<uniform> P : Params;

fn wrap(c : i32, n : i32) -> i32 {
  if (c < 0) { return c + n; }
  if (c >= n) { return c - n; }
  return c;
}

fn at(arr : ptr<storage, array<f32>, read>, x : i32, y : i32, n : i32) -> f32 {
  let xx = wrap(x, n);
  let yy = wrap(y, n);
  return (*arr)[u32(yy * n + xx)];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = i32(P.size);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= n || y >= n) { return; }
  let i = u32(y * n + x);

  let cu = srcU[i];
  let cv = srcV[i];

  let lapU =
    0.2 * (at(&srcU, x-1, y, n) + at(&srcU, x+1, y, n) + at(&srcU, x, y-1, n) + at(&srcU, x, y+1, n)) +
    0.05 * (at(&srcU, x-1, y-1, n) + at(&srcU, x+1, y-1, n) + at(&srcU, x-1, y+1, n) + at(&srcU, x+1, y+1, n)) -
    cu;
  let lapV =
    0.2 * (at(&srcV, x-1, y, n) + at(&srcV, x+1, y, n) + at(&srcV, x, y-1, n) + at(&srcV, x, y+1, n)) +
    0.05 * (at(&srcV, x-1, y-1, n) + at(&srcV, x+1, y-1, n) + at(&srcV, x-1, y+1, n) + at(&srcV, x+1, y+1, n)) -
    cv;

  let uvv = cu * cv * cv;
  var nu = cu + (P.du * lapU - uvv + P.feed * (1.0 - cu));
  var nv = cv + (P.dv * lapV + uvv - (P.kill + P.feed) * cv);
  nu = clamp(nu, 0.0, 1.0);
  nv = clamp(nv, 0.0, 1.0);
  dstU[i] = nu;
  dstV[i] = nv;
}
`;

interface MinimalGPUDevice {
  createShaderModule(d: { code: string }): GPUShaderModule;
  createBuffer(d: GPUBufferDescriptor): GPUBuffer;
  createComputePipeline(d: GPUComputePipelineDescriptor): GPUComputePipeline;
  createBindGroup(d: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(): GPUCommandEncoder;
  queue: GPUQueue;
}

class WebGPUField implements RDField {
  readonly backend: Backend = "webgpu";
  readonly size: number;
  private device: GPUDevice;
  private getParams: () => RDParams;

  private bufU: [GPUBuffer, GPUBuffer];
  private bufV: [GPUBuffer, GPUBuffer];
  private paramBuf: GPUBuffer;
  private pipeline: GPUComputePipeline;
  private bindGroups: [GPUBindGroup, GPUBindGroup];
  private cur = 0;

  // CPU mirrors for paint/sample/render (kept in sync after each frame).
  private u: Float32Array;
  private v: Float32Array;
  private readbackU: GPUBuffer;
  private readbackV: GPUBuffer;
  private readbackBusy = false;

  private ctx: CanvasRenderingContext2D;
  private image: ImageData;

  constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    size: number,
    getParams: () => RDParams,
  ) {
    this.device = device;
    this.size = size;
    this.getParams = getParams;
    const n = size * size;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.image = ctx.createImageData(size, size);

    const dev = device as unknown as MinimalGPUDevice;
    const bytes = n * 4;
    const mk = () =>
      dev.createBuffer({
        size: bytes,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });
    this.bufU = [mk(), mk()];
    this.bufV = [mk(), mk()];

    this.paramBuf = dev.createBuffer({
      size: 32, // 8 * 4 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.readbackU = dev.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.readbackV = dev.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const shaderModule = dev.createShaderModule({ code: RD_SHADER });
    this.pipeline = dev.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    const layout = this.pipeline.getBindGroupLayout(0);
    const mkBind = (from: number) =>
      dev.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.bufU[from] } },
          { binding: 1, resource: { buffer: this.bufV[from] } },
          { binding: 2, resource: { buffer: this.bufU[1 - from] } },
          { binding: 3, resource: { buffer: this.bufV[1 - from] } },
          { binding: 4, resource: { buffer: this.paramBuf } },
        ],
      });
    this.bindGroups = [mkBind(0), mkBind(1)];

    this.reset();
  }

  private uploadFields() {
    this.device.queue.writeBuffer(this.bufU[this.cur], 0, this.u.buffer);
    this.device.queue.writeBuffer(this.bufV[this.cur], 0, this.v.buffer);
  }

  reset() {
    this.u.fill(1);
    this.v.fill(0);
    const s = this.size;
    for (let k = 0; k < 3; k++) {
      const cx = ((k + 1) / 4) * s;
      const cy = (0.4 + 0.2 * Math.sin(k * 2.1)) * s;
      this.paintLocal(cx / s, cy / s, 6 / s, 0.9);
    }
    this.uploadFields();
  }

  private paintLocal(nx: number, ny: number, radius: number, amount: number) {
    const s = this.size;
    const cx = nx * s;
    const cy = ny * s;
    const r = Math.max(1, radius * s);
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(s - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(s - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const fall = 1 - d2 / r2;
        const i = y * s + x;
        this.v[i] = Math.min(1, this.v[i] + amount * fall);
      }
    }
  }

  paint(nx: number, ny: number, radius: number, amount: number) {
    // Paint into the CPU mirror then push only the V buffer to the GPU.
    this.paintLocal(nx, ny, radius, amount);
    this.device.queue.writeBuffer(this.bufV[this.cur], 0, this.v.buffer);
  }

  step(n: number) {
    const p = this.getParams();
    const params = new ArrayBuffer(32);
    const f = new Float32Array(params);
    const u32 = new Uint32Array(params);
    f[0] = p.feed;
    f[1] = p.kill;
    f[2] = p.du;
    f[3] = p.dv;
    u32[4] = this.size;
    this.device.queue.writeBuffer(this.paramBuf, 0, params);

    const dev = this.device as unknown as MinimalGPUDevice;
    const wg = Math.ceil(this.size / 8);
    for (let pass = 0; pass < n; pass++) {
      const encoder = dev.createCommandEncoder();
      const cpass = encoder.beginComputePass();
      cpass.setPipeline(this.pipeline);
      cpass.setBindGroup(0, this.bindGroups[this.cur]);
      cpass.dispatchWorkgroups(wg, wg);
      cpass.end();
      this.device.queue.submit([encoder.finish()]);
      this.cur = 1 - this.cur;
    }
    // Kick off an async readback to refresh CPU mirrors for sample/render.
    void this.readback();
  }

  private async readback() {
    if (this.readbackBusy) return;
    this.readbackBusy = true;
    try {
      const dev = this.device as unknown as MinimalGPUDevice;
      const bytes = this.size * this.size * 4;
      const encoder = dev.createCommandEncoder();
      encoder.copyBufferToBuffer(
        this.bufU[this.cur],
        0,
        this.readbackU,
        0,
        bytes,
      );
      encoder.copyBufferToBuffer(
        this.bufV[this.cur],
        0,
        this.readbackV,
        0,
        bytes,
      );
      this.device.queue.submit([encoder.finish()]);

      await this.readbackU.mapAsync(GPUMapMode.READ);
      this.u.set(new Float32Array(this.readbackU.getMappedRange().slice(0)));
      this.readbackU.unmap();

      await this.readbackV.mapAsync(GPUMapMode.READ);
      this.v.set(new Float32Array(this.readbackV.getMappedRange().slice(0)));
      this.readbackV.unmap();
    } catch {
      /* device may be lost; CPU mirror just goes stale, no crash */
    } finally {
      this.readbackBusy = false;
    }
  }

  private idx(x: number, y: number): number {
    const s = this.size;
    const xx = x < 0 ? x + s : x >= s ? x - s : x;
    const yy = y < 0 ? y + s : y >= s ? y - s : y;
    return yy * s + xx;
  }

  sample(nx: number, ny: number): FieldSample {
    const s = this.size;
    const x = Math.min(s - 1, Math.max(0, Math.round(nx * s)));
    const y = Math.min(s - 1, Math.max(0, Math.round(ny * s)));
    const i = y * s + x;
    const v = this.v[i];
    const u = this.u[i];
    const gx = this.v[this.idx(x + 1, y)] - this.v[this.idx(x - 1, y)];
    const gy = this.v[this.idx(x, y + 1)] - this.v[this.idx(x, y - 1)];
    const grad = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 4);
    return { v, u, grad };
  }

  render() {
    const s = this.size;
    const data = this.image.data;
    const v = this.v;
    const u = this.u;
    for (let i = 0; i < s * s; i++) {
      const t = v[i] * 1.6 + (1 - u[i]) * 0.25;
      const [r, g, b] = rampColor(t);
      const j = i * 4;
      data[j] = r;
      data[j + 1] = g;
      data[j + 2] = b;
      data[j + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  dispose() {
    try {
      this.bufU.forEach((b) => b.destroy());
      this.bufV.forEach((b) => b.destroy());
      this.paramBuf.destroy();
      this.readbackU.destroy();
      this.readbackV.destroy();
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export async function createField(
  canvas: HTMLCanvasElement,
  getParams: () => RDParams = () => DEFAULT_PARAMS,
): Promise<RDField> {
  // Try WebGPU compute first.
  const nav = navigator as Navigator & { gpu?: GPU };
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        // Larger grid is comfortable on the GPU.
        return new WebGPUField(device, canvas, 256, getParams);
      }
    } catch {
      /* fall through to CPU */
    }
  }
  // CPU fallback at a smaller grid so it runs everywhere.
  return new CPUField(canvas, 160, getParams);
}

export { DEFAULT_PARAMS };
