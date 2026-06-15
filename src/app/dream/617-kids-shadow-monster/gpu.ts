/// <reference types="@webgpu/types" />
// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — the WebGPU stage spectacle (hand-written WGSL).
//
// The body silhouette MASK is uploaded as a single-channel R8 texture. The
// fragment shader turns it into a GIANT GLOWING MONSTER on a theatre stage:
//   • a wobbling, breathing outline glow (the creature body),
//   • a soft inner fill that pulses with the roar,
//   • whoosh streaks that smear with motion,
//   • two procedural GOOGLY EYES placed near the top of the mask bbox,
//   • warm stage spotlight + curtain vignette.
// FRIENDLY palette — purples / teals / warm gold, silly not scary.
//
// A pure-Canvas2D fallback (same silhouette + googly eyes + glow) lives in
// render2d.ts and is auto-selected when WebGPU is absent or init fails.
// ─────────────────────────────────────────────────────────────────────────────

import { MASK_W, MASK_H } from "./mask";

export interface MonsterFrame {
  timeSec: number;
  grid: Float32Array; // MASK_W*MASK_H occupancy 0..1 (the silhouette)
  // monster signals (0..1)
  coverage: number;
  cx: number;
  cy: number;
  motion: number;
  roar: number;
  wobble: number;
  level: number; // audio output level for extra bloom
  // googly eyes (screen-ish, derived from bbox; 0..1 in canvas space)
  eyeL: [number, number];
  eyeR: [number, number];
  eyeR2: number; // eye radius 0..1
  pupil: [number, number]; // shared pupil offset -1..1
  hue: number; // 0..1 slow friendly colour drift
}

export interface GpuRenderer {
  render: (f: MonsterFrame) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

const SHADER = /* wgsl */ `
struct Uniforms {
  res: vec2f,
  time: f32,
  coverage: f32,
  motion: f32,
  roar: f32,
  wobble: f32,
  level: f32,
  eyeL: vec2f,
  eyeR: vec2f,
  eyeRad: f32,
  pupil: vec2f,
  hue: f32,
  cx: f32,
  cy: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var maskTex: texture_2d<f32>;
@group(0) @binding(2) var maskSamp: sampler;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  // uv 0..1, y flipped so (0,0) = top-left like the mask grid
  o.uv = vec2f(p[vi].x * 0.5 + 0.5, 1.0 - (p[vi].y * 0.5 + 0.5));
  return o;
}

const PI = 3.14159265;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// sample the mask with a little wobbly domain warp (squash-stretch life)
fn maskAt(uv: vec2f) -> f32 {
  return textureSampleLevel(maskTex, maskSamp, uv, 0.0).r;
}

fn palette(t: f32) -> vec3f {
  // friendly purple → teal → warm gold cycle
  let a = vec3f(0.55, 0.45, 0.75);
  let b = vec3f(0.45, 0.40, 0.55);
  let c = vec3f(1.0, 1.0, 1.0);
  let d = vec3f(0.10, 0.45, 0.78);
  return a + b * cos(2.0 * PI * (c * t + d));
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let uv = in.uv;
  let aspect = u.res.x / max(u.res.y, 1.0);

  // ── stage backdrop: deep theatre purple with a warm spotlight pool ──────────
  var col = vec3f(0.04, 0.03, 0.07);
  // spotlight centred a bit above middle
  let spotC = vec2f(0.5, 0.46);
  var sp = uv - spotC;
  sp.x *= aspect;
  let spot = exp(-dot(sp, sp) * 3.0);
  col += vec3f(0.16, 0.12, 0.05) * spot * (0.6 + u.level * 0.6);
  // curtain vignette
  let vig = smoothstep(1.15, 0.35, length((uv - vec2f(0.5)) * vec2f(aspect, 1.0)));
  col *= 0.4 + 0.6 * vig;
  // soft floorboards glow at the bottom (stage floor)
  col += vec3f(0.06, 0.03, 0.02) * smoothstep(0.78, 1.0, uv.y);

  // ── the monster body from the mask ──────────────────────────────────────────
  // wobble warp: the outline breathes & jiggles (Tex-Avery squash-stretch)
  let w = u.wobble;
  let warp = vec2f(
    sin(uv.y * 9.0 + u.time * 3.5) * 0.010 * (0.4 + w),
    cos(uv.x * 8.0 + u.time * 3.0) * 0.010 * (0.4 + w)
  );
  let m = maskAt(uv + warp);

  // edge / outline: glowing rim around the silhouette
  let e = 0.012 + 0.018 * (0.5 + 0.5 * sin(u.time * 4.0));
  let mIn = maskAt(uv + warp + vec2f(e, 0.0));
  let mIn2 = maskAt(uv + warp - vec2f(e, 0.0));
  let mIn3 = maskAt(uv + warp + vec2f(0.0, e));
  let mIn4 = maskAt(uv + warp - vec2f(0.0, e));
  let neighbour = max(max(mIn, mIn2), max(mIn3, mIn4));
  let edge = clamp(neighbour - m, 0.0, 1.0); // 1 near the outline

  let bodyHue = u.hue;
  let glowCol = palette(bodyHue);
  let warmCol = palette(bodyHue + 0.12);

  // glowing outline (rim) — brighter with roar & motion
  let rim = edge * (1.4 + u.roar * 1.6 + u.motion * 0.8);
  col += glowCol * rim;

  // inner shadow body — a dark friendly silhouette with a soft inner glow
  if (m > 0.5) {
    // dark puppet body
    col = mix(col, vec3f(0.03, 0.02, 0.05), 0.86);
    // inner glow pulsing with roar
    let innerGlow = (0.18 + u.roar * 0.5) * (0.6 + 0.4 * sin(u.time * 2.0));
    col += warmCol * innerGlow * 0.5;
    // whoosh streaks: animated bands smearing across the body with motion
    let streak = sin((uv.x * aspect - uv.y) * 26.0 - u.time * 6.0);
    col += glowCol * smoothstep(0.6, 1.0, streak) * u.motion * 0.4;
  }

  // soft outer halo (big friendly aura) sampled from a blurred-ish mask
  var halo = 0.0;
  let hs = 0.05;
  halo += maskAt(uv + vec2f(hs, 0.0));
  halo += maskAt(uv - vec2f(hs, 0.0));
  halo += maskAt(uv + vec2f(0.0, hs));
  halo += maskAt(uv - vec2f(0.0, hs));
  halo += maskAt(uv + vec2f(hs, hs));
  halo += maskAt(uv - vec2f(hs, hs));
  halo *= (1.0 / 6.0);
  let haloOnly = clamp(halo - m, 0.0, 1.0);
  col += glowCol * haloOnly * (0.4 + u.roar * 0.6);

  // ── procedural GOOGLY EYES ──────────────────────────────────────────────────
  // positions arrive in uv space (0..1, y down). Correct for aspect when measuring.
  let er = u.eyeRad;
  for (var i = 0; i < 2; i = i + 1) {
    var ec = u.eyeL;
    if (i == 1) { ec = u.eyeR; }
    var d = uv - ec;
    d.x *= aspect;
    let dist = length(d);
    // white of the eye (with a gentle wobble in size — googly!)
    let wob = 1.0 + 0.06 * sin(u.time * 7.0 + f32(i) * 2.0);
    let r = er * wob;
    if (dist < r) {
      let white = smoothstep(r, r * 0.6, dist);
      col = mix(col, vec3f(0.98, 0.97, 0.95), clamp(white + 0.3, 0.0, 1.0));
      // pupil rolls around (googly)
      let pc = ec + vec2f(u.pupil.x, u.pupil.y) * r * 0.42;
      var pd = uv - pc;
      pd.x *= aspect;
      let pr = r * 0.42;
      if (length(pd) < pr) {
        col = vec3f(0.02, 0.02, 0.04);
        // little catch-light
        let gl = uv - (pc - vec2f(0.0, pr * 0.4));
        if (length(vec2f(gl.x * aspect, gl.y)) < pr * 0.28) {
          col = vec3f(0.9, 0.9, 1.0);
        }
      }
      // friendly outline around the eye
      let ring = smoothstep(r * 1.06, r, dist) * smoothstep(r * 0.92, r, dist);
      col += glowCol * ring * 1.2;
    }
  }

  // film grain + overall audio bloom
  col += (hash(uv * u.res + u.time) - 0.5) * 0.02;
  col *= 1.0 + u.level * 0.35;
  return vec4f(col, 1.0);
}
`;

export async function initGpu(
  canvas: HTMLCanvasElement,
): Promise<GpuRenderer | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;
  let device: GPUDevice;
  let context: GPUCanvasContext;
  let format: GPUTextureFormat;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const ctx = canvas.getContext("webgpu");
    if (!ctx) return null;
    context = ctx;
    format = nav.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
  } catch {
    return null;
  }

  const shaderModule = device.createShaderModule({ code: SHADER });

  // uniforms: pack into a 96-byte buffer (24 f32 with vec2 alignment headroom)
  const uniformBuf = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const maskTex = device.createTexture({
    size: { width: MASK_W, height: MASK_H },
    format: "r8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  let pipeline: GPURenderPipeline;
  try {
    pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shaderModule, entryPoint: "vs" },
      fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
  } catch {
    return null;
  }

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: maskTex.createView() },
      { binding: 2, resource: sampler },
    ],
  });

  // r8unorm requires bytesPerRow to be a multiple of 256
  const bytesPerRow = Math.ceil(MASK_W / 256) * 256;
  const maskBytes = new Uint8Array(bytesPerRow * MASK_H);
  const uni = new Float32Array(24);
  let disposed = false;

  function render(f: MonsterFrame) {
    if (disposed) return;

    // upload mask → R8 texture
    for (let y = 0; y < MASK_H; y++) {
      const row = y * bytesPerRow;
      const grow = y * MASK_W;
      for (let x = 0; x < MASK_W; x++) {
        maskBytes[row + x] = f.grid[grow + x] > 0.5 ? 255 : 0;
      }
    }
    device.queue.writeTexture(
      { texture: maskTex },
      maskBytes,
      { bytesPerRow, rowsPerImage: MASK_H },
      { width: MASK_W, height: MASK_H },
    );

    // pack uniforms (mind vec2 16-byte alignment in WGSL std140-ish layout)
    uni.fill(0);
    uni[0] = canvas.width; // res.x
    uni[1] = canvas.height; // res.y
    uni[2] = f.timeSec; // time
    uni[3] = f.coverage; // coverage
    uni[4] = f.motion; // motion
    uni[5] = f.roar; // roar
    uni[6] = f.wobble; // wobble
    uni[7] = f.level; // level
    // eyeL vec2 must start at 16-byte boundary → index 8
    uni[8] = f.eyeL[0];
    uni[9] = f.eyeL[1];
    uni[10] = f.eyeR[0];
    uni[11] = f.eyeR[1];
    uni[12] = f.eyeR2; // eyeRad
    // pupil vec2 at 16-byte boundary → index 14
    uni[14] = f.pupil[0];
    uni[15] = f.pupil[1];
    uni[16] = f.hue;
    uni[17] = f.cx;
    uni[18] = f.cy;
    device.queue.writeBuffer(uniformBuf, 0, uni);

    const encoder = device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
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
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function resize(w: number, h: number) {
    canvas.width = w;
    canvas.height = h;
  }

  function dispose() {
    disposed = true;
    try {
      uniformBuf.destroy();
      maskTex.destroy();
      device.destroy();
    } catch {
      /* noop */
    }
  }

  return { render, resize, dispose };
}
