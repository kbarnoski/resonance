/**
 * 7384 · Pulsegate — the energy chamber.
 *
 * A WebGPU compute shader advects a storage buffer of particles that behave
 * like a physical, containable energy field, not a cosmic mandala:
 *   - as tension/mod ("charge") rises the containment radius shrinks and the
 *     field spins faster — it visibly tightens and charges through the build
 *     and riser;
 *   - on the DROP a radial burst impulse blows the containment open;
 *   - every kick ducks the render brightness via the same sidechain-pump
 *     envelope driving the audio (a physical "pump", not a strobe — the
 *     duck recovers smoothly and the kick rate stays under 3 Hz).
 *
 * Falls back to a small Canvas2D particle field with the same physics when
 * `navigator.gpu` is unavailable, so the piece never white-screens.
 */

import { VIOLET_VEC3 } from "../_shared/palette";
import { mulberry32 } from "./engine";

/* @webgpu/types is not a project dependency; these handles use one
 * narrowly-named `any` alias rather than a fragile hand-rolled interface.
 * eslint-disable-next-line @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wgpu = any;

const BUF_STORAGE = 0x0080;
const BUF_UNIFORM = 0x0040;
const BUF_COPY_DST = 0x0008;

export const PARTICLE_COUNT = 80_000;
const FALLBACK_COUNT = 2200;

export interface FieldUniforms {
  time: number;
  dt: number;
  tension: number;
  mod: number;
  dropImpulse: number;
  pump: number;
}

/* ------------------------------------------------------------------ WGSL --- */

const [DEEP, MID, LIGHT] = [VIOLET_VEC3.deep, VIOLET_VEC3.mid, VIOLET_VEC3.light];

const WGSL_HEADER = /* wgsl */ `
struct Params {
  time : f32,
  dt : f32,
  tension : f32,
  mod : f32,
  dropImpulse : f32,
  pump : f32,
  count : f32,
  aspect : f32,
  pointSize : f32,
  pad0 : f32,
  pad1 : f32,
  pad2 : f32,
};
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
};
`;

const WGSL_COMPUTE =
  WGSL_HEADER +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read_write> parts : array<Particle>;

fn potential(p : vec2<f32>, t : f32, freq : f32) -> f32 {
  var v = 0.0;
  v = v + sin(p.x * freq + t) * cos(p.y * freq * 0.9 - t * 0.6);
  v = v + 0.4 * sin(p.x * freq * 2.3 - t * 1.1) * cos(p.y * freq * 1.9 + t * 0.4);
  return v;
}

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= u32(params.count)) { return; }
  var pt = parts[idx];

  let p = pt.pos;
  let r = max(length(p), 0.0001);
  let dir = p / r;

  let charge = clamp(params.tension * 0.6 + params.mod * 0.6, 0.0, 1.0);
  let baseRadius = mix(0.95, 0.30, charge);
  let radius = baseRadius + params.dropImpulse * 0.9;
  let spring = (radius - r) * (2.0 + charge * 2.2);
  var force = dir * spring;

  let tangent = vec2<f32>(-dir.y, dir.x);
  let spin = 0.4 + charge * 2.4;
  force = force + tangent * spin;

  let e = 0.02;
  let freq = 2.5 + charge * 5.0;
  let t = params.time;
  let dPdx = (potential(p + vec2<f32>(e, 0.0), t, freq) - potential(p - vec2<f32>(e, 0.0), t, freq)) / (2.0 * e);
  let dPdy = (potential(p + vec2<f32>(0.0, e), t, freq) - potential(p - vec2<f32>(0.0, e), t, freq)) / (2.0 * e);
  let curl = vec2<f32>(dPdy, -dPdx);
  force = force + curl * (0.12 + charge * 0.55);

  force = force + dir * params.dropImpulse * 6.5;

  pt.vel = mix(pt.vel, force, 0.22);
  pt.pos = pt.pos + pt.vel * params.dt;

  if (length(pt.pos) > 1.3) {
    pt.pos = normalize(pt.pos) * 1.3;
    pt.vel = pt.vel * 0.35;
  }

  parts[idx] = pt;
}
`;

const WGSL_RENDER =
  WGSL_HEADER +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read> parts : array<Particle>;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) speed : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>(1.0, -1.0), vec2<f32>( 1.0, 1.0)
  );
  let c = corners[vi];
  let pt = parts[ii];
  let sp = clamp(length(pt.vel) * 0.16, 0.0, 1.0);
  let size = params.pointSize * (0.5 + sp * 0.9);
  var pos = pt.pos;
  pos.x = pos.x + c.x * size / params.aspect;
  pos.y = pos.y + c.y * size;

  var o : VSOut;
  o.clip = vec4<f32>(pos, 0.0, 1.0);
  o.uv = c;
  o.speed = sp;
  return o;
}

@fragment
fn fs(i : VSOut) -> @location(0) vec4<f32> {
  let d = length(i.uv);
  let a = smoothstep(1.0, 0.0, d);
  let deep = vec3<f32>(${DEEP[0]}, ${DEEP[1]}, ${DEEP[2]});
  let mid = vec3<f32>(${MID[0]}, ${MID[1]}, ${MID[2]});
  let light = vec3<f32>(${LIGHT[0]}, ${LIGHT[1]}, ${LIGHT[2]});
  var col = mix(deep, mid, clamp(i.speed * 1.6, 0.0, 1.0));
  col = mix(col, light, clamp((i.speed - 0.6) * 2.5, 0.0, 1.0));
  let intensity = a * (0.22 + i.speed * 0.78) * params.pump;
  return vec4<f32>(col * intensity, intensity);
}
`;

/* --------------------------------------------------------------- runtime --- */

export interface FieldRuntime {
  update: (u: FieldUniforms) => void;
  resize: () => void;
  dispose: () => void;
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

/** Build the WebGPU compute/render pipeline. Throws if anything fails —
 *  the caller then falls back to Canvas2D. */
export async function runWebGPU(canvas: HTMLCanvasElement): Promise<FieldRuntime> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped navigator.gpu
  const gpu: Wgpu = (navigator as any).gpu;
  if (!gpu) throw new Error("no-webgpu");
  const adapter: Wgpu = await gpu.requestAdapter();
  if (!adapter) throw new Error("no-adapter");
  const device: Wgpu = await adapter.requestDevice();

  const ctx: Wgpu = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-context");
  const format: string = gpu.getPreferredCanvasFormat();
  sizeCanvas(canvas);
  ctx.configure({ device, format, alphaMode: "opaque" });

  const stride = 4;
  const init = new Float32Array(PARTICLE_COUNT * stride);
  const rng = mulberry32(0x7384 ^ 0x51ed270b);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.15 + rng() * 0.75;
    init[i * stride + 0] = Math.cos(a) * r;
    init[i * stride + 1] = Math.sin(a) * r;
    init[i * stride + 2] = 0;
    init[i * stride + 3] = 0;
  }
  const particleBuf: Wgpu = device.createBuffer({
    size: init.byteLength,
    usage: BUF_STORAGE | BUF_COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, init);

  const uniformArr = new Float32Array(12);
  const uniformBuf: Wgpu = device.createBuffer({
    size: uniformArr.byteLength,
    usage: BUF_UNIFORM | BUF_COPY_DST,
  });

  const computeMod: Wgpu = device.createShaderModule({ code: WGSL_COMPUTE });
  const renderMod: Wgpu = device.createShaderModule({ code: WGSL_RENDER });

  const computePipeline: Wgpu = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeMod, entryPoint: "cs" },
  });
  const renderPipeline: Wgpu = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod,
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

  const computeBind: Wgpu = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: particleBuf } },
    ],
  });
  const renderBind: Wgpu = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: particleBuf } },
    ],
  });

  const workgroups = Math.ceil(PARTICLE_COUNT / 64);
  let aspect = canvas.width / Math.max(1, canvas.height);

  return {
    update(u: FieldUniforms) {
      uniformArr[0] = u.time;
      uniformArr[1] = u.dt;
      uniformArr[2] = u.tension;
      uniformArr[3] = u.mod;
      uniformArr[4] = u.dropImpulse;
      uniformArr[5] = u.pump;
      uniformArr[6] = PARTICLE_COUNT;
      uniformArr[7] = aspect;
      uniformArr[8] = 0.005;
      device.queue.writeBuffer(uniformBuf, 0, uniformArr);

      const enc: Wgpu = device.createCommandEncoder();
      const cpass: Wgpu = enc.beginComputePass();
      cpass.setPipeline(computePipeline);
      cpass.setBindGroup(0, computeBind);
      cpass.dispatchWorkgroups(workgroups);
      cpass.end();

      const view: Wgpu = ctx.getCurrentTexture().createView();
      const rpass: Wgpu = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: DEEP[0] * 0.5, g: DEEP[1] * 0.5, b: DEEP[2] * 0.6, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rpass.setPipeline(renderPipeline);
      rpass.setBindGroup(0, renderBind);
      rpass.draw(6, PARTICLE_COUNT);
      rpass.end();
      device.queue.submit([enc.finish()]);
    },
    resize() {
      sizeCanvas(canvas);
      aspect = canvas.width / Math.max(1, canvas.height);
      ctx.configure({ device, format, alphaMode: "opaque" });
    },
    dispose() {
      try {
        device.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

/* --------------------------------------------------------- Canvas2D FB ---- */

export function runCanvas2D(canvas: HTMLCanvasElement): FieldRuntime {
  const g = canvas.getContext("2d");
  sizeCanvas(canvas);

  const xs = new Float32Array(FALLBACK_COUNT);
  const ys = new Float32Array(FALLBACK_COUNT);
  const vx = new Float32Array(FALLBACK_COUNT);
  const vy = new Float32Array(FALLBACK_COUNT);
  const rng = mulberry32(0x7384 ^ 0x27d4eb2f);
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.15 + rng() * 0.75;
    xs[i] = Math.cos(a) * r;
    ys[i] = Math.sin(a) * r;
  }

  const potential = (x: number, y: number, t: number, f: number) =>
    Math.sin(x * f + t) * Math.cos(y * f * 0.9 - t * 0.6) +
    0.4 * Math.sin(x * f * 2.3 - t * 1.1) * Math.cos(y * f * 1.9 + t * 0.4);

  let aspect = canvas.width / Math.max(1, canvas.height);

  return {
    update(u: FieldUniforms) {
      if (!g) return;
      const W = canvas.width;
      const H = canvas.height;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = `rgba(${Math.floor(DEEP[0] * 40)}, ${Math.floor(DEEP[1] * 40)}, ${Math.floor(DEEP[2] * 50)}, 0.24)`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";

      const charge = Math.min(1, Math.max(0, u.tension * 0.6 + u.mod * 0.6));
      const baseRadius = 0.95 - charge * 0.65;
      const radius = baseRadius + u.dropImpulse * 0.9;
      const freq = 2.5 + charge * 5.0;
      const e = 0.02;

      for (let i = 0; i < FALLBACK_COUNT; i++) {
        const x = xs[i];
        const y = ys[i];
        const r = Math.max(Math.hypot(x, y), 0.0001);
        const dirx = x / r;
        const diry = y / r;
        const spring = (radius - r) * (2.0 + charge * 2.2);
        let fx = dirx * spring;
        let fy = diry * spring;
        const spin = 0.4 + charge * 2.4;
        fx += -diry * spin;
        fy += dirx * spin;

        const dPdx = (potential(x + e, y, u.time, freq) - potential(x - e, y, u.time, freq)) / (2 * e);
        const dPdy = (potential(x, y + e, u.time, freq) - potential(x, y - e, u.time, freq)) / (2 * e);
        fx += dPdy * (0.12 + charge * 0.55);
        fy += -dPdx * (0.12 + charge * 0.55);

        fx += dirx * u.dropImpulse * 6.5;
        fy += diry * u.dropImpulse * 6.5;

        vx[i] += (fx - vx[i]) * 0.22;
        vy[i] += (fy - vy[i]) * 0.22;
        let nx = x + vx[i] * u.dt;
        let ny = y + vy[i] * u.dt;
        const nr = Math.hypot(nx, ny);
        if (nr > 1.3) {
          nx = (nx / nr) * 1.3;
          ny = (ny / nr) * 1.3;
          vx[i] *= 0.35;
          vy[i] *= 0.35;
        }
        xs[i] = nx;
        ys[i] = ny;

        const sp = Math.min(1, Math.hypot(vx[i], vy[i]) * 0.16);
        const px = ((nx / aspect) * 0.5 + 0.5) * W;
        const py = (ny * 0.5 + 0.5) * H;
        const rr = Math.floor((DEEP[0] + (MID[0] - DEEP[0]) * sp) * 255);
        const gg = Math.floor((DEEP[1] + (MID[1] - DEEP[1]) * sp) * 255);
        const bb = Math.floor((DEEP[2] + (MID[2] - DEEP[2]) * sp) * 255);
        const alpha = (0.28 + sp * 0.55) * u.pump;
        g.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
        g.fillRect(px, py, 1.8, 1.8);
      }
    },
    resize() {
      sizeCanvas(canvas);
      aspect = canvas.width / Math.max(1, canvas.height);
    },
    dispose() {
      /* no persistent GPU resources to free for Canvas2D */
    },
  };
}
