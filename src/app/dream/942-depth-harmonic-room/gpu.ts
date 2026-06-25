// gpu.ts — primary renderer: raw WebGPU (WGSL) warm Tonnetz "room".
//
// A single full-screen fragment shader paints a candle-warm lattice of light:
// a hexagonal-ish Tonnetz of pitch nodes connected by triad edges, set in a
// soft volumetric room (amber / rose / deep-teal). The CURRENTLY-sounding triad
// triangle glows brightest and blooms with nearEnergy; a warm focal glow marks
// your position on the lattice; motion adds shimmer.
//
// No @huggingface, no three.js. We declare just-enough local WebGPU interfaces
// (no @webgpu/types dependency, no `any`) and hardcode the usage bit values.

// ── Minimal local WebGPU types (no external @webgpu/types) ───────────────────
interface GPUNav {
  requestAdapter(opts?: { powerPreference?: string }): Promise<GPUAdapterT | null>;
  getPreferredCanvasFormat(): string;
}
interface GPUAdapterT {
  requestDevice(): Promise<GPUDeviceT>;
}
interface GPUBufferT {
  destroy(): void;
}
interface GPUQueueT {
  writeBuffer(buf: GPUBufferT, offset: number, data: ArrayBufferView): void;
  submit(cmds: object[]): void;
}
interface GPUPipelineT {
  getBindGroupLayout(i: number): object;
}
interface GPURenderPassT {
  setPipeline(p: object): void;
  setBindGroup(i: number, bg: object): void;
  draw(verts: number, instances?: number): void;
  end(): void;
}
interface GPUEncoderT {
  beginRenderPass(desc: object): GPURenderPassT;
  finish(): object;
}
interface GPUDeviceT {
  createBuffer(desc: { size: number; usage: number }): GPUBufferT;
  createShaderModule(desc: { code: string }): object;
  createRenderPipeline(desc: object): GPUPipelineT;
  createBindGroup(desc: object): object;
  createCommandEncoder(): GPUEncoderT;
  queue: GPUQueueT;
  destroy(): void;
}
interface GPUCanvasContextT {
  configure(desc: object): void;
  getCurrentTexture(): { createView(): object };
  unconfigure(): void;
}

const U_UNIFORM = 0x40;
const U_COPY_DST = 0x08;

// Uniform layout (std140-ish, all vec4 aligned), 16 floats = 64 bytes:
//  [0] focalX   [1] focalY   [2] nearEnergy  [3] motion
//  [4] aActiveX [5] aActiveY  (active triad node A, in lattice uv)
//  [6] bActiveX [7] bActiveY  (node B)
//  [8] cActiveX [9] cActiveY  (node C)
//  [10] time    [11] glow     [12] aspect [13] hueShift [14] pad [15] pad
const UNIFLOATS = 16;

const SHADER = /* wgsl */ `
struct U {
  data0: vec4f, // focalX, focalY, nearEnergy, motion
  nodeA: vec4f, // aX, aY, bX, bY
  nodeBC: vec4f, // cX, cY, time, glow
  misc: vec4f,  // aspect, hueShift, pad, pad
};
@group(0) @binding(0) var<uniform> u: U;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[i];
  // uv 0..1 with y up
  return VOut(vec4f(xy, 0, 1), vec2f(xy.x*0.5+0.5, xy.y*0.5+0.5));
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// distance from point p to segment a-b
fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h);
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let aspect = u.misc.x;
  var uv = in.uv;
  // work in an aspect-corrected space centred at 0.5
  var p = uv;
  p.x = (p.x - 0.5) * aspect + 0.5;

  let nearE = u.data0.z;
  let motion = u.data0.w;
  let t = u.nodeBC.z;
  let glow = u.nodeBC.w;

  // ── warm room background: deep teal floor → amber haze, soft vignette ──
  let vy = uv.y;
  var col = mix(vec3f(0.03,0.045,0.055), vec3f(0.05,0.035,0.03), vy);
  // candle haze low-centre
  let hazeC = vec2f(0.5, 0.32);
  let hd = length((p - hazeC) * vec2f(1.0, 1.3));
  col += vec3f(0.16, 0.09, 0.05) * exp(-hd*hd*5.5) * (0.5 + 0.6*nearE);

  // ── Tonnetz lattice of light: a triangular grid of warm nodes ──
  // lattice spacing
  let gs = 0.14;
  // skew to triangular lattice
  var lp = p / gs;
  lp.x += lp.y * 0.5;
  let cell = floor(lp);
  let f = fract(lp);
  var nodeGlow = 0.0;
  var edgeGlow = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let g = cell + vec2f(f32(dx), f32(dy));
      // node centre in skewed space
      let np = g + vec2f(0.5, 0.5);
      // back to p-space
      var wp = np * gs;
      wp.x -= np.y * gs * 0.5; // undo skew approx
      let d = length((p - vec2f((np.x - np.y*0.5)*gs, np.y*gs)));
      let tw = 0.6 + 0.4*sin(t*0.6 + hash(g)*6.28);
      nodeGlow += smoothstep(0.02, 0.0, d) * tw;
    }
  }

  // ── active triad triangle (the sounding chord) ──
  let A = u.nodeA.xy;
  let B = u.nodeA.zw;
  let C = u.nodeBC.xy;
  let dA = segDist(p, A, B);
  let dB = segDist(p, B, C);
  let dC = segDist(p, C, A);
  let triEdge = min(dA, min(dB, dC));
  let edge = smoothstep(0.012, 0.0, triEdge) * (0.7 + 0.8*glow);
  // soft fill bloom inside the triad
  let centroid = (A + B + C) / 3.0;
  let fillD = length(p - centroid);
  let fill = exp(-fillD*fillD*22.0) * (0.25 + 0.9*nearE) * (0.6+0.7*glow);

  // ── focal glow (your position) ──
  let focal = u.data0.xy;
  let fp = vec2f((focal.x-0.5)*aspect+0.5, focal.y);
  let fd = length(p - fp);
  let focalGlow = exp(-fd*fd*36.0) * (0.6 + 1.2*nearE);

  // warm palette
  let amber = vec3f(1.0, 0.62, 0.28);
  let rose  = vec3f(1.0, 0.42, 0.5);
  let teal  = vec3f(0.3, 0.85, 0.78);
  let hueShift = u.misc.y; // 0..1, minor→rose, major→amber

  col += amber * nodeGlow * 0.6;
  col += mix(rose, amber, hueShift) * edge * 1.4;
  col += mix(rose, amber, hueShift) * fill * 1.2;
  col += mix(teal, amber, 0.5) * focalGlow * 1.5;

  // shimmer from motion
  let sh = hash(floor(p*220.0) + floor(vec2f(t*8.0)));
  col += vec3f(0.5,0.4,0.3) * sh * motion * 0.12;

  // soft vignette
  let vd = length(uv - vec2f(0.5));
  col *= 1.0 - vd*vd*0.7;

  // gentle filmic-ish tonemap
  col = col / (col + vec3f(0.85));
  col = pow(col, vec3f(0.92));
  return vec4f(col, 1.0);
}
`;

export interface TonnetzGpu {
  readonly kind: "webgpu";
  render(state: RoomState): void;
  resize(): void;
  dispose(): void;
}

export interface RoomState {
  focalX: number; // 0..1 lattice/screen position
  focalY: number;
  nearEnergy: number;
  motion: number;
  // active triad triangle node positions, in screen uv 0..1
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  time: number;
  glow: number; // transient bloom when a transform fires (0..1, decays)
  hueShift: number; // 0 = rose(minor) .. 1 = amber(major)
}

/** Try to initialise WebGPU. Returns null if unavailable (caller falls back). */
export async function initTonnetzGpu(
  canvas: HTMLCanvasElement,
): Promise<TonnetzGpu | null> {
  const gpu = (navigator as unknown as { gpu?: GPUNav }).gpu;
  if (!gpu) return null;
  let device: GPUDeviceT;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const ctx = canvas.getContext("webgpu") as unknown as GPUCanvasContextT | null;
  if (!ctx) return null;
  const format = gpu.getPreferredCanvasFormat();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  sizeCanvas();

  ctx.configure({ device, format, alphaMode: "opaque" });

  const shaderMod = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderMod, entryPoint: "vs" },
    fragment: { module: shaderMod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-strip" },
  });

  const uni = device.createBuffer({
    size: UNIFLOATS * 4,
    usage: U_UNIFORM | U_COPY_DST,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uni } }],
  });

  const arr = new Float32Array(UNIFLOATS);

  return {
    kind: "webgpu",
    render(s: RoomState) {
      sizeCanvas();
      const aspect = canvas.width / Math.max(1, canvas.height);
      arr[0] = s.focalX;
      arr[1] = s.focalY;
      arr[2] = s.nearEnergy;
      arr[3] = s.motion;
      arr[4] = s.ax;
      arr[5] = s.ay;
      arr[6] = s.bx;
      arr[7] = s.by;
      arr[8] = s.cx;
      arr[9] = s.cy;
      arr[10] = s.time;
      arr[11] = s.glow;
      arr[12] = aspect;
      arr[13] = s.hueShift;
      arr[14] = 0;
      arr[15] = 0;
      device.queue.writeBuffer(uni, 0, arr);

      const enc = device.createCommandEncoder();
      const view = ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.02, g: 0.03, b: 0.04, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.draw(4);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    resize() {
      sizeCanvas();
    },
    dispose() {
      try {
        uni.destroy();
      } catch {
        /* noop */
      }
      try {
        ctx.unconfigure();
      } catch {
        /* noop */
      }
      try {
        device.destroy();
      } catch {
        /* noop */
      }
    },
  };
}
