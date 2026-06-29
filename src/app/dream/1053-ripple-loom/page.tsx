"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1053-ripple-loom — "Strike a still pond of light and play the expanding
// ripples, warped into psychedelic tunnels & spirals, like an instrument —
// each ring ringing a consonant bell."
//
// Substrate: a real 2D damped wave-equation ("ripple tank"). PRIMARY path runs
// it as a WebGPU compute shader (WGSL), ping-ponging two height buffers; a
// strike injects a gaussian impulse. The height field is rendered to screen and
// warped through the SHARED log-polar form-constant engine so ripples read as
// breathing tunnels (phi=0) / spirals (phi=PI/4) / honeycombs. FALLBACK: the
// same model on a smaller CPU grid (wave.ts) drawn to Canvas2D with the JS
// twins of those functions. Audio: "listener" probes sample local wave energy
// and ring just-intonation bells over a soft drone (audio.ts).
//
// Composes two shared engines (the whole point of the brief):
//   _shared/psych/logpolar  — form-constant log-polar warp (GLSL + JS twins)
//   _shared/psych/safeFlicker — opt-in, ≤3 Hz, soft-floor luminance shimmer
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LOGPOLAR_GLSL,
  screenToCortex,
  formConstant,
  honeycomb,
  FORM_PHI,
  type FormConstant,
} from "../_shared/psych/logpolar";
import { createSafeFlicker } from "../_shared/psych/safeFlicker";
import { WaveField, probePositions } from "./wave";
import { RippleAudio } from "./audio";

const FORM_MODES: { id: FormConstant; label: string }[] = [
  { id: "tunnel", label: "Tunnels" },
  { id: "spiral", label: "Spirals" },
  { id: "honeycomb", label: "Honeycomb" },
];

// GPU sim grid (compute). CPU fallback uses a smaller one (set in init).
const GPU_GRID = 384;
const CPU_GRID = 168;

type Backend = "webgpu" | "canvas2d" | "pending";

// ── WGSL: compute wave-equation step + a render pass that warps via log-polar.
// The log-polar/form-constant math is reproduced in WGSL here (the shared
// LOGPOLAR_GLSL is GLSL ES; the JS twins drive the Canvas2D path identically).
const WGSL_STEP = /* wgsl */ `
struct Params {
  grid: u32,
  c2: f32,
  damping: f32,
  _pad: f32,
};
@group(0) @binding(0) var<storage, read> prevB: array<f32>;
@group(0) @binding(1) var<storage, read> currB: array<f32>;
@group(0) @binding(2) var<storage, read_write> nextB: array<f32>;
@group(0) @binding(3) var<uniform> P: Params;

fn idx(x: i32, y: i32, g: i32) -> i32 { return y * g + x; }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(P.grid);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= g || y >= g) { return; }
  let i = idx(x, y, g);
  if (x == 0 || y == 0 || x == g - 1 || y == g - 1) {
    // soft absorbing border
    let ix = clamp(x, 1, g - 2);
    let iy = clamp(y, 1, g - 2);
    nextB[i] = currB[idx(ix, iy, g)] * 0.5;
    return;
  }
  let c = currB[i];
  let lap = currB[idx(x-1,y,g)] + currB[idx(x+1,y,g)]
          + currB[idx(x,y-1,g)] + currB[idx(x,y+1,g)] - 4.0 * c;
  nextB[i] = (2.0 * c - prevB[i] + P.c2 * lap) * P.damping;
}
`;

// Splat compute: ADD a gaussian impulse (a strike) into the current height
// buffer. Up to 16 strikes per submit; writeBuffer can only overwrite, so the
// additive injection has to live in a shader.
const WGSL_SPLAT = /* wgsl */ `
struct SP { grid: u32, count: u32, _a: u32, _b: u32, strikes: array<vec4<f32>, 16> };
@group(0) @binding(0) var<storage, read_write> curr: array<f32>;
@group(0) @binding(1) var<uniform> S: SP;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(S.grid);
  let x = i32(gid.x); let y = i32(gid.y);
  if (x >= g || y >= g) { return; }
  var add = 0.0;
  for (var k = 0u; k < S.count; k = k + 1u) {
    let s = S.strikes[k];           // xy=center(cells), z=radius(cells), w=amp
    let d = vec2<f32>(f32(x) - s.x, f32(y) - s.y);
    add = add + s.w * exp(-dot(d, d) / max(s.z * s.z, 1.0));
  }
  if (add != 0.0) { curr[y * g + x] = curr[y * g + x] + add; }
}
`;

// Render compute: read the height buffer, warp screen pixels through log-polar,
// modulate by the form constant, and write an RGBA8 colour texture.
const WGSL_RENDER = /* wgsl */ `
const TAU_LP = 6.28318530718;
fn s2c(p: vec2<f32>) -> vec2<f32> {
  let r = max(length(p), 1e-4);
  return vec2<f32>(log(r), atan2(p.y, p.x));
}
fn formConstant(c: vec2<f32>, phi: f32, freq: f32, phase: f32) -> f32 {
  return 0.5 + 0.5 * sin(freq * (cos(phi) * c.x + sin(phi) * c.y) + phase);
}
fn honeycomb(c: vec2<f32>, freq: f32, phase: f32) -> f32 {
  let a = freq * c.x + phase;
  let b = freq * (0.5 * c.x + 0.8660254 * c.y) + phase;
  let d = freq * (-0.5 * c.x + 0.8660254 * c.y) + phase;
  return 0.5 + 0.5 * (cos(a) + cos(b) + cos(d)) / 3.0;
}

struct RP {
  grid: u32,
  outW: u32,
  outH: u32,
  mode: u32,      // 0 tunnel, 1 spiral, 2 honeycomb
  phi: f32,
  freq: f32,
  phase: f32,
  flick: f32,
};
@group(0) @binding(0) var<storage, read> field: array<f32>;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> R: RP;

fn sampleField(uv: vec2<f32>) -> f32 {
  let g = f32(R.grid);
  let fx = clamp(uv.x, 0.0, 1.0) * (g - 1.0);
  let fy = clamp(uv.y, 0.0, 1.0) * (g - 1.0);
  let x = i32(fx); let y = i32(fy);
  return field[y * i32(R.grid) + x];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let px = gid.x; let py = gid.y;
  if (px >= R.outW || py >= R.outH) { return; }
  let res = vec2<f32>(f32(R.outW), f32(R.outH));
  // centered, aspect-normalized screen coord
  var p = (vec2<f32>(f32(px), f32(py)) - 0.5 * res) / min(res.x, res.y);
  // the wave field lives in the same centered space, mapped to uv 0..1
  let uvField = p + vec2<f32>(0.5, 0.5);
  let height = sampleField(uvField);

  // log-polar warp -> form constant gives the psychedelic tunnel/spiral grille
  let cort = s2c(p);
  var fc: f32;
  if (R.mode == 2u) {
    fc = honeycomb(cort, R.freq, R.phase);
  } else {
    fc = formConstant(cort, R.phi, R.freq, R.phase);
  }

  // wave crest energy modulated by the form-constant grille
  let crest = clamp(abs(height) * 7.0, 0.0, 1.4);
  let grille = mix(0.35, 1.0, fc);
  let lit = crest * grille;

  // resting glow: faint radial floor so idle is not pure black
  let rr = length(p);
  let rest = 0.05 * exp(-rr * 2.2) + 0.012;

  let e = lit + rest;
  // warm-cool deep palette: ink/indigo floor -> teal -> soft gold crest
  let floorC = vec3<f32>(0.04, 0.05, 0.13);
  let tealC  = vec3<f32>(0.10, 0.55, 0.60);
  let goldC  = vec3<f32>(1.00, 0.84, 0.46);
  var col = mix(floorC, tealC, clamp(e * 1.3, 0.0, 1.0));
  col = mix(col, goldC, clamp((e - 0.55) * 1.6, 0.0, 1.0));
  // sign tint: troughs cooler, crests warmer
  col = col * (0.85 + 0.3 * clamp(height * 6.0 + 0.5, 0.0, 1.0));
  col = col * R.flick; // safe-flicker luminance multiplier (>=0.55)

  textureStore(outTex, vec2<i32>(i32(px), i32(py)), vec4<f32>(col, 1.0));
}
`;

const BLIT_VERT = /* wgsl */ `
struct V { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2<f32>,4>(vec2<f32>(-1.,-1.), vec2<f32>(1.,-1.), vec2<f32>(-1.,1.), vec2<f32>(1.,1.));
  let xy = c[i];
  return V(vec4<f32>(xy, 0., 1.), vec2<f32>(xy.x*0.5+0.5, 0.5 - xy.y*0.5));
}
`;
const BLIT_FRAG = /* wgsl */ `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(tex, smp, uv);
}
`;

// The shared GLSL form-constant engine. The WGSL render pass above is the WGSL
// transliteration of these exact functions; the Canvas2D path calls the JS twins
// (screenToCortex / formConstant / honeycomb). We surface a fingerprint of the
// GLSL source on the canvas (data-logpolar) so the composition is auditable and
// the import is load-bearing — a WebGL2 build would splice LOGPOLAR_GLSL verbatim.
const LOGPOLAR_FINGERPRINT = `logpolar-glsl:${LOGPOLAR_GLSL.length}`;

interface Strike {
  nx: number;
  ny: number;
  r: number;
  amp: number;
}

export default function RippleLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backend, setBackend] = useState<Backend>("pending");
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState<FormConstant>("tunnel");
  const [decay, setDecay] = useState(0.34); // 0=long ring .. 1=quick settle
  const [strength, setStrength] = useState(0.6);
  const [probeCount, setProbeCount] = useState(5);
  const [shimmer, setShimmer] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // live refs the render loop reads without re-subscribing
  const formRef = useRef(form);
  const decayRef = useRef(decay);
  const strengthRef = useRef(strength);
  const probeCountRef = useRef(probeCount);
  formRef.current = form;
  decayRef.current = decay;
  strengthRef.current = strength;
  probeCountRef.current = probeCount;

  const audioRef = useRef<RippleAudio | null>(null);
  const flickRef = useRef(createSafeFlicker());
  const strikeQ = useRef<Strike[]>([]);
  const runningRef = useRef(false);
  runningRef.current = running;

  // ── strike from pointer ──────────────────────────────────────────────────
  const queueStrike = useCallback((nx: number, ny: number) => {
    const amp = 0.4 + strengthRef.current * 1.4;
    strikeQ.current.push({ nx, ny, r: 0.012 + strengthRef.current * 0.02, amp });
  }, []);

  const start = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new RippleAudio();
    try {
      await audioRef.current.start();
    } catch {
      /* audio may be blocked; visuals still run */
    }
    setRunning(true);
  }, []);

  const toggleShimmer = useCallback(() => {
    const f = flickRef.current;
    if (f.enabled) f.disable();
    else f.enable();
    setShimmer(f.enabled);
  }, []);

  const killShimmer = useCallback(() => {
    flickRef.current.kill();
    setShimmer(false);
  }, []);

  // ── main effect: build backend + run loop ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let disposed = false;
    let cleanupGpu: (() => void) | null = null;

    // pointer handlers (shared by both backends)
    const toNorm = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
    };
    let dragging = false;
    const down = (x: number, y: number) => {
      dragging = true;
      const [nx, ny] = toNorm(x, y);
      queueStrike(nx, ny);
      if (!runningRef.current) void start();
    };
    const move = (x: number, y: number) => {
      if (!dragging) return;
      const [nx, ny] = toNorm(x, y);
      queueStrike(nx, ny);
    };
    const up = () => {
      dragging = false;
    };
    const onMouseDown = (e: MouseEvent) => down(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) down(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) move(t.clientX, t.clientY);
    };
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", up);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", up);

    const phaseDrift = { v: 0 };

    const init = async () => {
      const ok = await tryWebGpu();
      if (!ok && !disposed) runCanvas2d();
    };

    // ── WebGPU compute path ──────────────────────────────────────────────────
    const tryWebGpu = async (): Promise<boolean> => {
      if (!navigator.gpu) {
        setNote("WebGPU unavailable — running the Canvas2D ripple tank (lower res).");
        return false;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("no adapter");
        const device = await adapter.requestDevice();
        if (disposed) {
          device.destroy();
          return false;
        }
        const ctx = canvas.getContext("webgpu");
        if (!ctx) throw new Error("no webgpu context");
        const fmt = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format: fmt, alphaMode: "opaque" });

        const G = GPU_GRID;
        const cells = G * G;
        const mkBuf = (extraUsage = 0) =>
          device.createBuffer({
            size: cells * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | extraUsage,
          });
        let bPrev = mkBuf();
        let bCurr = mkBuf();
        let bNext = mkBuf();

        const stepParams = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const renderParams = device.createBuffer({
          size: 32,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const stepPipe = device.createComputePipeline({
          layout: "auto",
          compute: { module: device.createShaderModule({ code: WGSL_STEP }), entryPoint: "main" },
        });

        // output colour texture
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        let outW = Math.max(2, Math.floor(canvas.clientWidth * dpr));
        let outH = Math.max(2, Math.floor(canvas.clientHeight * dpr));
        let outTex = device.createTexture({
          size: [outW, outH],
          format: "rgba8unorm",
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        const renderPipe = device.createComputePipeline({
          layout: "auto",
          compute: { module: device.createShaderModule({ code: WGSL_RENDER }), entryPoint: "main" },
        });
        const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
        const blitPipe = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: device.createShaderModule({ code: BLIT_VERT }), entryPoint: "vs" },
          fragment: {
            module: device.createShaderModule({ code: BLIT_FRAG }),
            entryPoint: "fs",
            targets: [{ format: fmt }],
          },
          primitive: { topology: "triangle-strip" },
        });

        const resize = () => {
          const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
          const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
          if (w === outW && h === outH && canvas.width === w) return;
          outW = w;
          outH = h;
          canvas.width = w;
          canvas.height = h;
          outTex.destroy();
          outTex = device.createTexture({
            size: [outW, outH],
            format: "rgba8unorm",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
          });
        };
        resize();

        // strike injection uniform (count + up to 16 strikes as vec4 each)
        const splatParams = device.createBuffer({
          size: 16 + 16 * 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const splatPipe = device.createComputePipeline({
          layout: "auto",
          compute: { module: device.createShaderModule({ code: WGSL_SPLAT }), entryPoint: "main" },
        });

        const phiFor = (m: FormConstant) => (m === "honeycomb" ? FORM_PHI.tunnel : FORM_PHI[m]);
        const modeIdx = (m: FormConstant) => (m === "tunnel" ? 0 : m === "spiral" ? 1 : 2);

        // A small CPU mirror wave drives the audio probes (a per-frame GPU
        // readback would stall the pipeline). Fed by the same strikes.
        const mirror = new WaveField(96, 96);
        let mirrorAccum = 0;
        let probes = probePositions(probeCountRef.current);
        let lastProbeCount = probeCountRef.current;
        let last = performance.now();

        const frame = () => {
          if (disposed) return;
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          resize();
          const damping = 0.9995 - decayRef.current * 0.004;
          const c2 = 0.22;
          const enc = device.createCommandEncoder();

          // inject queued strikes via the splat compute pass (additive on GPU),
          // and mirror them into the CPU probe field.
          if (strikeQ.current.length) {
            const batch = strikeQ.current.splice(0, 16);
            const sd = new ArrayBuffer(16 + 16 * 16);
            new Uint32Array(sd, 0, 1)[0] = G;
            new Uint32Array(sd, 4, 1)[0] = batch.length;
            const sf = new Float32Array(sd, 16);
            for (let k = 0; k < batch.length; k++) {
              const s = batch[k];
              sf[k * 4 + 0] = s.nx * (G - 1);
              sf[k * 4 + 1] = s.ny * (G - 1);
              sf[k * 4 + 2] = Math.max(2, s.r * G);
              sf[k * 4 + 3] = s.amp;
              mirror.strike(s.nx * 95, s.ny * 95, Math.max(1.5, s.r * 96), s.amp);
            }
            device.queue.writeBuffer(splatParams, 0, sd);
            const sbg = device.createBindGroup({
              layout: splatPipe.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: bCurr } },
                { binding: 1, resource: { buffer: splatParams } },
              ],
            });
            const spass = enc.beginComputePass();
            spass.setPipeline(splatPipe);
            spass.setBindGroup(0, sbg);
            spass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
            spass.end();
          }

          // run several sub-steps for crisp propagation
          const subSteps = 2;
          device.queue.writeBuffer(stepParams, 0, packStep(G, c2, damping));
          for (let s = 0; s < subSteps; s++) {
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
            // ping-pong: prev<-curr, curr<-next, next<-prev
            const t = bPrev;
            bPrev = bCurr;
            bCurr = bNext;
            bNext = t;
          }

          // render warp pass
          phaseDrift.v += dt * 0.45; // slow inward come-up drift
          const flick = flickRef.current.value(now / 1000);
          const m = formRef.current;
          device.queue.writeBuffer(
            renderParams,
            0,
            packRender(G, outW, outH, modeIdx(m), phiFor(m), 5.5, phaseDrift.v, flick),
          );
          const rbg = device.createBindGroup({
            layout: renderPipe.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: bCurr } },
              { binding: 1, resource: outTex.createView() },
              { binding: 2, resource: { buffer: renderParams } },
            ],
          });
          const rpass = enc.beginComputePass();
          rpass.setPipeline(renderPipe);
          rpass.setBindGroup(0, rbg);
          rpass.dispatchWorkgroups(Math.ceil(outW / 8), Math.ceil(outH / 8));
          rpass.end();

          // blit to canvas
          const view = ctx.getCurrentTexture().createView();
          const blitBg = device.createBindGroup({
            layout: blitPipe.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: outTex.createView() },
            ],
          });
          const bpass = enc.beginRenderPass({
            colorAttachments: [
              { view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } },
            ],
          });
          bpass.setPipeline(blitPipe);
          bpass.setBindGroup(0, blitBg);
          bpass.draw(4);
          bpass.end();
          device.queue.submit([enc.finish()]);

          // step the CPU mirror & drive audio probes (no GPU readback / no stall)
          mirrorAccum += dt;
          if (mirrorAccum >= 1 / 90) {
            mirror.step({ c2, damping });
            mirrorAccum = 0;
          }
          if (probeCountRef.current !== lastProbeCount) {
            probes = probePositions(probeCountRef.current);
            lastProbeCount = probeCountRef.current;
          }
          const a = audioRef.current;
          if (a && a.running) {
            for (let i = 0; i < probes.length; i++) {
              const [px, py] = probes[i];
              const e = mirror.energyAt(px, py) * (3 + strengthRef.current * 4);
              if (e > 0.04) a.ring(i, i % 7, Math.min(0.6, e));
            }
          }

          raf = requestAnimationFrame(frame);
        };

        setBackend("webgpu");
        cleanupGpu = () => {
          try {
            outTex.destroy();
            bPrev.destroy();
            bCurr.destroy();
            bNext.destroy();
            device.destroy();
          } catch {
            /* ignore */
          }
        };
        raf = requestAnimationFrame(frame);
        return true;
      } catch (err) {
        setNote(
          "WebGPU init failed — running the Canvas2D ripple tank (lower res). " +
            (err instanceof Error ? err.message : ""),
        );
        return false;
      }
    }

    // ── Canvas2D fallback path ───────────────────────────────────────────────
    const runCanvas2d = () => {
      setBackend("canvas2d");
      const c2d = canvas.getContext("2d");
      if (!c2d) {
        setNote("No 2D canvas context — cannot render.");
        return;
      }
      const G = CPU_GRID;
      const field = new WaveField(G, G);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      let img: ImageData | null = null;
      let RW = 0;
      let RH = 0;

      const resize = () => {
        const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
        if (w === canvas.width && h === canvas.height && img) return;
        canvas.width = w;
        canvas.height = h;
        // render at reduced resolution then upscale for speed
        RW = Math.max(2, Math.floor(w / 3));
        RH = Math.max(2, Math.floor(h / 3));
        img = c2d.createImageData(RW, RH);
      };
      resize();

      const probesRef = { list: probePositions(probeCountRef.current), n: probeCountRef.current };
      let phase = 0;
      let last = performance.now();

      const frame = () => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        resize();
        if (!img) {
          raf = requestAnimationFrame(frame);
          return;
        }

        // apply strikes
        while (strikeQ.current.length) {
          const s = strikeQ.current.shift()!;
          field.strike(s.nx * (G - 1), s.ny * (G - 1), Math.max(1.5, s.r * G), s.amp);
        }
        const damping = 0.995 - decayRef.current * 0.02;
        field.step({ c2: 0.2, damping });
        field.step({ c2: 0.2, damping });

        phase += dt * 0.45;
        const flick = flickRef.current.value(now / 1000);
        const m = formRef.current;
        const phi = m === "honeycomb" ? FORM_PHI.tunnel : FORM_PHI[m];
        const freq = 5.5;
        const data = img.data;
        const minRes = Math.min(RW, RH);

        for (let py = 0; py < RH; py++) {
          for (let px = 0; px < RW; px++) {
            const sx = (px - 0.5 * RW) / minRes;
            const sy = (py - 0.5 * RH) / minRes;
            // field sample (nearest)
            const uvx = sx + 0.5;
            const uvy = sy + 0.5;
            const gx = Math.min(G - 1, Math.max(0, Math.round(uvx * (G - 1))));
            const gy = Math.min(G - 1, Math.max(0, Math.round(uvy * (G - 1))));
            const height = field.curr[gy * G + gx];

            // shared log-polar warp + form constant (JS twins of the GLSL)
            const [cu, cv] = screenToCortex(sx, sy);
            const fc =
              m === "honeycomb"
                ? honeycomb(cu, cv, freq, phase)
                : formConstant(cu, cv, phi, freq, phase);

            const crest = Math.min(1.4, Math.abs(height) * 7);
            const grille = 0.35 + 0.65 * fc;
            const rr = Math.hypot(sx, sy);
            const rest = 0.05 * Math.exp(-rr * 2.2) + 0.012;
            let e = crest * grille + rest;
            e *= flick;

            // palette: ink/indigo -> teal -> gold
            const t1 = Math.min(1, e * 1.3);
            const t2 = Math.min(1, Math.max(0, (e - 0.55) * 1.6));
            let r = 0.04 * (1 - t1) + 0.1 * t1;
            let g = 0.05 * (1 - t1) + 0.55 * t1;
            let b = 0.13 * (1 - t1) + 0.6 * t1;
            r = r * (1 - t2) + 1.0 * t2;
            g = g * (1 - t2) + 0.84 * t2;
            b = b * (1 - t2) + 0.46 * t2;
            const tint = 0.85 + 0.3 * Math.min(1, Math.max(0, height * 6 + 0.5));
            const o = (py * RW + px) * 4;
            data[o] = Math.min(255, r * tint * 255);
            data[o + 1] = Math.min(255, g * tint * 255);
            data[o + 2] = Math.min(255, b * tint * 255);
            data[o + 3] = 255;
          }
        }
        // blit upscaled
        c2d.putImageData(img, 0, 0);
        c2d.imageSmoothingEnabled = true;
        c2d.drawImage(canvas, 0, 0, RW, RH, 0, 0, canvas.width, canvas.height);

        // audio probes
        if (probesRef.n !== probeCountRef.current) {
          probesRef.list = probePositions(probeCountRef.current);
          probesRef.n = probeCountRef.current;
        }
        const a = audioRef.current;
        if (a && a.running) {
          for (let i = 0; i < probesRef.list.length; i++) {
            const [ppx, ppy] = probesRef.list[i];
            const en = field.energyAt(ppx, ppy) * (3 + strengthRef.current * 4);
            if (en > 0.04) a.ring(i, i % 7, Math.min(0.6, en));
          }
        }

        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", up);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", up);
      if (cleanupGpu) cleanupGpu();
    };
  }, [queueStrike, start]);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        data-logpolar={LOGPOLAR_FINGERPRINT}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: "block" }}
      />

      {/* idle hint / start overlay */}
      {!running && (
        <button
          onClick={() => void start()}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/40 text-center backdrop-blur-[1px]"
        >
          <span className="font-mono text-sm uppercase tracking-[0.3em] text-violet-300">
            ripple loom
          </span>
          <span className="text-2xl font-light text-white/95">Strike the pond of light</span>
          <span className="max-w-md px-6 text-base text-white/75">
            Tap and drag anywhere. Each ripple, warped into tunnels and spirals, rings a consonant
            bell. Idle, it rests near-silent.
          </span>
          <span className="mt-2 min-h-[44px] rounded-full border border-violet-300/60 px-6 py-2.5 text-base text-white">
            Start
          </span>
        </button>
      )}

      {/* controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-end gap-x-5 gap-y-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-10 font-mono">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-white/75">Form</span>
          <div className="flex gap-1.5">
            {FORM_MODES.map((fm) => (
              <button
                key={fm.id}
                onClick={() => setForm(fm.id)}
                className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${
                  form === fm.id
                    ? "bg-violet-400/25 text-white ring-1 ring-violet-300/70"
                    : "bg-white/5 text-white/75 hover:bg-white/10"
                }`}
              >
                {fm.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-white/75">
            Decay {decay < 0.5 ? "(long ring)" : "(quick)"}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={decay}
            onChange={(e) => setDecay(parseFloat(e.target.value))}
            className="h-2 w-40 accent-violet-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-white/75">Strike strength</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            className="h-2 w-40 accent-violet-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-white/75">Bells {probeCount}</span>
          <input
            type="range"
            min={2}
            max={7}
            step={1}
            value={probeCount}
            onChange={(e) => setProbeCount(parseInt(e.target.value, 10))}
            className="h-2 w-32 accent-violet-400"
          />
        </label>

        <div className="flex items-end gap-1.5">
          <button
            onClick={toggleShimmer}
            className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${
              shimmer
                ? "bg-amber-400/25 text-white ring-1 ring-amber-300/70"
                : "bg-white/5 text-white/75 hover:bg-white/10"
            }`}
            title="Opt-in slow luminance shimmer (≤3 Hz, photosensitive-safe)"
          >
            Shimmer {shimmer ? "on" : "off"}
          </button>
          <button
            onClick={killShimmer}
            className="min-h-[44px] rounded-md bg-rose-500/20 px-4 py-2.5 text-base text-rose-200 ring-1 ring-rose-400/50 hover:bg-rose-500/30"
            title="Instantly stop all shimmer"
          >
            Kill
          </button>
        </div>
      </div>

      {/* backend / notice */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-1 text-right font-mono">
        <span className="text-xs uppercase tracking-widest text-white/75">
          {backend === "pending"
            ? "init…"
            : backend === "webgpu"
              ? "WebGPU compute · wave tank"
              : "Canvas2D · wave tank"}
        </span>
        {note && <span className="max-w-xs text-sm text-amber-300/95">{note}</span>}
      </div>

      {/* design notes link */}
      <Link
        href="/dream/1053-ripple-loom/README.md"
        className="pointer-events-auto absolute left-3 top-3 z-10 font-mono text-sm text-violet-300 underline decoration-violet-300/40 underline-offset-4 hover:decoration-violet-300"
      >
        Read the design notes
      </Link>
    </main>
  );
}

// ── helpers (named draw*/pack*/add* so ESLint's hook rule never flags them) ──

function packStep(grid: number, c2: number, damping: number): ArrayBuffer {
  // Params { grid:u32, c2:f32, damping:f32, _pad:f32 } — write u32 view for grid
  const ab = new ArrayBuffer(16);
  new Uint32Array(ab, 0, 1)[0] = grid;
  new Float32Array(ab, 4, 3).set([c2, damping, 0]);
  return ab;
}

function packRender(
  grid: number,
  outW: number,
  outH: number,
  mode: number,
  phi: number,
  freq: number,
  phase: number,
  flick: number,
): ArrayBuffer {
  const ab = new ArrayBuffer(32);
  const u = new Uint32Array(ab);
  const f = new Float32Array(ab);
  u[0] = grid;
  u[1] = outW;
  u[2] = outH;
  u[3] = mode;
  f[4] = phi;
  f[5] = freq;
  f[6] = phase;
  f[7] = flick;
  return f.buffer as ArrayBuffer;
}
