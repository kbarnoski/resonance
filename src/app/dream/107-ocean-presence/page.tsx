"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── WGSL ──────────────────────────────────────────────────────────────────────

const VERT_WGSL = `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,6>(
    vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),
    vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), vec2f(xy.x*.5+.5,.5-xy.y*.5));
}`;

// 12 × f32 = 48 bytes (three 16-byte rows)
const FLUID_WGSL = `
struct U {
  time: f32, mx: f32, my: f32, mvx: f32,
  mvy: f32, mspd: f32, decay: f32, rX: f32,
  rY: f32, p0: f32, p1: f32, p2: f32,
}
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

fn hashF(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn smoothNoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hashF(i),            hashF(i + vec2f(1, 0)), s.x),
    mix(hashF(i + vec2f(0,1)), hashF(i + vec2f(1, 1)), s.x),
    s.y);
}

fn curlVelocity(uv: vec2f) -> vec2f {
  let e  = 1.8 / min(u.rX, u.rY);
  let q  = uv * 2.6 + vec2f(u.time * 0.13, u.time * 0.09);
  let n0 = smoothNoise(q);
  let nx = smoothNoise(q + vec2f(e, 0.0));
  let ny = smoothNoise(q + vec2f(0.0, e));
  return vec2f((ny - n0) / e, -(nx - n0) / e) * 0.00042;
}

fn presenceForce(uv: vec2f) -> vec2f {
  let d    = uv - vec2f(u.mx, u.my);
  let l    = max(length(d), 0.001);
  let fall = exp(-dot(d, d) * 110.0);
  let tang = vec2f(-d.y, d.x) / l * u.mspd * 0.007 * fall;
  let drag = vec2f(u.mvx, u.mvy) * fall * 0.004;
  return tang + drag;
}

@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vel  = curlVelocity(uv) + presenceForce(uv);
  var dye  = textureSample(tex, smp, fract(uv - vel)) * u.decay;
  let dist = length(uv - vec2f(u.mx, u.my));
  let inj  = u.mspd * exp(-dist * dist * 260.0) * 2.5;
  let tSpd = clamp(u.mspd * 3.0, 0.0, 1.0);
  // slow=cyan/teal, fast=violet/indigo
  let col  = vec3f(mix(0.05, 0.60, tSpd), mix(0.82, 0.18, tSpd), mix(0.96, 1.00, tSpd));
  return clamp(dye + vec4f(col * inj, inj * 0.75), vec4f(0.0), vec4f(2.0));
}`;

const DISP_WGSL = `
struct U {
  time: f32, mx: f32, my: f32, mvx: f32,
  mvy: f32, mspd: f32, decay: f32, rX: f32,
  rY: f32, p0: f32, p1: f32, p2: f32,
}
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dye  = textureSample(tex, smp, uv);
  let lum  = clamp(length(dye.rgb) * 0.65, 0.0, 1.0);
  let col  = dye.rgb * lum;
  let d    = length(uv - vec2f(u.mx, u.my));
  let pulse = 0.40 + 0.10 * sin(u.time * 1.8);
  let glow  = vec3f(0.55, 0.25, 0.95) * exp(-d * d * 2200.0) * pulse;
  let ring  = vec3f(0.80, 0.70, 1.00) * exp(-pow(d - 0.014, 2.0) * 7000.0) * 0.32;
  return vec4f(col + glow + ring, 1.0);
}`;

// ── Component ──────────────────────────────────────────────────────────────────

type Phase = "start" | "running";

export default function OceanPresencePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("start");
  const [gpuErr, setGpuErr] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let alive = true;
    let raf = 0;

    // ── Resize canvas to viewport ────────────────────────────────────────────
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // ── Audio ────────────────────────────────────────────────────────────────
    const ac = new AudioContext();

    // Ambient ocean drone: two detuned sines → lowpass
    const droneA = ac.createOscillator();
    const droneB = ac.createOscillator();
    const droneFilt = ac.createBiquadFilter();
    const droneGain = ac.createGain();
    droneA.type = "sine"; droneA.frequency.value = 110;
    droneB.type = "sine"; droneB.frequency.value = 110.6;
    droneFilt.type = "lowpass"; droneFilt.frequency.value = 320;
    droneGain.gain.value = 0.035;
    droneA.connect(droneFilt); droneB.connect(droneFilt);
    droneFilt.connect(droneGain); droneGain.connect(ac.destination);
    droneA.start(); droneB.start();

    // Fluid tone: speed → pitch + gain
    const fluidOsc = ac.createOscillator();
    const fluidGain = ac.createGain();
    fluidOsc.type = "sine";
    fluidOsc.frequency.value = 220;
    fluidGain.gain.value = 0;
    fluidOsc.connect(fluidGain); fluidGain.connect(ac.destination);
    fluidOsc.start();

    // ── Cursor tracking ──────────────────────────────────────────────────────
    let mx = 0.5, my = 0.5, mvx = 0.0, mvy = 0.0, smoothSpd = 0;
    let prevMx = 0.5, prevMy = 0.5;

    const applyMove = (nx: number, ny: number) => {
      mvx = nx - prevMx;
      mvy = ny - prevMy;
      const rawSpd = Math.sqrt(mvx * mvx + mvy * mvy) * 60;
      smoothSpd = smoothSpd * 0.78 + Math.min(rawSpd, 1.2) * 0.22;
      mx = nx; my = ny; prevMx = nx; prevMy = ny;
    };

    const onMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      applyMove((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const onTouchMove = (e: TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      applyMove((touch.clientX - r.left) / r.width, (touch.clientY - r.top) / r.height);
    };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });

    // ── WebGPU ───────────────────────────────────────────────────────────────
    const SIM = 512;

    async function runGPU() {
      if (!canvas) return;
      if (!("gpu" in navigator)) {
        setGpuErr("WebGPU unavailable — try Chrome or Edge.");
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) { setGpuErr("No WebGPU adapter found."); return; }
      const device = await adapter.requestDevice();
      if (!alive) return;

      const gpuCtxMaybe = canvas.getContext("webgpu") as GPUCanvasContext | null;
      if (!gpuCtxMaybe) { setGpuErr("Cannot acquire WebGPU canvas context."); return; }
      const gpuCtx: GPUCanvasContext = gpuCtxMaybe;
      const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
      gpuCtx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

      // Simulation textures (ping-pong)
      const makeTex = () => device.createTexture({
        size: [SIM, SIM],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      const texPair = [makeTex(), makeTex()];
      const viewPair = texPair.map(t => t.createView());

      const sampler = device.createSampler({
        addressModeU: "repeat", addressModeV: "repeat",
        magFilter: "linear", minFilter: "linear",
      });

      // Uniform buffer (48 bytes = 12 × f32)
      const uniBuf = device.createBuffer({
        size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const vertMod = device.createShaderModule({ code: VERT_WGSL });

      const fluidPipe = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: vertMod, entryPoint: "vs" },
        fragment: {
          module: device.createShaderModule({ code: FLUID_WGSL }),
          entryPoint: "fs",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      });

      const dispPipe = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: vertMod, entryPoint: "vs" },
        fragment: {
          module: device.createShaderModule({ code: DISP_WGSL }),
          entryPoint: "fs",
          targets: [{ format: canvasFmt }],
        },
        primitive: { topology: "triangle-list" },
      });

      // fluidBG[i] / dispBG[i] reads from texPair[i]
      const fluidBG = viewPair.map(v => device.createBindGroup({
        layout: fluidPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniBuf } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: v },
        ],
      }));
      const dispBG = viewPair.map(v => device.createBindGroup({
        layout: dispPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniBuf } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: v },
        ],
      }));

      const t0 = performance.now();
      let frame = 0;

      function renderFrame() {
        if (!alive) return;
        const t = (performance.now() - t0) / 1000;

        // Decay speed toward zero when cursor is still
        smoothSpd = Math.max(0, smoothSpd * 0.94);
        const spd = Math.min(smoothSpd, 1);

        // Audio: pitch and gain track cursor speed
        fluidOsc.frequency.setTargetAtTime(130 + spd * 500, ac.currentTime, 0.08);
        fluidGain.gain.setTargetAtTime(spd * 0.15, ac.currentTime, 0.05);
        droneFilt.frequency.setTargetAtTime(160 + spd * 700, ac.currentTime, 0.30);

        // Upload uniforms
        device.queue.writeBuffer(uniBuf, 0, new Float32Array([
          t, mx, my, mvx, mvy, spd, 0.992, SIM, SIM, 0, 0, 0,
        ]));

        const src = frame & 1;
        const dst = 1 - src;
        const enc = device.createCommandEncoder();

        // Fluid simulation pass: src → dst
        const fp = enc.beginRenderPass({
          colorAttachments: [{
            view: viewPair[dst],
            loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store",
          }],
        });
        fp.setPipeline(fluidPipe);
        fp.setBindGroup(0, fluidBG[src]);
        fp.draw(6);
        fp.end();

        // Display pass: dst → canvas
        const dp = enc.beginRenderPass({
          colorAttachments: [{
            view: gpuCtx.getCurrentTexture().createView(),
            loadOp: "clear", clearValue: [0, 0, 0, 1], storeOp: "store",
          }],
        });
        dp.setPipeline(dispPipe);
        dp.setBindGroup(0, dispBG[dst]);
        dp.draw(6);
        dp.end();

        device.queue.submit([enc.finish()]);
        frame++;
        raf = requestAnimationFrame(renderFrame);
      }

      renderFrame();
    }

    runGPU().catch(e => setGpuErr(String(e)));

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      droneA.stop(); droneB.stop(); fluidOsc.stop();
      ac.close();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [phase]);

  // ── Error fallback ─────────────────────────────────────────────────────────
  if (gpuErr) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-center px-6 gap-5">
        <p className="text-base text-violet-300">WebGPU unavailable: {gpuErr}</p>
        <p className="text-base text-muted-foreground">
          Try Chrome or Edge on a WebGPU-capable device.{" "}
          The{" "}
          <Link href="/dream/84-wave-fluid" className="text-violet-300 underline">
            wave-fluid
          </Link>{" "}
          prototype uses the same ocean engine with audio input instead.
        </p>
        <Link href="/dream" className="text-sm text-muted-foreground underline mt-1">
          ← Dream lab
        </Link>
      </div>
    );
  }

  // ── Start screen ───────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-8 px-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-xs">
          <h1 className="text-3xl font-serif text-foreground">Ocean Presence</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Move your cursor through the ocean.
            <br />
            It sings back.
          </p>
          <p className="text-sm text-muted-foreground">
            No mic needed — the fluid is the instrument.
            <br />
            Headphones recommended.
          </p>
        </div>
        <button
          onClick={() => setPhase("running")}
          className="bg-violet-600 hover:bg-violet-500 text-foreground text-lg font-medium px-8 py-3 rounded-xl min-h-[52px] transition-colors"
        >
          Enter the ocean
        </button>
        <Link href="/dream" className="text-sm text-muted-foreground underline">
          ← Dream lab
        </Link>
      </div>
    );
  }

  // ── Running ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: "none" }}
      />
      <Link
        href="/dream"
        className="absolute top-4 left-4 text-sm text-muted-foreground hover:text-foreground transition-colors z-10"
      >
        ← dream lab
      </Link>
      <p className="absolute bottom-4 right-4 text-xs text-muted-foreground/70 select-none pointer-events-none">
        move your cursor · it sings
      </p>
    </div>
  );
}
