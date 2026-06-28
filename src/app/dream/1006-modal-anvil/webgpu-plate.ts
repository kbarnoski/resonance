// WebGPU finite-difference thin-plate simulation.
//
// The plate field lives in GPU storage buffers (prev / curr / next), updated by
// a @compute shader that implements the damped stiff Kirchhoff–Love plate with
// non-linear tension modulation. Many substeps run per animation frame so the
// simulation advances near audio rate. A second tiny "pickup" buffer collects
// the displacement at one cell on every substep, giving a per-frame BLOCK of
// real simulated pickup samples that the audio worklet drains and resamples.
//
// Readback is async (mapAsync) and one frame behind — the standard, non-blocking
// WebGPU pattern. We never block the GPU on the audio path.

export type PlateParams = {
  kappa: number; // stiffness -> fundamental
  s0: number;    // freq-indep damping
  s1: number;    // freq-dep damping
  beta: number;  // non-linear tension modulation
};

const GRID = 96;          // simulation grid (GRID x GRID)
// FD substeps per animation frame == pickup samples produced per frame.
// At ~60fps, 800 substeps -> ~48k samples/sec, i.e. the plate sim runs at
// (close to) audio rate / real time, so the pickup stream feeds the speaker
// near 1:1 and the pitch you hear is the true simulated pitch.
const SUBSTEPS = 800;
const WG = 8;             // workgroup tile size

const SIM_WGSL = /* wgsl */ `
struct U {
  kappa: f32,
  s0: f32,
  s1: f32,
  beta: f32,
  dt: f32,
  energy: f32,
  pickupIdx: f32,
  writeIdx: f32,
};

@group(0) @binding(0) var<storage, read>        prev : array<f32>;
@group(0) @binding(1) var<storage, read>        curr : array<f32>;
@group(0) @binding(2) var<storage, read_write>  next : array<f32>;
@group(0) @binding(3) var<uniform>              u    : U;
@group(0) @binding(4) var<storage, read_write>  pickup : array<f32>;
@group(0) @binding(5) var<storage, read_write>  esum : array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write>  ctr  : array<atomic<i32>>; // [0]=pickup slot

const N : i32 = ${GRID};

fn idx(x: i32, y: i32) -> i32 { return y * N + x; }

fn lapC(x: i32, y: i32) -> f32 {
  let c = curr[idx(x, y)];
  return curr[idx(x - 1, y)] + curr[idx(x + 1, y)]
       + curr[idx(x, y - 1)] + curr[idx(x, y + 1)] - 4.0 * c;
}

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) {
    // clamp border to zero (handled by separate clear of next on edges)
    if (x < N && y < N) {
      next[idx(x, y)] = 0.0;
    }
    return;
  }

  // biharmonic = laplacian of laplacian
  let bih = lapC(x - 1, y) + lapC(x + 1, y) + lapC(x, y - 1) + lapC(x, y + 1)
          - 4.0 * lapC(x, y);

  // laplacian of velocity proxy (curr - prev)
  let vc = curr[idx(x, y)] - prev[idx(x, y)];
  let vl = curr[idx(x - 1, y)] - prev[idx(x - 1, y)];
  let vr = curr[idx(x + 1, y)] - prev[idx(x + 1, y)];
  let vu = curr[idx(x, y - 1)] - prev[idx(x, y - 1)];
  let vd = curr[idx(x, y + 1)] - prev[idx(x, y + 1)];
  let lapV = vl + vr + vu + vd - 4.0 * vc;

  // non-linear tension modulation: stiffness rises with global energy.
  // Hard-clamp k2 below the explicit-scheme stability limit for this biharmonic
  // stencil so a hard strike can never blow the simulation up.
  var k2 = u.kappa * u.kappa * (1.0 + u.beta * u.energy);
  k2 = min(k2, 0.052);

  // s0 is a per-step decay coefficient (already dimensionless): controls overall
  // ring length. s1 weights laplacian-of-velocity so high modes decay faster.
  let cval = curr[idx(x, y)];
  var nv = 2.0 * cval - prev[idx(x, y)]
         - k2 * bih
         - u.s0 * vc
         + u.s1 * lapV;

  next[idx(x, y)] = nv;

  // accumulate energy (fixed-point atomic add of u^2)
  let e = i32(cval * cval * 1.0e6);
  atomicAdd(&esum[0], e);

  // one designated invocation grabs this substep's pickup sample and advances
  // the per-frame slot counter. Passes in a single command buffer run in order,
  // so the counter increments exactly once per substep.
  if (x == 2 && y == 2) {
    let slot = atomicAdd(&ctr[0], 1);
    let pi = i32(u.pickupIdx);
    pickup[slot] = curr[pi];
  }
}
`;

// Strike shader: writes a gaussian velocity bump into curr (and a touch into prev).
const STRIKE_WGSL = /* wgsl */ `
struct S {
  cx: f32, cy: f32, amp: f32, radius: f32,
};
@group(0) @binding(0) var<storage, read_write> curr : array<f32>;
@group(0) @binding(1) var<storage, read_write> prev : array<f32>;
@group(0) @binding(2) var<uniform>             s    : S;
const N : i32 = ${GRID};

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) { return; }
  let dx = f32(x) - s.cx;
  let dy = f32(y) - s.cy;
  let d2 = dx * dx + dy * dy;
  let r2 = s.radius * s.radius;
  if (d2 > r2 * 9.0) { return; }
  let g = exp(-d2 / r2);
  curr[y * N + x] = curr[y * N + x] + s.amp * g;
  prev[y * N + x] = prev[y * N + x] - s.amp * g * 0.25;
}
`;

export class WebGpuPlate {
  device: GPUDevice;
  grid = GRID;
  substeps = SUBSTEPS;

  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private bufC: GPUBuffer;
  private simUbo: GPUBuffer;
  private pickup: GPUBuffer;
  private pickupRead: GPUBuffer;
  private esum: GPUBuffer;
  private esumZero: GPUBuffer;
  private esumRead: GPUBuffer;
  private fieldRead: GPUBuffer;
  private ctr: GPUBuffer;
  private ctrZero: GPUBuffer;

  private strikeUbo: GPUBuffer;

  private simPipe!: GPUComputePipeline;
  private strikePipe!: GPUComputePipeline;

  private params: PlateParams;
  private pickupIdx: number;
  private energy = 0;
  private gen = 0; // which buffer is "curr"
  private destroyed = false;

  // queues so we don't overlap maps
  private fieldBusy = false;
  private pickupBusy = false;
  private esumBusy = false;

  constructor(device: GPUDevice, params: PlateParams) {
    this.device = device;
    this.params = params;
    const cells = GRID * GRID;
    const f32 = Float32Array.BYTES_PER_ELEMENT;

    const mk = (size: number, usage: GPUBufferUsageFlags) =>
      device.createBuffer({ size, usage });

    const ST = GPUBufferUsage.STORAGE;
    const COPY_SRC = GPUBufferUsage.COPY_SRC;
    const COPY_DST = GPUBufferUsage.COPY_DST;
    const MAP_READ = GPUBufferUsage.MAP_READ;
    const UNIFORM = GPUBufferUsage.UNIFORM;

    this.bufA = mk(cells * f32, ST | COPY_SRC | COPY_DST);
    this.bufB = mk(cells * f32, ST | COPY_SRC | COPY_DST);
    this.bufC = mk(cells * f32, ST | COPY_SRC | COPY_DST);
    this.simUbo = mk(8 * f32, UNIFORM | COPY_DST);
    this.pickup = mk(SUBSTEPS * f32, ST | COPY_SRC);
    this.pickupRead = mk(SUBSTEPS * f32, MAP_READ | COPY_DST);
    this.esum = mk(4, ST | COPY_SRC | COPY_DST);
    this.esumZero = mk(4, COPY_SRC);
    this.esumRead = mk(4, MAP_READ | COPY_DST);
    this.fieldRead = mk(cells * f32, MAP_READ | COPY_DST);
    this.strikeUbo = mk(4 * f32, UNIFORM | COPY_DST);
    this.ctr = mk(4, ST | COPY_DST);
    this.ctrZero = mk(4, COPY_SRC);

    // pickup near (off-centre) so it captures many modes
    this.pickupIdx = Math.floor(GRID * 0.62) * GRID + Math.floor(GRID * 0.41);

    this.simPipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: SIM_WGSL }), entryPoint: "main" },
    });
    this.strikePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: STRIKE_WGSL }), entryPoint: "main" },
    });

    // init zero buffers (single i32 = 0)
    device.queue.writeBuffer(this.esumZero, 0, new Int32Array([0]));
    device.queue.writeBuffer(this.ctrZero, 0, new Int32Array([0]));
  }

  setParams(p: PlateParams) { this.params = p; }

  private bufs() {
    // ping-pong: returns [prev, curr, next] for this generation
    const order = [this.bufA, this.bufB, this.bufC];
    const a = this.gen % 3;
    const prev = order[a];
    const curr = order[(a + 1) % 3];
    const next = order[(a + 2) % 3];
    return { prev, curr, next };
  }

  strike(nx: number, ny: number, force: number) {
    if (this.destroyed) return;
    const { curr, prev } = this.bufs();
    const cx = Math.max(2, Math.min(GRID - 3, nx * GRID));
    const cy = Math.max(2, Math.min(GRID - 3, ny * GRID));
    const amp = 0.9 * Math.max(0.05, Math.min(1, force));
    this.device.queue.writeBuffer(
      this.strikeUbo, 0, new Float32Array([cx, cy, amp, 2.6]),
    );
    const bg = this.device.createBindGroup({
      layout: this.strikePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: curr } },
        { binding: 1, resource: { buffer: prev } },
        { binding: 2, resource: { buffer: this.strikeUbo } },
      ],
    });
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.strikePipe);
    pass.setBindGroup(0, bg);
    const wg = Math.ceil(GRID / WG);
    pass.dispatchWorkgroups(wg, wg);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.energy = Math.min(1.2, this.energy + amp * 0.15);
  }

  // Run one animation frame: SUBSTEPS FD steps + per-substep pickup grab.
  // Returns immediately; readback is requested async.
  step() {
    if (this.destroyed) return;
    const dt = 1 / 48000;
    const wg = Math.ceil(GRID / WG);

    // Energy is updated once per frame (read back async); inside the frame it is
    // held constant for the non-linear stiffness term — accurate enough at 800
    // substeps and avoids a per-substep CPU round-trip.
    this.device.queue.writeBuffer(this.simUbo, 0, new Float32Array([
      this.params.kappa, this.params.s0, this.params.s1, this.params.beta,
      dt, this.energy, this.pickupIdx, 0,
    ]));

    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.esumZero, 0, this.esum, 0, 4);
    enc.copyBufferToBuffer(this.ctrZero, 0, this.ctr, 0, 4); // reset pickup slot

    // The whole frame is one command buffer of SUBSTEPS sequential passes; the
    // sim shader itself appends one pickup sample per substep (atomic counter),
    // so the pickup buffer ends up holding a contiguous block of real samples.
    for (let s = 0; s < SUBSTEPS; s++) {
      const { prev, curr, next } = this.bufs();

      const bg = this.device.createBindGroup({
        layout: this.simPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: prev } },
          { binding: 1, resource: { buffer: curr } },
          { binding: 2, resource: { buffer: next } },
          { binding: 3, resource: { buffer: this.simUbo } },
          { binding: 4, resource: { buffer: this.pickup } },
          { binding: 5, resource: { buffer: this.esum } },
          { binding: 6, resource: { buffer: this.ctr } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(this.simPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg);
      pass.end();

      this.gen++;
    }

    // copy pickup + energy + field out for async readback within the same buffer
    if (!this.pickupBusy) enc.copyBufferToBuffer(this.pickup, 0, this.pickupRead, 0, SUBSTEPS * 4);
    if (!this.esumBusy) enc.copyBufferToBuffer(this.esum, 0, this.esumRead, 0, 4);
    if (!this.fieldBusy) {
      const { curr } = this.bufs();
      enc.copyBufferToBuffer(curr, 0, this.fieldRead, 0, GRID * GRID * 4);
    }
    this.device.queue.submit([enc.finish()]);
  }

  // Async: read the block of pickup samples produced this frame.
  async readPickup(): Promise<Float32Array | null> {
    if (this.destroyed || this.pickupBusy) return null;
    this.pickupBusy = true;
    try {
      await this.pickupRead.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(this.pickupRead.getMappedRange().slice(0));
      this.pickupRead.unmap();
      return out;
    } catch {
      return null;
    } finally {
      this.pickupBusy = false;
    }
  }

  async readEnergy(): Promise<void> {
    if (this.destroyed || this.esumBusy) return;
    this.esumBusy = true;
    try {
      await this.esumRead.mapAsync(GPUMapMode.READ);
      const v = new Int32Array(this.esumRead.getMappedRange().slice(0))[0];
      this.esumRead.unmap();
      const meanSq = (v / 1.0e6) / (GRID * GRID);
      const target = Math.min(meanSq * 4, 1.2);
      this.energy += (target - this.energy) * 0.08;
      if (this.energy > 1.2) this.energy = 1.2;
      if (this.energy < 0) this.energy = 0;
    } catch {
      /* ignore */
    } finally {
      this.esumBusy = false;
    }
  }

  async readField(): Promise<Float32Array | null> {
    if (this.destroyed || this.fieldBusy) return null;
    this.fieldBusy = true;
    try {
      await this.fieldRead.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(this.fieldRead.getMappedRange().slice(0));
      this.fieldRead.unmap();
      return out;
    } catch {
      return null;
    } finally {
      this.fieldBusy = false;
    }
  }

  getEnergy() { return this.energy; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const b of [
      this.bufA, this.bufB, this.bufC, this.simUbo, this.pickup, this.pickupRead,
      this.esum, this.esumZero, this.esumRead, this.fieldRead, this.strikeUbo,
      this.ctr, this.ctrZero,
    ]) {
      try { b.destroy(); } catch { /* ignore */ }
    }
  }
}
