// gpu.ts — WebGPU compute-driven particle field
//
// Tens of thousands of particles advected each frame by a wind/pressure vector
// field derived from the live data. A compute shader integrates particle
// positions; a render pass draws them as points. Particle SPEED, TURBULENCE and
// COLOR-TEMPERATURE all rise with global atmospheric tension — so the visual
// tension tracks the same instability that drives the harmonic tension.
//
// The wind field is the superposition of 12 city "vortices" (one per city),
// each placed by its lon/lat on a unit map and weighted by its instability.
// We pass the cities to the GPU as a uniform array and evaluate the field
// inside the compute shader.
//
// Graceful fallback (navigator.gpu absent) lives in the page via Canvas2D.

export type CityField = {
  x: number; // -1..1 (lon/180)
  y: number; // -1..1 (lat/90)
  instability: number; // 0..1
};

const PARTICLE_COUNT = 60_000;
const MAX_CITIES = 16;

export type GpuField = {
  setCities: (cities: CityField[], globalTension: number) => void;
  frame: (dt: number) => void;
  resize: () => void;
  dispose: () => void;
};

export async function createGpuField(
  canvas: HTMLCanvasElement
): Promise<GpuField | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resizeCanvas = () => {
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  resizeCanvas();
  ctx.configure({ device, format, alphaMode: "premultiplied" });

  // ── Particle buffer: pos.xy, vel.xy, seed, age ──────────────────────────
  const FLOATS_PER = 6;
  const particleData = new Float32Array(PARTICLE_COUNT * FLOATS_PER);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * FLOATS_PER;
    particleData[o + 0] = Math.random() * 2 - 1; // x
    particleData[o + 1] = Math.random() * 2 - 1; // y
    particleData[o + 2] = 0; // vx
    particleData[o + 3] = 0; // vy
    particleData[o + 4] = Math.random(); // seed
    particleData[o + 5] = Math.random(); // age
  }
  const particleBuf = device.createBuffer({
    size: particleData.byteLength,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.VERTEX |
      GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, particleData);

  // ── Uniforms: cities + sim params ────────────────────────────────────────
  // layout: [count, dt, tension, time] then MAX_CITIES * vec4(x,y,inst,_)
  const uniFloats = 4 + MAX_CITIES * 4;
  const uniData = new Float32Array(uniFloats);
  const uniBuf = device.createBuffer({
    size: uniData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Compute shader: advect particles by the city wind field ─────────────
  const computeWGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: f32, age: f32 };
struct Sim {
  count: f32, dt: f32, tension: f32, time: f32,
  cities: array<vec4<f32>, ${MAX_CITIES}>,
};
@group(0) @binding(0) var<storage, read_write> ps: array<Particle>;
@group(0) @binding(1) var<uniform> sim: Sim;

fn hash(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (f32(i) >= sim.count) { return; }
  var p = ps[i];

  // Accumulate wind from each city vortex.
  var wind = vec2<f32>(0.0, 0.0);
  for (var c = 0u; c < ${MAX_CITIES}u; c = c + 1u) {
    let city = sim.cities[c];
    let inst = city.z;
    if (inst <= 0.0) { continue; }
    let d = p.pos - city.xy;
    let dist2 = dot(d, d) + 0.02;
    // Rotational (vortex) + slight inward pull; strength = instability.
    let rot = vec2<f32>(-d.y, d.x);
    let swirl = rot / dist2 * inst * 0.06;
    wind = wind + swirl;
  }

  // Turbulence noise scales with global tension.
  let n = hash(p.pos * 3.0 + vec2<f32>(sim.time * 0.1, p.seed * 10.0)) - 0.5;
  let n2 = hash(p.pos * 5.0 + vec2<f32>(p.seed * 3.0, sim.time * 0.07)) - 0.5;
  let turb = vec2<f32>(n, n2) * (0.02 + sim.tension * 0.18);
  wind = wind + turb;

  // Integrate with damping; faster particles when tense.
  let speedScale = 0.4 + sim.tension * 1.4;
  p.vel = p.vel * 0.86 + wind * speedScale;
  p.pos = p.pos + p.vel * sim.dt;
  p.age = p.age + sim.dt * (0.05 + sim.tension * 0.25);

  // Respawn off-screen / aged particles to keep field full.
  if (p.age > 1.0 || abs(p.pos.x) > 1.15 || abs(p.pos.y) > 1.15) {
    let r1 = hash(vec2<f32>(f32(i), sim.time));
    let r2 = hash(vec2<f32>(sim.time, f32(i) * 1.7));
    p.pos = vec2<f32>(r1 * 2.0 - 1.0, r2 * 2.0 - 1.0);
    p.vel = vec2<f32>(0.0, 0.0);
    p.age = 0.0;
  }
  ps[i] = p;
}
`;

  // ── Render shader: draw particles as points; color-temp from tension ─────
  const renderWGSL = /* wgsl */ `
struct Sim {
  count: f32, dt: f32, tension: f32, time: f32,
  cities: array<vec4<f32>, ${MAX_CITIES}>,
};
@group(0) @binding(0) var<uniform> sim: Sim;

struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) col: vec4<f32> };

@vertex
fn vs(@location(0) pos: vec2<f32>, @location(1) vel: vec2<f32>,
      @location(2) seed: f32) -> VSOut {
  var o: VSOut;
  o.pos = vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  let sp = clamp(length(vel) * 6.0, 0.0, 1.0);
  // Cool deep-violet/indigo at rest → warm amber/rose under tension.
  let cool = vec3<f32>(0.30, 0.36, 0.85);
  let warm = vec3<f32>(0.95, 0.55, 0.35);
  let temp = clamp(sim.tension * 0.7 + sp * 0.4, 0.0, 1.0);
  var rgb = mix(cool, warm, temp);
  rgb = rgb * (0.45 + sp * 0.9);
  let a = 0.04 + sp * 0.18 + sim.tension * 0.05;
  o.col = vec4<f32>(rgb, a);
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return in.col;
}
`;

  const computeModule = device.createShaderModule({ code: computeWGSL });
  const renderModule = device.createShaderModule({ code: renderWGSL });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: renderModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: FLOATS_PER * 4,
          stepMode: "vertex",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" }, // pos
            { shaderLocation: 1, offset: 8, format: "float32x2" }, // vel
            { shaderLocation: 2, offset: 16, format: "float32" }, // seed
          ],
        },
      ],
    },
    fragment: {
      module: renderModule,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one" },
            alpha: { srcFactor: "one", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "point-list" },
  });

  const computeBind = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: uniBuf } },
    ],
  });
  const renderBind = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniBuf } }],
  });

  let simTime = 0;
  let tension = 0;
  let cities: CityField[] = [];

  const setCities = (cs: CityField[], globalTension: number) => {
    cities = cs;
    tension = globalTension;
  };

  const writeUniforms = (dt: number) => {
    uniData[0] = PARTICLE_COUNT;
    uniData[1] = dt;
    uniData[2] = tension;
    uniData[3] = simTime;
    for (let c = 0; c < MAX_CITIES; c++) {
      const o = 4 + c * 4;
      const city = cities[c];
      if (city) {
        uniData[o + 0] = city.x;
        uniData[o + 1] = city.y;
        uniData[o + 2] = city.instability;
        uniData[o + 3] = 0;
      } else {
        uniData[o + 0] = 0;
        uniData[o + 1] = 0;
        uniData[o + 2] = 0;
        uniData[o + 3] = 0;
      }
    }
    device.queue.writeBuffer(uniBuf, 0, uniData);
  };

  const frame = (dt: number) => {
    simTime += dt;
    writeUniforms(dt);

    const encoder = device.createCommandEncoder();

    // Compute advection
    const cpass = encoder.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, computeBind);
    cpass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 64));
    cpass.end();

    // Render
    const view = ctx.getCurrentTexture().createView();
    const rpass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.012, g: 0.016, b: 0.035, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBind);
    rpass.setVertexBuffer(0, particleBuf);
    rpass.draw(PARTICLE_COUNT);
    rpass.end();

    device.queue.submit([encoder.finish()]);
  };

  const resize = () => {
    resizeCanvas();
    ctx.configure({ device, format, alphaMode: "premultiplied" });
  };

  const dispose = () => {
    try {
      particleBuf.destroy();
      uniBuf.destroy();
      device.destroy();
    } catch {
      /* noop */
    }
  };

  return { setCities, frame, resize, dispose };
}
