// gpu.ts — the primary renderer: a WebGPU fragment shader that draws the
// blended log-polar form-constant field over a full-screen triangle.
//
// The log-polar cortex transform and the four form-constant field functions are
// PORTED to WGSL from _shared/visionary/logpolar.ts (the ~40 lines of trig are
// byte-for-byte the same math, so the CPU fallback agrees). The cursor's four
// bilinear weights, the four slow phase drifts, the blended base hue and the
// slow luminance drift arrive as a uniform buffer each frame. Coloring is
// iridescent-spectral (HSV, hue drifts with the cortical warp and the field),
// all as float in the shader. There is NO flicker — only slow phase + luminance
// drift (photosensitive-epilepsy safety).

import type { RenderParams, Stage } from "./field";

const SHADER = /* wgsl */ `
struct U {
  wT: f32, wS: f32, wSp: f32, wH: f32,      // 0..3  cursor weights
  aspect: f32, freq: f32, bright: f32, time: f32,  // 4..7
  phT: f32, phS: f32, phSp: f32, phH: f32,  // 8..11 phase drifts
  hueBase: f32, sat: f32, _p0: f32, _p1: f32, // 12..15
};
@group(0) @binding(0) var<uniform> u: U;

// --- ported from _shared/visionary/logpolar.ts ---
fn screenToCortex(p: vec2f) -> vec2f {
  let r = max(length(p), 1e-4);
  return vec2f(log(r), atan2(p.y, p.x));
}
fn formConstant(c: vec2f, phi: f32, freq: f32, phase: f32) -> f32 {
  return 0.5 + 0.5 * sin(freq * (cos(phi) * c.x + sin(phi) * c.y) + phase);
}
fn honeycomb(c: vec2f, freq: f32, phase: f32) -> f32 {
  let a = freq * c.x + phase;
  let b = freq * (0.5 * c.x + 0.8660254 * c.y) + phase;
  let d = freq * (-0.5 * c.x + 0.8660254 * c.y) + phase;
  return 0.5 + 0.5 * (cos(a) + cos(b) + cos(d)) / 3.0;
}

const PI = 3.14159265;

fn hsv2rgb(h: f32, s: f32, v: f32) -> vec3f {
  let k = vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0);
  let p = abs(fract(vec3f(h) + k) * 6.0 - 3.0);
  return v * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), s);
}

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var tri = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = tri[vi];
  var o: VO;
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = xy;               // clip space [-1,3]; we only use the [-1,1] window
  return o;
}

@fragment
fn fmain(v: VO) -> @location(0) vec4f {
  var p = v.uv;
  p.x = p.x * u.aspect;    // aspect-correct so the field reads round

  let c = screenToCortex(p);
  let ft  = formConstant(c, 0.0,       u.freq, u.phT);
  let fs  = formConstant(c, PI * 0.5,  u.freq, u.phS);
  let fsp = formConstant(c, PI * 0.25, u.freq, u.phSp);
  let fh  = honeycomb(c, u.freq, u.phH);
  let field = u.wT * ft + u.wS * fs + u.wSp * fsp + u.wH * fh;

  // iridescent-spectral: hue drifts with the cortical warp + the field itself
  let hue = fract(u.hueBase + field * 0.22 + 0.04 * sin(c.x * 1.5)
                  + 0.05 * sin(c.y * 2.0 + u.time * 0.25) + u.time * 0.012);
  let val = pow(clamp(field, 0.0, 1.0), 1.35) * u.bright;
  var col = hsv2rgb(hue, u.sat, clamp(val, 0.0, 1.0));

  // calm the aliasing singularity at the very center (r -> 0)
  let cen = smoothstep(0.0, 0.06, length(p));
  col = col * mix(0.55, 1.0, cen);
  // gentle vignette so the tunnel mouth glows
  col = col * mix(1.0, 0.72, clamp(length(p) / 1.8, 0.0, 1.0));

  return vec4f(col, 1.0);
}`;

export async function createGpuStage(canvas: HTMLCanvasElement): Promise<Stage> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("no-adapter");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const maybeCtx = canvas.getContext("webgpu");
  if (!maybeCtx) throw new Error("no-context");
  const cctx: GPUCanvasContext = maybeCtx;
  cctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const shaderModule = device.createShaderModule({ code: SHADER });
  const pipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vmain" },
    fragment: { module: shaderModule, entryPoint: "fmain", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  const uni = device.createBuffer({
    size: 64, // 16 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const arr = new Float32Array(16);

  const bind = device.createBindGroup({
    layout: pipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uni } }],
  });

  let destroyed = false;

  function render(rp: RenderParams): void {
    if (destroyed) return;
    const aspect = canvas.width / Math.max(1, canvas.height);
    arr[0] = rp.w[0];
    arr[1] = rp.w[1];
    arr[2] = rp.w[2];
    arr[3] = rp.w[3];
    arr[4] = aspect;
    arr[5] = rp.freq;
    arr[6] = rp.bright;
    arr[7] = rp.time;
    arr[8] = rp.phases.t;
    arr[9] = rp.phases.s;
    arr[10] = rp.phases.sp;
    arr[11] = rp.phases.h;
    arr[12] = rp.hueBase;
    arr[13] = rp.sat;
    arr[14] = 0;
    arr[15] = 0;
    device.queue.writeBuffer(uni, 0, arr);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: cctx.getCurrentTexture().createView(),
          clearValue: { r: 0.01, g: 0.01, b: 0.02, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  function resize(w: number, h: number): void {
    canvas.width = w;
    canvas.height = h;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    try {
      uni.destroy();
    } catch {
      /* device may already be gone */
    }
    device.destroy();
  }

  return { backend: "GPU", render, resize, destroy };
}
