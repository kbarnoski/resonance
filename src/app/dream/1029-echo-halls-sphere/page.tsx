"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  Vec3,
  cross,
  facedRoomIndex,
  facingWeights,
  chordFreqs,
  forwardFromYawPitch,
  normalize,
  roomSpherePositions,
  scale as vscale,
} from "./geometry";

// ════════════════════════════════════════════════════════════════════════════
// Echo Halls — Sphere (1029)
//
// Walk through a SPHERE of six harmonic rooms and find a chord by EAR. Each room
// is a sustained just/equal-tuned drone chord placed on a full sphere around you
// (some above, some below, some behind). You are the WebAudio AudioListener; each
// room owns its own HRTF PannerNode, and the listener orientation is rewritten
// every frame from your first-person camera, so the binaural field re-pans as you
// look around. The room you face blooms loudest.
//
// THE RESONATING BODY: each active room contains a living particle field. The
// preferred tier advects particles on a WebGPU compute shader (curl-noise flow +
// attraction to the room centre), reduces their kinetic energy with an atomic,
// reads it back non-blockingly, and feeds THAT measured energy into a shimmer
// layer's gain — the sim genuinely drives the sound. Fallbacks: CPU particles on
// WebGL2, then Canvas2D. The audio<->viz coupling holds in every tier.
//
// Self-contained: all audio/viz/UI live in this folder. No three.js, no new deps.
// Pure math + harmony lives in geometry.ts (verified by geometry.test.ts).
// ════════════════════════════════════════════════════════════════════════════

// ── Minimal local WebGPU typings (avoid adding @webgpu/types) ────────────────
// Narrow casts only at the navigator.gpu boundary.
interface NavGPULike {
  gpu?: {
    requestAdapter: (o?: unknown) => Promise<GPUAdapterLike | null>;
    getPreferredCanvasFormat: () => string;
  };
}
interface GPUAdapterLike {
  requestDevice: (o?: unknown) => Promise<GPUDeviceLike>;
}
interface GPUDeviceLike {
  createBuffer: (d: unknown) => GPUBufferLike;
  createShaderModule: (d: unknown) => unknown;
  createComputePipeline: (d: unknown) => GPUPipelineLike;
  createBindGroup: (d: unknown) => unknown;
  createCommandEncoder: () => GPUEncoderLike;
  queue: {
    writeBuffer: (b: GPUBufferLike, off: number, data: ArrayBufferView) => void;
    submit: (c: unknown[]) => void;
  };
  destroy?: () => void;
}
interface GPUBufferLike {
  mapAsync: (mode: number, off?: number, size?: number) => Promise<void>;
  getMappedRange: (off?: number, size?: number) => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
}
interface GPUPipelineLike {
  getBindGroupLayout: (i: number) => unknown;
}
interface GPUEncoderLike {
  beginComputePass: () => {
    setPipeline: (p: GPUPipelineLike) => void;
    setBindGroup: (i: number, g: unknown) => void;
    dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
    end: () => void;
  };
  copyBufferToBuffer: (a: GPUBufferLike, ao: number, b: GPUBufferLike, bo: number, n: number) => void;
  finish: () => unknown;
}

type Tier = "webgpu" | "webgl2" | "canvas2d" | "none";

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE — one HRTF panner per room + per-room shimmer driven by the sim
// ─────────────────────────────────────────────────────────────────────────────

interface RoomAudio {
  wet: GainNode; // facing-driven bloom
  shimmerGain: GainNode; // driven by the resonating body's measured energy
}

class HallsAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  lowpass: BiquadFilterNode | null = null;
  panners: PannerNode[] = [];
  rooms: RoomAudio[] = [];
  oscs: OscillatorNode[] = [];
  ok = false;

  start(rooms: Room[]): boolean {
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6000; // nothing shrill
      lp.Q.value = 0.3;
      master.connect(lp).connect(ctx.destination);
      this.master = master;
      this.lowpass = lp;

      rooms.forEach((room) => {
        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1.5;
        panner.maxDistance = 30;
        panner.rolloffFactor = 0.6;
        const pos = vscale(room.dir, room.radius);
        // setPosition is widely supported and the safe cross-browser path.
        if (panner.positionX) {
          panner.positionX.value = pos[0];
          panner.positionY.value = pos[1];
          panner.positionZ.value = pos[2];
        } else {
          panner.setPosition(pos[0], pos[1], pos[2]);
        }

        const wet = ctx.createGain();
        wet.gain.value = 0.12;

        // The drone: three octave-folded chord tones, each a soft saw through a
        // gentle per-tone gain, plus a slow detuned beat partner for warmth.
        const freqs = chordFreqs(room.pcs);
        const chordBus = ctx.createGain();
        chordBus.gain.value = 0.5;
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = f;
          o.detune.value = (i - 1) * 4;
          const g = ctx.createGain();
          g.gain.value = 0.22 / freqs.length + 0.06;
          o.connect(g).connect(chordBus);
          o.start();
          this.oscs.push(o);

          const o2 = ctx.createOscillator();
          o2.type = "triangle";
          o2.frequency.value = f;
          o2.detune.value = (i - 1) * 4 + 6; // slow beating
          const g2 = ctx.createGain();
          g2.gain.value = 0.12 / freqs.length;
          o2.connect(g2).connect(chordBus);
          o2.start();
          this.oscs.push(o2);
        });

        // Shimmer layer: a high partial of the root, driven by the sim energy.
        const shimmer = ctx.createOscillator();
        shimmer.type = "sine";
        shimmer.frequency.value = freqs[0] * 4; // 2 octaves up, still under LP
        const shimmerGain = ctx.createGain();
        shimmerGain.gain.value = 0.0001;
        shimmer.connect(shimmerGain).connect(chordBus);
        shimmer.start();
        this.oscs.push(shimmer);

        chordBus.connect(wet).connect(panner).connect(master);

        this.panners.push(panner);
        this.rooms.push({ wet, shimmerGain });
      });

      // Fade master in smoothly.
      master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.6);
      this.ok = true;
      return true;
    } catch {
      this.ok = false;
      return false;
    }
  }

  /** Rewrite the listener orientation from the camera, every frame. */
  setListener(forward: Vec3, up: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    if (l.forwardX) {
      l.forwardX.setValueAtTime(forward[0], t);
      l.forwardY.setValueAtTime(forward[1], t);
      l.forwardZ.setValueAtTime(forward[2], t);
      l.upX.setValueAtTime(up[0], t);
      l.upY.setValueAtTime(up[1], t);
      l.upZ.setValueAtTime(up[2], t);
    } else {
      // Older Safari/Firefox path.
      l.setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
    }
  }

  /** Bloom the faced room, recede others — no clicks (setTargetAtTime). */
  applyFacing(weights: number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.rooms.forEach((r, i) => {
      const target = 0.06 + weights[i] * 0.95;
      r.wet.gain.setTargetAtTime(target, t, 0.12);
    });
  }

  /** The sim's measured energy drives the active room's shimmer gain. */
  applyShimmer(roomIndex: number, energy01: number): void {
    const ctx = this.ctx;
    if (!ctx || roomIndex < 0) return;
    const t = ctx.currentTime;
    this.rooms.forEach((r, i) => {
      const target = i === roomIndex ? 0.0001 + energy01 * 0.5 : 0.0001;
      r.shimmerGain.gain.setTargetAtTime(target, t, 0.18);
    });
  }

  stop(): void {
    try {
      this.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      });
      this.panners.forEach((p) => p.disconnect());
      this.rooms.forEach((r) => {
        r.wet.disconnect();
        r.shimmerGain.disconnect();
      });
      this.lowpass?.disconnect();
      this.master?.disconnect();
      this.ctx?.close();
    } catch {
      /* best effort teardown */
    }
    this.oscs = [];
    this.panners = [];
    this.rooms = [];
    this.ctx = null;
    this.master = null;
    this.lowpass = null;
    this.ok = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RESONATING BODY — particle field, three tiers, all expose measured energy
// ─────────────────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 4096;

interface Body {
  tier: Tier;
  /** Advance the sim toward `targetCenter` with a `bloom` 0..1 fill amount.
   *  Returns the latest measured aggregate energy in 0..1 (or null if pending). */
  step(targetCenter: Vec3, bloom: number, dt: number): number | null;
  /** Draw the current particle state into the visual buffer for room `i`. */
  // (rendering is handled by the page's WebGL scene; the Body owns positions)
  positions(): Float32Array;
  dispose(): void;
}

// curl-of-value-noise flow used by the CPU tier and mirrored in WGSL.
function hash3(x: number, y: number, z: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  h -= Math.floor(h);
  return h;
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }
  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w) * 2 - 1;
}
function curl(x: number, y: number, z: number): Vec3 {
  const e = 0.1;
  const dydz = noise3(x, y + e, z) - noise3(x, y - e, z);
  const dzdy = noise3(x, y, z + e) - noise3(x, y, z - e);
  const dzdx = noise3(x + e, y, z) - noise3(x - e, y, z);
  const dxdz = noise3(x, y, z + e) - noise3(x, y, z - e);
  const dxdy = noise3(x, y + e, z) - noise3(x, y - e, z);
  const dydx = noise3(x + e, y, z) - noise3(x - e, y, z);
  return [(dydz - dzdy) / (2 * e), (dzdx - dxdz) / (2 * e), (dxdy - dydx) / (2 * e)];
}

class CpuBody implements Body {
  tier: Tier;
  pos: Float32Array;
  vel: Float32Array;
  n: number;
  constructor(tier: Tier, n = PARTICLE_COUNT) {
    this.tier = tier;
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // start as a loose shell
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 2.2 * Math.cbrt(Math.random());
      const s = Math.sqrt(1 - u * u);
      this.pos[i * 3] = r * s * Math.cos(th);
      this.pos[i * 3 + 1] = r * u;
      this.pos[i * 3 + 2] = r * s * Math.sin(th);
    }
  }
  step(target: Vec3, bloom: number, dt: number): number {
    const n = this.n;
    const t = performance.now() * 0.0002;
    let energy = 0;
    const flowScale = 0.18 + bloom * 0.5;
    const attract = 0.6 + bloom * 1.6;
    for (let i = 0; i < n; i++) {
      const px = this.pos[i * 3];
      const py = this.pos[i * 3 + 1];
      const pz = this.pos[i * 3 + 2];
      const c = curl(px * 0.5 + t, py * 0.5, pz * 0.5 - t);
      // attraction toward the local room centre (origin in local space), with a
      // small directional bias from the room's sphere direction so each room's
      // body leans a different way.
      const cx = target[0] * 0.25;
      const cy = target[1] * 0.25;
      const cz = target[2] * 0.25;
      const ax = (cx - px) * attract;
      const ay = (cy - py) * attract;
      const az = (cz - pz) * attract;
      let vx = this.vel[i * 3] + (c[0] * flowScale + ax) * dt;
      let vy = this.vel[i * 3 + 1] + (c[1] * flowScale + ay) * dt;
      let vz = this.vel[i * 3 + 2] + (c[2] * flowScale + az) * dt;
      vx *= 0.92;
      vy *= 0.92;
      vz *= 0.92;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      this.pos[i * 3] = px + vx * dt;
      this.pos[i * 3 + 1] = py + vy * dt;
      this.pos[i * 3 + 2] = pz + vz * dt;
      energy += vx * vx + vy * vy + vz * vz;
    }
    // normalise kinetic energy into 0..1
    const e = energy / n;
    return Math.min(1, e * 2.2);
  }
  positions(): Float32Array {
    return this.pos;
  }
  dispose(): void {
    /* nothing to free */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REACT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ROOMS = roomSpherePositions();

export default function EchoHallsSphere() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [tier, setTier] = useState<Tier>("none");
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [orientStatus, setOrientStatus] = useState<"none" | "active" | "denied" | "unavailable">(
    "unavailable",
  );
  const [facedName, setFacedName] = useState<string>("C major (I)");
  const [energy, setEnergy] = useState(0);
  const [autoTour, setAutoTour] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // mutable engine refs
  const audioRef = useRef<HallsAudio | null>(null);
  const bodyRef = useRef<Body | null>(null);
  const rafRef = useRef<number>(0);
  const camRef = useRef({ yaw: 0, pitch: 0 });
  const lastInputRef = useRef(performance.now());
  const draggingRef = useRef(false);
  const lastPtrRef = useRef<{ x: number; y: number } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const driftRef = useRef(0); // forward-drift accumulator (affects bloom feel)

  // ── Build the resonating body at the best available tier ───────────────────
  const buildBody = useCallback(async (): Promise<Body> => {
    // WebGPU preferred.
    if ("gpu" in navigator) {
      try {
        const nav = navigator as unknown as NavGPULike;
        const adapter = await nav.gpu!.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice();
          const gpuBody = await makeGpuBody(device);
          if (gpuBody) return gpuBody;
        }
      } catch {
        /* fall through */
      }
    }
    // WebGL2 just gives us a render target; the sim still runs on CPU here but
    // we mark the tier as webgl2 because the point cloud is GPU-rendered.
    const c = document.createElement("canvas");
    if (c.getContext("webgl2")) return new CpuBody("webgl2");
    if (c.getContext("2d")) return new CpuBody("canvas2d");
    return new CpuBody("canvas2d");
  }, []);

  // ── Render loop ────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2");
    const ctx2d = gl ? null : canvas.getContext("2d");
    const scene = gl ? makeGlScene(gl) : null;

    let prev = performance.now();
    const energySmooth = { v: 0 };

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      // resize backing store
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // ── input / auto-tour → camera ──
      const idle = now - lastInputRef.current > 2000;
      setAutoTour(idle);
      const cam = camRef.current;
      if (idle) {
        // slow orbit between a LOW room (ii, below) and a HIGH room (IV, above)
        const ph = now * 0.00018;
        cam.yaw = Math.sin(ph) * 2.4 + 0.6;
        cam.pitch = Math.sin(ph * 0.7) * 0.85; // sweeps up and down → elevation cue
      } else {
        // keyboard drift toward faced room → bumps bloom
        const k = keysRef.current;
        let drift = 0;
        if (k.has("w") || k.has("arrowup")) drift += 1;
        if (k.has("s") || k.has("arrowdown")) drift -= 1;
        if (k.has("a") || k.has("arrowleft")) cam.yaw -= dt * 1.1;
        if (k.has("d") || k.has("arrowright")) cam.yaw += dt * 1.1;
        driftRef.current = Math.max(0, Math.min(1, driftRef.current + drift * dt * 1.5 - dt * 0.4));
      }
      cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch));

      const forward = forwardFromYawPitch(cam.yaw, cam.pitch);
      const worldUp: Vec3 = [0, 1, 0];
      const right = normalize(cross(forward, worldUp));
      const up = normalize(cross(right, forward));

      // ── audio: listener + facing mix ──
      const audio = audioRef.current;
      const weights = facingWeights(forward, ROOMS);
      const faced = facedRoomIndex(forward, ROOMS);
      if (audio?.ok) {
        audio.setListener(forward, up);
        audio.applyFacing(weights);
      }

      // ── resonating body: advance + measure → drives shimmer ──
      const bloom = Math.min(1, weights[faced] + driftRef.current * 0.5);
      const body = bodyRef.current;
      let measured: number | null = null;
      if (body) {
        measured = body.step(ROOMS[faced].dir, bloom, dt);
      }
      if (measured != null) {
        energySmooth.v += (measured - energySmooth.v) * 0.15;
        if (audio?.ok) audio.applyShimmer(faced, energySmooth.v * bloom);
      }

      // ── render ──
      const room = ROOMS[faced];
      if (gl && scene) {
        scene.draw(canvas.width, canvas.height, forward, right, up, ROOMS, faced, weights, body, energySmooth.v);
      } else if (ctx2d) {
        drawCanvas2d(ctx2d, canvas.width, canvas.height, forward, right, up, ROOMS, faced, weights, energySmooth.v);
      }

      // ── UI (throttled via state, cheap enough at 60fps for these scalars) ──
      setFacedName(room.name);
      setEnergy(energySmooth.v);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── Start (user gesture) ──────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setStarted(true);
    lastInputRef.current = performance.now();

    // audio
    const audio = new HallsAudio();
    const ok = audio.start([...ROOMS]);
    audioRef.current = audio;
    if (!ok) setAudioErr("Audio could not start on this device — the visuals still play.");
    try {
      await audio.ctx?.resume();
    } catch {
      /* ignore */
    }

    // resonating body
    const body = await buildBody();
    bodyRef.current = body;
    setTier(body.tier);

    // iOS device-orientation permission (gated behind this tap)
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
      }
    ).DeviceOrientationEvent;
    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      if (DOE && typeof DOE.requestPermission === "function") {
        try {
          const res = await DOE.requestPermission();
          if (res === "granted") {
            attachOrientation();
            setOrientStatus("active");
          } else {
            setOrientStatus("denied");
          }
        } catch {
          setOrientStatus("denied");
        }
      } else {
        attachOrientation();
        setOrientStatus("active");
      }
    } else {
      setOrientStatus("unavailable");
    }

    startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildBody, startLoop]);

  // device orientation handler (kept stable via ref-based camera)
  const orientHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const attachOrientation = useCallback(() => {
    const h = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      lastInputRef.current = performance.now();
      // map phone alpha (compass) → yaw, beta (front-back tilt) → pitch
      camRef.current.yaw = (-e.alpha * Math.PI) / 180;
      camRef.current.pitch = Math.max(-1.4, Math.min(1.4, ((e.beta - 90) * Math.PI) / 180));
    };
    orientHandlerRef.current = h;
    window.addEventListener("deviceorientation", h);
  }, []);

  // ── pointer + keyboard listeners ──────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      lastInputRef.current = performance.now();
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || !lastPtrRef.current) return;
      const dx = e.clientX - lastPtrRef.current.x;
      const dy = e.clientY - lastPtrRef.current.y;
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      camRef.current.yaw += dx * 0.005;
      camRef.current.pitch = Math.max(-1.45, Math.min(1.45, camRef.current.pitch - dy * 0.005));
      lastInputRef.current = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      lastPtrRef.current = null;
      canvas.releasePointerCapture?.(e.pointerId);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      lastInputRef.current = performance.now();
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [started]);

  // ── teardown on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (orientHandlerRef.current)
        window.removeEventListener("deviceorientation", orientHandlerRef.current);
      bodyRef.current?.dispose();
      audioRef.current?.stop();
    };
  }, []);

  const tierLabel: Record<Tier, string> = {
    webgpu: "WebGPU compute body",
    webgl2: "WebGL2 + CPU particle body",
    canvas2d: "Canvas2D fallback body",
    none: "—",
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />

      {/* reticle + horizon overlay (drawn over canvas) */}
      {started && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-10 w-10">
            <div className="absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 bg-muted" />
            <div className="absolute left-1/2 top-1/2 h-6 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-muted" />
          </div>
        </div>
      )}

      {/* HUD */}
      {started && (
        <div className="pointer-events-none absolute left-0 top-0 flex flex-col gap-1 p-4 font-mono">
          <div className="text-xl text-foreground">
            facing <span className="text-violet-300">{facedName}</span>
          </div>
          <div className="text-base text-muted-foreground">
            body energy{" "}
            <span className="text-violet-300/95">{(energy * 100).toFixed(0)}%</span>
            {" "}→ shimmer
          </div>
          <div className="text-base text-muted-foreground">{tierLabel[tier]}</div>
          {autoTour && (
            <div className="text-base text-violet-300/95">auto-tour — move mouse / press a key to steer</div>
          )}
          {orientStatus === "active" && (
            <div className="text-base text-violet-300/95">turn your phone to look around</div>
          )}
          {orientStatus === "denied" && (
            <div className="text-base text-violet-300/95">motion denied — pointer-look still works</div>
          )}
        </div>
      )}

      {audioErr && (
        <div className="absolute bottom-4 left-4 right-4 rounded-md bg-black/70 p-3 text-base text-violet-300">
          {audioErr}
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-black via-black/95 to-violet-950/40 px-6 text-center">
          <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">Echo Halls — Sphere</h1>
          <p className="max-w-xl text-base text-foreground sm:text-lg">
            Six harmonic rooms float around you on a full sphere — some above, some below, some
            behind. Close your eyes and turn toward the chord you want. The room you face blooms,
            its particle body comes alive, and that living motion drives the shimmer you hear.
          </p>
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-lg font-medium text-foreground shadow-lg transition hover:bg-violet-400"
          >
            Enter the halls
          </button>
          <p className="text-base text-muted-foreground">
            drag to look · WASD / arrows to drift · turn your phone if it asks
          </p>
        </div>
      )}

      {/* Design notes affordance */}
      {started && (
        <>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="absolute bottom-4 right-4 min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur transition hover:bg-accent"
          >
            {showNotes ? "close" : "design notes"}
          </button>
          {showNotes && (
            <div className="absolute bottom-20 right-4 max-h-[60dvh] w-[min(92vw,28rem)] overflow-auto rounded-lg bg-black/85 p-4 text-base text-foreground backdrop-blur">
              <p className="mb-2 text-lg text-foreground">How it works</p>
              <p className="mb-2">
                You are the Web Audio <span className="text-violet-300">AudioListener</span>. Each
                room owns an HRTF <span className="text-violet-300">PannerNode</span> at its 3D
                position; the listener orientation is rewritten every frame from your camera, so the
                binaural field re-pans as you look — find the chord by ear.
              </p>
              <p className="mb-2">
                The room you face blooms loudest (no clicks — gains ramp). Its{" "}
                <span className="text-violet-300/95">particle body</span> (WebGPU compute when
                available, else CPU) advects on a curl-noise flow and attracts toward the room
                centre; the measured kinetic energy drives that room&apos;s shimmer gain — the sim
                genuinely sings.
              </p>
              <p className="text-muted-foreground">
                Refs: Cardiff, The Forty Part Motet · Spatial Orchestra (arXiv:2510.23848) ·
                full-sphere localisation (arXiv:2606.24367) · Sonic4D (arXiv:2506.15759).
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU compute body — curl-noise advection + atomic energy reduction
// ─────────────────────────────────────────────────────────────────────────────

const WGSL = /* wgsl */ `
struct Params { center: vec3<f32>, bloom: f32, dt: f32, time: f32, _p0: f32, _p1: f32 };
@group(0) @binding(0) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> vel: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> energy: atomic<u32>;

fn hash3(p: vec3<f32>) -> f32 {
  var h = sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453;
  return fract(h);
}
fn noise3(p: vec3<f32>) -> f32 {
  let i = floor(p); let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  let c000 = hash3(i + vec3<f32>(0.0,0.0,0.0));
  let c100 = hash3(i + vec3<f32>(1.0,0.0,0.0));
  let c010 = hash3(i + vec3<f32>(0.0,1.0,0.0));
  let c110 = hash3(i + vec3<f32>(1.0,1.0,0.0));
  let c001 = hash3(i + vec3<f32>(0.0,0.0,1.0));
  let c101 = hash3(i + vec3<f32>(1.0,0.0,1.0));
  let c011 = hash3(i + vec3<f32>(0.0,1.0,1.0));
  let c111 = hash3(i + vec3<f32>(1.0,1.0,1.0));
  let x00 = mix(c000, c100, u.x); let x10 = mix(c010, c110, u.x);
  let x01 = mix(c001, c101, u.x); let x11 = mix(c011, c111, u.x);
  let y0 = mix(x00, x10, u.y); let y1 = mix(x01, x11, u.y);
  return mix(y0, y1, u.z) * 2.0 - 1.0;
}
fn curl(p: vec3<f32>) -> vec3<f32> {
  let e = 0.1;
  let dydz = noise3(p + vec3<f32>(0.0,e,0.0)) - noise3(p - vec3<f32>(0.0,e,0.0));
  let dzdy = noise3(p + vec3<f32>(0.0,0.0,e)) - noise3(p - vec3<f32>(0.0,0.0,e));
  let dzdx = noise3(p + vec3<f32>(e,0.0,0.0)) - noise3(p - vec3<f32>(e,0.0,0.0));
  let dxdz = noise3(p + vec3<f32>(0.0,0.0,e)) - noise3(p - vec3<f32>(0.0,0.0,e));
  let dxdy = noise3(p + vec3<f32>(0.0,e,0.0)) - noise3(p - vec3<f32>(0.0,e,0.0));
  let dydx = noise3(p + vec3<f32>(e,0.0,0.0)) - noise3(p - vec3<f32>(e,0.0,0.0));
  return vec3<f32>(dydz - dzdy, dzdx - dxdz, dxdy - dydx) / (2.0 * e);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos)) { return; }
  var p = pos[i].xyz;
  var v = vel[i].xyz;
  let t = params.time;
  let flow = 0.18 + params.bloom * 0.5;
  let attract = 0.6 + params.bloom * 1.6;
  let c = curl(p * 0.5 + vec3<f32>(t, 0.0, -t));
  let a = (vec3<f32>(0.0,0.0,0.0) - p) * attract;
  v = (v + (c * flow + a) * params.dt) * 0.92;
  p = p + v * params.dt;
  pos[i] = vec4<f32>(p, 1.0);
  vel[i] = vec4<f32>(v, 0.0);
  let ke = dot(v, v);
  atomicAdd(&energy, u32(ke * 1000.0));
}
`;

async function makeGpuBody(device: GPUDeviceLike): Promise<Body | null> {
  try {
    const n = PARTICLE_COUNT;
    const posArr = new Float32Array(n * 4);
    const velArr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 2.2 * Math.cbrt(Math.random());
      const s = Math.sqrt(1 - u * u);
      posArr[i * 4] = r * s * Math.cos(th);
      posArr[i * 4 + 1] = r * u;
      posArr[i * 4 + 2] = r * s * Math.sin(th);
      posArr[i * 4 + 3] = 1;
    }

    const STORAGE = 0x80 | 0x8 | 0x4; // STORAGE | COPY_DST | COPY_SRC
    const UNIFORM = 0x40 | 0x8; // UNIFORM | COPY_DST
    const MAP_READ = 0x1 | 0x8; // MAP_READ | COPY_DST

    const posBuf = device.createBuffer({ size: posArr.byteLength, usage: STORAGE });
    const velBuf = device.createBuffer({ size: velArr.byteLength, usage: STORAGE });
    const paramBuf = device.createBuffer({ size: 32, usage: UNIFORM });
    const energyBuf = device.createBuffer({ size: 4, usage: STORAGE });
    const readBuf = device.createBuffer({ size: 4, usage: MAP_READ });

    device.queue.writeBuffer(posBuf, 0, posArr);
    device.queue.writeBuffer(velBuf, 0, velArr);

    const shaderModule = device.createShaderModule({ code: WGSL });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: posBuf } },
        { binding: 1, resource: { buffer: velBuf } },
        { binding: 2, resource: { buffer: paramBuf } },
        { binding: 3, resource: { buffer: energyBuf } },
      ],
    });

    // CPU shadow copy of positions for the GL renderer (read back occasionally).
    const shadow = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      shadow[i * 3] = posArr[i * 4];
      shadow[i * 3 + 1] = posArr[i * 4 + 1];
      shadow[i * 3 + 2] = posArr[i * 4 + 2];
    }

    let mapping = false;
    let lastEnergy = 0;
    let time = 0;
    const posReadBuf = device.createBuffer({ size: posArr.byteLength, usage: MAP_READ });
    let posMapping = false;
    let posFrame = 0;

    const body: Body = {
      tier: "webgpu",
      step(_target: Vec3, bloom: number, dt: number): number | null {
        time += dt;
        const params = new Float32Array([0, 0, 0, bloom, dt, time, 0, 0]);
        device.queue.writeBuffer(paramBuf, 0, params);
        // zero the energy accumulator
        device.queue.writeBuffer(energyBuf, 0, new Uint32Array([0]));

        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroups(Math.ceil(n / 64));
        pass.end();
        enc.copyBufferToBuffer(energyBuf, 0, readBuf, 0, 4);
        // read positions back every ~6 frames for rendering
        posFrame++;
        const doPos = posFrame % 6 === 0 && !posMapping;
        if (doPos) enc.copyBufferToBuffer(posBuf, 0, posReadBuf, 0, posArr.byteLength);
        device.queue.submit([enc.finish()]);

        // non-blocking energy readback
        if (!mapping) {
          mapping = true;
          readBuf
            .mapAsync(0x1 /* MAP_READ */)
            .then(() => {
              const u = new Uint32Array(readBuf.getMappedRange().slice(0));
              readBuf.unmap();
              lastEnergy = Math.min(1, (u[0] / 1000 / n) * 2.2);
              mapping = false;
            })
            .catch(() => {
              mapping = false;
            });
        }
        // non-blocking position readback for rendering
        if (doPos) {
          posMapping = true;
          posReadBuf
            .mapAsync(0x1)
            .then(() => {
              const f = new Float32Array(posReadBuf.getMappedRange().slice(0));
              posReadBuf.unmap();
              for (let i = 0; i < n; i++) {
                shadow[i * 3] = f[i * 4];
                shadow[i * 3 + 1] = f[i * 4 + 1];
                shadow[i * 3 + 2] = f[i * 4 + 2];
              }
              posMapping = false;
            })
            .catch(() => {
              posMapping = false;
            });
        }
        return lastEnergy;
      },
      positions() {
        return shadow;
      },
      dispose() {
        try {
          posBuf.destroy();
          velBuf.destroy();
          paramBuf.destroy();
          energyBuf.destroy();
          readBuf.destroy();
          posReadBuf.destroy();
          device.destroy?.();
        } catch {
          /* ignore */
        }
      },
    };
    return body;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 first-person scene — glowing room blobs + faced-room particle cloud
// ─────────────────────────────────────────────────────────────────────────────

interface GlScene {
  draw: (
    w: number,
    h: number,
    forward: Vec3,
    right: Vec3,
    up: Vec3,
    rooms: Room[],
    faced: number,
    weights: number[],
    body: Body | null,
    energy: number,
  ) => void;
}

function hueToRgb(h: number): [number, number, number] {
  const c = 1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r, g, b];
}

function makeGlScene(gl: WebGL2RenderingContext): GlScene {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const link = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  };

  // Billboard blob program: draws each room as a glowing quad facing the camera.
  const blobProg = link(
    `#version 300 es
    precision highp float;
    in vec2 corner;
    uniform vec3 uForward, uRight, uUp, uRoomDir;
    uniform float uAspect, uSize, uFov;
    out vec2 vUV;
    void main(){
      vUV = corner;
      // camera at origin; room at uRoomDir * 6
      vec3 wp = uRoomDir * 6.0 + (uRight * corner.x + uUp * corner.y) * uSize;
      // view transform (camera at origin looking along uForward)
      float x = dot(wp, uRight);
      float y = dot(wp, uUp);
      float z = dot(wp, -uForward); // depth (positive in front)
      float zc = max(z, 0.05);
      float f = 1.0 / tan(uFov * 0.5);
      gl_Position = vec4(x * f / uAspect, y * f, zc * 0.02, zc);
    }`,
    `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform vec3 uColor;
    uniform float uGlow;
    out vec4 frag;
    void main(){
      float d = length(vUV);
      float a = smoothstep(1.0, 0.0, d);
      a = pow(a, 2.0);
      vec3 col = uColor * (0.5 + uGlow);
      frag = vec4(col * a, a * (0.35 + uGlow * 0.6));
    }`,
  );

  // Particle program for the faced room's resonating body.
  const partProg = link(
    `#version 300 es
    precision highp float;
    in vec3 p;
    uniform vec3 uForward, uRight, uUp, uRoomDir;
    uniform float uAspect, uFov, uEnergy;
    out float vE;
    void main(){
      vec3 wp = uRoomDir * 6.0 + p;
      float x = dot(wp, uRight);
      float y = dot(wp, uUp);
      float z = dot(wp, -uForward);
      float zc = max(z, 0.05);
      float f = 1.0 / tan(uFov * 0.5);
      gl_Position = vec4(x * f / uAspect, y * f, zc * 0.02, zc);
      gl_PointSize = clamp(60.0 / zc, 1.5, 6.0) * (1.0 + uEnergy);
      vE = uEnergy;
    }`,
    `#version 300 es
    precision highp float;
    in float vE;
    uniform vec3 uColor;
    out vec4 frag;
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.0, d);
      frag = vec4(uColor * (0.8 + vE), a * 0.5);
    }`,
  );

  // unit quad
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const partBuf = gl.createBuffer();

  const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);

  return {
    draw(w, h, forward, right, up, rooms, faced, weights, body, energy) {
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.02, 0.02, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      const aspect = w / h;
      const fov = 1.3;

      // blobs
      gl.useProgram(blobProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      const cornerLoc = gl.getAttribLocation(blobProg, "corner");
      gl.enableVertexAttribArray(cornerLoc);
      gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(u(blobProg, "uForward"), forward[0], forward[1], forward[2]);
      gl.uniform3f(u(blobProg, "uRight"), right[0], right[1], right[2]);
      gl.uniform3f(u(blobProg, "uUp"), up[0], up[1], up[2]);
      gl.uniform1f(u(blobProg, "uAspect"), aspect);
      gl.uniform1f(u(blobProg, "uFov"), fov);

      rooms.forEach((room, i) => {
        const [r, g, b] = hueToRgb(room.hue);
        gl.uniform3f(u(blobProg, "uRoomDir"), room.dir[0], room.dir[1], room.dir[2]);
        gl.uniform3f(u(blobProg, "uColor"), r, g, b);
        const glow = i === faced ? 0.6 + energy * 0.8 : weights[i] * 0.5;
        gl.uniform1f(u(blobProg, "uGlow"), glow);
        gl.uniform1f(u(blobProg, "uSize"), 1.6 + (i === faced ? energy * 0.8 : 0));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      });

      // faced room particle cloud
      if (body) {
        const pos = body.positions();
        gl.useProgram(partProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
        const pLoc = gl.getAttribLocation(partProg, "p");
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 0, 0);
        const room = rooms[faced];
        const [r, g, b] = hueToRgb(room.hue);
        gl.uniform3f(u(partProg, "uForward"), forward[0], forward[1], forward[2]);
        gl.uniform3f(u(partProg, "uRight"), right[0], right[1], right[2]);
        gl.uniform3f(u(partProg, "uUp"), up[0], up[1], up[2]);
        gl.uniform3f(u(partProg, "uRoomDir"), room.dir[0], room.dir[1], room.dir[2]);
        gl.uniform1f(u(partProg, "uAspect"), aspect);
        gl.uniform1f(u(partProg, "uFov"), fov);
        gl.uniform1f(u(partProg, "uEnergy"), energy);
        gl.uniform3f(u(partProg, "uColor"), r, g, b);
        gl.drawArrays(gl.POINTS, 0, pos.length / 3);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas2D fallback — project room directions to screen, glow + horizon
// ─────────────────────────────────────────────────────────────────────────────

function drawCanvas2d(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  forward: Vec3,
  right: Vec3,
  up: Vec3,
  rooms: Room[],
  faced: number,
  weights: number[],
  energy: number,
) {
  ctx.fillStyle = "#050509";
  ctx.fillRect(0, 0, w, h);
  // horizon line
  const cx = w / 2;
  const cy = h / 2;
  const horizonY = cy + forward[1] * h * 0.5; // pitch shifts horizon
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.stroke();

  const fov = 1.3;
  const f = 1 / Math.tan(fov / 2);
  rooms.forEach((room, i) => {
    const wp = vscale(room.dir, 6);
    const x = wp[0] * right[0] + wp[1] * right[1] + wp[2] * right[2];
    const y = wp[0] * up[0] + wp[1] * up[1] + wp[2] * up[2];
    const z = -(wp[0] * forward[0] + wp[1] * forward[1] + wp[2] * forward[2]);
    if (z <= 0.1) return; // behind camera
    const sx = cx + (x * f) / z * (h / 2);
    const sy = cy - (y * f) / z * (h / 2);
    const [r, g, b] = hueToRgb(room.hue).map((c) => Math.round(c * 255));
    const glow = i === faced ? 0.7 + energy * 0.8 : weights[i] * 0.5 + 0.1;
    const rad = (i === faced ? 90 + energy * 60 : 50) / Math.max(0.4, z * 0.5);
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, glow)})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();
  });
}
