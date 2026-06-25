// WebGPU fragment-pipeline metaball renderer for 941-kids-choir-bloom.
//
// Evaluates a luminous metaball iso-field of four colored voice-creatures and
// outputs an additive warm glow that blooms brighter as the voices come into
// consonance. Primary renderer for this build; webgl-fallback.ts mirrors it.

export interface Blob {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized (0 = top)
  r: number; // radius in normalized units
  color: [number, number, number];
  energy: number; // brightness boost when this voice is active/blooming
}

// 4 blobs * (x,y,r,energy + color rgb + pad) — we pack into 8 floats each = 32 floats.
const BLOB_FLOATS = 8;
const NUM_BLOBS = 4;
// uniform layout: time(1) bloom(1) aspect(1) pad(1) + 4*8 floats = 36 floats.
const UNIFORM_FLOATS = 4 + NUM_BLOBS * BLOB_FLOATS;

const WGSL = /* wgsl */ `
struct Uniforms {
  time   : f32,
  bloom  : f32,
  aspect : f32,
  _pad   : f32,
  // per-blob: x, y, r, energy, cr, cg, cb, _pad
  blobs  : array<vec4<f32>, 8>,
};
@group(0) @binding(0) var<uniform> U : Uniforms;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // Full-screen triangle.
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out : VSOut;
  let xy = p[vi];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = vec2<f32>((xy.x + 1.0) * 0.5, 1.0 - (xy.y + 1.0) * 0.5);
  return out;
}

fn blobData(i : i32) -> vec4<f32> { return U.blobs[i * 2]; }       // x,y,r,energy
fn blobColor(i : i32) -> vec4<f32> { return U.blobs[i * 2 + 1]; }  // r,g,b,_

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let uv = in.uv;
  // Cozy dark violet/indigo background with a soft radial vignette.
  var col = vec3<f32>(0.06, 0.04, 0.12) + vec3<f32>(0.04, 0.02, 0.10) * (1.0 - distance(uv, vec2<f32>(0.5, 0.55)));

  var field = 0.0;
  var glow = vec3<f32>(0.0);

  for (var i = 0; i < 4; i = i + 1) {
    let b = blobData(i);
    let c = blobColor(i).rgb;
    var d = uv - vec2<f32>(b.x, b.y);
    d.x = d.x * U.aspect; // correct for aspect so blobs stay round
    let dist2 = dot(d, d);
    let r = b.r;
    // Smooth metaball potential.
    let f = (r * r) / (dist2 + 0.00015);
    field = field + f;
    // Accumulate colored glow weighted by this blob's contribution + energy.
    let w = f * (0.6 + 0.8 * b.w);
    glow = glow + c * w;
  }

  // Iso-surface bloom: where the summed field crosses threshold, voices merge.
  let merge = smoothstep(0.7, 2.2, field);
  let core = smoothstep(2.0, 6.0, field);

  // Normalize glow so color stays true, then scale by field intensity.
  let gn = glow / max(field, 0.001);
  let bloomBoost = 1.0 + U.bloom * 1.6;

  col = col + gn * (merge * 0.9 + core * 1.3) * bloomBoost;
  // Bright merged core gets a soft white bloom when consonant.
  col = col + vec3<f32>(1.0, 0.96, 0.9) * core * U.bloom * 0.7;

  // Gentle filmic-ish tone curve, keep it warm and soft.
  col = col / (col + vec3<f32>(0.9));
  col = pow(col, vec3<f32>(0.85));

  return vec4<f32>(col, 1.0);
}
`;

export class GpuMetaballs {
  private device!: GPUDevice;
  private ctx: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private uniformBuf!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private format!: GPUTextureFormat;
  private uniformData = new Float32Array(UNIFORM_FLOATS);
  private canvas: HTMLCanvasElement;
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, ctx: GPUCanvasContext) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  static async create(canvas: HTMLCanvasElement): Promise<GpuMetaballs | null> {
    if (!navigator.gpu) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const ctx = canvas.getContext("webgpu");
      if (!ctx) return null;

      const inst = new GpuMetaballs(canvas, ctx);
      inst.device = device;
      inst.format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format: inst.format, alphaMode: "opaque" });

      const shaderModule = device.createShaderModule({ code: WGSL });
      inst.pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs" },
        fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format: inst.format }] },
        primitive: { topology: "triangle-list" },
      });

      inst.uniformBuf = device.createBuffer({
        size: UNIFORM_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      inst.bindGroup = device.createBindGroup({
        layout: inst.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: inst.uniformBuf } }],
      });

      // Surface lost-device as a controlled failure for the React layer.
      device.lost.then(() => {
        inst.disposed = true;
      });

      return inst;
    } catch {
      return null;
    }
  }

  resize(w: number, h: number): void {
    this.canvas.width = Math.max(1, Math.floor(w));
    this.canvas.height = Math.max(1, Math.floor(h));
  }

  render(blobs: Blob[], time: number, bloom: number): void {
    if (this.disposed) return;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const u = this.uniformData;
    u[0] = time;
    u[1] = bloom;
    u[2] = aspect;
    u[3] = 0;
    for (let i = 0; i < NUM_BLOBS; i++) {
      const b = blobs[i];
      const base = 4 + i * BLOB_FLOATS;
      u[base + 0] = b.x;
      u[base + 1] = b.y;
      u[base + 2] = b.r;
      u[base + 3] = b.energy;
      u[base + 4] = b.color[0];
      u[base + 5] = b.color[1];
      u[base + 6] = b.color[2];
      u[base + 7] = 0;
    }
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);

    let view: GPUTextureView;
    try {
      view = this.ctx.getCurrentTexture().createView();
    } catch {
      return;
    }
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.06, g: 0.04, b: 0.12, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.uniformBuf.destroy();
    } catch {
      // ignore
    }
    try {
      this.device.destroy();
    } catch {
      // ignore
    }
  }
}
