"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Color Hunt · src/app/dream/727-kids-color-hunt/page.tsx
//
// ONE question: what if a 4-year-old could point the tablet at the COLORS in
// their room and PAINT music with what they see — red things sing warm and low,
// sky-blue shimmers bright and high?
//
// The camera is a COLOR SAMPLER (analysis-only, never recorded or sent). Each
// frame we draw the rear-camera video to a tiny offscreen canvas and average the
// RGB of the CENTER reticle. That color's HUE picks a consonant pentatonic chord
// whose REGISTER climbs from warm-low (red) up to bright-high (cyan/blue);
// SATURATION drives the particle count + energy; BRIGHTNESS drives loudness and
// the openness of the bloom. The world's color is the instrument.
//
// OUTPUT: a WebGPU compute-shader particle bloom (PRIMARY) — particles colored
// and energized by the sampled hue — with a first-class Canvas2D fallback that
// reproduces the same physics. Camera denied / idle → a ghost auto-demo slowly
// cycles a palette of colors so it blooms and sings with ZERO input.
//
// Cross-modal color↔tone lineage: Scriabin's clavier à lumières, Kandinsky's
// color-tone theory, Refik Anadol's luminous particle fields. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hsvToCss,
  hueToChord,
  sampleCenterRegion,
  type ColorSample,
} from "./color";

// ─── Minimal local WebGPU surface (zero new deps) ────────────────────────────
// We touch the API through one typed boundary; the annotated `any`s below are
// the only ones in this file, matching the lab's ESLint convention.
type GpuCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computePipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderPipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  particleBuf: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uniformBuf: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeBind: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderBind: any;
  count: number;
};

const PARTICLE_COUNT = 12288;

// The live "color state" that drives both the bloom and the sound.
type Paint = {
  hue: number; // 0..360
  sat: number; // 0..1 → particle count / energy
  val: number; // 0..1 → loudness / openness
  r: number; // 0..1 display color
  g: number;
  b: number;
};

// ─── WGSL: compute (color-driven bloom physics) + render (additive glow) ─────
const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: vec2<f32>, glow: f32, hue: f32 };
struct Uniforms {
  paint: vec4<f32>, // hue01, sat, val, time
  misc:  vec4<f32>, // dt, count, _, _
};
@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(u.misc.y)) { return; }
  var p = parts[i];
  let dt = u.misc.x;
  let sat = u.paint.y;
  let val = u.paint.z;
  let t = u.paint.w;

  // The bloom forms around screen center (where the reticle points). Openness
  // grows with brightness so bright colors fill the field, dark ones cluster.
  let center = vec2<f32>(0.5, 0.5);
  let toC = center - p.pos;
  let d = length(toC) + 0.0001;

  // Saturation = energy: more colorful → more outward push + livelier orbit.
  let energy = 0.15 + sat * 0.95;
  let radius = 0.12 + val * 0.34; // brighter → wider, more open bloom

  // Spring toward a glowing ring at the radius around center, gently swirling.
  let target = d - radius;
  p.vel = p.vel - normalize(toC) * target * 0.9 * energy * dt;
  // Tangential swirl (perpendicular) so the bloom breathes rather than freezes.
  let tang = vec2<f32>(-toC.y, toC.x) / d;
  p.vel = p.vel + tang * energy * 0.20 * dt;

  // Slow ambient drift so the field is alive even at zero saturation.
  p.vel = p.vel + vec2<f32>(
    sin(t * 0.4 + p.seed.x * 6.28) * 0.004,
    cos(t * 0.37 + p.seed.y * 6.28) * 0.004
  ) * dt * 60.0;

  p.vel = p.vel * 0.93; // soft damping — nothing ever flings
  p.pos = p.pos + p.vel * dt;
  p.pos = fract(p.pos + vec2<f32>(1.0, 1.0)); // soft-wrap, never vanish

  // Glow swells with saturation + brightness, eases back tenderly.
  let live = (0.25 + sat * 0.75) * (0.3 + val * 0.7);
  p.glow = max(p.glow * 0.95, live * (0.5 + 0.5 * hash(p.seed.x + t * 0.05)));

  // Each particle's hue eases toward the sampled hue (a smooth color wash).
  let targetHue = u.paint.x;
  var dh = targetHue - p.hue;
  if (dh > 0.5) { dh = dh - 1.0; }
  if (dh < -0.5) { dh = dh + 1.0; }
  p.hue = fract(p.hue + dh * 0.06 + 1.0);

  parts[i] = p;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: vec2<f32>, glow: f32, hue: f32 };
@group(0) @binding(0) var<storage, read> parts: array<Particle>;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) glow: f32,
  @location(2) hue: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let p = parts[ii];
  let c = corners[vi];
  let size = 0.008 + p.glow * 0.028;
  let center = vec2<f32>(p.pos.x * 2.0 - 1.0, (1.0 - p.pos.y) * 2.0 - 1.0);
  var out: VsOut;
  out.clip = vec4<f32>(center + c * size, 0.0, 1.0);
  out.uv = c;
  out.glow = p.glow;
  out.hue = p.hue;
  return out;
}

// HSV(hue, 0.85, 1) → RGB so particles literally take the room's color.
fn hsv2rgb(h: f32) -> vec3<f32> {
  let s = 0.78;
  let v = 1.0;
  let hh = fract(h) * 6.0;
  let c = v * s;
  let x = c * (1.0 - abs((hh % 2.0) - 1.0));
  var rgb = vec3<f32>(0.0, 0.0, 0.0);
  if (hh < 1.0) { rgb = vec3<f32>(c, x, 0.0); }
  else if (hh < 2.0) { rgb = vec3<f32>(x, c, 0.0); }
  else if (hh < 3.0) { rgb = vec3<f32>(0.0, c, x); }
  else if (hh < 4.0) { rgb = vec3<f32>(0.0, x, c); }
  else if (hh < 5.0) { rgb = vec3<f32>(x, 0.0, c); }
  else { rgb = vec3<f32>(c, 0.0, x); }
  return rgb + vec3<f32>(v - c);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  let soft = smoothstep(1.0, 0.0, r);
  let base = 0.08 + in.glow * 0.92;
  let col = hsv2rgb(in.hue);
  let a = soft * base;
  return vec4<f32>(col * a, a);
}
`;

// ─── WebGPU init ─────────────────────────────────────────────────────────────
async function makeGpu(canvas: HTMLCanvasElement): Promise<GpuCtx | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (!nav.gpu) return null;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = canvas.getContext("webgpu") as any;
    if (!ctx) return null;
    const format = nav.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });

    // particle struct = 8 floats (pos2, vel2, seed2, glow, hue) = 32 bytes
    const stride = 8 * 4;
    const init = new Float32Array(PARTICLE_COUNT * 8);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * 8;
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.18 + Math.random() * 0.12;
      init[o + 0] = 0.5 + Math.cos(ang) * rad;
      init[o + 1] = 0.5 + Math.sin(ang) * rad;
      init[o + 2] = 0;
      init[o + 3] = 0;
      init[o + 4] = Math.random();
      init[o + 5] = Math.random();
      init[o + 6] = 0;
      init[o + 7] = Math.random();
    }
    // WebGPU buffer-usage flag bits (avoids @webgpu/types globals).
    const STORAGE = 0x80;
    const COPY_DST = 0x8;
    const UNIFORM = 0x40;
    const particleBuf = device.createBuffer({
      size: PARTICLE_COUNT * stride,
      usage: STORAGE | COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(particleBuf.getMappedRange()).set(init);
    particleBuf.unmap();

    const uniformBuf = device.createBuffer({
      size: 8 * 4, // two vec4
      usage: UNIFORM | COPY_DST,
    });

    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
    const renderModule = device.createShaderModule({ code: RENDER_WGSL });

    const computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: computeModule, entryPoint: "main" },
    });
    const renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: {
        module: renderModule,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    const computeBind = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuf } },
        { binding: 1, resource: { buffer: uniformBuf } },
      ],
    });
    const renderBind = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: particleBuf } }],
    });

    return {
      device,
      ctx,
      format,
      computePipeline,
      renderPipeline,
      particleBuf,
      uniformBuf,
      computeBind,
      renderBind,
      count: PARTICLE_COUNT,
    };
  } catch {
    return null;
  }
}

function drawGpuFrame(g: GpuCtx, paint: Paint, t: number, dt: number) {
  const uni = new Float32Array([
    paint.hue / 360,
    paint.sat,
    paint.val,
    t,
    dt,
    g.count,
    0,
    0,
  ]);
  g.device.queue.writeBuffer(g.uniformBuf, 0, uni);

  const enc = g.device.createCommandEncoder();
  const cpass = enc.beginComputePass();
  cpass.setPipeline(g.computePipeline);
  cpass.setBindGroup(0, g.computeBind);
  cpass.dispatchWorkgroups(Math.ceil(g.count / 64));
  cpass.end();

  const view = g.ctx.getCurrentTexture().createView();
  const rpass = enc.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0.01, g: 0.012, b: 0.03, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  rpass.setPipeline(g.renderPipeline);
  rpass.setBindGroup(0, g.renderBind);
  rpass.draw(6, g.count, 0, 0);
  rpass.end();
  g.device.queue.submit([enc.finish()]);
}

// ─── Canvas2D fallback particle bloom (same physics as the WGSL compute) ─────
type Mote = { x: number; y: number; vx: number; vy: number; glow: number; hue: number };

function makeMotes(n: number): Mote[] {
  const motes: Mote[] = [];
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.18 + Math.random() * 0.12;
    motes.push({
      x: 0.5 + Math.cos(ang) * rad,
      y: 0.5 + Math.sin(ang) * rad,
      vx: 0,
      vy: 0,
      glow: 0,
      hue: Math.random(),
    });
  }
  return motes;
}

function hsv2rgb255(h01: number): [number, number, number] {
  const s = 0.78;
  const v = 1;
  const hh = (((h01 % 1) + 1) % 1) * 6;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g] = [c, x];
  else if (hh < 2) [r, g] = [x, c];
  else if (hh < 3) [g, b] = [c, x];
  else if (hh < 4) [g, b] = [x, c];
  else if (hh < 5) [r, b] = [x, c];
  else [r, b] = [c, x];
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function drawCanvas2dFrame(
  cx: CanvasRenderingContext2D,
  motes: Mote[],
  paint: Paint,
  t: number,
  dt: number,
  w: number,
  h: number,
) {
  // Soft trailing fade — luminous ghosts, never a hard clear.
  cx.globalCompositeOperation = "source-over";
  cx.fillStyle = "rgba(3, 4, 9, 0.20)";
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = "lighter";

  const energy = 0.15 + paint.sat * 0.95;
  const radius = 0.12 + paint.val * 0.34;
  const targetHue = paint.hue / 360;
  const live = (0.25 + paint.sat * 0.75) * (0.3 + paint.val * 0.7);

  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    const dx = 0.5 - m.x;
    const dy = 0.5 - m.y;
    const d = Math.hypot(dx, dy) + 0.0001;
    const target = d - radius;
    m.vx -= (dx / d) * target * 0.9 * energy * dt;
    m.vy -= (dy / d) * target * 0.9 * energy * dt;
    // tangential swirl
    m.vx += (-dy / d) * energy * 0.2 * dt;
    m.vy += (dx / d) * energy * 0.2 * dt;
    m.vx += Math.sin(t * 0.4 + i) * 0.004 * dt * 60;
    m.vy += Math.cos(t * 0.37 + i * 1.3) * 0.004 * dt * 60;
    m.vx *= 0.93;
    m.vy *= 0.93;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.x = (m.x + 1) % 1;
    m.y = (m.y + 1) % 1;
    m.glow = Math.max(m.glow * 0.95, live);

    // ease hue toward sampled hue (shortest path on the circle)
    let dh = targetHue - m.hue;
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    m.hue = (m.hue + dh * 0.06 + 1) % 1;

    const px = m.x * w;
    const py = (1 - m.y) * h;
    const size = 1.0 + m.glow * 9;
    const a = 0.05 + m.glow * 0.8;
    const [cr, cg, cb] = hsv2rgb255(m.hue);
    const grad = cx.createRadialGradient(px, py, 0, px, py, size);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = grad;
    cx.beginPath();
    cx.arc(px, py, size, 0, Math.PI * 2);
    cx.fill();
  }
  cx.globalCompositeOperation = "source-over";
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ColorHuntPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [started, setStarted] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgpu" | "canvas2d" | "">("");
  const [camState, setCamState] = useState<"off" | "on" | "denied">("off");
  const [showNotes, setShowNotes] = useState(false);
  // The current sampled color, surfaced to the UI swatch (throttled updates).
  const [swatch, setSwatch] = useState<{ css: string; ghost: boolean } | null>(null);

  // Audio graph refs (kept off React state for rAF speed).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const chordBusRef = useRef<GainNode | null>(null);
  const droneNodesRef = useRef<{ osc: OscillatorNode[]; gain: GainNode } | null>(null);

  // Camera analysis refs.
  const camStreamRef = useRef<MediaStream | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Render + state refs.
  const rafRef = useRef<number | null>(null);
  const gpuRef = useRef<GpuCtx | null>(null);
  const motesRef = useRef<Mote[] | null>(null);
  const paintRef = useRef<Paint>({ hue: 30, sat: 0.0, val: 0.5, r: 0.5, g: 0.4, b: 0.3 });
  const lastFrameMsRef = useRef<number>(0);
  const lastChordMsRef = useRef<number>(0);
  const lastChordHueRef = useRef<number>(-999);
  const lastSwatchMsRef = useRef<number>(0);

  // ─── Cross-modal: voice a consonant chord for the current color ────────────
  const voiceChord = useCallback((paint: Paint, ghost: boolean) => {
    const ctx = audioCtxRef.current;
    const bus = chordBusRef.current;
    if (!ctx || !bus) return;

    const now = performance.now();
    // Re-voice only when the color shifts meaningfully, or every ~2.2s, so it
    // is a slow EVOLVING texture — never a loop, never a beat.
    const hueDelta = Math.min(
      Math.abs(paint.hue - lastChordHueRef.current),
      360 - Math.abs(paint.hue - lastChordHueRef.current),
    );
    const due = now - lastChordMsRef.current;
    if (hueDelta < 22 && due < 2200) return;
    if (due < 500) return; // never machine-gun
    lastChordMsRef.current = now;
    lastChordHueRef.current = paint.hue;

    const chord = hueToChord(paint.hue);
    // brightness → loudness/openness; saturation → how "present" the voicing is.
    const loud = (0.06 + paint.val * 0.16) * (0.5 + paint.sat * 0.5) * (ghost ? 0.85 : 1);
    const t0 = ctx.currentTime;
    const attack = 0.6 + (1 - paint.val) * 0.8; // dark colors swell slower
    const hold = 2.4;

    chord.freqs.forEach((hz, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? "triangle" : "sine";
      osc.frequency.value = hz;
      osc.detune.value = (idx - chord.freqs.length / 2) * 3; // gentle chorus

      const env = ctx.createGain();
      const peak = loud * (idx === 0 ? 1 : 0.6 / idx + 0.25);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(peak, t0 + attack);
      env.gain.linearRampToValueAtTime(0.0001, t0 + attack + hold);

      // Cool/high colors pan a touch wider for an airy shimmer.
      const pan = ctx.createStereoPanner();
      pan.pan.value = ((idx % 2 === 0 ? -1 : 1) * (1 - chord.warmth)) * 0.4;

      osc.connect(env);
      env.connect(pan);
      pan.connect(bus);
      osc.start(t0);
      osc.stop(t0 + attack + hold + 0.1);
    });
  }, []);

  // ─── Ghost auto-demo: slowly cycle a palette of colors with zero input ─────
  const ghostPaint = useCallback((now: number): Paint => {
    // A slow walk around the hue wheel, with gently breathing sat/val so it
    // blooms and sings on its own — wonder, not a loop.
    const hue = (now * 0.012) % 360;
    const sat = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.0006));
    const val = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(now * 0.00041 + 1.7));
    const [r, g, b] = hsv2rgb255(hue / 360);
    return { hue, sat, val, r: r / 255, g: g / 255, b: b / 255 };
  }, []);

  // ─── Read the center color of the live camera frame (analysis only) ────────
  const sampleCamera = useCallback((): ColorSample | null => {
    const video = videoRef.current;
    const canvas = sampleCanvasRef.current;
    const ctx = sampleCtxRef.current;
    if (!video || !canvas || !ctx) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;
    // Draw into a tiny offscreen canvas — we only ever read a few pixels.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return sampleCenterRegion(img, 0.34);
  }, []);

  // ─── Render + audio loop ───────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const tick = () => {
      const now = performance.now();
      const dtRaw = lastFrameMsRef.current ? (now - lastFrameMsRef.current) / 1000 : 0.016;
      const dt = Math.min(0.05, dtRaw);
      lastFrameMsRef.current = now;
      const t = now / 1000;

      // 1) Decide the live "paint": real camera color, else ghost demo.
      let ghost = true;
      const cur = paintRef.current;
      if (camStreamRef.current) {
        const s = sampleCamera();
        if (s && s.confident) {
          ghost = false;
          const [r, g, b] = [s.rgb.r / 255, s.rgb.g / 255, s.rgb.b / 255];
          // Ease toward the new reading so transitions are smooth, never jumpy.
          let dh = s.hsv.h - cur.hue;
          if (dh > 180) dh -= 360;
          if (dh < -180) dh += 360;
          cur.hue = (cur.hue + dh * 0.18 + 360) % 360;
          cur.sat += (s.hsv.s - cur.sat) * 0.18;
          cur.val += (s.hsv.v - cur.val) * 0.18;
          cur.r += (r - cur.r) * 0.18;
          cur.g += (g - cur.g) * 0.18;
          cur.b += (b - cur.b) * 0.18;
        }
      }
      if (ghost) {
        const gp = ghostPaint(now);
        cur.hue = gp.hue;
        cur.sat += (gp.sat - cur.sat) * 0.05;
        cur.val += (gp.val - cur.val) * 0.05;
        cur.r += (gp.r - cur.r) * 0.05;
        cur.g += (gp.g - cur.g) * 0.05;
        cur.b += (gp.b - cur.b) * 0.05;
      }

      // 2) Voice the chord for the current color (rate-limited, evolving).
      voiceChord(cur, ghost);

      // 3) Surface the swatch to the UI ~6×/sec (cheap, not every frame).
      if (now - lastSwatchMsRef.current > 160) {
        lastSwatchMsRef.current = now;
        setSwatch({
          css: hsvToCss(cur.hue, Math.max(0.4, cur.sat), Math.max(0.45, cur.val)),
          ghost,
        });
      }

      // 4) Render — WebGPU primary, Canvas2D fallback, same physics.
      const g = gpuRef.current;
      if (g) {
        drawGpuFrame(g, cur, t, dt);
      } else {
        const canvas = canvasRef.current;
        const cx2d = canvas?.getContext("2d");
        const motes = motesRef.current;
        if (canvas && cx2d && motes) {
          drawCanvas2dFrame(cx2d, motes, cur, t, dt, canvas.width, canvas.height);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [sampleCamera, ghostPaint, voiceChord]);

  // ─── Kids-safe audio graph + always-on soft ambient bed ────────────────────
  const buildAudio = useCallback((ctx: AudioContext) => {
    // Master safety chain: gain → lowpass(7.5k) → compressor(−10/20:1) → out.
    const master = ctx.createGain();
    master.gain.value = 0.3; // low master per kids-safe rules
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500;
    lp.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 20;
    comp.attack.value = 0.004;
    comp.release.value = 0.3;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);
    masterRef.current = master;

    // Chord voices route through their own bus into the safety chain.
    const chordBus = ctx.createGain();
    chordBus.gain.value = 0.9;
    chordBus.connect(master);
    chordBusRef.current = chordBus;

    // Always-on soft ambient bed — it never feels broken or silent.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.connect(master);
    const oscs: OscillatorNode[] = [];
    [65.41, 98.0, 130.81].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      osc.detune.value = i * 3 - 3;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(og);
      og.connect(droneGain);
      osc.start();
      oscs.push(osc);
    });
    droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);
    droneNodesRef.current = { osc: oscs, gain: droneGain };
  }, []);

  // ─── Start (inside the user gesture — iOS audio + camera unlock) ───────────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // 1) AudioContext inside the gesture.
    const Ctor =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).webkitAudioContext as typeof AudioContext);
    const ctx = new Ctor();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    buildAudio(ctx);

    // 2) Renderer: try WebGPU, fall back to Canvas2D.
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const gpu = await makeGpu(canvas);
      if (gpu) {
        gpuRef.current = gpu;
        setRendererKind("webgpu");
      } else {
        motesRef.current = makeMotes(3200);
        setRendererKind("canvas2d");
      }
    }

    // 3) Camera — rear-facing, analysis-only. Denied → ghost demo runs on.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      camStreamRef.current = stream;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute("playsinline", "");
      await video.play().catch(() => undefined);
      videoRef.current = video;

      // Tiny offscreen canvas for the color read — never displayed, never sent.
      const sc = document.createElement("canvas");
      sc.width = 96;
      sc.height = 72;
      sampleCanvasRef.current = sc;
      sampleCtxRef.current = sc.getContext("2d", { willReadFrequently: true });
      setCamState("on");
    } catch {
      setCamState("denied");
    }

    // 4) Go. Loop runs regardless of camera (ghost demo guarantees life).
    runLoop();
  }, [started, buildAudio, runLoop]);

  // ─── Full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const stream = camStreamRef.current;
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      const drone = droneNodesRef.current;
      if (drone) {
        try {
          drone.osc.forEach((o) => o.stop());
        } catch {
          /* already stopped */
        }
      }
      const g = gpuRef.current;
      if (g) {
        try {
          g.particleBuf.destroy();
          g.uniformBuf.destroy();
          g.device.destroy();
        } catch {
          /* already gone */
        }
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#03040a] font-mono text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Reticle — where the kid is "looking" for color. Pure decoration. */}
      {started && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="h-28 w-28 rounded-full border-2 border-border shadow-[0_0_30px_rgba(255,255,255,0.15)]"
            style={{
              boxShadow: swatch ? `0 0 60px 6px ${swatch.css}` : undefined,
            }}
          />
        </div>
      )}

      {/* Title — labeling, not gating. Always readable. */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow">
          Color Hunt
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Point at the colors in your room — red sings warm and low, sky-blue shimmers bright and high.
        </p>
      </header>

      {/* Start affordance — big, friendly, holds the iOS audio + camera unlock. */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleStart}
            className="flex min-h-[44px] flex-col items-center gap-2 rounded-3xl bg-muted px-10 py-8 text-center ring-1 ring-border transition hover:bg-accent"
          >
            <span className="text-5xl" aria-hidden="true">
              🎨
            </span>
            <span className="text-xl font-semibold text-foreground">Start the hunt</span>
            <span className="text-base text-muted-foreground">Tap, then point at a color</span>
          </button>
        </div>
      )}

      {/* Live color swatch — shows the kid which color they are "painting" with. */}
      {started && swatch && (
        <div className="pointer-events-none absolute left-1/2 top-40 z-10 -translate-x-1/2">
          <div
            className="h-16 w-16 rounded-2xl ring-2 ring-border transition-colors"
            style={{ backgroundColor: swatch.css }}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Status strip — small, readable, never blocks play. */}
      {started && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-1 px-4 pb-6 text-center">
          {camState === "denied" && (
            <p className="text-base text-violet-300">
              No camera — Color Hunt keeps painting and singing on its own. Tap allow to hunt real colors.
            </p>
          )}
          <p className="text-base text-muted-foreground">
            {rendererKind === "webgpu"
              ? "Blooming with WebGPU"
              : rendererKind === "canvas2d"
                ? "Blooming with Canvas"
                : "Waking the colors…"}
            {camState === "on" ? " · seeing your room" : " · auto-painting"}
          </p>
        </div>
      )}

      {/* "Design notes" — corner toggle, lightweight. */}
      <div className="absolute right-3 top-3 z-30">
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent"
        >
          {showNotes ? "Close notes" : "Design notes"}
        </button>
      </div>

      {showNotes && (
        <div className="absolute right-3 top-20 z-30 max-h-[70vh] w-[min(92vw,28rem)] overflow-auto rounded-2xl bg-black/80 p-5 text-base leading-relaxed text-muted-foreground ring-1 ring-border backdrop-blur">
          <h2 className="mb-2 text-xl font-semibold text-foreground">Design notes</h2>
          <p className="mb-3 text-foreground">
            One question: what if a 4-year-old could point the tablet at the COLORS in their room
            and PAINT music with what they see?
          </p>
          <p className="mb-3">
            <span className="text-foreground">Input</span> · camera as a color sampler — we average
            the RGB of the center reticle each frame (analysis-only, never recorded or sent).{" "}
            <span className="text-foreground">Technique</span> · cross-modal color → harmony: HUE
            picks a consonant pentatonic chord whose register climbs from warm-low (red) to
            bright-high (cyan/blue); SATURATION drives particle energy; BRIGHTNESS drives loudness
            and the openness of the bloom. <span className="text-foreground">Output</span> · a WebGPU
            compute-shader particle bloom (Canvas2D fallback, same physics).{" "}
            <span className="text-foreground">Vibe</span> · wonder &amp; discovery — a slow evolving
            texture, never a loop or a beat.
          </p>
          <p>
            Lineage: Scriabin&apos;s <em>clavier à lumières</em> and Kandinsky&apos;s color-tone
            theory (color IS a tone color); Refik Anadol&apos;s luminous particle fields. Full
            notes live in <span className="text-foreground">README.md</span> in this folder.
          </p>
        </div>
      )}
    </main>
  );
}
