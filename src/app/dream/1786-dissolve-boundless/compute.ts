// ─────────────────────────────────────────────────────────────────────────────
// 1786-dissolve-boundless — WebGPU compute core.
//
// Half a million particles live in a pair of ping-ponged storage buffers
// (position + velocity, one vec4 each). Every frame a WGSL COMPUTE shader steps
// them; the deliverable is the GPU simulation, not a texture animation.
//
// The one field each particle feels is a COHESION↔DIFFUSION blend:
//   • cohesion (0..1) scales a spring toward a shared sphere-shell radius r0.
//     At cohesion=1 the swarm is a tight, dense, bright sphere — "the ego".
//   • (1 - cohesion) scales a curl/noise diffusion term plus a gentle outward
//     drift. At cohesion=0 the particles unravel and, via a toroidal wrap into a
//     box, distribute into a vast even glow filling the frame — "boundless
//     awareness". Movement/loud sound (page.tsx) drives cohesion back toward 1
//     and the swarm re-coheres into the sphere.
//
// Render: each particle is drawn as an additive soft-disc billboard (6 verts,
// instanced). Additive accumulation does the aesthetic work for free — dense
// overlap in the tight sphere blooms toward white-hot; the thin dispersed field
// reads as a dim, even violet luminescence.
//
// Everything degrades: create() throws a typed error the page catches to show a
// readable notice + a lightweight fallback instead of a blank screen.
// ─────────────────────────────────────────────────────────────────────────────

export class WebGPUUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGPUUnsupportedError";
  }
}

/** ~half a million particles (2^19 = 524,288). */
export const PARTICLE_COUNT = 1 << 19;
const WORKGROUP = 64;

// Simulation constants (tuned; all in view-space units where the sphere shell
// sits at r0 and the boundless box has half-size BOUND).
const R0 = 0.42;
const BOUND = 1.5;

export interface StepParams {
  /** 0..1 — 1 = tight ego sphere, 0 = boundless diffusion. */
  cohesion: number;
  /** Seconds since start (drives the curl field + slow rotation). */
  timeSec: number;
  /** Real delta-time (seconds), clamped internally. */
  dt: number;
  /** Overall emission brightness multiplier (breath drift lives here). */
  brightness: number;
  /** Y-rotation of the swarm, radians. */
  rotY: number;
}

// ─── WGSL: compute step ──────────────────────────────────────────────────────
const SIM_WGSL = /* wgsl */ `
struct Sim {
  count   : u32,
  time    : f32,
  dt      : f32,
  cohesion: f32,
  kSpring : f32,
  r0      : f32,
  diffuse : f32,
  swirl   : f32,
  drag    : f32,
  bound   : f32,
  freq    : f32,
  expand  : f32,
};
@group(0) @binding(0) var<uniform> S : Sim;
@group(0) @binding(1) var<storage, read>       posIn  : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       velIn  : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> posOut : array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut : array<vec4<f32>>;

// A cheap swirling, mostly divergence-free flow — the "diffusion" that unravels
// the sphere into space when cohesion drops.
fn curl(p: vec3<f32>, t: f32) -> vec3<f32> {
  let a = p * S.freq;
  return vec3<f32>(
    sin(a.z + t)        - cos(a.y * 1.3 - t * 0.7),
    sin(a.x * 1.1 - t)  - cos(a.z * 0.9 + t * 0.6),
    sin(a.y * 1.2 + t)  - cos(a.x       - t * 0.8),
  );
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= S.count) { return; }

  var p = posIn[i].xyz;
  let seed = posIn[i].w;
  var v = velIn[i].xyz;

  let r = max(1e-4, length(p));
  let dir = p / r;

  // (a) cohesion spring toward the shared sphere shell of radius r0.
  let spring = -S.kSpring * (r - S.r0) * dir * S.cohesion;
  // a little tangential swirl keeps the coherent sphere alive (not frozen).
  let tang = normalize(cross(dir, vec3<f32>(0.0, 1.0, 0.0)) + vec3<f32>(1e-4, 0.0, 0.0));
  let swirlF = tang * S.swirl * S.cohesion;

  // (b) diffusion — curl flow + gentle outward drift, scaled by (1 - cohesion).
  let open = 1.0 - S.cohesion;
  let dif = curl(p, S.time * 0.2 + seed * 6.2831853) * S.diffuse * open;
  let expandF = dir * S.expand * open;

  v = v + (spring + swirlF + dif + expandF) * S.dt;
  v = v * exp(-S.drag * S.dt); // frame-rate-independent damping
  p = p + v * S.dt;

  // Toroidal wrap into [-bound, bound): when dispersed this fills space evenly.
  // When cohesive the swarm sits at r0 << bound and never touches the wrap.
  let b = S.bound;
  p = p - 2.0 * b * floor((p + vec3<f32>(b)) / (2.0 * b));

  posOut[i] = vec4<f32>(p, seed);
  velOut[i] = vec4<f32>(v, 0.0);
}
`;

// ─── WGSL: render (instanced additive soft-disc billboards) ──────────────────
const RENDER_WGSL = /* wgsl */ `
struct R {
  aspect    : f32,
  time      : f32,
  cohesion  : f32,
  pointSize : f32,
  rotY      : f32,
  brightness: f32,
  bound     : f32,
  _pad      : f32,
};
@group(0) @binding(0) var<uniform> U : R;
@group(0) @binding(1) var<storage, read> pos : array<vec4<f32>>;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv   : vec2<f32>,
  @location(1) glow : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
  );
  let c = corners[vi];
  let p = pos[ii].xyz;

  // rotate around Y for a slow parallax tumble
  let ca = cos(U.rotY);
  let sa = sin(U.rotY);
  let rx =  p.x * ca + p.z * sa;
  let rz = -p.x * sa + p.z * ca;
  let ry =  p.y;

  // orthographic map box [-bound,bound] -> clip with slight overscan
  let scale = 1.18 / U.bound;
  var ndc = vec2<f32>(rx * scale / U.aspect, ry * scale);

  // depth cue: particles toward the viewer glow a touch brighter
  let depth = clamp(0.5 + rz * scale * 0.5, 0.0, 1.0);

  // screen-facing billboard offset (kept square via aspect)
  let off = c * U.pointSize;
  ndc = ndc + vec2<f32>(off.x / U.aspect, off.y);

  var o : VSOut;
  o.clip = vec4<f32>(ndc, 0.0, 1.0);
  o.uv = c;
  o.glow = 0.55 + 0.45 * depth;
  return o;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  let a = smoothstep(1.0, 0.0, d);
  let falloff = a * a;

  // cool violet emission; additive accumulation whitens dense cores for free.
  let violet = vec3<f32>(0.55, 0.40, 0.98);
  let warm   = vec3<f32>(0.80, 0.78, 1.00);
  let col = mix(violet, warm, 0.22) * (falloff * in.glow * U.brightness);
  return vec4<f32>(col, falloff);
}
`;

const SIM_BYTES = 64; // 12 * 4 rounded up
const RENDER_BYTES = 32; // 8 * 4

export interface DissolveRenderer {
  step(p: StepParams): void;
  resize(): void;
  dispose(): void;
}

/** Fibonacci-sphere shell + tiny jitter → the initial coherent "ego" sphere. */
function makeInitialState(count: number): {
  pos: Float32Array;
  vel: Float32Array;
} {
  const pos = new Float32Array(count * 4);
  const vel = new Float32Array(count * 4); // all zero
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // 1..-1
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const jitter = 0.94 + 0.12 * fract(Math.sin(i * 12.9898) * 43758.5453);
    const rr = R0 * jitter;
    const o = i * 4;
    pos[o + 0] = Math.cos(theta) * rad * rr;
    pos[o + 1] = y * rr;
    pos[o + 2] = Math.sin(theta) * rad * rr;
    pos[o + 3] = fract(Math.sin(i * 78.233) * 12345.678); // per-particle seed
  }
  return { pos, vel };
}

function fract(x: number): number {
  return x - Math.floor(x);
}

export async function createDissolveRenderer(
  canvas: HTMLCanvasElement,
): Promise<DissolveRenderer> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new WebGPUUnsupportedError("navigator.gpu is unavailable");
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw new WebGPUUnsupportedError("no WebGPU adapter (GPU/driver blocked)");
  }
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (e) {
    throw new WebGPUUnsupportedError(
      "requestDevice failed: " + (e instanceof Error ? e.message : String(e)),
    );
  }

  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    throw new WebGPUUnsupportedError("could not get a webgpu canvas context");
  }
  const format = navigator.gpu.getPreferredCanvasFormat();

  let disposed = false;
  let deviceLost = false;
  device.lost.then((info) => {
    deviceLost = true;
    if (!disposed && info.reason !== "destroyed") {
      console.warn("[dissolve-boundless] WebGPU device lost:", info.message);
    }
  });

  const configure = () => {
    const dpr = Math.min(
      2,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    context.configure({ device, format, alphaMode: "opaque" });
  };
  configure();

  // ── particle storage buffers (ping-pong) ───────────────────────────────────
  const bytesPer = PARTICLE_COUNT * 4 * 4; // vec4<f32>
  const { pos, vel } = makeInitialState(PARTICLE_COUNT);

  const makeBuf = (init?: Float32Array) => {
    const buf = device.createBuffer({
      size: bytesPer,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: !!init,
    });
    if (init) {
      new Float32Array(buf.getMappedRange()).set(init);
      buf.unmap();
    }
    return buf;
  };
  const posA = makeBuf(pos);
  const velA = makeBuf(vel);
  const posB = makeBuf();
  const velB = makeBuf();

  // ── uniforms ────────────────────────────────────────────────────────────────
  const simBuf = device.createBuffer({
    size: SIM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderBuf = device.createBuffer({
    size: RENDER_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── bind group layouts ──────────────────────────────────────────────────────
  const simLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ],
  });

  // ── pipelines ───────────────────────────────────────────────────────────────
  const simModule = device.createShaderModule({ code: SIM_WGSL });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });

  const simPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [simLayout] }),
    compute: { module: simModule, entryPoint: "main" },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: {
      module: renderModule,
      entryPoint: "fs",
      targets: [
        {
          format,
          // additive: bright where particles overlap
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  // ── bind groups (A→B and B→A) ───────────────────────────────────────────────
  const simAB = device.createBindGroup({
    layout: simLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: posA } },
      { binding: 2, resource: { buffer: velA } },
      { binding: 3, resource: { buffer: posB } },
      { binding: 4, resource: { buffer: velB } },
    ],
  });
  const simBA = device.createBindGroup({
    layout: simLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: posB } },
      { binding: 2, resource: { buffer: velB } },
      { binding: 3, resource: { buffer: posA } },
      { binding: 4, resource: { buffer: velA } },
    ],
  });
  const renderFromA = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: renderBuf } },
      { binding: 1, resource: { buffer: posA } },
    ],
  });
  const renderFromB = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: renderBuf } },
      { binding: 1, resource: { buffer: posB } },
    ],
  });

  const simData = new ArrayBuffer(SIM_BYTES);
  const sf = new Float32Array(simData);
  const su = new Uint32Array(simData);
  const renderData = new ArrayBuffer(RENDER_BYTES);
  const rf = new Float32Array(renderData);

  // currentIsA: true when the newest state lives in A. Init wrote A, so before
  // the first sim pass A is current; each pass flips it.
  let currentIsA = true;
  const groups = Math.ceil(PARTICLE_COUNT / WORKGROUP);

  const step = (p: StepParams) => {
    if (disposed || deviceLost) return;
    const dt = Math.min(0.033, Math.max(0.0005, p.dt));
    const coh = Math.min(1, Math.max(0, p.cohesion));

    // sim uniforms
    su[0] = PARTICLE_COUNT;
    sf[1] = p.timeSec;
    sf[2] = dt; // real seconds — integration is in per-second units
    sf[3] = coh;
    sf[4] = 9.0; // kSpring  (omega ~3 rad/s → ~2s elastic re-coherence)
    sf[5] = R0; // r0
    sf[6] = 0.7; // diffuse
    sf[7] = 0.3; // swirl
    sf[8] = 1.4; // drag  (v *= exp(-drag*dt))
    sf[9] = BOUND; // bound
    sf[10] = 2.2; // freq
    sf[11] = 0.15; // expand
    device.queue.writeBuffer(simBuf, 0, simData);

    const enc = device.createCommandEncoder();

    // one compute step per frame (reads current, writes the other buffer)
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(simPipeline);
      pass.setBindGroup(0, currentIsA ? simAB : simBA);
      pass.dispatchWorkgroups(groups);
      pass.end();
      currentIsA = !currentIsA;
    }

    // render uniforms
    const aspect = canvas.width / Math.max(1, canvas.height);
    // softer, larger points when dispersed → smoother even glow
    const pointSize = 0.0045 + 0.006 * (1 - coh);
    rf[0] = aspect;
    rf[1] = p.timeSec;
    rf[2] = coh;
    rf[3] = pointSize;
    rf[4] = p.rotY;
    rf[5] = p.brightness;
    rf[6] = BOUND;
    rf[7] = 0;
    device.queue.writeBuffer(renderBuf, 0, renderData);

    const view = context.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.006, g: 0.004, b: 0.016, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    // after the flip, currentIsA marks where the freshly-written state lives
    rpass.setBindGroup(0, currentIsA ? renderFromA : renderFromB);
    rpass.draw(6, PARTICLE_COUNT);
    rpass.end();

    device.queue.submit([enc.finish()]);
  };

  const resize = () => {
    if (disposed || deviceLost) return;
    configure();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      context.unconfigure();
    } catch {
      /* ignore */
    }
    posA.destroy();
    posB.destroy();
    velA.destroy();
    velB.destroy();
    simBuf.destroy();
    renderBuf.destroy();
    device.destroy();
  };

  return { step, resize, dispose };
}
