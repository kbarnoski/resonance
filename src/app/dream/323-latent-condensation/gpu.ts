// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — raw WebGPU compute-shader particle system for "Latent Condensation".
//
// This is the headline: ~120k particles whose positions + velocities live in GPU
// storage buffers and are integrated every frame by a WGSL COMPUTE shader. The
// flow field is curl-of-value-noise (turbulent chaos) blended against an
// attraction term that pulls each particle toward a slowly morphing target shape.
// The blend is driven by the live audio "condensation" coupling: 0 = pure chaos,
// 1 = fully condensed onto the form. A second WGSL RENDER pipeline draws the
// particles as additive quads so dense regions glow.
//
// Self-contained: no imports. Pure raw WebGPU (no three.js, no TSL).
//
// Uniform layout (std140-friendly, 64 bytes):
//   time(f32) dt(f32) condensation(f32) low(f32)
//   high(f32) amplitude(f32) count(f32) morph(f32)
//   aspect(f32) seed(f32) _pad(f32) _pad(f32)
//   bands: vec4<f32>  (first 4 bands)
// ─────────────────────────────────────────────────────────────────────────────

export const PARTICLE_COUNT = 120_000;

const WORKGROUP = 256;

const COMPUTE_WGSL = /* wgsl */ `
struct Particle {
  pos : vec4<f32>,   // xyz position, w = per-particle phase/seed
  vel : vec4<f32>,   // xyz velocity, w = life/energy
};

struct Uni {
  time : f32, dt : f32, condensation : f32, low : f32,
  high : f32, amplitude : f32, count : f32, morph : f32,
  aspect : f32, seed : f32, p0 : f32, p1 : f32,
  bands : vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> u : Uni;

// ── hash / value noise ──────────────────────────────────────────────────────
fn hash3(p : vec3<f32>) -> vec3<f32> {
  var q = vec3<f32>(
    dot(p, vec3<f32>(127.1, 311.7, 74.7)),
    dot(p, vec3<f32>(269.5, 183.3, 246.1)),
    dot(p, vec3<f32>(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453123) * 2.0 - 1.0;
}

fn vnoise(p : vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let n000 = dot(hash3(i + vec3<f32>(0.0,0.0,0.0)), f - vec3<f32>(0.0,0.0,0.0));
  let n100 = dot(hash3(i + vec3<f32>(1.0,0.0,0.0)), f - vec3<f32>(1.0,0.0,0.0));
  let n010 = dot(hash3(i + vec3<f32>(0.0,1.0,0.0)), f - vec3<f32>(0.0,1.0,0.0));
  let n110 = dot(hash3(i + vec3<f32>(1.0,1.0,0.0)), f - vec3<f32>(1.0,1.0,0.0));
  let n001 = dot(hash3(i + vec3<f32>(0.0,0.0,1.0)), f - vec3<f32>(0.0,0.0,1.0));
  let n101 = dot(hash3(i + vec3<f32>(1.0,0.0,1.0)), f - vec3<f32>(1.0,0.0,1.0));
  let n011 = dot(hash3(i + vec3<f32>(0.0,1.0,1.0)), f - vec3<f32>(0.0,1.0,1.0));
  let n111 = dot(hash3(i + vec3<f32>(1.0,1.0,1.0)), f - vec3<f32>(1.0,1.0,1.0));
  let nx00 = mix(n000, n100, w.x);
  let nx10 = mix(n010, n110, w.x);
  let nx01 = mix(n001, n101, w.x);
  let nx11 = mix(n011, n111, w.x);
  let nxy0 = mix(nx00, nx10, w.y);
  let nxy1 = mix(nx01, nx11, w.y);
  return mix(nxy0, nxy1, w.z);
}

// curl of a noise field → divergence-free flow (smoke-like)
fn curl(p : vec3<f32>) -> vec3<f32> {
  let e = 0.45;
  let dx = vec3<f32>(e, 0.0, 0.0);
  let dy = vec3<f32>(0.0, e, 0.0);
  let dz = vec3<f32>(0.0, 0.0, e);
  let x1 = vnoise(p + dy + vec3<f32>(0.0,47.1,0.0)) - vnoise(p - dy + vec3<f32>(0.0,47.1,0.0));
  let x2 = vnoise(p + dz) - vnoise(p - dz);
  let y1 = vnoise(p + dz + vec3<f32>(31.4,0.0,0.0)) - vnoise(p - dz + vec3<f32>(31.4,0.0,0.0));
  let y2 = vnoise(p + dx + vec3<f32>(0.0,47.1,0.0)) - vnoise(p - dx + vec3<f32>(0.0,47.1,0.0));
  let z1 = vnoise(p + dx) - vnoise(p - dx);
  let z2 = vnoise(p + dy + vec3<f32>(31.4,0.0,0.0)) - vnoise(p - dy + vec3<f32>(31.4,0.0,0.0));
  return vec3<f32>(x1 - x2, y1 - y2, z1 - z2) / (2.0 * e);
}

// Target form: morph between a sphere shell, a torus and a lissajous ribbon.
// Each particle maps deterministically from its seed to a point on the surface.
fn targetPoint(seed : f32, t : f32, morph : f32) -> vec3<f32> {
  let a = seed * 6.28318;
  let b = fract(seed * 17.31) * 6.28318;

  // sphere shell
  let sx = sin(b) * cos(a);
  let sy = cos(b);
  let sz = sin(b) * sin(a);
  let sph = vec3<f32>(sx, sy, sz) * 1.15;

  // torus
  let R = 1.05; let rr = 0.42;
  let tx = (R + rr * cos(b)) * cos(a);
  let ty = rr * sin(b);
  let tz = (R + rr * cos(b)) * sin(a);
  let tor = vec3<f32>(tx, ty, tz);

  // lissajous ribbon (curve thickened by b)
  let u = a;
  let lx = sin(3.0 * u + t * 0.1);
  let ly = sin(2.0 * u);
  let lz = cos(4.0 * u);
  let liss = vec3<f32>(lx, ly, lz) * 1.25
    + hash3(vec3<f32>(seed * 91.0, b, 1.0)) * 0.06;

  // morph in [0,3) cycles sphere→torus→lissajous→sphere
  let m = fract(morph);
  let seg = morph - m;
  let segi = i32(seg) % 3;
  var fromP = sph; var toP = tor;
  if (segi == 1) { fromP = tor; toP = liss; }
  else if (segi == 2) { fromP = liss; toP = sph; }
  let k = smoothstep(0.0, 1.0, m);
  return mix(fromP, toP, k);
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= u32(u.count)) { return; }
  var p = particles[i];

  let seed = p.pos.w;
  let dt = clamp(u.dt, 0.0, 0.05);
  let t = u.time;

  // ── turbulent flow (chaos) ─────────────────────────────────────────────────
  let scale = 0.55 + u.low * 0.9;           // low freqs widen the flow cells
  let speed = 0.6 + u.amplitude * 1.6;
  let flow = curl(p.pos.xyz * scale + vec3<f32>(0.0, 0.0, t * 0.12)) * speed;

  // ── attraction toward target form (order) ──────────────────────────────────
  let tgt = targetPoint(seed, t, u.morph);
  let toTgt = tgt - p.pos.xyz;

  // condensation blends chaos↔order; squared for a snappier "lock-in"
  let c = clamp(u.condensation, 0.0, 1.0);
  let order = c * c;

  // forces
  let attract = toTgt * (1.2 + 6.0 * order);
  let acc = mix(flow, attract, order) + flow * (1.0 - order) * 0.4;

  // integrate with damping; more damping when condensed (settles onto form)
  let damp = mix(0.92, 0.80, order);
  var v = p.vel.xyz * damp + acc * dt * (2.4 - 1.0 * order);

  // high-freq sparkle: tiny jitter kick scaled by treble
  let jit = hash3(p.pos.xyz * 13.0 + vec3<f32>(t)) * u.high * 0.9;
  v += jit * dt * 6.0;

  var pos = p.pos.xyz + v * dt;

  // soft containment so chaos doesn't fling particles to infinity
  let r = length(pos);
  if (r > 3.2) {
    pos = pos * (3.2 / r);
    v = v * 0.3;
  }

  // store energy in vel.w for the renderer (brightness): speed + treble
  let energy = clamp(length(v) * 0.5 + u.high * 0.5 + order * 0.4, 0.0, 1.5);

  p.pos = vec4<f32>(pos, seed);
  p.vel = vec4<f32>(v, energy);
  particles[i] = p;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos : vec4<f32>,
  vel : vec4<f32>,
};
struct Uni {
  time : f32, dt : f32, condensation : f32, low : f32,
  high : f32, amplitude : f32, count : f32, morph : f32,
  aspect : f32, seed : f32, p0 : f32, p1 : f32,
  bands : vec4<f32>,
};
@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> u : Uni;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) energy : f32,
  @location(2) seed : f32,
};

// rotate the whole cloud slowly so the form reads in 3D
fn rotY(p : vec3<f32>, a : f32) -> vec3<f32> {
  let c = cos(a); let s = sin(a);
  return vec3<f32>(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
  var out : VSOut;
  let part = particles[ii];

  // billboard quad corners
  var corner = vec2<f32>(-1.0, -1.0);
  if (vi == 1u) { corner = vec2<f32>(1.0, -1.0); }
  else if (vi == 2u) { corner = vec2<f32>(-1.0, 1.0); }
  else if (vi == 3u) { corner = vec2<f32>(1.0, -1.0); }
  else if (vi == 4u) { corner = vec2<f32>(1.0, 1.0); }
  else if (vi == 5u) { corner = vec2<f32>(-1.0, 1.0); }

  var wp = rotY(part.pos.xyz, u.time * 0.18);

  // simple perspective projection
  let camZ = 4.6;
  let z = wp.z + camZ;
  let f = 1.9 / max(z, 0.2);
  var proj = vec2<f32>(wp.x * f, wp.y * f);
  proj.x = proj.x / u.aspect;

  let sizeBase = 0.0085 + part.vel.w * 0.004;
  let size = sizeBase * (0.7 + 1.0 / max(z, 0.4));
  proj += corner * size;

  out.clip = vec4<f32>(proj, 0.0, 1.0);
  out.uv = corner;
  out.energy = part.vel.w;
  out.seed = part.pos.w;
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let d = dot(in.uv, in.uv);
  if (d > 1.0) { discard; }
  let glow = pow(1.0 - d, 2.2);

  // violet→cyan→warm palette keyed on energy + per-particle seed
  let e = clamp(in.energy, 0.0, 1.3);
  let coolA = vec3<f32>(0.30, 0.22, 0.85);  // violet
  let coolB = vec3<f32>(0.20, 0.65, 0.95);  // cyan
  let warm  = vec3<f32>(0.98, 0.72, 0.45);  // warm sparkle
  var col = mix(coolA, coolB, fract(in.seed * 7.0));
  col = mix(col, warm, smoothstep(0.7, 1.25, e));
  col *= (0.35 + e * 1.1);

  let a = glow * (0.10 + e * 0.5);
  return vec4<f32>(col * glow, a);
}
`;

export interface GpuSim {
  /** Advance one frame and render. */
  frame(params: FrameParams, dtSeconds: number): void;
  /** Resize the swapchain. */
  resize(w: number, h: number): void;
  /** Release all GPU resources. */
  destroy(): void;
}

export interface FrameParams {
  time: number;
  condensation: number;
  low: number;
  high: number;
  amplitude: number;
  morph: number;
  bands: number[];
}

/**
 * Initialise the WebGPU compute + render pipelines.
 * Throws (rejects) if WebGPU is unavailable or the device is lost — callers must
 * catch and fall back to the non-GPU placeholder.
 */
export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuSim> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("WebGPU not available (navigator.gpu missing)");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) throw new Error("Could not get webgpu context");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  // ── particle storage buffer (seeded chaos) ──────────────────────────────────
  const floatsPerParticle = 8; // 2 × vec4
  const init = new Float32Array(PARTICLE_COUNT * floatsPerParticle);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * floatsPerParticle;
    // random point in a ball
    let x = 0, y = 0, z = 0, m = 2;
    while (m > 1 || m < 0.0001) {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      m = x * x + y * y + z * z;
    }
    const rad = 1.4 + Math.random() * 0.8;
    init[o + 0] = x * rad;
    init[o + 1] = y * rad;
    init[o + 2] = z * rad;
    init[o + 3] = i / PARTICLE_COUNT; // seed
    init[o + 4] = 0; init[o + 5] = 0; init[o + 6] = 0; init[o + 7] = 0;
  }
  const particleBuf = device.createBuffer({
    size: init.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, init);

  // ── uniform buffer ───────────────────────────────────────────────────────────
  const uniArr = new Float32Array(16); // 64 bytes
  const uniformBuf = device.createBuffer({
    size: uniArr.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── compute pipeline ─────────────────────────────────────────────────────────
  const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "main" },
  });
  const computeBind = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: uniformBuf } },
    ],
  });

  // ── render pipeline (additive points) ────────────────────────────────────────
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: {
      module: renderModule,
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
  const renderBind = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: uniformBuf } },
    ],
  });

  let aspect = canvas.width / Math.max(1, canvas.height);
  let destroyed = false;

  const sim: GpuSim = {
    frame(params: FrameParams, dtSeconds: number) {
      if (destroyed) return;
      uniArr[0] = params.time;
      uniArr[1] = dtSeconds;
      uniArr[2] = params.condensation;
      uniArr[3] = params.low;
      uniArr[4] = params.high;
      uniArr[5] = params.amplitude;
      uniArr[6] = PARTICLE_COUNT;
      uniArr[7] = params.morph;
      uniArr[8] = aspect;
      uniArr[9] = 0;
      uniArr[10] = 0;
      uniArr[11] = 0;
      uniArr[12] = params.bands[0] ?? 0;
      uniArr[13] = params.bands[1] ?? 0;
      uniArr[14] = params.bands[2] ?? 0;
      uniArr[15] = params.bands[3] ?? 0;
      device.queue.writeBuffer(uniformBuf, 0, uniArr);

      const encoder = device.createCommandEncoder();

      const cpass = encoder.beginComputePass();
      cpass.setPipeline(computePipeline);
      cpass.setBindGroup(0, computeBind);
      cpass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WORKGROUP));
      cpass.end();

      let view: GPUTextureView;
      try {
        view = context.getCurrentTexture().createView();
      } catch {
        return; // canvas not ready / context lost mid-resize
      }
      const rpass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.012, g: 0.012, b: 0.025, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rpass.setPipeline(renderPipeline);
      rpass.setBindGroup(0, renderBind);
      rpass.draw(6, PARTICLE_COUNT, 0, 0);
      rpass.end();

      device.queue.submit([encoder.finish()]);
    },
    resize(w: number, h: number) {
      if (destroyed) return;
      canvas.width = w;
      canvas.height = h;
      aspect = w / Math.max(1, h);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { particleBuf.destroy(); } catch { /* ignore */ }
      try { uniformBuf.destroy(); } catch { /* ignore */ }
      try { context.unconfigure(); } catch { /* ignore */ }
      try { device.destroy(); } catch { /* ignore */ }
    },
  };

  return sim;
}
