// Tier 1 — WebGPU fragment-pipeline fluid (Stam-style advect / project /
// vorticity, ping-pong render targets). This is the frontier substrate we
// want on screen. Adapted from the proven pattern in dream/15-webgpu-fluid.

import type { Splat, VisualFluid } from "./shared";

const SIM = 256;
const JACOBI = 20;
const SIM_FMT = "rgba16float" as GPUTextureFormat;

const VERT = `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), vec2f(xy.x*.5+.5, .5-xy.y*.5));
}`;

const ADVECT_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(1) @binding(0) var<uniform> u: vec4f;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let v = textureSample(vel, smp, uv).xy;
  let back = clamp(uv - u.x * v, vec2f(0), vec2f(1));
  return u.y * textureSample(src, smp, back);
}`;

const DIV_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vel: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(vel, 0));
  let L = textureSample(vel, smp, uv-vec2f(ts.x,0)).x;
  let R = textureSample(vel, smp, uv+vec2f(ts.x,0)).x;
  let B = textureSample(vel, smp, uv-vec2f(0,ts.y)).y;
  let T = textureSample(vel, smp, uv+vec2f(0,ts.y)).y;
  return vec4f((R-L+T-B)*.5, 0, 0, 1);
}`;

const CURL_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vel: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(vel, 0));
  let L = textureSample(vel, smp, uv-vec2f(ts.x,0)).y;
  let R = textureSample(vel, smp, uv+vec2f(ts.x,0)).y;
  let B = textureSample(vel, smp, uv-vec2f(0,ts.y)).x;
  let T = textureSample(vel, smp, uv+vec2f(0,ts.y)).x;
  return vec4f((R-L)-(T-B), 0, 0, 1);
}`;

// Vorticity confinement: push velocity back toward the curl it is losing.
const VORT_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var curl: texture_2d<f32>;
@group(1) @binding(0) var<uniform> u: vec4f; // x = dt*strength
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(vel, 0));
  let L = abs(textureSample(curl, smp, uv-vec2f(ts.x,0)).x);
  let R = abs(textureSample(curl, smp, uv+vec2f(ts.x,0)).x);
  let B = abs(textureSample(curl, smp, uv-vec2f(0,ts.y)).x);
  let T = abs(textureSample(curl, smp, uv+vec2f(0,ts.y)).x);
  let c = textureSample(curl, smp, uv).x;
  var n = vec2f(R-L, T-B);
  n = n / (length(n) + 1e-5);
  let force = vec2f(n.y, -n.x) * c;
  let v = textureSample(vel, smp, uv).xy + force * u.x;
  return vec4f(v, 0, 1);
}`;

const PRES_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var pres: texture_2d<f32>;
@group(0) @binding(2) var divTex: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(pres, 0));
  let L = textureSample(pres, smp, uv-vec2f(ts.x,0)).x;
  let R = textureSample(pres, smp, uv+vec2f(ts.x,0)).x;
  let B = textureSample(pres, smp, uv-vec2f(0,ts.y)).x;
  let T = textureSample(pres, smp, uv+vec2f(0,ts.y)).x;
  let d = textureSample(divTex, smp, uv).x;
  return vec4f((L+R+B+T-d)*.25, 0, 0, 1);
}`;

const GRAD_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var pres: texture_2d<f32>;
@group(0) @binding(2) var vel: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(pres, 0));
  let L = textureSample(pres, smp, uv-vec2f(ts.x,0)).x;
  let R = textureSample(pres, smp, uv+vec2f(ts.x,0)).x;
  let B = textureSample(pres, smp, uv-vec2f(0,ts.y)).x;
  let T = textureSample(pres, smp, uv+vec2f(0,ts.y)).x;
  let v = textureSample(vel, smp, uv).xy;
  return vec4f(v - .5*vec2f(R-L,T-B), 0, 1);
}`;

const SPLAT_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
struct SU { posRad: vec4f, col: vec4f }
@group(1) @binding(0) var<uniform> su: SU;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var d = uv - su.posRad.xy;
  d.x *= su.posRad.w;
  let g = exp(-dot(d,d) / su.posRad.z);
  return textureSample(src, smp, uv) + vec4f(g * su.col.xyz, 0);
}`;

// Filmic tone-map + gamma, over a deep indigo ground.
const DISPLAY_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var dye: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSample(dye, smp, uv).rgb + vec3f(0.02, 0.015, 0.06);
  c = c / (1.0 + dot(c, vec3f(.299,.587,.114)));
  return vec4f(pow(max(c, vec3f(0)), vec3f(.45)), 1);
}`;

function f32buf(...vals: number[]): ArrayBuffer {
  return new Float32Array(vals).buffer as ArrayBuffer;
}

export async function makeGpuFluid(
  canvas: HTMLCanvasElement,
): Promise<VisualFluid> {
  if (!navigator.gpu) throw new Error("WebGPU not supported");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();
  // Surface async device-loss as a thrown error path during init only.
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("No WebGPU canvas context");
  const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

  const mkTex = (): GPUTexture =>
    device.createTexture({
      size: [SIM, SIM],
      format: SIM_FMT,
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const mkUni = (n: number): GPUBuffer =>
    device.createBuffer({
      size: n,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

  const mkPipeline = (
    fsSrc: string,
    fmt: GPUTextureFormat = SIM_FMT,
  ): GPURenderPipeline =>
    device.createRenderPipeline({
      layout: "auto",
      vertex: { module: device.createShaderModule({ code: VERT }), entryPoint: "vs" },
      fragment: {
        module: device.createShaderModule({ code: fsSrc }),
        entryPoint: "fs",
        targets: [{ format: fmt }],
      },
      primitive: { topology: "triangle-strip" },
    });

  const vel: [GPUTexture, GPUTexture] = [mkTex(), mkTex()];
  const pres: [GPUTexture, GPUTexture] = [mkTex(), mkTex()];
  const dye: [GPUTexture, GPUTexture] = [mkTex(), mkTex()];
  const divTex = mkTex();
  const curlTex = mkTex();

  const advectPl = mkPipeline(ADVECT_FS);
  const divPl = mkPipeline(DIV_FS);
  const curlPl = mkPipeline(CURL_FS);
  const vortPl = mkPipeline(VORT_FS);
  const presPl = mkPipeline(PRES_FS);
  const gradPl = mkPipeline(GRAD_FS);
  const splatPl = mkPipeline(SPLAT_FS);
  const displayPl = mkPipeline(DISPLAY_FS, canvasFmt);

  const advVelUni = mkUni(16);
  const advDyeUni = mkUni(16);
  const vortUni = mkUni(16);
  const splatVelUni = mkUni(32);
  const splatDyeUni = mkUni(32);

  let vR: 0 | 1 = 0;
  let pR: 0 | 1 = 0;
  let dR: 0 | 1 = 0;
  let dead = false;

  const bg = (pl: GPURenderPipeline, grp: number, entries: GPUBindGroupEntry[]) =>
    device.createBindGroup({ layout: pl.getBindGroupLayout(grp), entries });

  const pass = (
    enc: GPUCommandEncoder,
    pl: GPURenderPipeline,
    groups: GPUBindGroup[],
    target: GPUTextureView,
  ): void => {
    const p = enc.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    p.setPipeline(pl);
    for (let i = 0; i < groups.length; i++) p.setBindGroup(i, groups[i]);
    p.draw(4);
    p.end();
  };

  const aspect = canvas.width / Math.max(1, canvas.height);

  function doSplat(s: Splat): void {
    if (dead) return;
    // This tier's vertex shader already uses a top-left uv origin (uv.y = 0 at
    // the top), matching the pointer/CPU convention, so no vertical flip.
    const x = s.x;
    const y = s.y;
    const uvx = s.vx;
    const uvy = s.vy;
    device.queue.writeBuffer(
      splatVelUni,
      0,
      f32buf(x, y, s.radius * s.radius * 6, aspect, uvx, uvy, 0, 0),
    );
    device.queue.writeBuffer(
      splatDyeUni,
      0,
      f32buf(x, y, s.radius * s.radius * 4, aspect, s.r, s.g, s.b, 0),
    );
    const enc = device.createCommandEncoder();
    const vW = (1 - vR) as 0 | 1;
    pass(
      enc,
      splatPl,
      [
        bg(splatPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: vel[vR].createView() },
        ]),
        bg(splatPl, 1, [{ binding: 0, resource: { buffer: splatVelUni } }]),
      ],
      vel[vW].createView(),
    );
    vR = vW;
    const dW = (1 - dR) as 0 | 1;
    pass(
      enc,
      splatPl,
      [
        bg(splatPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: dye[dR].createView() },
        ]),
        bg(splatPl, 1, [{ binding: 0, resource: { buffer: splatDyeUni } }]),
      ],
      dye[dW].createView(),
    );
    dR = dW;
    device.queue.submit([enc.finish()]);
  }

  function frame(dt: number): void {
    if (dead) return;
    const clamped = Math.min(dt, 1 / 30);
    device.queue.writeBuffer(advVelUni, 0, f32buf(clamped, 0.994, 0, 0));
    device.queue.writeBuffer(advDyeUni, 0, f32buf(clamped, 0.985, 0, 0));
    device.queue.writeBuffer(vortUni, 0, f32buf(clamped * 22, 0, 0, 0));

    const enc = device.createCommandEncoder();

    // advect velocity (self)
    let vW = (1 - vR) as 0 | 1;
    pass(
      enc,
      advectPl,
      [
        bg(advectPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: vel[vR].createView() },
          { binding: 2, resource: vel[vR].createView() },
        ]),
        bg(advectPl, 1, [{ binding: 0, resource: { buffer: advVelUni } }]),
      ],
      vel[vW].createView(),
    );
    vR = vW;

    // curl → vorticity confinement
    pass(
      enc,
      curlPl,
      [
        bg(curlPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: vel[vR].createView() },
        ]),
      ],
      curlTex.createView(),
    );
    vW = (1 - vR) as 0 | 1;
    pass(
      enc,
      vortPl,
      [
        bg(vortPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: vel[vR].createView() },
          { binding: 2, resource: curlTex.createView() },
        ]),
        bg(vortPl, 1, [{ binding: 0, resource: { buffer: vortUni } }]),
      ],
      vel[vW].createView(),
    );
    vR = vW;

    // divergence
    pass(
      enc,
      divPl,
      [
        bg(divPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: vel[vR].createView() },
        ]),
      ],
      divTex.createView(),
    );

    // pressure jacobi
    for (let i = 0; i < JACOBI; i++) {
      const pW = (1 - pR) as 0 | 1;
      pass(
        enc,
        presPl,
        [
          bg(presPl, 0, [
            { binding: 0, resource: sampler },
            { binding: 1, resource: pres[pR].createView() },
            { binding: 2, resource: divTex.createView() },
          ]),
        ],
        pres[pW].createView(),
      );
      pR = pW;
    }

    // subtract gradient
    vW = (1 - vR) as 0 | 1;
    pass(
      enc,
      gradPl,
      [
        bg(gradPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: pres[pR].createView() },
          { binding: 2, resource: vel[vR].createView() },
        ]),
      ],
      vel[vW].createView(),
    );
    vR = vW;

    // advect dye
    const dW = (1 - dR) as 0 | 1;
    pass(
      enc,
      advectPl,
      [
        bg(advectPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: vel[vR].createView() },
          { binding: 2, resource: dye[dR].createView() },
        ]),
        bg(advectPl, 1, [{ binding: 0, resource: { buffer: advDyeUni } }]),
      ],
      dye[dW].createView(),
    );
    dR = dW;

    // display to canvas
    pass(
      enc,
      displayPl,
      [
        bg(displayPl, 0, [
          { binding: 0, resource: sampler },
          { binding: 1, resource: dye[dR].createView() },
        ]),
      ],
      ctx!.getCurrentTexture().createView(),
    );

    device.queue.submit([enc.finish()]);
  }

  return {
    kind: "webgpu",
    splat: doSplat,
    frame,
    destroy(): void {
      if (dead) return;
      dead = true;
      for (const t of [
        vel[0], vel[1], pres[0], pres[1], dye[0], dye[1], divTex, curlTex,
      ]) {
        t.destroy();
      }
      for (const b of [advVelUni, advDyeUni, vortUni, splatVelUni, splatDyeUni]) {
        b.destroy();
      }
      device.destroy();
    },
  };
}
