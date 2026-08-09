// gpu.ts — the visualization substrate: a WebGPU compute particle field.
//
// N particles live in normalized [0,1] space and are stepped every frame by a
// compute shader. The first half belong to KAREL'S hand (they orbit a left
// attractor, spin one way, and burst outward on his onsets); the second half
// belong to the SHADOW hand (right attractor, opposite spin, bursts on the
// accompanist's onsets). The detected chroma bends both flow fields, so a
// change of pitch visibly re-shapes the duet. A render pass draws each particle
// as a soft additive amber sprite (instanced quads). Warm amber + ink only.
//
// Graceful degradation lives in page.tsx: if navigator.gpu is missing, an SVG
// field is driven instead. Nothing here uses Canvas2D or WebGL2.

import { mulberry32, type VizState } from "./analysis";

const PARTICLES = 4000;
const WG = 64;

// ── compute: step particle positions/velocities ───────────────────────────────
const COMPUTE_WGSL = /* wgsl */ `
struct U {
  time: f32, dt: f32, onsetA: f32, onsetB: f32,
  chroma: f32, energy: f32, reduce: f32, half: f32,
  count: f32, beat: f32, pad0: f32, pad1: f32,
};
@group(0) @binding(0) var<storage, read_write> parts: array<vec4f>;
@group(0) @binding(1) var<uniform> u: U;

fn hash1(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (f32(i) >= u.count) { return; }
  var s = parts[i];
  var p = s.xy;
  var v = s.zw;

  let isA = f32(i) < u.half;                   // first half = Karel's hand
  let center = select(vec2f(0.64, 0.5), vec2f(0.36, 0.5), isA);
  let spin = select(-1.0, 1.0, isA);
  let onset = select(u.onsetB, u.onsetA, isA);

  // attraction back toward the hand's home
  let toC = center - p;
  // rotational (curl-like) flow — the two hands spin opposite ways
  let rot = vec2f(-toC.y, toC.x) * spin;
  // chroma bends the flow angle so pitch changes re-shape the field
  let bend = u.chroma * 6.2831853;
  let br = vec2f(cos(bend), sin(bend));
  let swirl = vec2f(rot.x * br.x - rot.y * br.y, rot.x * br.y + rot.y * br.x);

  let amp = select(1.0, 0.4, u.reduce > 0.5);   // reduced-motion damping
  var force = toC * 0.9 + swirl * (0.9 + u.energy * 1.4) * amp;

  // onset burst — radial impulse outward from the hand's center
  let outDir = normalize(p - center + vec2f(hash1(f32(i)) - 0.5, hash1(f32(i) + 7.0) - 0.5) * 0.01);
  force = force + outDir * onset * 2.6 * amp;

  // a little seeded turbulence so the field never freezes
  let tw = vec2f(
    sin(u.time * 0.6 + f32(i) * 0.7),
    cos(u.time * 0.5 + f32(i) * 1.3)
  ) * 0.12 * amp;
  force = force + tw;

  v = v * 0.9 + force * u.dt;
  p = p + v * u.dt;

  // soft reflect at the borders so particles stay on screen
  if (p.x < 0.02) { p.x = 0.02; v.x = abs(v.x) * 0.5; }
  if (p.x > 0.98) { p.x = 0.98; v.x = -abs(v.x) * 0.5; }
  if (p.y < 0.02) { p.y = 0.02; v.y = abs(v.y) * 0.5; }
  if (p.y > 0.98) { p.y = 0.98; v.y = -abs(v.y) * 0.5; }

  parts[i] = vec4f(p, v);
}`;

// ── render: instanced additive amber sprites ──────────────────────────────────
const RENDER_WGSL = /* wgsl */ `
struct RU {
  resX: f32, resY: f32, onsetA: f32, onsetB: f32,
  time: f32, energy: f32, half: f32, count: f32,
};
@group(0) @binding(0) var<storage, read> parts: array<vec4f>;
@group(0) @binding(1) var<uniform> u: RU;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) bright: f32,
};

@vertex
fn vmain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let corner = quad[vi];
  let s = parts[ii];
  let p = s.xy;
  let speed = length(s.zw);

  let isA = f32(ii) < u.half;
  let onset = select(u.onsetB, u.onsetA, isA);

  // warm amber duet: Karel = deep ember, shadow = pale honey
  let ember = vec3f(0.95, 0.55, 0.18);
  let honey = vec3f(1.0, 0.82, 0.45);
  var col = select(honey, ember, isA);

  let bright = 0.25 + speed * 2.2 + onset * 0.8;
  let sizePx = (2.0 + speed * 26.0 + onset * 6.0);
  let sizeClip = vec2f(sizePx / u.resX, sizePx / u.resY);

  let center = p * 2.0 - vec2f(1.0, 1.0);
  let clip = center + corner * sizeClip;

  var o: VO;
  o.pos = vec4f(clip.x, -clip.y, 0.0, 1.0);
  o.uv = corner;
  o.col = col;
  o.bright = bright;
  return o;
}

@fragment
fn fmain(v: VO) -> @location(0) vec4f {
  let d = length(v.uv);
  let a = smoothstep(1.0, 0.0, d);
  let glow = a * a * v.bright;
  return vec4f(v.col * glow, glow);
}`;

export interface GpuField {
  readonly backend: "GPU";
  frame(state: VizState, dt: number, timeSec: number, reduce: boolean): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

export async function createGpuField(
  canvas: HTMLCanvasElement,
): Promise<GpuField> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "low-power",
  });
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const maybeCtx = canvas.getContext("webgpu");
  if (!maybeCtx) throw new Error("no-webgpu");
  const ctx: GPUCanvasContext = maybeCtx;
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  // seeded initial particle cloud
  const init = new Float32Array(PARTICLES * 4);
  const rnd = mulberry32(0x9016);
  for (let i = 0; i < PARTICLES; i++) {
    const isA = i < PARTICLES / 2;
    const cx = isA ? 0.36 : 0.64;
    const r = 0.12 + rnd() * 0.16;
    const a = rnd() * Math.PI * 2;
    init[i * 4] = cx + Math.cos(a) * r;
    init[i * 4 + 1] = 0.5 + Math.sin(a) * r;
    init[i * 4 + 2] = 0;
    init[i * 4 + 3] = 0;
  }
  const partBuf = device.createBuffer({
    size: init.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(partBuf, 0, init);

  const computeUni = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUni = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipe = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vmain" },
    fragment: {
      module: renderModule,
      entryPoint: "fmain",
      targets: [
        {
          format: fmt,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = device.createBindGroup({
    layout: computePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: partBuf } },
      { binding: 1, resource: { buffer: computeUni } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: partBuf } },
      { binding: 1, resource: { buffer: renderUni } },
    ],
  });

  const cu = new Float32Array(12);
  const ru = new Float32Array(8);
  let destroyed = false;

  function frame(
    state: VizState,
    dt: number,
    timeSec: number,
    reduce: boolean,
  ): void {
    if (destroyed) return;
    const cdt = Math.min(0.05, dt);
    // chroma → a normalized angle driver (dominant pitch class)
    const chromaN = state.dominant / 12;

    cu[0] = timeSec;
    cu[1] = cdt;
    cu[2] = state.onsetA;
    cu[3] = state.onsetB;
    cu[4] = chromaN;
    cu[5] = state.energy;
    cu[6] = reduce ? 1 : 0;
    cu[7] = PARTICLES / 2;
    cu[8] = PARTICLES;
    cu[9] = state.beatPhase;
    device.queue.writeBuffer(computeUni, 0, cu);

    ru[0] = canvas.width;
    ru[1] = canvas.height;
    ru[2] = state.onsetA;
    ru[3] = state.onsetB;
    ru[4] = timeSec;
    ru[5] = state.energy;
    ru[6] = PARTICLES / 2;
    ru[7] = PARTICLES;
    device.queue.writeBuffer(renderUni, 0, ru);

    const enc = device.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setPipeline(computePipe);
    cpass.setBindGroup(0, computeBG);
    cpass.dispatchWorkgroups(Math.ceil(PARTICLES / WG));
    cpass.end();

    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.035, g: 0.022, b: 0.014, a: 1 }, // warm ink
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipe);
    rpass.setBindGroup(0, renderBG);
    rpass.draw(6, PARTICLES);
    rpass.end();

    device.queue.submit([enc.finish()]);
  }

  function resize(w: number, h: number): void {
    canvas.width = w;
    canvas.height = h;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    partBuf.destroy();
    computeUni.destroy();
    renderUni.destroy();
    device.destroy();
  }

  return { backend: "GPU", frame, resize, destroy };
}
