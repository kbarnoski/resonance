/// <reference types="@webgpu/types" />
/**
 * WebGPU compute backend for the breath fresco.
 *
 * Two rgba16float storage textures are ping-ponged. A compute pass updates a
 * WINDOW of columns around the trowel head (vertical fuse + additive deposit)
 * and copies frozen history everywhere else — so past strata are permanent. A
 * fullscreen render pass tone-maps the field over a deep-umber plaster ground,
 * applies age-based oxidation for columns behind the trowel, and draws the wet
 * trowel-head sheen.
 */

import type { Fresco, FrescoDeposit } from "./fresco";

const W = 1024;
const H = 512;
const WINDOW = 18; // texels of "wet" wall around the trowel

const UPDATE_WGSL = /* wgsl */ `
struct Params {
  dims : vec2<f32>,
  trowelX : f32,
  window : f32,
  depY : f32,
  depHalf : f32,
  depInt : f32,
  vFuse : f32,
  col : vec3<f32>,
  _pad : f32,
};
@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var dst : texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> P : Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let Wd = u32(P.dims.x);
  let Hd = u32(P.dims.y);
  if (gid.x >= Wd || gid.y >= Hd) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  var c = textureLoad(src, coord, 0);
  let dx = abs(f32(gid.x) - P.trowelX);
  if (dx < P.window) {
    let up = textureLoad(src, vec2<i32>(coord.x, max(coord.y - 1, 0)), 0);
    let dn = textureLoad(src, vec2<i32>(coord.x, min(coord.y + 1, i32(Hd) - 1)), 0);
    c = mix(c, (up + dn) * 0.5, P.vFuse);
    if (P.depInt > 0.0 && dx < 2.2) {
      let yN = f32(gid.y) / P.dims.y;
      let d = (yN - P.depY) / max(P.depHalf, 0.001);
      let g = exp(-d * d);
      let add = g * P.depInt;
      c = vec4<f32>(c.rgb + P.col * add, min(c.a + add, 12.0));
    }
  }
  textureStore(dst, coord, c);
}
`;

const RENDER_WGSL = /* wgsl */ `
struct RParams {
  dims : vec2<f32>,
  trowelX : f32,
  ox : f32,
};
@group(0) @binding(0) var field : texture_2d<f32>;
@group(0) @binding(1) var<uniform> R : RParams;

@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}

fn hash(p : vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

@fragment
fn fs(@builtin(position) fc : vec4<f32>) -> @location(0) vec4<f32> {
  let coord = vec2<i32>(i32(fc.x), i32(fc.y));
  let fld = textureLoad(field, coord, 0);

  // Deep-umber plaster ground with static grain (no time ⇒ no flicker).
  let grain = (hash(floor(fc.xy)) - 0.5) * 0.045;
  var col = vec3<f32>(0.085, 0.058, 0.038) + grain;

  // Tone-map accumulated pigment.
  var pig = vec3<f32>(1.0) - exp(-fld.rgb * 1.3);

  // Oxidation: columns behind the trowel deepen toward sienna with age.
  let ageX = clamp((R.trowelX - fc.x) / (R.dims.x * 0.6), 0.0, 1.0) * R.ox;
  pig = mix(pig, pig * vec3<f32>(0.86, 0.62, 0.44), ageX);

  col = col + pig;

  // Wet trowel-head sheen (slow-moving, soft ⇒ no strobe).
  let d = f32(coord.x) - R.trowelX;
  let sheen = exp(-(d * d) / (2.0 * 9.0 * 9.0));
  col = col + vec3<f32>(0.9, 0.84, 0.72) * sheen * 0.16;
  // Faint leading wet edge just ahead of the trowel.
  let lead = clamp(1.0 - abs(d - 3.0) / 2.0, 0.0, 1.0);
  col = col + vec3<f32>(0.5, 0.46, 0.38) * lead * 0.05;

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

class GpuFresco implements Fresco {
  readonly backend = "webgpu" as const;
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private tex: [GPUTexture, GPUTexture];
  private cur = 0;
  private updatePipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private paramsBuf: GPUBuffer;
  private rParamsBuf: GPUBuffer;
  private updateBind: [GPUBindGroup, GPUBindGroup];
  private renderBind: [GPUBindGroup, GPUBindGroup];
  private pf32 = new Float32Array(12);
  private rf32 = new Float32Array(4);

  constructor(device: GPUDevice, canvas: HTMLCanvasElement, format: GPUTextureFormat) {
    this.device = device;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.ctx.configure({ device, format, alphaMode: "opaque" });

    const usage =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.COPY_DST;
    this.tex = [
      device.createTexture({ size: [W, H], format: "rgba16float", usage }),
      device.createTexture({ size: [W, H], format: "rgba16float", usage }),
    ];

    this.updatePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: UPDATE_WGSL }), entryPoint: "main" },
    });
    this.renderPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: device.createShaderModule({ code: RENDER_WGSL }), entryPoint: "vs" },
      fragment: {
        module: device.createShaderModule({ code: RENDER_WGSL }),
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.paramsBuf = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.rParamsBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const mkUpdate = (src: number, dst: number) =>
      device.createBindGroup({
        layout: this.updatePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.tex[src].createView() },
          { binding: 1, resource: this.tex[dst].createView() },
          { binding: 2, resource: { buffer: this.paramsBuf } },
        ],
      });
    this.updateBind = [mkUpdate(0, 1), mkUpdate(1, 0)];

    const mkRender = (idx: number) =>
      device.createBindGroup({
        layout: this.renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.tex[idx].createView() },
          { binding: 1, resource: { buffer: this.rParamsBuf } },
        ],
      });
    // After step, current = the just-written texture.
    this.renderBind = [mkRender(1), mkRender(0)];
  }

  step(trowelX: number, deposit: FrescoDeposit | null): void {
    const tx = Math.max(0, Math.min(W - 1, trowelX * (W - 1)));
    const p = this.pf32;
    p[0] = W;
    p[1] = H;
    p[2] = tx;
    p[3] = WINDOW;
    p[4] = deposit ? deposit.y : 0.5;
    p[5] = 0.03;
    p[6] = deposit ? deposit.intensity * 0.16 : 0;
    p[7] = 0.12;
    p[8] = deposit ? deposit.color[0] : 0;
    p[9] = deposit ? deposit.color[1] : 0;
    p[10] = deposit ? deposit.color[2] : 0;
    p[11] = 0;
    this.device.queue.writeBuffer(this.paramsBuf, 0, p);

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.updatePipe);
    pass.setBindGroup(0, this.updateBind[this.cur]);
    pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8));
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.cur ^= 1; // written texture is now current
  }

  render(trowelX: number): void {
    const tx = Math.max(0, Math.min(W - 1, trowelX * (W - 1)));
    this.rf32[0] = W;
    this.rf32[1] = H;
    this.rf32[2] = tx;
    this.rf32[3] = 0.9;
    this.device.queue.writeBuffer(this.rParamsBuf, 0, this.rf32);

    const enc = this.device.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(this.renderPipe);
    // renderBind index: current written texture is tex[cur^1==cur? ] — cur was
    // flipped in step(), so the just-written texture is tex[cur]. renderBind[0]
    // views tex[1], renderBind[1] views tex[0]; pick the one matching cur.
    pass.setBindGroup(0, this.renderBind[this.cur === 1 ? 0 : 1]);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  reset(): void {
    const zero = new Uint8Array(W * H * 8); // rgba16float = 8 bytes/texel
    for (const t of this.tex) {
      this.device.queue.writeTexture(
        { texture: t },
        zero,
        { bytesPerRow: W * 8, rowsPerImage: H },
        { width: W, height: H },
      );
    }
    this.cur = 0;
  }

  dispose(): void {
    try {
      this.tex.forEach((t) => t.destroy());
      this.paramsBuf.destroy();
      this.rParamsBuf.destroy();
      this.ctx.unconfigure();
    } catch {
      /* noop */
    }
  }
}

export async function createGpuFresco(
  canvas: HTMLCanvasElement,
): Promise<Fresco | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;
  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const format = nav.gpu.getPreferredCanvasFormat();
  const fresco = new GpuFresco(device, canvas, format);
  fresco.reset();
  return fresco;
}
