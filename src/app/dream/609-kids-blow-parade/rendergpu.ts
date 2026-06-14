// ─────────────────────────────────────────────────────────────────────────────
// rendergpu.ts — WebGPU renderer: instanced googly-balloon quads via WGSL.
//
// One quad per balloon, instanced. Per-instance data (center, radius, hue,
// squash, spin, look-direction, blink, mouth-open) is uploaded each frame to a
// storage buffer. The fragment shader draws the whole balloon-creature
// procedurally inside the quad: body radial gradient + gloss + knot + two
// googly eyes + cheeks + mouth (smile or inflating "O").
//
// Primary path (Safari 26+ supports WebGPU on iPad/iOS). Falls back to
// Canvas2D (render2d.ts) when navigator.gpu is missing or init fails.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParadeState } from "./scene";

const MAX_BALLOONS = 32;
const FLOATS_PER = 12; // cx,cy,radius,hue, squash,spin,lookx,looky, blink,mouth,active,pad

export interface GpuRenderer {
  resize: (w: number, h: number, dpr: number) => void;
  draw: (st: ParadeState, w: number, h: number, activeStrength: number) => void;
  dispose: () => void;
}

const WGSL = /* wgsl */ `
struct Inst {
  center : vec2<f32>,   // pixels
  radius : f32,         // pixels
  hue    : f32,         // degrees
  squash : f32,
  spin   : f32,
  look   : vec2<f32>,
  blink  : f32,
  mouth  : f32,         // 0 smile .. 1 wide O
  active : f32,
  _pad   : f32,
};

struct Uniforms { res : vec2<f32>, _p : vec2<f32> };

@group(0) @binding(0) var<uniform> U : Uniforms;
@group(0) @binding(1) var<storage, read> insts : array<Inst>;

struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) local : vec2<f32>,  // -1.3..1.3 quad local coords
  @location(1) @interpolate(flat) id : u32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VOut {
  // Two-triangle quad, padded a bit beyond the balloon for knot + glow.
  var corners = array<vec2<f32>, 6>(
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
  );
  let inst = insts[ii];
  let pad = 1.6;
  var c = corners[vi] * pad;
  let r = inst.radius;

  // Apply squash (x wide / y tall) then spin, in local space.
  var p = vec2(c.x * inst.squash, c.y / inst.squash);
  let s = sin(inst.spin); let co = cos(inst.spin);
  p = vec2(p.x * co - p.y * s, p.x * s + p.y * co);

  let world = inst.center + p * r;
  // Pixels → clip space (y down in pixels → flip).
  let clip = vec2(world.x / U.res.x * 2.0 - 1.0, 1.0 - world.y / U.res.y * 2.0);

  var out : VOut;
  out.pos = vec4(clip, 0.0, 1.0);
  out.local = c;          // unsquashed/unspun local for shading
  out.id = ii;
  return out;
}

fn hsl2rgb(h : f32, s : f32, l : f32) -> vec3<f32> {
  let hh = h / 360.0;
  let c = (1.0 - abs(2.0*l - 1.0)) * s;
  let x = c * (1.0 - abs((hh*6.0) % 2.0 - 1.0));
  let m = l - c*0.5;
  var rgb = vec3(0.0);
  if (hh < 1.0/6.0)      { rgb = vec3(c,x,0.0); }
  else if (hh < 2.0/6.0) { rgb = vec3(x,c,0.0); }
  else if (hh < 3.0/6.0) { rgb = vec3(0.0,c,x); }
  else if (hh < 4.0/6.0) { rgb = vec3(0.0,x,c); }
  else if (hh < 5.0/6.0) { rgb = vec3(x,0.0,c); }
  else                   { rgb = vec3(c,0.0,x); }
  return rgb + m;
}

fn sdCircle(p : vec2<f32>, c : vec2<f32>, r : f32) -> f32 {
  return length(p - c) - r;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let inst = insts[in.id];
  // p in local quad space, undo squash so we shade a round balloon.
  var p = in.local;
  p = vec2(p.x / inst.squash, p.y * inst.squash);
  // Undo spin so eyes/mouth stay upright relative to the creature.
  let s = sin(-inst.spin); let co = cos(-inst.spin);
  p = vec2(p.x * co - p.y * s, p.x * s + p.y * co);

  var col = vec3(0.0);
  var alpha = 0.0;

  let base = hsl2rgb(inst.hue, 0.9, 0.55);
  let lite = hsl2rgb(inst.hue, 0.95, 0.74);
  let dark = hsl2rgb(inst.hue, 0.8, 0.38);

  // Body: slightly teardrop (taller).
  let bodyP = vec2(p.x, p.y / 1.06);
  let dBody = length(bodyP) - 1.0;

  // Glow halo.
  let glow = smoothstep(1.5, 0.95, length(p));
  col += hsl2rgb(inst.hue, 0.9, 0.6) * glow * 0.22;
  alpha += glow * 0.22;

  if (dBody < 0.0) {
    // Radial gradient lit from upper-left.
    let lp = length(p - vec2(-0.3, -0.35));
    var bcol = mix(lite, base, smoothstep(0.0, 0.9, lp));
    bcol = mix(bcol, dark, smoothstep(0.7, 1.3, length(p)));
    col = bcol;
    alpha = 1.0;

    // Gloss highlight.
    let gloss = smoothstep(0.28, 0.0, length((p - vec2(-0.33,-0.38)) * vec2(1.0,1.6)));
    col = mix(col, vec3(1.0), gloss * 0.55);

    // Cheeks.
    let chL = smoothstep(0.18, 0.0, length(p - vec2(-0.5, 0.18)));
    let chR = smoothstep(0.18, 0.0, length(p - vec2( 0.5, 0.18)));
    col = mix(col, vec3(1.0, 0.45, 0.6), (chL+chR) * 0.3);

    // ── Eyes ──
    let eyeR = 0.26;
    let eyeY = -0.05;
    let eyeDX = 0.32;
    let openY = max(0.08, 1.0 - inst.blink); // squash on blink
    // Left
    let elp = (p - vec2(-eyeDX, eyeY)) / vec2(1.0, openY);
    let erp = (p - vec2( eyeDX, eyeY)) / vec2(1.0, openY);
    let inEyeL = step(length(elp), eyeR);
    let inEyeR = step(length(erp), eyeR);
    let inEye = max(inEyeL, inEyeR);
    col = mix(col, vec3(1.0), inEye);
    // Pupils (follow look).
    let look = inst.look * eyeR * 0.35;
    let pupR = eyeR * 0.48;
    let plp = elp - vec2(look.x, look.y + eyeR*0.1);
    let prp = erp - vec2(look.x, look.y + eyeR*0.1);
    let inPup = max(step(length(plp), pupR) * inEyeL, step(length(prp), pupR) * inEyeR);
    col = mix(col, vec3(0.08,0.06,0.12), inPup);
    // Catchlight.
    let clp = plp - vec2(-pupR*0.3, -pupR*0.2);
    let crp = prp - vec2(-pupR*0.3, -pupR*0.2);
    let inCl = max(step(length(clp), pupR*0.3)*inEyeL, step(length(crp), pupR*0.3)*inEyeR);
    col = mix(col, vec3(1.0), inCl);

    // ── Mouth ── O when inflating, smile otherwise.
    let mr = 0.12 + inst.mouth * 0.16;
    let mp = (p - vec2(0.0, 0.42)) / vec2(0.8, 1.0);
    let inO = step(length(mp), mr);
    // Smile: thin arc band when mouth small.
    let smileD = abs(length(p - vec2(0.0, 0.0)) - 0.32);
    let smileBand = step(smileD, 0.05) * step(p.y, 0.55) * step(0.18, p.y);
    let mouthMask = mix(smileBand, inO, smoothstep(0.04, 0.18, mr));
    col = mix(col, vec3(0.12,0.05,0.16), mouthMask);
  }

  if (alpha < 0.01) { discard; }
  return vec4(col * alpha, alpha);
}
`;

export async function initGpuRenderer(
  canvas: HTMLCanvasElement
): Promise<GpuRenderer | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let device: GPUDevice;
  let ctx: GPUCanvasContext;
  let format: GPUTextureFormat;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const c = canvas.getContext("webgpu");
    if (!c) return null;
    ctx = c;
    format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });
  } catch {
    return null;
  }

  const shaderModule = device.createShaderModule({ code: WGSL });

  const uniformBuf = device.createBuffer({
    size: 16, // vec2 res + vec2 pad
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const instBuf = device.createBuffer({
    size: MAX_BALLOONS * FLOATS_PER * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const instData = new Float32Array(MAX_BALLOONS * FLOATS_PER);

  const bindLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
    ],
  });
  const bindGroup = device.createBindGroup({
    layout: bindLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: instBuf } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindLayout] }),
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: {
      module: shaderModule,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  let pxW = canvas.width;
  let pxH = canvas.height;

  function resize(w: number, h: number, dpr: number) {
    pxW = Math.max(1, Math.floor(w * dpr));
    pxH = Math.max(1, Math.floor(h * dpr));
    canvas.width = pxW;
    canvas.height = pxH;
    device.queue.writeBuffer(
      uniformBuf,
      0,
      new Float32Array([pxW, pxH, 0, 0])
    );
  }

  function draw(
    st: ParadeState,
    _w: number,
    _h: number,
    activeStrength: number
  ) {
    const minDim = Math.min(pxW, pxH);
    let n = 0;
    // Order: flying behind, idle, active on top (paint order via instance order).
    const order = [...st.balloons].sort(
      (a, b) => rank(a.phase) - rank(b.phase)
    );
    for (const b of order) {
      if (n >= MAX_BALLOONS) break;
      const isActive = b.id === st.activeId;
      const o = n * FLOATS_PER;
      instData[o + 0] = b.x * pxW;
      instData[o + 1] = b.y * pxH;
      instData[o + 2] = b.radius * minDim;
      instData[o + 3] = b.hue;
      instData[o + 4] = b.squash * (isActive ? 1 + activeStrength * 0.04 : 1);
      instData[o + 5] = b.spin;
      instData[o + 6] = clamp(b.vx * 6, -1, 1);
      instData[o + 7] = clamp(b.vy * 6, -1, 1);
      instData[o + 8] = b.eyeBlink;
      // mouth open: inflating active balloon opens with strength.
      instData[o + 9] =
        b.phase === "inflating"
          ? 0.4 + (isActive ? activeStrength : 0) * 0.6
          : b.phase === "flying"
            ? 0.6
            : 0;
      instData[o + 10] = isActive ? 1 : 0;
      instData[o + 11] = 0;
      n++;
    }
    device.queue.writeBuffer(instBuf, 0, instData, 0, n * FLOATS_PER);

    const encoder = device.createCommandEncoder();
    const view = ctx.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.047, g: 0.063, b: 0.141, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    if (n > 0) pass.draw(6, n);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function dispose() {
    instBuf.destroy();
    uniformBuf.destroy();
    device.destroy();
  }

  return { resize, draw, dispose };
}

function rank(phase: string): number {
  if (phase === "flying") return 0;
  if (phase === "idle") return 1;
  return 2;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
