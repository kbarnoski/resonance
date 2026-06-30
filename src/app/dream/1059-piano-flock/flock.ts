// flock.ts — the luminous boids flock and its emergent-shape statistics.
//
// Two interchangeable substrates behind one `FlockSim` interface:
//   • GPUFlock   — WebGPU compute (WGSL storage-buffer ping-pong), additive
//                  glowing points. Structural model: the canonical WebGPU
//                  "Compute Boids" sample.
//   • CPUFlock   — Canvas2D fallback with a spatial hash for O(n) neighbours,
//                  the same cohesion/alignment/separation + pointer attractor,
//                  the same emergent stats. Required demo-on-any-device path.
//
// Both expose readStats(): the centroid, dispersion, mean speed and order
// (alignment) of the flock — these descriptors drive the granular instrument
// (see instrument.ts). Reynolds, *Boids* (1987).

export interface FlockStats {
  /** Flock centroid in normalized [0,1] space. */
  cx: number;
  cy: number;
  /** Mean distance of boids from centroid (spread), ~0..0.7. */
  dispersion: number;
  /** Mean speed magnitude (normalized units / frame * scale). */
  speed: number;
  /** Order parameter: |mean(velocity_hat)| in [0,1]. 1 = perfectly aligned. */
  order: number;
}

export interface FlockSim {
  readonly kind: "webgpu" | "canvas2d";
  /** Pointer attractor in normalized [0,1] space; strength 0 = no pull. */
  setAttractor(x: number, y: number, strength: number): void;
  /** Step the simulation + render one frame. dt in seconds (clamped inside). */
  frame(dt: number): void;
  /** Latest emergent statistics (cheap; cached per frame). */
  readStats(): FlockStats;
  /** Tear down all GPU/Canvas resources. Idempotent. */
  destroy(): void;
}

// Tunable rule weights shared by both substrates so they feel identical.
export const RULES = {
  cohesion: 0.020,
  alignment: 0.045,
  separation: 0.055,
  separationDist: 0.022, // normalized
  neighborDist: 0.075, // normalized
  maxSpeed: 0.0042, // normalized / frame at 60fps
  attractor: 0.0016,
  drift: 0.00018, // idle wander
};

// ─────────────────────────────────────────────────────────────────────────────
// Canvas2D CPU flock (fallback) — genuinely beautiful, not a stub.
// ─────────────────────────────────────────────────────────────────────────────

export class CPUFlock implements FlockSim {
  readonly kind = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private n: number;
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private hue: Float32Array;
  private ax = 0.5;
  private ay = 0.5;
  private aStrength = 0;
  private stats: FlockStats = { cx: 0.5, cy: 0.5, dispersion: 0.2, speed: 0, order: 0 };
  // spatial hash
  private cells = RULES.neighborDist;
  private grid = new Map<number, number[]>();
  private destroyed = false;
  private t = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    count = 2200,
  ) {
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.n = count;
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.hue = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // seed in a soft cosmic disc around centre
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.28;
      this.px[i] = 0.5 + Math.cos(a) * r;
      this.py[i] = 0.5 + Math.sin(a) * r;
      const sp = RULES.maxSpeed * (0.3 + Math.random() * 0.7);
      const va = Math.random() * Math.PI * 2;
      this.vx[i] = Math.cos(va) * sp;
      this.vy[i] = Math.sin(va) * sp;
      this.hue[i] = Math.random();
    }
  }

  setAttractor(x: number, y: number, strength: number) {
    this.ax = x;
    this.ay = y;
    this.aStrength = strength;
  }

  private rebuildGrid() {
    this.grid.clear();
    const inv = 1 / this.cells;
    for (let i = 0; i < this.n; i++) {
      const gx = Math.floor(this.px[i] * inv);
      const gy = Math.floor(this.py[i] * inv);
      const key = gx * 73856093 ^ gy * 19349663;
      let arr = this.grid.get(key);
      if (!arr) {
        arr = [];
        this.grid.set(key, arr);
      }
      arr.push(i);
    }
  }

  private step(scale: number) {
    this.rebuildGrid();
    const inv = 1 / this.cells;
    const nd2 = RULES.neighborDist * RULES.neighborDist;
    const sd2 = RULES.separationDist * RULES.separationDist;

    for (let i = 0; i < this.n; i++) {
      const xi = this.px[i];
      const yi = this.py[i];
      let cohX = 0, cohY = 0, aliX = 0, aliY = 0, sepX = 0, sepY = 0, count = 0;

      const gx = Math.floor(xi * inv);
      const gy = Math.floor(yi * inv);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const key = (gx + ox) * 73856093 ^ (gy + oy) * 19349663;
          const arr = this.grid.get(key);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const j = arr[k];
            if (j === i) continue;
            const dx = this.px[j] - xi;
            const dy = this.py[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 > nd2) continue;
            cohX += this.px[j];
            cohY += this.py[j];
            aliX += this.vx[j];
            aliY += this.vy[j];
            if (d2 < sd2 && d2 > 1e-9) {
              const inv2 = 1 / Math.sqrt(d2);
              sepX -= dx * inv2;
              sepY -= dy * inv2;
            }
            count++;
          }
        }
      }

      if (count > 0) {
        this.vx[i] += (cohX / count - xi) * RULES.cohesion * scale;
        this.vy[i] += (cohY / count - yi) * RULES.cohesion * scale;
        this.vx[i] += (aliX / count - this.vx[i]) * RULES.alignment * scale;
        this.vy[i] += (aliY / count - this.vy[i]) * RULES.alignment * scale;
        this.vx[i] += sepX * RULES.separation * scale;
        this.vy[i] += sepY * RULES.separation * scale;
      }

      // pointer attractor
      if (this.aStrength > 0) {
        this.vx[i] += (this.ax - xi) * RULES.attractor * this.aStrength * scale;
        this.vy[i] += (this.ay - yi) * RULES.attractor * this.aStrength * scale;
      }

      // gentle idle swirl so the flock never freezes
      const sw = RULES.drift * scale;
      this.vx[i] += -(yi - 0.5) * sw + (Math.random() - 0.5) * sw;
      this.vy[i] += (xi - 0.5) * sw + (Math.random() - 0.5) * sw;

      // clamp speed
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      const maxS = RULES.maxSpeed * scale;
      if (sp > maxS) {
        const f = maxS / sp;
        this.vx[i] *= f;
        this.vy[i] *= f;
      }

      this.px[i] += this.vx[i];
      this.py[i] += this.vy[i];

      // soft wrap to keep the disc cohesive
      if (this.px[i] < 0) this.px[i] += 1;
      else if (this.px[i] > 1) this.px[i] -= 1;
      if (this.py[i] < 0) this.py[i] += 1;
      else if (this.py[i] > 1) this.py[i] -= 1;
    }
    this.computeStats();
  }

  private computeStats() {
    let mx = 0, my = 0, mvx = 0, mvy = 0, msp = 0;
    for (let i = 0; i < this.n; i++) {
      mx += this.px[i];
      my += this.py[i];
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      msp += sp;
      if (sp > 1e-9) {
        mvx += this.vx[i] / sp;
        mvy += this.vy[i] / sp;
      }
    }
    mx /= this.n;
    my /= this.n;
    let disp = 0;
    for (let i = 0; i < this.n; i++) {
      disp += Math.hypot(this.px[i] - mx, this.py[i] - my);
    }
    disp /= this.n;
    this.stats = {
      cx: mx,
      cy: my,
      dispersion: disp,
      speed: (msp / this.n) / RULES.maxSpeed, // 0..~1
      order: Math.hypot(mvx, mvy) / this.n,
    };
  }

  frame(dt: number) {
    if (this.destroyed) return;
    const scale = Math.min(2.2, Math.max(0.5, dt * 60));
    this.t += dt;
    this.step(scale);
    this.draw();
  }

  private draw() {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // cosmic trail: translucent dark wash instead of clear -> motion smears
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6, 4, 16, 0.20)";
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    // hue drifts warm->cool with dispersion (cosmic drift)
    const base = (this.t * 8) % 360;
    const spreadShift = Math.min(120, this.stats.dispersion * 420);
    for (let i = 0; i < this.n; i++) {
      const x = this.px[i] * w;
      const y = this.py[i] * h;
      const sp = Math.hypot(this.vx[i], this.vy[i]) / RULES.maxSpeed;
      const hue = (base + this.hue[i] * 80 + spreadShift + 200) % 360; // warm->cool band
      const a = 0.18 + sp * 0.5;
      const rad = 1.1 + sp * 2.2;
      ctx.fillStyle = `hsla(${hue}, 90%, ${55 + sp * 25}%, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // glowing attractor cursor
    if (this.aStrength > 0) {
      const ax = this.ax * w;
      const ay = this.ay * h;
      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, 60);
      g.addColorStop(0, "rgba(190, 170, 255, 0.55)");
      g.addColorStop(1, "rgba(190, 170, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ax, ay, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  readStats() {
    return this.stats;
  }

  destroy() {
    this.destroyed = true;
    this.grid.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU compute flock (primary). WGSL compute pass implements the three Boids
// rules + a pointer attractor; positions/velocities ping-pong between two
// storage buffers; an additive point render pass draws glowing sprites. Stats
// are computed by reading back a downsampled copy on a cadence (cheap).
// ─────────────────────────────────────────────────────────────────────────────

const WGSL_COMPUTE = /* wgsl */ `
struct Boid { pos: vec2<f32>, vel: vec2<f32> };
struct Params {
  cohesion: f32, alignment: f32, separation: f32,
  sepDist: f32, neighDist: f32, maxSpeed: f32,
  attractor: f32, ax: f32, ay: f32, aStrength: f32,
  drift: f32, scale: f32,
};
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read> inB : array<Boid>;
@group(0) @binding(2) var<storage, read_write> outB : array<Boid>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let total = arrayLength(&inB);
  if (i >= total) { return; }
  var pos = inB[i].pos;
  var vel = inB[i].vel;

  var coh = vec2<f32>(0.0, 0.0);
  var ali = vec2<f32>(0.0, 0.0);
  var sep = vec2<f32>(0.0, 0.0);
  var count = 0.0;
  let nd2 = P.neighDist * P.neighDist;
  let sd2 = P.sepDist * P.sepDist;

  for (var j : u32 = 0u; j < total; j = j + 1u) {
    if (j == i) { continue; }
    let d = inB[j].pos - pos;
    let d2 = dot(d, d);
    if (d2 > nd2) { continue; }
    coh = coh + inB[j].pos;
    ali = ali + inB[j].vel;
    if (d2 < sd2 && d2 > 1e-9) {
      sep = sep - d * inverseSqrt(d2);
    }
    count = count + 1.0;
  }

  let s = P.scale;
  if (count > 0.0) {
    coh = coh / count;
    ali = ali / count;
    vel = vel + (coh - pos) * P.cohesion * s;
    vel = vel + (ali - vel) * P.alignment * s;
    vel = vel + sep * P.separation * s;
  }

  if (P.aStrength > 0.0) {
    let a = vec2<f32>(P.ax, P.ay);
    vel = vel + (a - pos) * P.attractor * P.aStrength * s;
  }

  // idle swirl about centre
  let c = pos - vec2<f32>(0.5, 0.5);
  vel = vel + vec2<f32>(-c.y, c.x) * P.drift * s;

  let sp = length(vel);
  let maxS = P.maxSpeed * s;
  if (sp > maxS) { vel = vel * (maxS / sp); }

  pos = pos + vel;
  // soft wrap
  pos = fract(pos);

  outB[i].pos = pos;
  outB[i].vel = vel;
}
`;

const WGSL_RENDER = /* wgsl */ `
struct Boid { pos: vec2<f32>, vel: vec2<f32> };
struct RParams { aspect: f32, hueBase: f32, spread: f32, pad: f32 };
@group(0) @binding(0) var<storage, read> boids : array<Boid>;
@group(0) @binding(1) var<uniform> R : RParams;

struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) color : vec3<f32>,
};

// hsv->rgb
fn hsv2rgb(h: f32, s: f32, v: f32) -> vec3<f32> {
  let k = vec3<f32>(5.0, 3.0, 1.0);
  let p = abs(fract(vec3<f32>(h) + k / 6.0) * 6.0 - 3.0);
  return v * mix(vec3<f32>(1.0), clamp(p - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), s);
}

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VOut {
  // quad corners
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let b = boids[ii];
  let sp = clamp(length(b.vel) * 240.0, 0.0, 1.0);
  let size = (0.006 + sp * 0.010);
  let corner = corners[vi];
  // boid pos [0,1] -> clip [-1,1], y flipped
  var center = vec2<f32>(b.pos.x * 2.0 - 1.0, 1.0 - b.pos.y * 2.0);
  var offset = vec2<f32>(corner.x * size, corner.y * size * R.aspect);
  var out : VOut;
  out.clip = vec4<f32>(center + offset, 0.0, 1.0);
  out.uv = corner;
  let hue = fract(R.hueBase + sp * 0.18 + R.spread + 0.55);
  out.color = hsv2rgb(hue, 0.85, 0.6 + sp * 0.4);
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  let glow = smoothstep(1.0, 0.0, r);
  let core = pow(glow, 2.2);
  let a = core * 0.85;
  return vec4<f32>(in.color * (0.4 + core), a);
}
`;

export async function createGPUFlock(
  canvas: HTMLCanvasElement,
  count = 12000,
): Promise<FlockSim | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (!nav.gpu) return null;
  let device: GPUDevice;
  let context: GPUCanvasContext;
  let format: GPUTextureFormat;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const c = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!c) return null;
    context = c;
    format = nav.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "premultiplied" });
  } catch {
    return null;
  }

  return new GPUFlock(canvas, device, context, format, count);
}

class GPUFlock implements FlockSim {
  readonly kind = "webgpu" as const;
  private n: number;
  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private params: GPUBuffer;
  private rparams: GPUBuffer;
  private readBuf: GPUBuffer;
  private computePipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private bindA: GPUBindGroup;
  private bindB: GPUBindGroup;
  private renderBindA: GPUBindGroup;
  private renderBindB: GPUBindGroup;
  private flip = false;
  private destroyed = false;
  private ax = 0.5;
  private ay = 0.5;
  private aStrength = 0;
  private t = 0;
  private stats: FlockStats = { cx: 0.5, cy: 0.5, dispersion: 0.2, speed: 0, order: 0 };
  private readPending = false;
  private readCooldown = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private device: GPUDevice,
    private context: GPUCanvasContext,
    format: GPUTextureFormat,
    count: number,
  ) {
    this.n = count;
    const stride = 4 * 4; // 4 floats per boid
    const init = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.28;
      init[i * 4 + 0] = 0.5 + Math.cos(a) * r;
      init[i * 4 + 1] = 0.5 + Math.sin(a) * r;
      const sp = RULES.maxSpeed * (0.3 + Math.random() * 0.7);
      const va = Math.random() * Math.PI * 2;
      init[i * 4 + 2] = Math.cos(va) * sp;
      init[i * 4 + 3] = Math.sin(va) * sp;
    }

    const mkStorage = () => {
      const b = device.createBuffer({
        size: count * stride,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      });
      new Float32Array(b.getMappedRange()).set(init);
      b.unmap();
      return b;
    };
    this.bufA = mkStorage();
    this.bufB = mkStorage();

    this.params = device.createBuffer({
      size: 12 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.rparams = device.createBuffer({
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // small readback buffer for stats (downsample on CPU side after map)
    this.readBuf = device.createBuffer({
      size: count * stride,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const computeModule = device.createShaderModule({ code: WGSL_COMPUTE });
    this.computePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: computeModule, entryPoint: "main" },
    });

    const renderModule = device.createShaderModule({ code: WGSL_RENDER });
    this.renderPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: {
        module: renderModule,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              // additive glow
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    const cl = this.computePipe.getBindGroupLayout(0);
    this.bindA = device.createBindGroup({
      layout: cl,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.bufA } },
        { binding: 2, resource: { buffer: this.bufB } },
      ],
    });
    this.bindB = device.createBindGroup({
      layout: cl,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.bufB } },
        { binding: 2, resource: { buffer: this.bufA } },
      ],
    });

    const rl = this.renderPipe.getBindGroupLayout(0);
    this.renderBindA = device.createBindGroup({
      layout: rl,
      entries: [
        { binding: 0, resource: { buffer: this.bufA } },
        { binding: 1, resource: { buffer: this.rparams } },
      ],
    });
    this.renderBindB = device.createBindGroup({
      layout: rl,
      entries: [
        { binding: 0, resource: { buffer: this.bufB } },
        { binding: 1, resource: { buffer: this.rparams } },
      ],
    });
  }

  setAttractor(x: number, y: number, strength: number) {
    this.ax = x;
    this.ay = y;
    this.aStrength = strength;
  }

  frame(dt: number) {
    if (this.destroyed) return;
    const scale = Math.min(2.2, Math.max(0.5, dt * 60));
    this.t += dt;

    // upload params
    const p = new Float32Array([
      RULES.cohesion, RULES.alignment, RULES.separation,
      RULES.separationDist, RULES.neighborDist, RULES.maxSpeed,
      RULES.attractor, this.ax, this.ay, this.aStrength,
      RULES.drift, scale,
    ]);
    this.device.queue.writeBuffer(this.params, 0, p);

    const spread = Math.min(0.33, this.stats.dispersion * 1.2);
    const r = new Float32Array([
      this.canvas.width / Math.max(1, this.canvas.height),
      (this.t * 0.022) % 1,
      spread,
      0,
    ]);
    this.device.queue.writeBuffer(this.rparams, 0, r);

    const encoder = this.device.createCommandEncoder();
    // compute: read current -> write other
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipe);
      pass.setBindGroup(0, this.flip ? this.bindB : this.bindA);
      pass.dispatchWorkgroups(Math.ceil(this.n / 64));
      pass.end();
    }
    const writtenBuf = this.flip ? this.bufA : this.bufB;
    const writtenBind = this.flip ? this.renderBindA : this.renderBindB;

    // render the freshly written buffer
    {
      const view = this.context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.024, g: 0.016, b: 0.063, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.renderPipe);
      pass.setBindGroup(0, writtenBind);
      pass.draw(6, this.n);
      pass.end();
    }

    // occasional readback for stats
    this.readCooldown -= dt;
    if (!this.readPending && this.readCooldown <= 0) {
      encoder.copyBufferToBuffer(writtenBuf, 0, this.readBuf, 0, this.n * 16);
    }

    this.device.queue.submit([encoder.finish()]);

    if (!this.readPending && this.readCooldown <= 0) {
      this.readCooldown = 0.08; // ~12Hz stat refresh
      this.readPending = true;
      this.readBuf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (this.destroyed) return;
          const data = new Float32Array(this.readBuf.getMappedRange().slice(0));
          this.readBuf.unmap();
          this.updateStats(data);
        })
        .catch(() => {})
        .finally(() => {
          this.readPending = false;
        });
    }

    this.flip = !this.flip;
  }

  private updateStats(data: Float32Array) {
    // downsample: sample up to 2000 boids for stats
    const step = Math.max(1, Math.floor(this.n / 2000));
    let mx = 0, my = 0, mvx = 0, mvy = 0, msp = 0, cnt = 0;
    for (let i = 0; i < this.n; i += step) {
      const px = data[i * 4 + 0];
      const py = data[i * 4 + 1];
      const vx = data[i * 4 + 2];
      const vy = data[i * 4 + 3];
      mx += px;
      my += py;
      const sp = Math.hypot(vx, vy);
      msp += sp;
      if (sp > 1e-9) {
        mvx += vx / sp;
        mvy += vy / sp;
      }
      cnt++;
    }
    mx /= cnt;
    my /= cnt;
    let disp = 0;
    for (let i = 0; i < this.n; i += step) {
      disp += Math.hypot(data[i * 4 + 0] - mx, data[i * 4 + 1] - my);
    }
    disp /= cnt;
    this.stats = {
      cx: mx,
      cy: my,
      dispersion: disp,
      speed: (msp / cnt) / RULES.maxSpeed,
      order: Math.hypot(mvx, mvy) / cnt,
    };
  }

  readStats() {
    return this.stats;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.bufA.destroy();
      this.bufB.destroy();
      this.params.destroy();
      this.rparams.destroy();
      this.readBuf.destroy();
      this.device.destroy();
    } catch {
      /* ignore */
    }
  }
}
