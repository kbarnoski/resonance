// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — the Ganzfeld "structure field" substrate (WebGPU compute).
//
//   A persistent 2D scalar field lives in GPU storage buffers ACROSS frames —
//   the whole reason this is a compute piece and not a fragment shader. Each
//   frame the CPU hands down one number that matters: `complexity` (0..1), the
//   height of the stillness-driven ascent. Two compute passes run per frame:
//
//     1. INJECT — seed spatial neural noise: sparse twinkling phosphene specks
//                 plus a faint fine grain. This is the raw material at every
//                 stage; what CHANGES with complexity is how it organizes.
//     2. STEP   — an anisotropic reaction-diffusion move whose kernel climbs a
//                 content hierarchy with `complexity`:
//                   • low  → isotropic center-surround → floaters / DOTS
//                   • mid  → activator support bends along a fixed swirling
//                            orientation field → oriented filaments = COBWEBS /
//                            lattice form-constants
//                   • high → the field is folded with bilateral (mirror-x)
//                            symmetry and pulled by slow symmetric attractor
//                            wells (two eye-like, one mouth-like, inside a broad
//                            face oval) so the accreted grain reads as a
//                            proto-FACE (pareidolia), never a literal photo.
//                 Ping-pong two storage buffers.
//
//   Then a full-viewport RENDER pass samples the field onto a dim, near-uniform
//   violet-grey Ganzfeld with faint emergent structure. Brightness is hard-
//   clamped ≤ 0.7 — this is a calm cosmic-ambient field, not a strobe.
//
//   Determinism: all noise is a hash of integer (x, y, frame); the orientation
//   field and attractor layout are fixed constants / a fixed-seed mulberry32.
//   No Math.random / Date / clock anywhere in the field path. If navigator.gpu
//   or the adapter is missing, initGanzfeldGpu returns null and page.tsx shows a
//   clean on-brand notice while the audio bed keeps playing.
// ─────────────────────────────────────────────────────────────────────────────

export const GRID = 256;

/** Fixed-seed PRNG (kept for parity with the lab reference; used only for any
 *  one-time layout so every build/run is identical). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GanzfeldFrameState {
  /** Stillness-driven ascent height 0..1 → drives the whole hierarchy. */
  complexity: number;
  /** Slow, safe luminance-drift multiplier in ~[0.85, 1.0] (≤3 Hz). */
  flick: number;
  /** True under prefers-reduced-motion → softer internal motion. */
  reduced: boolean;
}

export interface GanzfeldBackend {
  frame(state: GanzfeldFrameState): void;
  resize(): void;
  destroy(): void;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

// INJECT — sparse phosphene specks + faint fine grain, added in place to curr.
const WGSL_INJECT = /* wgsl */ `
struct IP { grid:u32, frame:u32, p0:u32, p1:u32, injAmp:f32, grain:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage, read_write> curr: array<f32>;
@group(0) @binding(1) var<uniform> I: IP;

fn hash3(x:u32, y:u32, s:u32) -> f32 {
  var n = x * 374761393u + y * 668265263u + s * 362437u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return f32(n & 0x00ffffffu) / f32(0x00ffffffu);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = I.grid;
  if (gid.x >= g || gid.y >= g) { return; }
  let i = gid.y * g + gid.x;
  let r = hash3(gid.x, gid.y, I.frame);
  // Sparse bright specks (~1.5% of cells twinkle each frame) = phosphenes.
  var spark = 0.0;
  if (r > 0.985) { spark = (r - 0.985) / 0.015; }
  // Faint continuous fine grain so the ground is never perfectly flat.
  let fine = (hash3(gid.x, gid.y, I.frame + 9871u) - 0.5) * I.grain;
  curr[i] = curr[i] + I.injAmp * spark + fine;
}`;

// STEP — anisotropic reaction-diffusion; kernel climbs dots→cobwebs→faces.
const WGSL_STEP = /* wgsl */ `
struct SP {
  grid:u32, frame:u32, p0:u32, p1:u32,
  complexity:f32, decay:f32, react:f32, diff:f32,
  wCob:f32, wFace:f32, attr:f32, symAmt:f32,
};
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: SP;

fn at(x:i32, y:i32, g:i32) -> f32 {
  let cx = clamp(x, 0, g - 1);
  let cy = clamp(y, 0, g - 1);
  return src[cy * g + cx];
}

// A smooth, fixed swirling orientation field. Filaments diffuse ALONG it, so as
// the cobweb weight rises the isotropic grain elongates into oriented veins.
fn orient(x:i32, y:i32, g:i32) -> vec2<f32> {
  let fx = f32(x) / f32(g);
  let fy = f32(y) / f32(g);
  let a = sin(fx * 12.566 + 1.3)
        + cos(fy * 12.566 - 0.7)
        + 0.5 * sin((fx + fy) * 18.849 + 2.1);
  let ang = a * 1.7;
  return vec2<f32>(cos(ang), sin(ang));
}

fn well(fx:f32, fy:f32, cx:f32, cy:f32, rx:f32, ry:f32) -> f32 {
  let dx = (fx - cx) / rx;
  let dy = (fy - cy) / ry;
  return exp(-0.5 * (dx * dx + dy * dy));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(P.grid);
  let xi = i32(gid.x);
  let yi = i32(gid.y);
  if (xi >= g || yi >= g) { return; }

  let s = at(xi, yi, g);

  // Isotropic near ring (activator) and a wider ring (inhibitor) → Turing-style
  // center-surround that concentrates the grain into structure at one scale.
  let near = (at(xi-1,yi,g) + at(xi+1,yi,g) + at(xi,yi-1,g) + at(xi,yi+1,g)) * 0.25;
  let wide = (at(xi-2,yi,g) + at(xi+2,yi,g) + at(xi,yi-2,g) + at(xi,yi+2,g)
            + at(xi-2,yi-2,g) + at(xi+2,yi+2,g) + at(xi-2,yi+2,g) + at(xi+2,yi-2,g)) * 0.125;

  // Directional activator support along the orientation field → filaments.
  let d = orient(xi, yi, g);
  var dp = vec2<i32>(0, 0);
  if (abs(d.x) >= abs(d.y)) {
    dp = vec2<i32>(select(-1, 1, d.x >= 0.0), i32(round(d.y / max(abs(d.x), 1e-3))));
  } else {
    dp = vec2<i32>(i32(round(d.x / max(abs(d.y), 1e-3))), select(-1, 1, d.y >= 0.0));
  }
  let along = 0.5 * (at(xi + dp.x, yi + dp.y, g) + at(xi - dp.x, yi - dp.y, g));

  // As wCob rises, the activator becomes directional → oriented cobweb veins.
  let activator = mix(near, along, P.wCob);
  let react = P.react * (activator - wide);

  // Gentle diffusion base keeps the field bounded and cohesive.
  let base = mix(s, near, P.diff);
  var v = base + react;

  // ── Faces: bilateral fold + symmetric attractor wells (only at high c). ──
  let mv = at(g - 1 - xi, yi, g);
  v = mix(v, mv, P.symAmt);

  let fx = f32(xi) / f32(g);
  let fy = f32(yi) / f32(g);
  let faceOval = well(fx, fy, 0.5, 0.5, 0.28, 0.38);
  let eyeL = well(fx, fy, 0.385, 0.44, 0.055, 0.045);
  let eyeR = well(fx, fy, 0.615, 0.44, 0.055, 0.045);
  let mouth = well(fx, fy, 0.5, 0.66, 0.12, 0.04);
  // Broad oval lifts a head-shaped region above the ground; wells carve dark
  // eyes + mouth into it. The accreted, mirror-symmetric grain does the rest.
  let bias = P.attr * (0.5 * faceOval - 1.35 * (eyeL + eyeR) - 0.9 * mouth);
  v = v + bias;

  v = clamp(v * P.decay, -1.3, 1.3);
  dst[yi * g + xi] = v;
}`;

const WGSL_RENDER = /* wgsl */ `
struct RP {
  grid:u32, frame:u32, p0:u32, p1:u32,
  resW:f32, resH:f32, flick:f32, bright:f32,
  structAmp:f32, complexity:f32, p2:f32, p3:f32,
};
@group(0) @binding(0) var<storage, read> field: array<f32>;
@group(0) @binding(1) var<uniform> R: RP;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.,-1.), vec2<f32>(3.,-1.), vec2<f32>(-1.,3.));
  return vec4<f32>(p[i], 0., 1.);
}

@fragment fn fs(@builtin(position) fc: vec4<f32>) -> @location(0) vec4<f32> {
  // COVER the viewport with the square field so the Ganzfeld bleeds edge-to-edge.
  let uv = vec2<f32>(fc.x / R.resW, fc.y / R.resH);
  var sc = vec2<f32>(1.0, 1.0);
  let asp = R.resW / R.resH;
  if (asp > 1.0) { sc.y = 1.0 / asp; } else { sc.x = asp; }
  let gc = clamp((uv - 0.5) * sc + 0.5, vec2<f32>(0.0), vec2<f32>(1.0));

  let g = i32(R.grid);
  let ix = clamp(i32(gc.x * f32(g - 1)), 0, g - 1);
  let iy = clamp(i32(gc.y * f32(g - 1)), 0, g - 1);
  let v = clamp(field[iy * g + ix], -1.0, 1.0);

  // Dim, near-uniform violet-grey ground — the Ganzfeld.
  let ground = vec3<f32>(0.088, 0.080, 0.122);
  // Structure modulates luminance gently around the ground: brighter violet on
  // ridges, darker in the hollows (eyes/mouth carve as dark).
  let accent = vec3<f32>(0.34, 0.26, 0.54);
  var col = ground + v * accent * R.structAmp;

  // Soft field vignette so it reads as an unbounded glow, not a rectangle.
  let dc = gc - 0.5;
  let vig = 1.0 - 0.5 * clamp(dot(dc, dc) * 2.4, 0.0, 1.0);
  col = col * vig;

  // bright = ≤0.7 luminance ceiling; flick = slow safe drift in ~[0.85,1].
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(R.bright)) * R.flick;
  return vec4<f32>(col, 1.0);
}`;

// ── backend ──────────────────────────────────────────────────────────────────

export async function initGanzfeldGpu(
  canvas: HTMLCanvasElement,
): Promise<GanzfeldBackend | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;

  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!ctx) {
    device.destroy();
    return null;
  }
  const fmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const G = GRID;
  const cells = G * G;
  const mkField = () =>
    device.createBuffer({
      size: cells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  let bA = mkField();
  let bB = mkField();

  const injParams = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const stepParams = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderParams = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const mod = (code: string) => device.createShaderModule({ code });
  const injectPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: mod(WGSL_INJECT), entryPoint: "main" },
  });
  const stepPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: mod(WGSL_STEP), entryPoint: "main" },
  });
  const renderMod = mod(WGSL_RENDER);
  const renderPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: { module: renderMod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  const dpr = Math.min(
    2,
    (typeof window !== "undefined" && window.devicePixelRatio) || 1,
  );
  let outW = 2;
  let outH = 2;
  const resize = () => {
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (w === outW && h === outH && canvas.width === w) return;
    outW = w;
    outH = h;
    canvas.width = w;
    canvas.height = h;
  };
  resize();

  // Reusable CPU-side staging (no per-frame allocation).
  const injBuf = new ArrayBuffer(32);
  const stepBuf = new ArrayBuffer(48);
  const renderBuf = new ArrayBuffer(48);

  let frameNo = 0;
  let disposed = false;

  const frame = (st: GanzfeldFrameState) => {
    if (disposed) return;
    resize();
    frameNo += 1;
    const c = Math.max(0, Math.min(1, st.complexity));

    // Hierarchy weights derived from complexity (smooth stage cross-fades).
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const wCob = smooth(0.28, 0.62, c);
    const wFace = smooth(0.6, 0.95, c);
    const reduced = st.reduced;

    const enc = device.createCommandEncoder();

    // 1. INJECT neural noise into the current buffer (bA).
    {
      const u32 = new Uint32Array(injBuf, 0, 4);
      const f32 = new Float32Array(injBuf, 16, 4);
      u32[0] = G;
      u32[1] = frameNo;
      f32[0] = 0.22; // speck amplitude
      f32[1] = 0.05; // fine-grain amplitude
      device.queue.writeBuffer(injParams, 0, injBuf);

      const bg = device.createBindGroup({
        layout: injectPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bA } },
          { binding: 1, resource: { buffer: injParams } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(injectPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
      pass.end();
    }

    // 2. STEP the reaction-diffusion move bA → bB, then swap.
    {
      const u32 = new Uint32Array(stepBuf, 0, 4);
      const f32 = new Float32Array(stepBuf, 16, 8);
      u32[0] = G;
      u32[1] = frameNo;
      f32[0] = c;
      // Lower complexity forgets faster → structure melts back to grain when you
      // move (the "you disturbed something delicate" reset).
      f32[1] = 0.9 + 0.088 * c; // decay
      f32[2] = 0.34 + 0.12 * c; // react gain (sharper structure higher up)
      f32[3] = 0.14; // diffusion base
      f32[4] = wCob; // cobweb / anisotropy weight
      f32[5] = wFace; // face weight
      f32[6] = (reduced ? 0.7 : 1.0) * 0.05 * wFace; // attractor strength
      f32[7] = 0.5 * wFace; // bilateral fold amount
      device.queue.writeBuffer(stepParams, 0, stepBuf);

      const bg = device.createBindGroup({
        layout: stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bA } },
          { binding: 1, resource: { buffer: bB } },
          { binding: 2, resource: { buffer: stepParams } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(stepPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
      pass.end();

      const t = bA;
      bA = bB;
      bB = t;
    }

    // 3. RENDER the field → dim violet-grey Ganzfeld, brightness-clamped.
    {
      const u32 = new Uint32Array(renderBuf, 0, 4);
      const f32 = new Float32Array(renderBuf, 16, 8);
      u32[0] = G;
      u32[1] = frameNo;
      f32[0] = outW;
      f32[1] = outH;
      f32[2] = st.flick;
      f32[3] = 0.7; // hard luminance ceiling — no white-out
      // Structure barely above uniform at dots; more present (still calm) higher.
      f32[4] = 0.16 + 0.5 * c;
      f32[5] = c;
      device.queue.writeBuffer(renderParams, 0, renderBuf);

      const bg = device.createBindGroup({
        layout: renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bA } },
          { binding: 1, resource: { buffer: renderParams } },
        ],
      });
      const view = ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(renderPipe);
      pass.setBindGroup(0, bg);
      pass.draw(3);
      pass.end();
    }

    device.queue.submit([enc.finish()]);
  };

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    try {
      bA.destroy();
      bB.destroy();
      device.destroy();
    } catch {
      /* ignore */
    }
  };

  return { frame, resize, destroy };
}
