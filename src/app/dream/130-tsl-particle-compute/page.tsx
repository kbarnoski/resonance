"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── constants ──────────────────────────────────────────────────────────────────

const N = 50_000;
const WG = 64;

// ── WGSL compute shader: Lorenz attractor ──────────────────────────────────────
// Lorenz equations: dx/dt = σ(y-x), dy/dt = x(ρ-z)-y, dz/dt = xy - βz
// σ and ρ are driven by audio (bass → σ, treble → ρ)

const COMPUTE_WGSL = /* wgsl */`
struct P { pos: vec4f }   // xyz = Lorenz position, w = normalised speed (→ colour)

struct CU {
  sigma: f32, rho: f32, beta: f32, dt: f32,
  onset: f32, seed: f32,  p0: f32, p1: f32,
}

@group(0) @binding(0) var<storage, read_write> pts: array<P>;
@group(0) @binding(1) var<uniform> u: CU;

fn h(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= ${N}u) { return; }
  var p = pts[i].pos;
  let x = p.x; let y = p.y; let z = p.z;

  // Lorenz derivatives
  let dx = u.sigma * (y - x);
  let dy = x * (u.rho - z) - y;
  let dz = x * y - u.beta * z;

  // Normalise speed for colour (typical max ≈ 240 units/s at standard params)
  let spd = clamp(length(vec3f(dx, dy, dz)) / 240.0, 0.0, 1.0);

  // Onset turbulence: randomised kick proportional to u.onset
  let fi = f32(i);
  let tb = u.onset * vec3f(
    h(fi * 1.1 + u.seed) - 0.5,
    h(fi * 2.3 + u.seed + 1.7) - 0.5,
    h(fi * 3.7 + u.seed + 3.4) - 0.5
  );

  pts[i].pos = vec4f(
    clamp(x + (dx + tb.x) * u.dt, -60.0,  60.0),
    clamp(y + (dy + tb.y) * u.dt, -70.0,  70.0),
    clamp(z + (dz + tb.z) * u.dt,  -2.0,  80.0),
    spd
  );
}`;

// ── WGSL vertex shader: particle → screen-space quad ──────────────────────────
// Each particle is drawn as a 2-triangle quad (6 vertices).
// vi/6 → particle index; vi%6 → which corner.
// Size is constant in NDC regardless of depth: offset = corner × size × clip.w

const VERT_WGSL = /* wgsl */`
struct P { pos: vec4f }

struct VU { mvp: mat4x4f, size: f32, p0: f32, p1: f32, p2: f32 }

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) spd: f32,
  @location(1) uv:  vec2f,
}

@group(0) @binding(0) var<storage, read> pts: array<P>;
@group(0) @binding(1) var<uniform> u: VU;

const OFF = array<vec2f, 6>(
  vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(-0.5,  0.5),
  vec2f(-0.5,  0.5), vec2f(0.5, -0.5), vec2f(0.5,   0.5)
);

@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let p  = pts[pi].pos;
  // Scale Lorenz space to fit screen: divide by 22, offset z so wings centre at z≈0
  let wp = vec4f(p.x / 22.0, p.y / 22.0, p.z / 22.0 - 1.1, 1.0);
  let cl = u.mvp * wp;
  // Screen-space constant size: offset proportional to cl.w so perspective divide
  // cancels → same pixel radius at any depth.
  let o  = OFF[ci];
  let sz = u.size * cl.w;
  var vo: VO;
  vo.pos = cl + vec4f(o.x * sz, o.y * sz, 0.0, 0.0);
  vo.spd = p.w;
  vo.uv  = o + 0.5;
  return vo;
}`;

// ── WGSL fragment shader: smooth point-sprite with colour gradient ─────────────

const FRAG_WGSL = /* wgsl */`
@fragment fn main(
  @location(0) spd: f32,
  @location(1) uv:  vec2f
) -> @location(0) vec4f {
  let d = length(uv - 0.5);
  if (d > 0.5) { discard; }
  let a = (1.0 - smoothstep(0.18, 0.5, d)) * 0.5;
  // colour gradient: slow=violet → mid=emerald → fast=cyan
  let c0 = vec3f(0.345, 0.125, 0.753);
  let c1 = vec3f(0.314, 0.863, 0.392);
  let c2 = vec3f(0.125, 0.659, 0.863);
  let col = select(mix(c0, c1, spd * 2.0), mix(c1, c2, (spd - 0.5) * 2.0), spd >= 0.5);
  return vec4f(col * a, a);
}`;

// ── helpers ────────────────────────────────────────────────────────────────────

function buildInitialParticles(): Float32Array {
  const data = new Float32Array(N * 4);
  // Seed near the two Lorenz fixed points C± = (±8.49, ±8.49, 27)
  for (let i = 0; i < N; i++) {
    const sign = i < N / 2 ? 1 : -1;
    data[i * 4]     = sign * 8.49 + (Math.random() - 0.5) * 18;
    data[i * 4 + 1] = sign * 8.49 + (Math.random() - 0.5) * 18;
    data[i * 4 + 2] = 27          + (Math.random() - 0.5) * 18;
    data[i * 4 + 3] = 0;
  }
  return data;
}

function buildMvp(az: number, el: number, aspect: number): Float32Array {
  // Perspective (WebGPU depth [0,1])
  const fov = 50 * (Math.PI / 180);
  const f   = 1 / Math.tan(fov / 2);
  const nr = 0.1, fr = 60.0;
  const A  = fr / (nr - fr);
  const B  = nr * fr / (nr - fr);
  // column-major
  const P = new Float32Array([
    f / aspect, 0, 0,  0,
    0,          f, 0,  0,
    0,          0, A, -1,
    0,          0, B,  0,
  ]);

  // Camera orbits origin at radius 3.5
  const r  = 3.5;
  const ex = r * Math.cos(el) * Math.sin(az);
  const ey = r * Math.sin(el);
  const ez = r * Math.cos(el) * Math.cos(az);

  // forward = normalize(origin − eye) = −eye/r
  const fx = -ex / r, fy = -ey / r, fz = -ez / r;

  // right = normalize(forward × world_up) — world_up = (0,1,0)
  // cross(fwd, up) = (fy*0−fz*1, fz*0−fx*0, fx*1−fy*0) = (−fz, 0, fx)
  let  rx = -fz, rz = fx;
  const rl = Math.sqrt(rx * rx + rz * rz);
  rx /= rl; rz /= rl;

  // corrected_up = cross(right, forward) — right.y = 0
  const ux = -rz * fy;
  const uy =  rz * fx - rx * fz;
  const uz =  rx * fy;

  const tx = -(rx * ex + 0 * ey + rz * ez);
  const ty = -(ux * ex + uy * ey + uz * ez);
  const tz =   fx * ex + fy * ey + fz * ez;   // = −r

  // column-major view matrix
  const V = new Float32Array([
    rx,  ux,  -fx,  0,
    0,   uy,  -fy,  0,
    rz,  uz,  -fz,  0,
    tx,  ty,   tz,  1,
  ]);

  // MVP = P × V (column-major: M[c*4+r] = Σ_k P[k*4+r] * V[c*4+k])
  const M = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let rr = 0; rr < 4; rr++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += P[k * 4 + rr] * V[c * 4 + k];
      M[c * 4 + rr] = s;
    }
  }
  return M;
}

// ── GPU state ──────────────────────────────────────────────────────────────────

interface GpuCtx {
  device:          GPUDevice;
  ctx:             GPUCanvasContext;
  computePipeline: GPUComputePipeline;
  renderPipeline:  GPURenderPipeline;
  particleBuf:     GPUBuffer;
  computeUniBuf:   GPUBuffer;
  renderUniBuf:    GPUBuffer;
  computeBG:       GPUBindGroup;
  renderBG:        GPUBindGroup;
}

async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx  = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const initialData = buildInitialParticles();
  const particleBuf = device.createBuffer({
    size:  initialData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, initialData.buffer);

  // 32 bytes: sigma, rho, beta, dt, onset, seed, pad×2
  const computeUniBuf = device.createBuffer({
    size:  32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // 80 bytes: mat4 (64) + size + pad×3
  const renderUniBuf = device.createBuffer({
    size:  80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout:  "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout:   "auto",
    vertex:   { module: device.createShaderModule({ code: VERT_WGSL }),  entryPoint: "main" },
    fragment: {
      module:  device.createShaderModule({ code: FRAG_WGSL }),
      entryPoint: "main",
      targets: [{
        format: fmt,
        blend: {
          color: { operation: "add", srcFactor: "one", dstFactor: "one" },
          alpha: { operation: "add", srcFactor: "zero", dstFactor: "one" },
        },
      }],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = device.createBindGroup({
    layout:  computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: computeUniBuf } },
    ],
  });

  const renderBG = device.createBindGroup({
    layout:  renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: renderUniBuf } },
    ],
  });

  return {
    device, ctx,
    computePipeline, renderPipeline,
    particleBuf, computeUniBuf, renderUniBuf,
    computeBG, renderBG,
  };
}

// ── component ──────────────────────────────────────────────────────────────────

type Phase = "idle" | "running" | "no-gpu";

export default function TslParticleCompute() {
  const [phase, setPhase]     = useState<Phase>("idle");
  const [micMode, setMicMode] = useState(false);
  const [hudSigma, setHudSigma] = useState(10);
  const [hudRho,   setHudRho]   = useState(28);

  const { running: micRunning, error: micError, start: startMic,
          stop: stopMic, getFrame, gain, setGain } = useMicAnalyser({
    smoothing: 0.85, gain: 1.8, onsetThreshold: 1.6,
  });

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const azRef          = useRef(0.6);
  const elRef          = useRef(0.25);
  const dragRef        = useRef<{ x: number; y: number } | null>(null);
  const animRef        = useRef(0);
  const timeRef        = useRef(0);
  const onsetDecayRef  = useRef(0);
  const micModeRef     = useRef(false);

  // Keep ref in sync with state so the frame-loop closure sees the latest value.
  useEffect(() => { micModeRef.current = micMode; }, [micMode]);

  // ── GPU loop ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gpu: GpuCtx | null = null;
    let lastTime = performance.now();
    let hudTimer = 0;

    async function run(cv: HTMLCanvasElement) {
      // Size canvas before init
      const dpr = Math.min(devicePixelRatio, 2);
      cv.width  = Math.floor(cv.clientWidth  * dpr);
      cv.height = Math.floor(cv.clientHeight * dpr);

      try {
        gpu = await buildGpu(cv);
      } catch {
        if (!cancelled) setPhase("no-gpu");
        return;
      }
      if (cancelled) { gpu.device.destroy(); return; }

      function frame(now: number) {
        if (cancelled || !gpu) return;

        // Resize if needed
        const dpr2 = Math.min(devicePixelRatio, 2);
        const newW = Math.floor(cv.clientWidth  * dpr2);
        const newH = Math.floor(cv.clientHeight * dpr2);
        if (cv.width !== newW || cv.height !== newH) {
          cv.width  = newW;
          cv.height = newH;
        }

        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        timeRef.current += dt;

        // Audio parameters
        const af = micModeRef.current ? getFrame() : null;
        let sigma: number, rho: number;

        if (af) {
          sigma = 8  + af.bands[1] * 6;
          rho   = 24 + af.bands[5] * 9;
          if (af.onset) onsetDecayRef.current = 1.0;
        } else {
          const t = timeRef.current;
          sigma = 10 + 1.5  * Math.sin(t * 0.35);
          rho   = 28 + 2.0  * Math.sin(t * 0.21 + 1.0);
        }
        onsetDecayRef.current *= 0.84;
        const onset = onsetDecayRef.current * 5;

        // Update HUD at ~10Hz
        hudTimer += dt;
        if (hudTimer > 0.1) {
          hudTimer = 0;
          setHudSigma(Math.round(sigma * 10) / 10);
          setHudRho(Math.round(rho * 10) / 10);
        }

        // Write compute uniforms
        gpu.device.queue.writeBuffer(
          gpu.computeUniBuf, 0,
          new Float32Array([sigma, rho, 2.667, 0.002, onset, Math.random() * 1000, 0, 0]).buffer
        );

        // Write render uniforms (MVP + point size)
        const aspect = cv.width / Math.max(cv.height, 1);
        const mvp    = buildMvp(azRef.current, elRef.current, aspect);
        const rUni   = new Float32Array(20);
        rUni.set(mvp, 0);
        rUni[16] = 0.0038; // point half-size in NDC
        gpu.device.queue.writeBuffer(gpu.renderUniBuf, 0, rUni.buffer);

        // Command encoder
        const cmd = gpu.device.createCommandEncoder();

        // Compute pass (update Lorenz positions)
        const cp = cmd.beginComputePass();
        cp.setPipeline(gpu.computePipeline);
        cp.setBindGroup(0, gpu.computeBG);
        cp.dispatchWorkgroups(Math.ceil(N / WG));
        cp.end();

        // Render pass (draw particles as additive point sprites)
        const rp = cmd.beginRenderPass({
          colorAttachments: [{
            view:       gpu.ctx.getCurrentTexture().createView(),
            loadOp:     "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            storeOp:    "store",
          }],
        });
        rp.setPipeline(gpu.renderPipeline);
        rp.setBindGroup(0, gpu.renderBG);
        rp.draw(N * 6);
        rp.end();

        gpu.device.queue.submit([cmd.finish()]);
        animRef.current = requestAnimationFrame(frame);
      }

      animRef.current = requestAnimationFrame(frame);
    }

    run(canvas);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      gpu?.device.destroy();
    };
  }, [phase, getFrame]);

  // ── handlers ───────────────────────────────────────────────────────────────

  async function handleStartDemo() {
    setMicMode(false);
    setPhase("running");
  }

  async function handleStartMic() {
    await startMic();
    setMicMode(true);
    setPhase("running");
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    azRef.current += (e.clientX - dragRef.current.x) * 0.007;
    elRef.current  = Math.max(-1.35, Math.min(1.35,
      elRef.current - (e.clientY - dragRef.current.y) * 0.007));
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerUp() { dragRef.current = null; }

  // ── render ─────────────────────────────────────────────────────────────────

  const isRunning = phase === "running";

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full bg-black"
        style={{ touchAction: "none", cursor: isRunning ? "grab" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* ── idle: start screen ───────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Lorenz Attractor</h1>
          <p className="text-base text-white/75 max-w-md mb-2 leading-relaxed">
            50,000 particles trace the Lorenz strange attractor in a WebGPU compute shader.
          </p>
          <p className="text-base text-white/60 max-w-md mb-8 leading-relaxed">
            Bass warps σ (wing spread), treble warps ρ (chaos level).
            Drag to orbit.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={handleStartDemo}
              className="px-6 py-3 text-base border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition min-h-[44px]"
            >
              Demo mode
            </button>
            <button
              onClick={handleStartMic}
              className="px-6 py-3 text-base border border-violet-400/50 text-violet-300 rounded hover:bg-violet-500/10 hover:border-violet-400 transition min-h-[44px]"
            >
              Start mic
            </button>
          </div>
          {micError && (
            <p className="mt-4 text-sm text-rose-300">{micError}</p>
          )}
          <Link
            href="/dream"
            className="mt-12 text-xs text-white/40 hover:text-white/70"
          >
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* ── no-gpu: fallback ─────────────────────────────────────────────── */}
      {phase === "no-gpu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <p className="text-base text-amber-300/95 mb-3">
            WebGPU is not available in this browser.
          </p>
          <p className="text-sm text-white/75 mb-6">
            Try Chrome 113+, Edge 113+, or Safari 18+ on a supported device.
          </p>
          <Link
            href="/dream/10-strange"
            className="text-sm text-violet-300 hover:text-violet-200 underline underline-offset-4 mb-8"
          >
            Open /dream/10-strange instead →
          </Link>
          <Link href="/dream" className="text-xs text-white/40 hover:text-white/70">
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* ── running: HUD ─────────────────────────────────────────────────── */}
      {isRunning && (
        <>
          <div className="absolute top-4 right-4 text-xs text-white/55 space-y-1 text-right pointer-events-none select-none">
            <div className="text-white/75 tracking-wider">LORENZ · 50k</div>
            <div>σ = <span className="text-violet-300">{hudSigma}</span></div>
            <div>ρ = <span className="text-cyan-300">{hudRho}</span></div>
            <div className="text-white/40 mt-1">drag to orbit</div>
          </div>

          {micMode && micRunning && (
            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
              <label className="text-xs text-white/55 tracking-wider">
                GAIN {gain.toFixed(1)}
              </label>
              <input
                type="range" min="0.5" max="4" step="0.1"
                value={gain}
                onChange={(e) => setGain(parseFloat(e.target.value))}
                className="w-32 accent-violet-400"
              />
              <button
                onClick={stopMic}
                className="text-xs text-white/55 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1.5 rounded min-h-[36px]"
              >
                stop mic
              </button>
            </div>
          )}

          <Link
            href="/dream"
            className="absolute bottom-4 left-4 text-xs text-white/35 hover:text-white/65"
          >
            ← back
          </Link>
        </>
      )}
    </div>
  );
}
