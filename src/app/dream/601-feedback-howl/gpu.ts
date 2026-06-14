// gpu.ts — violent reactive spectrum renderer.
//
// Primary path: WebGPU. A full-screen quad samples a 1D spectrum texture
// (uploaded each frame from the AnalyserNode) and renders a writhing
// frequency lattice that smears with loudness and brightens to white at
// resonant peaks. Plus a feedback-trail term so it tears rather than blinks.
//
// Fallback path: a REAL Canvas2D renderer that draws an equivalent violent
// reactive spectrum — never blank, never an error.
//
// All GPU objects are typed `any` (no @webgpu/types dependency). Every GPU
// call is inside try/catch in the caller.

export type Renderer = {
  draw: (freq: Uint8Array, time: Uint8Array, peak: number) => void;
  dispose: () => void;
  mode: "webgpu" | "canvas2d";
};

const SPECTRUM_W = 512; // texture width = number of FFT bins we sample

const WGSL = `
@group(0) @binding(0) var spec: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct U { time: f32, peak: f32, _a: f32, _b: f32 }
@group(0) @binding(2) var<uniform> u: U;

struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), vec2f(xy.x*.5+.5, .5-xy.y*.5));
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  // horizontal axis = frequency, smeared by a time-varying shear
  let shear = sin(uv.y * 9.0 + u.time * 1.7) * 0.02 * (0.4 + u.peak);
  let fx = clamp(uv.x + shear, 0.0, 1.0);
  // bin amplitude
  let amp = textureSample(spec, smp, vec2f(fx, 0.5)).r;

  // distance from the lattice line for this bin = a writhing horizontal field
  let line = abs(uv.y - 0.5);
  let band = amp * (0.55 + 0.45 * sin(u.time * 3.0 + uv.x * 40.0));
  // glowing ridge: bright where amplitude high near center
  let ridge = smoothstep(band, 0.0, line) * amp;

  // vertical scan tearing with loudness
  let tear = step(0.5, hash(vec2f(floor(uv.x * 200.0), floor(u.time * 30.0))))
             * u.peak * 0.25;

  // base abrasive color: cold magenta/cyan that whites out at peaks
  let hot = pow(ridge, 0.7);
  var col = vec3f(0.9, 0.15, 0.45) * hot
          + vec3f(0.1, 0.7, 0.9) * pow(amp, 2.0) * 0.6
          + vec3f(1.0) * pow(hot, 4.0); // white-hot resonant peaks
  col += tear;
  // grain
  col += (hash(uv * 800.0 + u.time) - 0.5) * 0.06;
  return vec4f(col, 1.0);
}`;

export async function makeRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpu = (navigator as any).gpu;
  if (gpu) {
    try {
      return await makeGpuRenderer(canvas, gpu);
    } catch {
      // fall through to canvas2d
    }
  }
  return makeCanvasRenderer(canvas);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeGpuRenderer(canvas: HTMLCanvasElement, gpu: any): Promise<Renderer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter: any = await gpu.requestAdapter();
  if (!adapter) throw new Error("no adapter");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const device: any = await adapter.requestDevice();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx: any = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no webgpu context");
  const format = gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const shaderMod = device.createShaderModule({ code: WGSL });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline: any = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderMod, entryPoint: "vs" },
    fragment: { module: shaderMod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-strip" },
  });

  // 1D spectrum texture (width x 1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tex: any = device.createTexture({
    size: [SPECTRUM_W, 1],
    format: "r8unorm",
    usage:
      // GPUTextureUsage.TEXTURE_BINDING | COPY_DST
      0x4 | 0x2,
  });
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uni: any = device.createBuffer({
    size: 16,
    // UNIFORM | COPY_DST
    usage: 0x40 | 0x8,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bind: any = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: tex.createView() },
      { binding: 1, resource: sampler },
      { binding: 2, resource: { buffer: uni } },
    ],
  });

  const row = new Uint8Array(SPECTRUM_W);
  const uniData = new Float32Array(4);
  const start = performance.now();
  let disposed = false;

  const draw = (freq: Uint8Array, _time: Uint8Array, peak: number) => {
    if (disposed) return;
    // resample freq bins into SPECTRUM_W
    const n = freq.length;
    for (let i = 0; i < SPECTRUM_W; i++) {
      row[i] = freq[Math.min(n - 1, Math.floor((i / SPECTRUM_W) * n))];
    }
    device.queue.writeTexture(
      { texture: tex },
      row,
      { bytesPerRow: SPECTRUM_W, rowsPerImage: 1 },
      [SPECTRUM_W, 1]
    );
    uniData[0] = (performance.now() - start) / 1000;
    uniData[1] = peak;
    device.queue.writeBuffer(uni, 0, uniData);

    const enc = device.createCommandEncoder();
    const view = ctx.getCurrentTexture().createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
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
  };

  return {
    mode: "webgpu",
    draw,
    dispose: () => {
      disposed = true;
      try {
        device.destroy();
      } catch {
        // ignore
      }
    },
  };
}

// REAL Canvas2D fallback: an equivalent violent reactive spectrum.
function makeCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const c2d = canvas.getContext("2d");
  if (!c2d) {
    // last-ditch no-op (should never happen)
    return { mode: "canvas2d", draw: () => {}, dispose: () => {} };
  }
  const ctx = c2d;
  const start = performance.now();
  let disposed = false;

  const draw = (freq: Uint8Array, time: Uint8Array, peak: number) => {
    if (disposed) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = (performance.now() - start) / 1000;

    // feedback-trail smear: don't fully clear — fade so it tears.
    ctx.fillStyle = `rgba(4,2,8,${0.18 + peak * 0.1})`;
    ctx.fillRect(0, 0, w, h);

    const n = freq.length;
    const mid = h * 0.5;

    // writhing frequency lattice mirrored around center
    ctx.globalCompositeOperation = "lighter";
    for (let x = 0; x < w; x += 2) {
      const fi = Math.min(n - 1, Math.floor((x / w) * n));
      const amp = freq[fi] / 255;
      const shear = Math.sin(x * 0.02 + t * 1.7) * 12 * (0.4 + peak);
      const len = amp * h * 0.46;
      const hot = Math.pow(amp, 0.7);
      const white = Math.pow(hot, 4) * 255;
      const r = Math.min(255, 230 * hot + white);
      const g = Math.min(255, 40 * hot + 180 * amp * amp + white);
      const b = Math.min(255, 115 * hot + 230 * amp * amp + white);
      ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.5 + amp * 0.5})`;
      ctx.lineWidth = 1 + amp * 2;
      ctx.beginPath();
      ctx.moveTo(x, mid - len + shear);
      ctx.lineTo(x, mid + len + shear);
      ctx.stroke();
    }

    // tearing scanlines on loud peaks
    if (peak > 0.35) {
      ctx.strokeStyle = `rgba(255,255,255,${(peak - 0.35) * 0.5})`;
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // waveform ghost across the top
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(120,230,255,${0.25 + peak * 0.4})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const tn = time.length;
    for (let x = 0; x < w; x++) {
      const ti = Math.floor((x / w) * tn);
      const v = (time[ti] - 128) / 128;
      const y = h * 0.12 + v * h * 0.1;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  return {
    mode: "canvas2d",
    draw,
    dispose: () => {
      disposed = true;
    },
  };
}
