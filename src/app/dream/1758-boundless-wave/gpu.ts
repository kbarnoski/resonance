// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — the GPU wave-equation solver, pointed the wrong way on purpose.
//
//   The mature technique here — a finite-difference 2D wave-equation PDE solved
//   on the GPU — is the exact machinery every WebGPU water/cloth demo uses to
//   sell REALISM: an object, a surface, a scale, an edge you can read. This
//   piece points it at the opposite. No object. No centre you can trust. The
//   square's reflective boundary folds every ripple back on itself until the
//   field settles into a boundless standing-wave interference — the Chladni
//   figure — that you shape only with the loudness of your breath.
//
//   Per frame:
//     1. FORCE   compute — inject a slow, wide, low-amplitude radial Gaussian
//                          drive at a handful of fixed sites, signed by a
//                          drifting phase, scaled by breath. (Not a DC push —
//                          it oscillates, so it builds real standing waves.)
//     2. STEP ×2 compute — advance u_next = 2u − u_prev + c²·∇²u, with light
//                          damping and REFLECTIVE (Neumann) edges via clamped
//                          neighbour indexing. Ping-pong three storage buffers.
//     3. RENDER  — a full-viewport pass samples |u| and maps it to a dim→bright
//                          violet ramp (brightness hard-clamped ≤ 0.7). Near-
//                          zero |u| reads as dark filaments = the nodal lines.
//
//   c² = 0.24 → Courant number well below the 2D stability wall (0.5); it is a
//   hardcoded constant, never derived from a wall clock. If navigator.gpu or the
//   adapter is missing, initWaveGpu returns null and page.tsx shows a clean
//   on-brand notice while the audio bed keeps playing.
// ─────────────────────────────────────────────────────────────────────────────

export const GRID = 512;
const MAX_SRC = 6;

/** Fixed-seed PRNG so the drive-site layout is identical every build/run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WaveFrameState {
  /** Breath loudness 0..1 → drive amplitude of the radial excitation. */
  breath: number;
  /** Drifting drive phase (radians). Advanced deterministically on the CPU. */
  phase: number;
  /** Slow safe luminance-drift multiplier in [~0.8, 1.0]. */
  flick: number;
  /** Softened when prefers-reduced-motion. */
  reduced: boolean;
}

export interface WaveBackend {
  frame(state: WaveFrameState): void;
  resize(): void;
  destroy(): void;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

// Wide, low-amplitude radial Gaussian drive at fixed sites; signed by phase so
// the medium is continuously stirred into standing waves rather than a DC bump.
const WGSL_FORCE = /* wgsl */ `
struct FP {
  grid:u32, count:u32, p0:u32, p1:u32,
  driveAmp:f32, phase:f32, p2:f32, p3:f32,
  src: array<vec4<f32>, ${MAX_SRC}>,
};
@group(0) @binding(0) var<storage, read_write> curr: array<f32>;
@group(0) @binding(1) var<uniform> F: FP;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(F.grid);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x < 1 || y < 1 || x >= g - 1 || y >= g - 1) { return; }
  var add = 0.0;
  for (var k = 0u; k < F.count; k = k + 1u) {
    let s = F.src[k];                        // xy = normalized site, z = sigma(cells), w = phase offset
    let cx = s.x * f32(g - 1);
    let cy = s.y * f32(g - 1);
    let d = vec2<f32>(f32(x) - cx, f32(y) - cy);
    let sig = max(s.z, 1.0);
    add = add + F.driveAmp * sin(F.phase + s.w) * exp(-dot(d, d) / (2.0 * sig * sig));
  }
  if (add != 0.0) { curr[y * g + x] = curr[y * g + x] + add; }
}`;

// d'Alembert 2D wave step with light damping. Reflective (Neumann) edges: the
// neighbour index is CLAMPED to the grid, so the outward normal derivative is
// zero and ripples fold back — this is what makes standing waves / Chladni
// interference form instead of leaking away.
const WGSL_STEP = /* wgsl */ `
struct SP { grid:u32, c2:f32, damping:f32, pad:f32 };
@group(0) @binding(0) var<storage, read> prevB: array<f32>;
@group(0) @binding(1) var<storage, read> currB: array<f32>;
@group(0) @binding(2) var<storage, read_write> nextB: array<f32>;
@group(0) @binding(3) var<uniform> P: SP;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(P.grid);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= g || y >= g) { return; }
  let i = y * g + x;
  let c = currB[i];
  let xm = max(x - 1, 0);
  let xp = min(x + 1, g - 1);
  let ym = max(y - 1, 0);
  let yp = min(y + 1, g - 1);
  let lap = currB[y * g + xm] + currB[y * g + xp]
          + currB[ym * g + x] + currB[yp * g + x] - 4.0 * c;
  nextB[i] = (2.0 * c - prevB[i] + P.c2 * lap) * P.damping;
}`;

const WGSL_RENDER = /* wgsl */ `
struct RP { grid:u32, p0:u32, p1:u32, p2:u32, resW:f32, resH:f32, flick:f32, bright:f32 };
@group(0) @binding(0) var<storage, read> field: array<f32>;
@group(0) @binding(1) var<uniform> R: RP;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.,-1.), vec2<f32>(3.,-1.), vec2<f32>(-1.,3.));
  return vec4<f32>(p[i], 0., 1.);
}
@fragment fn fs(@builtin(position) fc: vec4<f32>) -> @location(0) vec4<f32> {
  // COVER the viewport with the square field so it bleeds edge-to-edge (no frame).
  let uv = vec2<f32>(fc.x / R.resW, fc.y / R.resH);
  var s = vec2<f32>(1.0, 1.0);
  let asp = R.resW / R.resH;
  if (asp > 1.0) { s.y = 1.0 / asp; } else { s.x = asp; }
  let gc = clamp((uv - 0.5) * s + 0.5, vec2<f32>(0.0), vec2<f32>(1.0));

  let g = i32(R.grid);
  let ix = clamp(i32(gc.x * f32(g - 1)), 0, g - 1);
  let iy = clamp(i32(gc.y * f32(g - 1)), 0, g - 1);
  let amp = abs(field[iy * g + ix]);

  // Perceptual lift so faint equilibrium still glows; nodal lines stay dark.
  let e = clamp(pow(amp * 3.2, 0.7), 0.0, 1.0);
  // Boundless violet: cold indigo ground → warm violet antinodes.
  let ground = vec3<f32>(0.030, 0.016, 0.070);
  let mid    = vec3<f32>(0.180, 0.090, 0.430);
  let hot    = vec3<f32>(0.460, 0.280, 0.760);
  var col = mix(ground, mid, clamp(e * 1.6, 0.0, 1.0));
  col = mix(col, hot, clamp(e * e, 0.0, 1.0));
  // A faint continuous breathing floor so the field is never fully black.
  col = col + ground * 0.6;

  // bright is the ≤0.7 luminance ceiling; flick is a slow safe drift in [~0.8,1].
  let outc = col * R.bright * R.flick;
  return vec4<f32>(outc, 1.0);
}`;

// ── backend ──────────────────────────────────────────────────────────────────

export async function initWaveGpu(
  canvas: HTMLCanvasElement,
): Promise<WaveBackend | null> {
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
  let bPrev = mkField();
  let bCurr = mkField();
  let bNext = mkField();

  // Fixed drive-site layout: scattered across the field, deliberately avoiding
  // the exact centre (no centre, no scale) — "boundless space", not a source.
  const srcArr = new Float32Array(MAX_SRC * 4);
  {
    const rnd = mulberry32(0x0b0bcafe);
    for (let k = 0; k < MAX_SRC; k++) {
      // Keep sites off the walls and off dead-centre.
      let sx = 0.18 + 0.64 * rnd();
      let sy = 0.18 + 0.64 * rnd();
      if (Math.abs(sx - 0.5) < 0.08) sx += 0.12;
      if (Math.abs(sy - 0.5) < 0.08) sy += 0.12;
      srcArr[k * 4] = sx;
      srcArr[k * 4 + 1] = sy;
      srcArr[k * 4 + 2] = 0.05 * G + 0.03 * G * rnd(); // wide sigma (cells)
      srcArr[k * 4 + 3] = rnd() * Math.PI * 2; // per-site phase offset
    }
  }

  const stepParams = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const forceParams = device.createBuffer({
    size: 32 + MAX_SRC * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderParams = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const mod = (code: string) => device.createShaderModule({ code });
  const forcePipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: mod(WGSL_FORCE), entryPoint: "main" },
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

  // Reusable CPU-side staging buffers (no per-frame allocation).
  const stepBuf = new ArrayBuffer(16);
  const forceBuf = new ArrayBuffer(32 + MAX_SRC * 16);
  const renderBuf = new ArrayBuffer(32);

  // Static parts written once.
  {
    const u32 = new Uint32Array(stepBuf, 0, 1);
    const f32 = new Float32Array(stepBuf, 4, 3);
    u32[0] = G;
    f32[0] = 0.24; // c² — Courant well under the 0.5 stability wall
    f32[1] = 0.9985; // light damping → slow decay to a calm equilibrium
    device.queue.writeBuffer(stepParams, 0, stepBuf);

    new Float32Array(forceBuf, 32).set(srcArr);
  }

  let disposed = false;

  const frame = (st: WaveFrameState) => {
    if (disposed) return;
    resize();
    const enc = device.createCommandEncoder();

    // 1. Inject the breath-driven radial excitation into curr.
    {
      const u32 = new Uint32Array(forceBuf, 0, 4);
      const f32 = new Float32Array(forceBuf, 16, 4);
      u32[0] = G;
      u32[1] = MAX_SRC;
      // Low amplitude; a tiny floor keeps a faint living ground even in silence.
      f32[0] = 0.004 + st.breath * (st.reduced ? 0.014 : 0.022);
      f32[1] = st.phase;
      device.queue.writeBuffer(forceParams, 0, forceBuf);

      const bg = device.createBindGroup({
        layout: forcePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bCurr } },
          { binding: 1, resource: { buffer: forceParams } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(forcePipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
      pass.end();
    }

    // 2. Advance the PDE (two sub-steps for crisp propagation), ping-ponging.
    for (let s = 0; s < 2; s++) {
      const bg = device.createBindGroup({
        layout: stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bPrev } },
          { binding: 1, resource: { buffer: bCurr } },
          { binding: 2, resource: { buffer: bNext } },
          { binding: 3, resource: { buffer: stepParams } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(stepPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
      pass.end();
      const t = bPrev;
      bPrev = bCurr;
      bCurr = bNext;
      bNext = t;
    }

    // 3. Render |u| → violet, boundless, brightness-clamped.
    {
      const u32 = new Uint32Array(renderBuf, 0, 4);
      const f32 = new Float32Array(renderBuf, 16, 4);
      u32[0] = G;
      f32[0] = outW;
      f32[1] = outH;
      f32[2] = st.flick;
      f32[3] = 0.7; // hard luminance ceiling — no white-out
      device.queue.writeBuffer(renderParams, 0, renderBuf);

      const bg = device.createBindGroup({
        layout: renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bCurr } },
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
      bPrev.destroy();
      bCurr.destroy();
      bNext.destroy();
      device.destroy();
    } catch {
      /* ignore */
    }
  };

  return { frame, resize, destroy };
}
