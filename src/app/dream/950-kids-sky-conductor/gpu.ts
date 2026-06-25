// gpu.ts — PRIMARY renderer: raw WebGPU (WGSL).
//
// A full-screen fragment shader paints a warm sky whose gradient color IS the
// conductor's current chord, with a gentle shimmer that PULSES on the tempo and
// glowing note-blooms where the player tapped. No three.js. We declare just the
// WebGPU interfaces we use (no @webgpu/types dependency, no bare `any`), exactly
// as the lab's other WebGPU prototypes do, and hardcode usage bit values.

import type { SkyState } from './scene-types'

// ── Minimal local WebGPU types ───────────────────────────────────────────────
interface GPUNav {
  requestAdapter(opts?: { powerPreference?: string }): Promise<GPUAdapterT | null>
  getPreferredCanvasFormat(): string
}
interface GPUAdapterT {
  requestDevice(): Promise<GPUDeviceT>
}
interface GPUBufferT {
  destroy(): void
}
interface GPUQueueT {
  writeBuffer(buf: GPUBufferT, offset: number, data: ArrayBufferView): void
  submit(cmds: object[]): void
}
interface GPUPipelineT {
  getBindGroupLayout(i: number): object
}
interface GPURenderPassT {
  setPipeline(p: object): void
  setBindGroup(i: number, bg: object): void
  draw(verts: number, instances?: number): void
  end(): void
}
interface GPUEncoderT {
  beginRenderPass(desc: object): GPURenderPassT
  finish(): object
}
interface GPUDeviceT {
  createBuffer(desc: { size: number; usage: number }): GPUBufferT
  createShaderModule(desc: { code: string }): object
  createRenderPipeline(desc: object): GPUPipelineT
  createBindGroup(desc: object): object
  createCommandEncoder(): GPUEncoderT
  queue: GPUQueueT
  destroy(): void
}
interface GPUCanvasContextT {
  configure(desc: object): void
  getCurrentTexture(): { createView(): object }
  unconfigure(): void
}

const U_UNIFORM = 0x40
const U_COPY_DST = 0x08

// Uniform layout (vec4-aligned). 8 blooms * vec4(x,y,age,bright) = 32 floats.
//   header (8 floats / 2 vec4):
//     [0] time [1] aspect [2] pulse [3] chordHueR
//     [4] hueG [5] hueB [6] beatPhase [7] bloomCount
//   then 8 * vec4 blooms.
const HEADER_FLOATS = 8
const MAX_BLOOMS = 8
const UNIFLOATS = HEADER_FLOATS + MAX_BLOOMS * 4 // 40

const SHADER = /* wgsl */ `
struct Bloom { v: vec4f }; // x, y, age(0..1 remaining), brightness
struct U {
  head0: vec4f, // time, aspect, pulse, hueR
  head1: vec4f, // hueG, hueB, beatPhase, bloomCount
  blooms: array<vec4f, 8>,
};
@group(0) @binding(0) var<uniform> u: U;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[i];
  return VOut(vec4f(xy, 0, 1), vec2f(xy.x*0.5+0.5, 1.0 - (xy.y*0.5+0.5)));
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let aspect = u.head0.y;
  let t = u.head0.x;
  let pulse = u.head0.z;
  let chordHue = vec3f(u.head0.w, u.head1.x, u.head1.y);
  let beatPhase = u.head1.z; // 0..1 within a beat
  let count = u.head1.w;

  var uv = in.uv; // y down 0..1 (top=0)
  // aspect-corrected p for circular blooms
  var p = uv;
  p.x = (p.x - 0.5) * aspect + 0.5;

  // ── warm sky gradient = the current chord color ──
  // top is a deeper, richer wash of the chord hue; bottom lifts toward a soft
  // glow, so the whole sky reads as "this chord."
  let deep = chordHue * 0.30 + vec3f(0.03, 0.02, 0.05);
  let lift = chordHue * 0.72 + vec3f(0.05, 0.04, 0.06);
  var col = mix(lift, deep, smoothstep(0.0, 1.0, uv.y));

  // gentle breathing wash
  col += 0.02 * sin(t * 0.5 + uv.x * 3.0) * chordHue;

  // ── conductor-driven tempo shimmer: a soft horizontal pulse band that
  //    sweeps with the beat, brighter at higher tempo (pulse). ──
  let band = exp(-pow((uv.y - beatPhase) * 3.5, 2.0)) ;
  col += chordHue * band * (0.10 + 0.20 * pulse);

  // faint star dust so the sky feels alive (twinkle on the chord hue)
  let cellsz = 90.0;
  let cell = floor(uv * cellsz);
  let h = hash(cell);
  if (h > 0.985) {
    let tw = 0.5 + 0.5 * sin(t * 1.5 + h * 30.0);
    col += vec3f(1.0, 0.96, 0.9) * tw * 0.5;
  }

  // ── player note-blooms ──
  var i = 0;
  loop {
    if (i >= 8) { break; }
    if (f32(i) >= count) { break; }
    let b = u.blooms[i].xyz;
    let bx = (b.x - 0.5) * aspect + 0.5;
    let age = u.blooms[i].z;       // 1 = fresh .. 0 = gone
    let bright = u.blooms[i].w;    // self vs friend brightness
    if (age > 0.0) {
      let d = length(p - vec2f(bx, b.y));
      // expanding ring + warm core
      let core = exp(-d*d * 240.0) * age * bright;
      let ring = exp(-pow((d - (1.0-age)*0.18) * 26.0, 2.0)) * age * 0.5 * bright;
      let warm = mix(chordHue, vec3f(1.0, 0.95, 0.8), 0.6);
      col += warm * (core * 1.6 + ring);
    }
    i = i + 1;
  }

  // soft vignette
  let vd = length(uv - vec2f(0.5));
  col *= 1.0 - vd*vd*0.6;

  // gentle tonemap so nothing ever gets harsh/blown for little eyes
  col = col / (col + vec3f(0.9));
  col = pow(col, vec3f(0.9));
  return vec4f(col, 1.0);
}
`

export interface SkyGpu {
  readonly kind: 'webgpu'
  render(state: SkyState): void
  resize(): void
  dispose(): void
}

/** Try to initialise WebGPU. Returns null if unavailable (caller falls back). */
export async function initSkyGpu(canvas: HTMLCanvasElement): Promise<SkyGpu | null> {
  const gpu = (navigator as unknown as { gpu?: GPUNav }).gpu
  if (!gpu) return null
  let device: GPUDeviceT
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' })
    if (!adapter) return null
    device = await adapter.requestDevice()
  } catch {
    return null
  }

  const ctx = canvas.getContext('webgpu') as unknown as GPUCanvasContextT | null
  if (!ctx) return null
  const format = gpu.getPreferredCanvasFormat()

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const sizeCanvas = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
  }
  sizeCanvas()

  ctx.configure({ device, format, alphaMode: 'opaque' })

  const shaderMod = device.createShaderModule({ code: SHADER })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderMod, entryPoint: 'vs' },
    fragment: { module: shaderMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-strip' },
  })

  const uni = device.createBuffer({ size: UNIFLOATS * 4, usage: U_UNIFORM | U_COPY_DST })
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uni } }],
  })

  const arr = new Float32Array(UNIFLOATS)

  return {
    kind: 'webgpu',
    render(s: SkyState) {
      sizeCanvas()
      const aspect = canvas.width / Math.max(1, canvas.height)
      arr[0] = s.time
      arr[1] = aspect
      arr[2] = s.pulse
      arr[3] = s.hue[0]
      arr[4] = s.hue[1]
      arr[5] = s.hue[2]
      arr[6] = s.beatPhase
      const n = Math.min(MAX_BLOOMS, s.blooms.length)
      arr[7] = n
      for (let i = 0; i < n; i++) {
        const b = s.blooms[i]
        const o = HEADER_FLOATS + i * 4
        arr[o] = b.x
        arr[o + 1] = b.y
        arr[o + 2] = b.age
        arr[o + 3] = b.bright
      }
      for (let i = n; i < MAX_BLOOMS; i++) {
        const o = HEADER_FLOATS + i * 4
        arr[o] = 0
        arr[o + 1] = 0
        arr[o + 2] = 0
        arr[o + 3] = 0
      }
      device.queue.writeBuffer(uni, 0, arr)

      const enc = device.createCommandEncoder()
      const view = ctx.getCurrentTexture().createView()
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r: 0.03, g: 0.02, b: 0.05, a: 1 }, loadOp: 'clear', storeOp: 'store' },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bind)
      pass.draw(4)
      pass.end()
      device.queue.submit([enc.finish()])
    },
    resize() {
      sizeCanvas()
    },
    dispose() {
      try {
        uni.destroy()
      } catch {
        /* noop */
      }
      try {
        ctx.unconfigure()
      } catch {
        /* noop */
      }
      try {
        device.destroy()
      } catch {
        /* noop */
      }
    },
  }
}
