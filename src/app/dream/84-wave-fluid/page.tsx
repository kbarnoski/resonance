"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── WGSL ──────────────────────────────────────────────────────────────────────

const VERT_SRC = `
struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), vec2f(xy.x*.5+.5, .5-xy.y*.5));
}`;

// Uniform layout: 8 × f32 = 32 bytes
// time | bass | treble | splash_x | splash_time | splash_str | pad0 | pad1
const FRAG_SRC = `
const TAU: f32 = 6.2831853;

struct Uni {
  time:        f32,
  bass:        f32,
  treble:      f32,
  splash_x:    f32,
  splash_time: f32,
  splash_str:  f32,
  pad0:        f32,
  pad1:        f32,
}
@group(0) @binding(0) var<uniform> u: Uni;

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i),            hash21(i + vec2f(1,0)), s.x),
    mix(hash21(i + vec2f(0,1)), hash21(i + vec2f(1,1)), s.x),
    s.y
  );
}

@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let x  = uv.x;
  let y  = uv.y;   // 0=top, 1=bottom
  let t  = u.time;
  let B  = u.bass;
  let Tr = u.treble;

  // Splash guard — prevents NaN/inf when splash_time is in a different timeframe
  let s_age   = t - u.splash_time;
  let s_dist  = abs(x - u.splash_x);
  let s_valid = u.splash_str > 0.0 && s_age > 0.0 && s_age < 4.5;

  // ── Wave surface height field ──────────────────────────────────────────────
  // Four sinusoidal modes at incommensurable frequencies; amplitude ∝ bass.
  let w1 = sin(x * 7.0  * TAU + t * 2.10) * 0.054;
  let w2 = sin(x * 13.0 * TAU - t * 1.65 + 0.7) * 0.030;
  let w3 = sin(x * 23.0 * TAU + t * 3.90 - 1.1) * 0.018;
  let w4 = sin(x * 41.0 * TAU - t * 5.20 + 2.3) * 0.010;
  let wave = B * (w1 + w2 + w3 + w4);

  // Treble: high-frequency value-noise turbulence
  let turb = Tr * (vnoise(vec2f(x * 18.0 + t * 1.2, t * 0.4)) - 0.5) * 0.014;

  // Splash ripple wave (radially expanding from click/onset point)
  var s_wave = 0.0;
  if (s_valid) {
    s_wave = u.splash_str
      * exp(-s_age * 2.2)
      * sin(s_dist * 20.0 * TAU - s_age * 7.0)
      * exp(-s_dist * 10.0)
      * 0.08;
  }

  // Surface y (0=top, 1=bottom). Baseline at 0.44.
  let surf = 0.44 + wave + turb + s_wave;

  // Signed distance from surface: positive = above (sky), negative = below (water)
  let sd = y - surf;

  var col: vec3f;

  if (sd >= 0.0) {
    // ── SKY / ABOVE WATER ─────────────────────────────────────────────────────
    let above = sd;

    // Dark atmospheric gradient
    let sky_lo = vec3f(0.022, 0.026, 0.075);
    let sky_hi = vec3f(0.006, 0.006, 0.020);
    col = mix(sky_lo, sky_hi, clamp(above * 5.0, 0.0, 1.0));

    // Twinkling stars
    let star_id  = floor(uv * vec2f(220.0, 110.0));
    let star_v   = hash21(star_id);
    let star_fade = clamp(above * 7.0, 0.0, 1.0);
    if (star_v > 0.987) {
      let twinkle = 0.55 + 0.45 * sin(t * (2.2 + star_v * 9.0) + star_v * 80.0);
      col += vec3f(twinkle * 0.85) * star_fade;
    }

    // Spray particles: per-column parabolic arcs rising above the surface
    let col_id   = floor(x * 38.0);
    let col_frac = fract(x * 38.0);
    let sp_phase = fract(t * 0.44 + hash21(vec2f(col_id,  7.0)));
    let sp_apex  = 0.022 + hash21(vec2f(col_id, 13.0)) * 0.048;
    let sp_h     = sp_apex * 4.0 * sp_phase * (1.0 - sp_phase);   // parabola peaks at apex
    let sp_dy    = abs(above - sp_h);
    let sp_dx    = abs(col_frac - 0.5);
    let sp_glow  = exp(-sp_dy * 290.0 - sp_dx * 52.0) * B * 0.55;
    col += sp_glow * vec3f(0.50, 0.64, 1.00);

    // Foam band at the waterline
    let foam_i = exp(-above * 190.0) * (0.50 + B * 0.60) * (0.70 + Tr * 0.40);
    let foam_c = mix(vec3f(0.82, 0.87, 1.00), vec3f(0.58, 0.13, 0.90), B * 0.72);
    col = mix(col, foam_c, clamp(foam_i, 0.0, 1.0));

  } else {
    // ── WATER BODY ────────────────────────────────────────────────────────────
    let depth = -sd;   // 0 at surface, grows downward

    // Base color: bright surface blue → deep indigo
    let w_surf = vec3f(0.07, 0.19, 0.70);
    let w_deep = vec3f(0.01, 0.03, 0.15);
    col = mix(w_surf, w_deep, clamp(depth * 5.5, 0.0, 1.0));

    // Caustic shimmer (multiplicative interference pattern driven by bass)
    let cx      = sin(x * 40.0 * TAU + t * 4.5) * sin(x * 17.0 * TAU - t * 2.8);
    let cy      = sin(depth * 120.0 - t * 3.2);
    let caustic = max(cx * cy, 0.0) * B * 0.15;
    col += vec3f(0.18, 0.50, 0.95) * caustic;

    // Subsurface violet volume scatter (near-surface glow)
    let scatter = exp(-depth * 16.0) * B * 0.30;
    col += vec3f(0.30, 0.09, 0.78) * scatter;
  }

  // ── Surface bloom ────────────────────────────────────────────────────────────
  // Rose/violet glow right at the surface, driven by bass.
  let bloom = exp(-sd * sd * 16000.0) * pow(max(B, 0.0), 1.4) * 1.1;
  col += vec3f(0.90, 0.26, 0.54) * bloom;

  // ── Splash ring glow ─────────────────────────────────────────────────────────
  if (s_valid && s_age < 3.8) {
    let ring_r  = s_age * 0.10;
    let ring_at = exp(-pow(s_dist - ring_r, 2.0) * 2400.0) * exp(-s_age * 1.8) * 0.72;
    let surf_w  = exp(-sd * sd * 5800.0);
    col += ring_at * surf_w * vec3f(0.65, 0.24, 0.95);
  }

  // ── Tone mapping + gamma correction ──────────────────────────────────────────
  col = col / (1.0 + dot(col, vec3f(0.299, 0.587, 0.114)));
  col = pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2));

  return vec4f(col, 1.0);
}
`;

// ── WebGPU setup ──────────────────────────────────────────────────────────────

interface GpuCtx {
  device:    GPUDevice;
  ctx:       GPUCanvasContext;
  pipeline:  GPURenderPipeline;
  uniBuf:    GPUBuffer;
  bindGroup: GPUBindGroup;
}

async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("WebGPU not supported in this browser.");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found.");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("Could not acquire WebGPU canvas context.");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const uniBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex:   { module: device.createShaderModule({ code: VERT_SRC }), entryPoint: "vs" },
    fragment: {
      module:     device.createShaderModule({ code: FRAG_SRC }),
      entryPoint: "fs",
      targets:    [{ format: fmt }],
    },
    primitive: { topology: "triangle-strip" },
  });

  const bindGroup = device.createBindGroup({
    layout:  pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniBuf } }],
  });

  return { device, ctx, pipeline, uniBuf, bindGroup };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "idle" | "demo" | "mic";

export default function WaveFluidPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef    = useRef<GpuCtx | null>(null);
  // x in [0,1], time = elapsed seconds at splash (−100 = never splashed)
  const splashRef = useRef({ x: 0.5, time: -100.0, str: 0.0 });
  const t0Ref     = useRef(0);

  const [mode, setMode]         = useState<Mode>("idle");
  const [gpuError, setGpuError] = useState<string | null>(null);

  const {
    running,
    error: micError,
    start: startMic,
    stop:  stopMic,
    getFrame,
  } = useMicAnalyser({ smoothing: 0.80, gain: 2.0 });

  // ── Canvas resize + click-to-splash ──────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.round(canvas.offsetWidth  * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX  = (e.clientX - rect.left) / rect.width;
      const elapsed = (performance.now() - t0Ref.current) / 1000;
      splashRef.current = { x: clickX, time: elapsed, str: 1.1 };
    };
    canvas.addEventListener("pointerdown", onPointer);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  // ── WebGPU init (triggered when mode goes non-idle) ───────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    buildGpu(canvas)
      .then(gpu => {
        if (destroyed) { gpu.device.destroy(); return; }
        gpuRef.current = gpu;
      })
      .catch(e => setGpuError((e as Error).message));

    return () => {
      destroyed = true;
      gpuRef.current?.device.destroy();
      gpuRef.current = null;
    };
  }, [mode]);

  // ── Animation loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;

    let raf = 0;
    let lastOnsetSec = -5.0;
    t0Ref.current = performance.now();

    function frame() {
      const gpu = gpuRef.current;
      if (!gpu) { raf = requestAnimationFrame(frame); return; }

      const t = (performance.now() - t0Ref.current) / 1000;

      // Audio params
      let bass = 0.30, treble = 0.08;
      let onset = false;

      if (mode === "mic" && running) {
        const fr = getFrame();
        if (fr) {
          bass   = fr.bands[1] * 0.65 + fr.bands[0] * 0.35;
          treble = fr.bands[4] * 0.70 + fr.bands[5] * 0.30;
          onset  = fr.onset;
        }
      } else {
        // Demo: slow breathing ocean
        bass   = 0.28 + 0.22 * Math.sin(t * 0.68) + 0.07 * Math.sin(t * 1.90);
        treble = 0.06 + 0.10 * Math.sin(t * 1.70 + 0.5);
        // Synthetic onset every ~2.2 seconds
        onset  = Math.floor(t * 0.45) !== Math.floor((t - 0.016) * 0.45);
      }

      if (onset && t - lastOnsetSec > 1.2) {
        splashRef.current = {
          x:    Math.random(),
          time: t,
          str:  0.75 + Math.random() * 0.50,
        };
        lastOnsetSec = t;
      }

      const { x: sx, time: st, str: ss } = splashRef.current;
      gpu.device.queue.writeBuffer(
        gpu.uniBuf, 0,
        new Float32Array([t, bass, treble, sx, st, ss, 0, 0]),
      );

      const enc  = gpu.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view:       gpu.ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.01, g: 0.02, b: 0.06, a: 1 },
          loadOp:     "clear",
          storeOp:    "store",
        }],
      });
      pass.setPipeline(gpu.pipeline);
      pass.setBindGroup(0, gpu.bindGroup);
      pass.draw(4);
      pass.end();
      gpu.device.queue.submit([enc.finish()]);

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode, running, getFrame]);

  // ── Controls ──────────────────────────────────────────────────────────────────

  const beginDemo = () => setMode("demo");

  const beginMic = async () => {
    await startMic();
    setMode("mic");
  };

  const stop = () => {
    if (mode === "mic") stopMic();
    setMode("idle");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100vh - 3rem)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full bg-black"
        style={{ touchAction: "none", cursor: mode !== "idle" ? "crosshair" : "default" }}
      />

      {/* ── Idle screen ──────────────────────────────────────────────────────── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center px-6">
          <div>
            <h1 className="text-3xl font-mono mb-3 tracking-tight">Wave Fluid</h1>
            <p className="text-base text-white/80 max-w-sm leading-relaxed">
              Audio-reactive ocean surface rendered in WebGPU.
              Bass raises the swell. Treble chops the surface.
              Onsets send ripples. Click anywhere to splash.
            </p>
            <p className="text-sm text-white/55 mt-2">
              Requires WebGPU — Chrome 113+, Edge 113+, Safari 26+
            </p>
          </div>

          {gpuError && (
            <div className="border border-rose-400/30 rounded-lg px-5 py-3 max-w-sm text-left">
              <p className="text-rose-300 text-base mb-1">WebGPU unavailable</p>
              <p className="text-white/55 text-sm mb-2">{gpuError}</p>
              <Link href="/dream/3-fluid" className="text-violet-300 text-sm underline">
                Open 3-fluid (Canvas2D Navier-Stokes) →
              </Link>
            </div>
          )}

          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={beginMic}
              className="px-5 py-2.5 min-h-[44px] text-base font-mono tracking-wide border border-white/30 rounded-lg hover:bg-white/5 hover:border-white/60 transition"
            >
              🎤 Start mic
            </button>
            <button
              onClick={beginDemo}
              className="px-5 py-2.5 min-h-[44px] text-base font-mono tracking-wide border border-white/15 rounded-lg hover:bg-white/5 hover:border-white/35 transition text-white/80"
            >
              ▶ Demo mode
            </button>
          </div>

          {micError && (
            <p className="text-rose-300 text-base">{micError}</p>
          )}

          <Link href="/dream" className="text-sm text-white/40 hover:text-white/70 transition">
            ← back to dream lab
          </Link>
        </div>
      )}

      {/* ── Running HUD ──────────────────────────────────────────────────────── */}
      {mode !== "idle" && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2 select-none">
          <div className="flex items-center gap-3">
            {mode === "mic" && (
              <span className={`text-sm font-mono ${running ? "text-emerald-300/95" : "text-amber-300/95"}`}>
                {running ? "● mic" : "◌ starting…"}
              </span>
            )}
            {mode === "demo" && (
              <span className="text-sm font-mono text-white/55">demo</span>
            )}
            <button
              onClick={stop}
              className="text-sm text-white/65 hover:text-white/95 border border-white/20 hover:border-white/50 px-3 py-1.5 min-h-[36px] rounded-lg transition font-mono"
            >
              stop
            </button>
          </div>
          {micError && (
            <p className="text-rose-300 text-sm">{micError}</p>
          )}
          <a
            href="/dream/84-wave-fluid/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-white/25 hover:text-white/55 transition"
          >
            design notes ↗
          </a>
        </div>
      )}

      {mode !== "idle" && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/30 pointer-events-none font-mono select-none">
          click water to splash · WebGPU ocean
        </p>
      )}
    </div>
  );
}
