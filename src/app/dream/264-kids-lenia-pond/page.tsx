"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * 264 · Kids Lenia Pond
 * Tap the dark pond -> a glowing nebula lifeform (a Lenia "orbium"
 * glider) is born, crawls away on its own, and sings.
 *
 * Classic grid Lenia (Bert Wang-Chak Chan, "Lenia - Biology of
 * Artificial Life", 2019). A continuous scalar field A(x,y) in [0,1]
 * lives on a 150x150 toroidal grid (Float32 ping-pong buffers, CPU).
 * Each step convolves A with a smooth radial ring kernel (R=13),
 * applies a Gaussian growth function G(U)=2*exp(-(U-mu)^2/(2 sigma^2))-1
 * with mu=0.15, sigma=0.017, then A <- clamp(A + dt*G, 0, 1), dt=0.1.
 * Under exactly these parameters the orbium pattern is a stable glider.
 *
 * The field is packed to Uint8 and uploaded as a WebGL2 R8 texture
 * (R8, not R32F: R8 LINEAR filtering works on every device; R32F-linear
 * needs OES_texture_float_linear, missing on many tablets -> black).
 * A fragment shader maps the field to a violet/cyan/rose nebula glow.
 *
 * Audio: always-on soft detuned pad + 5 vertical-band pentatonic voices
 * driven by band mass (gain) and band centroid (detune), plus a soft
 * one-octave-up ping on every tap. Warm lowpass -> limiter. Pentatonic
 * only, gains capped: never silent, never harsh.
 * ------------------------------------------------------------------ */

// ---- Lenia simulation constants (the de-risked stable params) ----
const GRID = 150;
const GRID_N = GRID * GRID;
const R = 13; // kernel radius (cells)
const MU = 0.15; // growth center
const SIGMA = 0.017; // growth width
const DT = 0.1; // time step
const BANDS = 5; // vertical audio bands
// C major pentatonic: C3 E3 G3 A3 C4
const BAND_HZ = [130.81, 164.81, 196.0, 220.0, 261.63];

// ---- ring kernel, precomputed once at module load ----
// Bert Chan's canonical orbium uses a single smooth bump kernel peaked at
// half-radius: the "exponential-core" shell K_c(r) = exp(4 - 1/(r(1-r)))
// for r in (0,1), zero outside the disc of radius R. We normalize to
// sum=1. This is the exact kernel the published orbium matrix was tuned
// for, so the glider holds together. Stored as flat offsets + weights.
type Kernel = {
  ox: Int32Array;
  oy: Int32Array;
  w: Float32Array;
  count: number;
};

function makeKernel(): Kernel {
  const ox: number[] = [];
  const oy: number[] = [];
  const wRaw: number[] = [];
  let sum = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy) / R;
      if (dist >= 1 || dist <= 0) continue;
      // Chan's smooth exponential bump, peaked at r = 0.5
      const wv = Math.exp(4 - 1 / (dist * (1 - dist)));
      ox.push(dx);
      oy.push(dy);
      wRaw.push(wv);
      sum += wv;
    }
  }
  const count = wRaw.length;
  const w = new Float32Array(count);
  for (let i = 0; i < count; i++) w[i] = wRaw[i] / sum;
  return { ox: Int32Array.from(ox), oy: Int32Array.from(oy), w, count };
}

const KERNEL = makeKernel();

// ---- orbium seed: Bert Chan's canonical 20x20 orbium matrix ----
// This is the published "orbium unicaudatus" pattern from Chan's Lenia
// notebook (the same float matrix used in the 2019 paper / Google Colab),
// the de-risked glider for exactly R=13 / mu=0.15 / sigma=0.017 / dt=0.1.
// We use the published matrix verbatim rather than hand-rolling a crescent,
// because only this specific configuration reliably self-organizes into a
// translating glider; a synthesized blob would dissolve or explode.
const SEED = 20;
// prettier-ignore
const ORBIUM_ROWS: number[][] = [
  [0,0,0,0,0,0,0.1,0.14,0.1,0,0,0.03,0.03,0,0,0.3,0,0,0,0],
  [0,0,0,0,0,0.08,0.24,0.3,0.3,0.18,0.14,0.15,0.16,0.15,0.09,0.2,0,0,0,0],
  [0,0,0,0,0,0.15,0.34,0.44,0.46,0.38,0.18,0.14,0.11,0.13,0.19,0.18,0.45,0,0,0],
  [0,0,0,0,0.06,0.13,0.39,0.5,0.5,0.37,0.06,0,0,0,0.02,0.16,0.68,0,0,0],
  [0,0,0,0.11,0.17,0.17,0.33,0.4,0.38,0.28,0.14,0,0,0,0,0,0.18,0.42,0,0],
  [0,0,0.09,0.18,0.13,0.06,0.08,0.26,0.32,0.32,0.27,0,0,0,0,0,0,0.82,0,0],
  [0.27,0,0.16,0.12,0,0,0,0.25,0.38,0.44,0.45,0.34,0,0,0,0,0,0.22,0.17,0],
  [0,0.07,0.2,0.02,0,0,0,0.31,0.48,0.57,0.6,0.57,0,0,0,0,0,0,0.49,0],
  [0,0.59,0.19,0,0,0,0,0.2,0.57,0.69,0.76,0.76,0.49,0,0,0,0,0,0.36,0],
  [0,0.58,0.19,0,0,0,0,0,0.67,0.83,0.9,0.92,0.87,0.12,0,0,0,0,0.22,0.07],
  [0,0,0.46,0,0,0,0,0,0.7,0.93,1,1,1,0.61,0,0,0,0,0.18,0.11],
  [0,0,0.82,0,0,0,0,0,0.47,1,1,0.98,1,0.96,0.27,0,0,0,0.19,0.1],
  [0,0,0.46,0,0,0,0,0,0.25,1,1,0.84,0.92,0.97,0.54,0.14,0.04,0.1,0.21,0.05],
  [0,0,0,0.4,0,0,0,0,0.09,0.8,1,0.82,0.8,0.85,0.63,0.31,0.18,0.19,0.2,0.01],
  [0,0,0,0.36,0.1,0,0,0,0.05,0.54,0.86,0.79,0.74,0.72,0.6,0.39,0.28,0.24,0.13,0],
  [0,0,0,0.01,0.3,0.07,0,0,0.08,0.36,0.64,0.7,0.64,0.6,0.51,0.39,0.29,0.19,0.04,0],
  [0,0,0,0,0.1,0.24,0.14,0.1,0.15,0.29,0.45,0.53,0.52,0.46,0.4,0.31,0.21,0.08,0,0],
  [0,0,0,0,0,0.08,0.21,0.21,0.22,0.29,0.36,0.39,0.37,0.33,0.26,0.18,0.09,0,0,0],
  [0,0,0,0,0,0,0.03,0.13,0.19,0.22,0.24,0.24,0.23,0.18,0.13,0.05,0,0,0,0],
  [0,0,0,0,0,0,0,0,0.02,0.06,0.08,0.09,0.07,0.05,0.01,0,0,0,0,0],
];
function makeOrbiumSeed(): Float32Array {
  const s = new Float32Array(SEED * SEED);
  for (let y = 0; y < SEED; y++) {
    for (let x = 0; x < SEED; x++) {
      s[y * SEED + x] = ORBIUM_ROWS[y][x];
    }
  }
  return s;
}
const ORBIUM = makeOrbiumSeed();

// ---------------- shader sources ----------------

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Map field value -> violet/cyan/rose nebula glow with soft bloom.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_field;
uniform float u_time;

vec3 ramp(float t){
  vec3 violet = vec3(0.45, 0.20, 0.85);
  vec3 cyan   = vec3(0.25, 0.92, 0.95);
  vec3 rose   = vec3(1.00, 0.45, 0.72);
  vec3 c;
  if (t < 0.5) {
    c = mix(violet, cyan, smoothstep(0.0, 0.5, t));
  } else {
    c = mix(cyan, rose, smoothstep(0.5, 1.0, t));
  }
  return c;
}

void main(){
  float v = texture(u_field, v_uv).r;
  float g = pow(clamp(v, 0.0, 1.0), 0.75);

  // near-black cosmic background with a faint nebula shimmer
  float shimmer = 0.010 * sin(u_time * 0.5 + v_uv.x * 8.0 + v_uv.y * 6.0);
  vec3 bg = vec3(0.015, 0.010, 0.045) + shimmer;

  vec3 glow = ramp(g) * g * 2.0;
  // luminous jellyfish core where the creature is densest
  glow += vec3(0.85, 0.95, 1.0) * smoothstep(0.65, 1.0, g) * 0.7;

  vec3 col = bg + glow;
  // soft vignette
  vec2 d = v_uv - 0.5;
  col *= 1.0 - 0.4 * dot(d, d);

  outColor = vec4(col, 1.0);
}`;

function makeShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makeProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = makeShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = makeShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export default function KidsLeniaPond() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [glOk, setGlOk] = useState<boolean | null>(null);

  // ---- mutable sim state (refs, never React state) ----
  const rafRef = useRef<number | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const texRef = useRef<WebGLTexture | null>(null);

  // field ping-pong buffers + upload buffer
  const fieldRef = useRef<Float32Array>(new Float32Array(GRID_N));
  const fieldNextRef = useRef<Float32Array>(new Float32Array(GRID_N));
  const uploadRef = useRef<Uint8Array>(new Uint8Array(GRID_N));

  // pending stamp requests (grid coords + rotation), drained each step
  const stampsRef = useRef<{ gx: number; gy: number; rot: number }[]>([]);

  // audio
  const audioRef = useRef<AudioContext | null>(null);
  const padGainRef = useRef<GainNode | null>(null);
  const pingBusRef = useRef<{ node: AudioNode; ctx: AudioContext } | null>(
    null,
  );
  const voicesRef = useRef<
    { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }[]
  >([]);
  const startedRef = useRef(false);
  const frameRef = useRef(0);

  // ---------------- audio setup ----------------
  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    type WindowWithAudio = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx =
      window.AudioContext || (window as WindowWithAudio).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    audioRef.current = ac;

    // master: bus -> warm lowpass -> compressor/limiter -> destination
    const master = ac.createGain();
    master.gain.value = 0.9;
    const warm = ac.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 2200;
    warm.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 12;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(warm);
    warm.connect(comp);
    comp.connect(ac.destination);

    // a dedicated bus for taps' pings (same master chain)
    pingBusRef.current = { node: master, ctx: ac };

    // always-on soft ambient pad: C3 + G3 detuned triangles
    const pad = ac.createGain();
    pad.gain.value = 0.0;
    pad.connect(master);
    padGainRef.current = pad;
    [
      [130.81, -4],
      [130.81, 5],
      [196.0, -3],
      [196.0, 4],
    ].forEach(([hz, cents]) => {
      const o = ac.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz;
      o.detune.value = cents;
      const g = ac.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(pad);
      o.start();
    });
    pad.gain.setTargetAtTime(0.05, ac.currentTime, 1.2);

    // 5 vertical-band pentatonic voices (triangle -> lowpass -> gain)
    const voices = BAND_HZ.map((hz) => {
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      filter.Q.value = 0.7;
      const gain = ac.createGain();
      gain.gain.value = 0.0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      return { osc, gain, filter };
    });
    voicesRef.current = voices;
  }, []);

  // soft one-octave-up ping for instant tap feedback
  const runPing = useCallback((gx: number) => {
    const bus = pingBusRef.current;
    if (!bus) return;
    const { node, ctx } = bus;
    const t = ctx.currentTime;
    // pick the pentatonic note for the tapped column, one octave up
    const band = Math.min(BANDS - 1, Math.floor((gx / GRID) * BANDS));
    const hz = BAND_HZ[band] * 2;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    osc.connect(lp);
    lp.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 0.55);
  }, []);

  // ---------------- sim helpers ----------------

  // stamp the orbium seed into the field at (gx,gy) with a quarter-turn
  // rotation (rot in 0..3), wrapping toroidally.
  const applyStamp = useCallback(
    (field: Float32Array, gx: number, gy: number, rot: number) => {
      const half = SEED / 2;
      for (let sy = 0; sy < SEED; sy++) {
        for (let sx = 0; sx < SEED; sx++) {
          const v = ORBIUM[sy * SEED + sx];
          if (v <= 0) continue;
          // rotate sample coords around seed center
          let rx = sx - half;
          let ry = sy - half;
          for (let k = 0; k < rot; k++) {
            const t = rx;
            rx = -ry;
            ry = t;
          }
          let tx = (gx + Math.round(rx)) % GRID;
          let ty = (gy + Math.round(ry)) % GRID;
          if (tx < 0) tx += GRID;
          if (ty < 0) ty += GRID;
          const idx = ty * GRID + tx;
          // overwrite with max so overlapping stamps stay clean
          if (v > field[idx]) field[idx] = v;
        }
      }
    },
    [],
  );

  const initSim = useCallback(() => {
    fieldRef.current.fill(0);
    fieldNextRef.current.fill(0);
    // one orbium dead-center on start so something is always alive
    applyStamp(fieldRef.current, GRID >> 1, GRID >> 1, 0);
  }, [applyStamp]);

  // ---------------- one Lenia step ----------------
  const stepSim = useCallback(() => {
    const field = fieldRef.current;
    const next = fieldNextRef.current;
    const kox = KERNEL.ox;
    const koy = KERNEL.oy;
    const kw = KERNEL.w;
    const kn = KERNEL.count;
    const twoSig2 = 2 * SIGMA * SIGMA;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        // convolution U = sum kernel * neighborhood (toroidal wrap)
        let u = 0;
        for (let k = 0; k < kn; k++) {
          let nx = x + kox[k];
          let ny = y + koy[k];
          // cheap toroidal wrap (offsets are within +-R << GRID)
          if (nx < 0) nx += GRID;
          else if (nx >= GRID) nx -= GRID;
          if (ny < 0) ny += GRID;
          else if (ny >= GRID) ny -= GRID;
          u += field[ny * GRID + nx] * kw[k];
        }
        // growth G(U) = 2*exp(-((U-mu)^2)/(2 sigma^2)) - 1
        const d = u - MU;
        const gG = 2 * Math.exp(-(d * d) / twoSig2) - 1;
        let a = field[y * GRID + x] + DT * gG;
        if (a < 0) a = 0;
        else if (a > 1) a = 1;
        next[y * GRID + x] = a;
      }
    }

    // swap buffers
    fieldRef.current = next;
    fieldNextRef.current = field;

    // drain any pending stamps into the now-current buffer
    const stamps = stampsRef.current;
    if (stamps.length) {
      const cur = fieldRef.current;
      for (let i = 0; i < stamps.length; i++) {
        const s = stamps[i];
        applyStamp(cur, s.gx, s.gy, s.rot);
      }
      stamps.length = 0;
    }
  }, [applyStamp]);

  // ---------------- audio from field bands ----------------
  const applyAudio = useCallback(() => {
    const ac = audioRef.current;
    if (!ac) return;
    const field = fieldRef.current;
    const voices = voicesRef.current;
    const t = ac.currentTime;
    const bandW = GRID / BANDS;

    for (let b = 0; b < BANDS; b++) {
      const voice = voices[b];
      if (!voice) continue;
      const x0 = Math.floor(b * bandW);
      const x1 = Math.floor((b + 1) * bandW);
      let mass = 0;
      let wy = 0; // weighted y for centroid
      for (let y = 0; y < GRID; y++) {
        let rowSum = 0;
        const row = y * GRID;
        for (let x = x0; x < x1; x++) rowSum += field[row + x];
        mass += rowSum;
        wy += rowSum * y;
      }
      // normalize mass to a gentle 0..1-ish range; one orbium ~ small
      const norm = Math.min(1, mass / 400);
      const gain = norm * 0.14; // capped, soft
      // vertical centroid -> +-cents detune (top bright, bottom mellow)
      const centroid = mass > 0.0001 ? wy / mass / GRID : 0.5; // 0..1
      const detune = (0.5 - centroid) * 24; // +-12 cents
      const cutoff = 400 + norm * 2200;

      voice.gain.gain.setTargetAtTime(gain, t, 0.12);
      voice.osc.detune.setTargetAtTime(detune, t, 0.2);
      voice.filter.frequency.setTargetAtTime(cutoff, t, 0.15);
    }
  }, []);

  // ---------------- render ----------------
  const drawFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const tex = texRef.current;
    if (!gl || !prog || !tex) return;

    const field = fieldRef.current;
    const up = uploadRef.current;
    for (let i = 0; i < GRID_N; i++) {
      const v = field[i];
      up[i] = v >= 1 ? 255 : (v * 255) | 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      GRID,
      GRID,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      up,
    );

    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    const tLoc = gl.getUniformLocation(prog, "u_time");
    if (tLoc) gl.uniform1f(tLoc, performance.now() / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, []);

  // ---------------- main effect: GL + loop ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setGlOk(false);
      return;
    }
    setGlOk(true);
    glRef.current = gl;

    const prog = makeProgram(gl, VERT, FRAG);
    if (!prog) {
      setGlOk(false);
      return;
    }
    progRef.current = prog;

    const quad = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    texRef.current = tex;
    gl.useProgram(prog);
    const fLoc = gl.getUniformLocation(prog, "u_field");
    if (fLoc) gl.uniform1i(fLoc, 0);

    initSim();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      frameRef.current++;
      // step the sim every frame (150x150 holds 60fps comfortably)
      stepSim();
      applyAudio();
      drawFrame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const ac = audioRef.current;
      if (ac) {
        ac.close().catch(() => {});
        audioRef.current = null;
      }
      const ext = gl.getExtension("WEBGL_lose_context");
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
      gl.deleteBuffer(vbo);
      if (ext) ext.loseContext();
      glRef.current = null;
      progRef.current = null;
      texRef.current = null;
    };
  }, [initSim, stepSim, applyAudio, drawFrame]);

  // ---------------- tap -> stamp a creature + ping ----------------
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!startedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      const gx = Math.max(0, Math.min(GRID - 1, Math.round(u * GRID)));
      const gy = Math.max(0, Math.min(GRID - 1, Math.round(v * GRID)));
      const rot = (Math.random() * 4) | 0;
      stampsRef.current.push({ gx, gy, rot });
      runPing(gx); // immediate (<50ms) feedback
    },
    [runPing],
  );

  const handleStart = useCallback(() => {
    startAudio();
    const ac = audioRef.current;
    if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    startedRef.current = true;
    setStarted(true);
  }, [startAudio]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04030f] text-white/95">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
      />

      {/* title (small, top-left) */}
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <h1 className="text-xl font-semibold text-white/95 drop-shadow">
          Lenia Pond
        </h1>
        <p className="text-base text-white/75 drop-shadow">
          Tap to grow glowing creatures
        </p>
      </div>

      {/* design notes link */}
      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/264-kids-lenia-pond/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-4 right-4 z-10 text-xs text-white/75 underline decoration-white/30 underline-offset-4"
      >
        design notes
      </a>

      {/* WebGL2 unavailable notice */}
      {glOk === false && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-rose-300">
            This browser can&apos;t show the glowing pond (WebGL2 is
            unavailable), but a gentle tone is still playing. Try a recent
            Chrome, Safari, or Firefox.
          </p>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#04030f]/70 backdrop-blur-sm">
          <div className="px-6 text-center">
            <h2 className="text-xl font-semibold text-white/95">
              Grow glowing pond creatures
            </h2>
            <p className="mt-2 text-base text-white/75">
              Tap anywhere on the dark pond. A glowing nebula creature is born,
              swims away on its own, and sings.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] min-w-[44px] rounded-full bg-violet-400/90 px-8 py-2.5 text-xl font-semibold text-[#0a0720] shadow-lg shadow-violet-400/30 active:scale-95"
          >
            Start
          </button>
        </div>
      )}
    </main>
  );
}
