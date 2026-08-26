"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeMaster } from "../_shared/visionary/safeMaster";

// ─── constants ──────────────────────────────────────────────────────────────
const GRID_W = 64; // motion-field grid width  (selfie-mirrored)
const GRID_H = 48; // motion-field grid height
const CELLS = GRID_W * GRID_H;
const SIM_W = 512; // GPU feedback buffer resolution (fixed, 4:3)
const SIM_H = 384;

// A minor pentatonic — always consonant. Semitone offsets from A2 (110 Hz).
const A2 = 110;
const PENTA_STEPS = [0, 3, 5, 7, 10];
const SCALE: number[] = (() => {
  const out: number[] = [];
  for (let oct = 0; oct <= 3; oct++) {
    for (const s of PENTA_STEPS) out.push(A2 * Math.pow(2, (oct * 12 + s) / 12));
  }
  return out; // ~20 notes, low → high
})();

// ─── motion field types ───────────────────────────────────────────────────────
interface FieldStats {
  hCentroid: number; // -1 (left) .. +1 (right)
  vNorm: number; //  0 (top)  ..  1 (bottom)
  energy: number; //  0 .. ~1 total motion
}

// ─── GL helpers (plain functions — never `use*`, which React treats as hooks) ──
function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

function makeSimTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const t = gl.createTexture();
  if (!t) return null;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, SIM_W, SIM_H, 0, gl.RGBA,
    gl.UNSIGNED_BYTE, null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// ─── shaders ───────────────────────────────────────────────────────────────────
const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Advect the glow along the motion vectors + gentle diffusion + injection.
const SIM_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_prev;    // previous feedback buffer
uniform sampler2D u_motion;  // RG = velocity (0.5 centred), B = magnitude
uniform vec2 u_texel;        // 1 / sim resolution
uniform float u_decay;
out vec4 o;
void main(){
  vec3 m = texture(u_motion, v_uv).rgb;
  vec2 vel = (m.rg - 0.5) * 2.0;   // -1 .. 1
  float mag = m.b;
  // sample the previous frame displaced against velocity → trails behind motion
  vec2 disp = vel * 0.045;
  float c = texture(u_prev, v_uv - disp).r;
  // soft diffusion so wakes bloom rather than stay hard
  float n =
      texture(u_prev, v_uv - disp + vec2( u_texel.x, 0.0)).r +
      texture(u_prev, v_uv - disp + vec2(-u_texel.x, 0.0)).r +
      texture(u_prev, v_uv - disp + vec2(0.0,  u_texel.y)).r +
      texture(u_prev, v_uv - disp + vec2(0.0, -u_texel.y)).r;
  float glow = (c * 0.72 + n * 0.07) * u_decay;
  glow += mag * 1.15;                 // inject fresh motion
  glow = clamp(glow, 0.0, 1.6);
  o = vec4(vec3(glow), 1.0);
}`;

// Map the accumulated glow onto the violet ramp + vignette.
const DISP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_field;
out vec4 o;
vec3 ramp(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.024, 0.016, 0.055); // near-black violet
  vec3 c1 = vec3(0.180, 0.090, 0.400); // violet-800
  vec3 c2 = vec3(0.545, 0.360, 0.965); // violet-500 (brand)
  vec3 c3 = vec3(0.880, 0.840, 1.000); // violet highlight
  vec3 col = mix(c0, c1, smoothstep(0.0, 0.28, t));
  col = mix(col, c2, smoothstep(0.24, 0.62, t));
  col = mix(col, c3, smoothstep(0.60, 1.0, t));
  return col;
}
void main(){
  float g = texture(u_field, v_uv).r;
  vec3 col = ramp(g);
  col += pow(clamp(g, 0.0, 1.0), 2.2) * vec3(0.35, 0.28, 0.55); // extra bloom
  vec2 d = v_uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.85; // vignette
  o = vec4(col, 1.0);
}`;

// ─── audio graph ───────────────────────────────────────────────────────────────
interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  masterFilter: BiquadFilterNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
  panner: StereoPannerNode;
  delay: DelayNode;
  oscs: OscillatorNode[];
  wet: GainNode;
}

function buildAudio(): AudioGraph {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = "lowpass";
  masterFilter.frequency.value = 700;
  masterFilter.Q.value = 0.4;
  masterFilter.connect(master);
  // Route through the shared ear-safety bus (shelf + lowpass + limiter)
  // instead of connecting to ctx.destination directly. Cleanup relies on the
  // existing ctx.close() on unmount.
  const safe = createSafeMaster(ctx);
  master.connect(safe.input);

  // feedback delay for warmth / space
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.3;
  const fb = ctx.createGain();
  fb.gain.value = 0.36;
  const dFilter = ctx.createBiquadFilter();
  dFilter.type = "lowpass";
  dFilter.frequency.value = 1800;
  delay.connect(dFilter);
  dFilter.connect(fb);
  fb.connect(delay);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  delay.connect(wet);
  wet.connect(masterFilter);

  // pad voice: unison detune + sub octave
  const panner = ctx.createStereoPanner();
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.6;
  padFilter.connect(padGain);
  padGain.connect(panner);
  panner.connect(masterFilter);
  panner.connect(delay);

  const detunes = [-4, 4, 0];
  const gains = [0.5, 0.5, 0.42];
  const types: OscillatorType[] = ["sawtooth", "sawtooth", "sine"];
  const oscs: OscillatorNode[] = [];
  detunes.forEach((det, i) => {
    const osc = ctx.createOscillator();
    osc.type = types[i];
    osc.frequency.value = i === 2 ? SCALE[6] / 2 : SCALE[6];
    osc.detune.value = det;
    const g = ctx.createGain();
    g.gain.value = gains[i];
    osc.connect(g);
    g.connect(padFilter);
    osc.start();
    oscs.push(osc);
  });

  return { ctx, master, masterFilter, padGain, padFilter, panner, delay, oscs, wet };
}

function triggerPluck(a: AudioGraph, freq: number, pan: number, level: number) {
  const { ctx } = a;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  osc.connect(g);
  g.connect(p);
  p.connect(a.masterFilter);
  p.connect(a.delay);
  const peak = 0.05 + level * 0.14;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(peak, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, now + 0.32);
  osc.start(now);
  osc.stop(now + 0.36);
}

// ─── engine (mutable, lives outside React render) ──────────────────────────────
interface Engine {
  gl: WebGL2RenderingContext | null;
  ctx2d: CanvasRenderingContext2D | null;
  simProg: WebGLProgram | null;
  dispProg: WebGLProgram | null;
  fbo: WebGLFramebuffer | null;
  texA: WebGLTexture | null;
  texB: WebGLTexture | null;
  motionTex: WebGLTexture | null;
  vao: WebGLVertexArrayObject | null;
  read: number; // 0 → texA is source, 1 → texB is source
  prevGray: Float32Array;
  motionBytes: Uint8Array;
  stats: FieldStats;
  smoothed: FieldStats;
  blobs: { x: number; y: number; vx: number; vy: number; ph: number }[];
  lastPluck: number;
  raf: number;
}

export default function FlowBodyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null); // offscreen GRID_W×GRID_H
  const engineRef = useRef<Engine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioGraph | null>(null);

  const [running, setRunning] = useState(false);
  const [usingCamera, setUsingCamera] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── read the current motion field (camera or synthetic) into engine.motionBytes ──
  const computeField = useCallback((eng: Engine, dt: number, t: number) => {
    const bytes = eng.motionBytes;
    const stats = eng.stats;
    let sumMag = 0, sumX = 0, sumY = 0, wsum = 0;

    const video = videoRef.current;
    const sample = sampleRef.current;
    const cam =
      usingCamera && video && sample && video.readyState >= 2 && video.videoWidth > 0;

    if (cam && sample && video) {
      const sc = sample.getContext("2d", { willReadFrequently: true });
      if (sc) {
        // mirror horizontally for selfie view
        sc.save();
        sc.scale(-1, 1);
        sc.drawImage(video, -GRID_W, 0, GRID_W, GRID_H);
        sc.restore();
        const img = sc.getImageData(0, 0, GRID_W, GRID_H).data;
        const gray = eng.prevGray;
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            const p = i << 2;
            const g =
              (img[p] * 0.299 + img[p + 1] * 0.587 + img[p + 2] * 0.114) / 255;
            const prev = gray[i];
            const It = g - prev;
            // spatial gradients (Lucas-Kanade-lite)
            const xr = x < GRID_W - 1 ? i + 1 : i;
            const xl = x > 0 ? i - 1 : i;
            const yb = y < GRID_H - 1 ? i + GRID_W : i;
            const yt = y > 0 ? i - GRID_W : i;
            const Ix =
              ((img[xr << 2] - img[xl << 2]) * 0.299 +
                (img[(xr << 2) + 1] - img[(xl << 2) + 1]) * 0.587) / 255;
            const Iy =
              ((img[yb << 2] - img[yt << 2]) * 0.299 +
                (img[(yb << 2) + 1] - img[(yt << 2) + 1]) * 0.587) / 255;
            const denom = Ix * Ix + Iy * Iy + 0.0008;
            let vx = (-It * Ix) / denom;
            let vy = (-It * Iy) / denom;
            vx = Math.max(-1, Math.min(1, vx * 0.25));
            vy = Math.max(-1, Math.min(1, vy * 0.25));
            const mag = Math.min(1, Math.abs(It) * 6);
            const b = i << 2;
            bytes[b] = ((vx * 0.5 + 0.5) * 255) | 0;
            bytes[b + 1] = ((vy * 0.5 + 0.5) * 255) | 0;
            bytes[b + 2] = (mag * 255) | 0;
            bytes[b + 3] = 255;
            gray[i] = g;
            sumMag += mag;
            sumX += x * mag;
            sumY += y * mag;
            wsum += mag;
          }
        }
      }
    } else {
      // ── synthetic drifting flow-blobs — alive & musical with zero permission ──
      const blobs = eng.blobs;
      for (const bl of blobs) {
        bl.x += bl.vx * dt;
        bl.y += bl.vy * dt;
        bl.ph += dt;
        // gentle wandering
        bl.vx += Math.sin(t * 0.7 + bl.ph) * 0.02 * dt;
        bl.vy += Math.cos(t * 0.5 + bl.ph * 1.3) * 0.02 * dt;
        if (bl.x < -0.2) bl.x = 1.2;
        if (bl.x > 1.2) bl.x = -0.2;
        if (bl.y < -0.2) bl.y = 1.2;
        if (bl.y > 1.2) bl.y = -0.2;
      }
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = y * GRID_W + x;
          const u = x / GRID_W;
          const v = y / GRID_H;
          let vx = 0, vy = 0, mag = 0;
          for (const bl of blobs) {
            const dx = u - bl.x;
            const dy = v - bl.y;
            const r2 = dx * dx + dy * dy;
            const infl = Math.exp(-r2 * 42);
            mag += infl;
            const sp = Math.hypot(bl.vx, bl.vy) + 0.001;
            vx += (bl.vx / sp) * infl;
            vy += (bl.vy / sp) * infl;
          }
          mag = Math.min(1, mag * 0.9);
          vx = Math.max(-1, Math.min(1, vx));
          vy = Math.max(-1, Math.min(1, vy));
          const b = i << 2;
          bytes[b] = ((vx * 0.5 + 0.5) * 255) | 0;
          bytes[b + 1] = ((vy * 0.5 + 0.5) * 255) | 0;
          bytes[b + 2] = (mag * 255) | 0;
          bytes[b + 3] = 255;
          sumMag += mag;
          sumX += x * mag;
          sumY += y * mag;
          wsum += mag;
        }
      }
    }

    if (wsum > 0.001) {
      stats.hCentroid = (sumX / wsum / (GRID_W - 1)) * 2 - 1;
      stats.vNorm = sumY / wsum / (GRID_H - 1);
    }
    stats.energy = Math.min(1, sumMag / (CELLS * 0.18));
  }, [usingCamera]);

  // ── update the audio graph from smoothed field stats ──
  const applyAudio = useCallback((eng: Engine, t: number) => {
    const a = audioRef.current;
    if (!a) return;
    const s = eng.smoothed;
    const raw = eng.stats;
    // smooth for musicality
    s.hCentroid += (raw.hCentroid - s.hCentroid) * 0.12;
    s.vNorm += (raw.vNorm - s.vNorm) * 0.12;
    s.energy += (raw.energy - s.energy) * 0.2;

    const now = a.ctx.currentTime;
    const pitchT = 1 - s.vNorm; // top of frame → high pitch
    const idx = Math.max(0, Math.min(SCALE.length - 1, Math.round(pitchT * (SCALE.length - 1))));
    const freq = SCALE[idx];
    a.oscs.forEach((osc, i) => {
      const target = i === 2 ? freq / 2 : freq;
      osc.frequency.setTargetAtTime(target, now, 0.08);
    });
    a.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, s.hCentroid)), now, 0.05);
    a.padGain.gain.setTargetAtTime(0.05 + s.energy * 0.32, now, 0.1);
    a.padFilter.frequency.setTargetAtTime(500 + s.energy * 3200, now, 0.12);
    a.masterFilter.frequency.setTargetAtTime(650 + s.energy * 4200, now, 0.12);

    // fast-gesture plucks — density scales with energy
    if (raw.energy > 0.05 && t - eng.lastPluck > 0.07) {
      if (Math.random() < raw.energy * 1.4) {
        const step = idx + 5 + Math.floor(Math.random() * 4);
        const pf = SCALE[Math.min(SCALE.length - 1, step)];
        triggerPluck(a, pf, s.hCentroid, raw.energy);
        eng.lastPluck = t;
      }
    }
  }, []);

  const startAudio = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === "suspended") void audioRef.current.ctx.resume();
      return;
    }
    const a = buildAudio();
    a.master.gain.setTargetAtTime(0.85, a.ctx.currentTime, 0.4);
    audioRef.current = a;
  }, []);

  const requestCamera = useCallback(async () => {
    startAudio();
    setRunning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setSensorError(null);
      setUsingCamera(true);
    } catch {
      setSensorError("Camera unavailable — performing with the synthetic flow field.");
      setUsingCamera(false);
    }
  }, [startAudio]);

  const toggleRun = useCallback(() => {
    if (!running) {
      startAudio();
      setRunning(true);
    } else {
      setRunning(false);
      const a = audioRef.current;
      if (a && a.ctx.state === "running") void a.ctx.suspend();
    }
  }, [running, startAudio]);

  // keep the audio context suspended/running in sync with `running`
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (running && a.ctx.state === "suspended") void a.ctx.resume();
  }, [running]);

  // ── setup render backend + main loop (runs from mount; visuals always alive) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // offscreen sampling canvas
    const sc = document.createElement("canvas");
    sc.width = GRID_W;
    sc.height = GRID_H;
    sampleRef.current = sc;

    const eng: Engine = {
      gl: null, ctx2d: null, simProg: null, dispProg: null, fbo: null,
      texA: null, texB: null, motionTex: null, vao: null, read: 0,
      prevGray: new Float32Array(CELLS),
      motionBytes: new Uint8Array(CELLS * 4),
      stats: { hCentroid: 0, vNorm: 0.5, energy: 0 },
      smoothed: { hCentroid: 0, vNorm: 0.5, energy: 0 },
      blobs: Array.from({ length: 3 }, (_, k) => ({
        x: 0.2 + 0.3 * k, y: 0.3 + 0.2 * k,
        vx: (k % 2 ? -1 : 1) * 0.14, vy: (k === 1 ? 0.12 : -0.09), ph: k * 2.1,
      })),
      lastPluck: 0, raf: 0,
    };
    engineRef.current = eng;

    const gl = canvas.getContext("webgl2", {
      antialias: false, alpha: false, preserveDrawingBuffer: false,
    });

    let backend2d: CanvasRenderingContext2D | null = null;

    if (gl) {
      eng.gl = gl;
      eng.simProg = linkProgram(gl, VS, SIM_FS);
      eng.dispProg = linkProgram(gl, VS, DISP_FS);
      if (!eng.simProg || !eng.dispProg) {
        setWebglError(true);
      } else {
        // fullscreen triangle
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        eng.vao = vao;

        eng.texA = makeSimTexture(gl);
        eng.texB = makeSimTexture(gl);
        eng.fbo = gl.createFramebuffer();

        eng.motionTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, eng.motionTex);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA, GRID_W, GRID_H, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
    } else {
      backend2d = canvas.getContext("2d");
      eng.ctx2d = backend2d;
      if (!backend2d) setWebglError(true);
    }

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(parent.clientWidth * dpr));
      const h = Math.max(1, Math.floor(parent.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const loop = (nowMs: number) => {
      eng.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const t = nowMs / 1000;

      computeField(eng, dt, t);
      if (audioRef.current) applyAudio(eng, t);

      const glc = eng.gl;
      if (glc && eng.simProg && eng.dispProg && eng.fbo && eng.motionTex) {
        // upload motion field
        glc.activeTexture(glc.TEXTURE1);
        glc.bindTexture(glc.TEXTURE_2D, eng.motionTex);
        glc.texSubImage2D(
          glc.TEXTURE_2D, 0, 0, 0, GRID_W, GRID_H, glc.RGBA,
          glc.UNSIGNED_BYTE, eng.motionBytes,
        );

        const src = eng.read === 0 ? eng.texA : eng.texB;
        const dst = eng.read === 0 ? eng.texB : eng.texA;

        // ── sim pass → dst ──
        glc.bindFramebuffer(glc.FRAMEBUFFER, eng.fbo);
        glc.framebufferTexture2D(
          glc.FRAMEBUFFER, glc.COLOR_ATTACHMENT0, glc.TEXTURE_2D, dst, 0,
        );
        glc.viewport(0, 0, SIM_W, SIM_H);
        glc.useProgram(eng.simProg);
        glc.bindVertexArray(eng.vao);
        glc.activeTexture(glc.TEXTURE0);
        glc.bindTexture(glc.TEXTURE_2D, src);
        glc.uniform1i(glc.getUniformLocation(eng.simProg, "u_prev"), 0);
        glc.uniform1i(glc.getUniformLocation(eng.simProg, "u_motion"), 1);
        glc.uniform2f(glc.getUniformLocation(eng.simProg, "u_texel"), 1 / SIM_W, 1 / SIM_H);
        glc.uniform1f(glc.getUniformLocation(eng.simProg, "u_decay"), 0.965);
        glc.drawArrays(glc.TRIANGLES, 0, 3);

        // ── display pass → screen ──
        glc.bindFramebuffer(glc.FRAMEBUFFER, null);
        glc.viewport(0, 0, canvas.width, canvas.height);
        glc.useProgram(eng.dispProg);
        glc.activeTexture(glc.TEXTURE0);
        glc.bindTexture(glc.TEXTURE_2D, dst);
        glc.uniform1i(glc.getUniformLocation(eng.dispProg, "u_field"), 0);
        glc.drawArrays(glc.TRIANGLES, 0, 3);

        eng.read = eng.read === 0 ? 1 : 0;
      } else if (eng.ctx2d) {
        // ── Canvas2D fallback: fading trail of glowing motion cells ──
        const c = eng.ctx2d;
        const W = canvas.width, H = canvas.height;
        c.globalCompositeOperation = "source-over";
        c.fillStyle = "rgba(6,4,14,0.16)";
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = "lighter";
        const cw = W / GRID_W, ch = H / GRID_H;
        const by = eng.motionBytes;
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const b = (y * GRID_W + x) << 2;
            const mag = by[b + 2] / 255;
            if (mag < 0.05) continue;
            const vx = (by[b] / 255 - 0.5) * 2;
            const vy = (by[b + 1] / 255 - 0.5) * 2;
            const px = x * cw + cw / 2 + vx * cw * 2;
            const py = y * ch + ch / 2 + vy * ch * 2;
            const rad = cw * (1.2 + mag * 2.4);
            const gr = c.createRadialGradient(px, py, 0, px, py, rad);
            gr.addColorStop(0, `rgba(180,150,255,${0.5 * mag})`);
            gr.addColorStop(1, "rgba(90,46,201,0)");
            c.fillStyle = gr;
            c.beginPath();
            c.arc(px, py, rad, 0, Math.PI * 2);
            c.fill();
          }
        }
        c.globalCompositeOperation = "source-over";
      }
    };
    eng.raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(eng.raf);
      const g = eng.gl;
      if (g) {
        if (eng.texA) g.deleteTexture(eng.texA);
        if (eng.texB) g.deleteTexture(eng.texB);
        if (eng.motionTex) g.deleteTexture(eng.motionTex);
        if (eng.fbo) g.deleteFramebuffer(eng.fbo);
        if (eng.vao) g.deleteVertexArray(eng.vao);
        if (eng.simProg) g.deleteProgram(eng.simProg);
        if (eng.dispProg) g.deleteProgram(eng.dispProg);
      }
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const a = audioRef.current;
      if (a) {
        a.oscs.forEach((o) => o.stop());
        void a.ctx.close();
        audioRef.current = null;
      }
      engineRef.current = null;
    };
  }, [computeField, applyAudio]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* full-bleed instrument canvas */}
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* overlay chrome */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-8">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 6296 · Flowbody
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Flowbody
          </h1>
          <p className="text-base text-muted-foreground">
            Conduct a live violet soundscape with the raw motion of your body —
            optical flow becomes stereo, pitch, and glowing wakes of light.
          </p>
          {sensorError && (
            <p className="text-base text-destructive">{sensorError}</p>
          )}
          {webglError && (
            <p className="text-base text-muted-foreground">
              WebGL2 unavailable — rendering the motion field on the Canvas2D
              fallback.
            </p>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleRun}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {running ? "Pause" : "Begin"}
          </button>
          <button
            onClick={requestCamera}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {usingCamera ? "Camera live" : "Use camera"}
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          <Link
            href="/dream"
            className="min-h-[44px] rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Lab
          </Link>
        </div>
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if you
                conducted a live spatial soundscape with the raw motion of your
                body in front of the webcam — no keys, no touch, no pose model,
                just the flow of movement becoming sound and light?
              </p>
              <p>
                Each frame the webcam is downscaled to a {GRID_W}×{GRID_H} grid and
                a Lucas-Kanade-lite optical flow is estimated per cell (temporal
                difference against a local spatial gradient) to recover a coarse
                motion vector and magnitude. That field drives everything. With no
                camera, drifting synthetic flow-blobs sweep the same grid so the
                instrument is fully alive and musical with zero permission.
              </p>
              <p>
                <span className="text-foreground">Sound:</span> the horizontal
                motion centroid pans a warm detuned pad; vertical position selects
                a note on an A-minor pentatonic scale (always consonant); total
                motion energy opens the filters and swells the gain, while fast
                gestures scatter plucked grains through a feedback delay.
              </p>
              <p>
                <span className="text-foreground">Light:</span> a WebGL2 feedback
                buffer advects a violet luminance field along the motion vectors,
                so every gesture leaves a glowing wake — an instrument mirror, not
                a meditation tunnel.
              </p>
              <p>
                <span className="text-foreground">Lineage:</span> Myron Krueger&apos;s
                <em> Videoplace</em> (1985), the seminal full-body
                camera-as-instrument; and Bao, Wang, Wen &amp; Wünsche,
                &ldquo;Optical Flow-Based Anticipatory Audio Cues for Cybersickness
                Mitigation,&rdquo; I3D 2026 (DOI 10.1145/3804502), whose finding
                that optical-flow motion reads as movement when encoded as stereo
                position + temporal pattern is here repurposed as a played
                instrument.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
