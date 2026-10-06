// ─────────────────────────────────────────────────────────────────────────────
// particle-engine.ts — Resonance's real GPU particle system (WebGL2).
//
// Why: every journey layer today is a full-screen fragment shader where
// "particles" are faked per pixel and the music arrives as a handful of
// uniforms. Here every particle is a real simulated body (100k–1M), and EACH
// one listens to its OWN frequency band: the FFT is folded into 128 log bands
// and uploaded every frame as a texture the simulation samples per particle.
//
// Architecture (one frame):
//   1. SIM   — GPGPU: N×N RGBA32F position(+age) / velocity textures,
//              ping-ponged, both written in one MRT pass. Soul force laws
//              (vortex · smoke · bloom · murmuration) blend during a soul
//              change, so a transition is the particles FLOWING into a new
//              structure — never a cut.
//   2. DRAW  — gl.POINTS × N², attribute-less (texelFetch by gl_VertexID),
//              soft gaussian sprites at native DPR, additive into an RGBA16F
//              HDR target that carries trail persistence (prev × decay).
//   3. LUM   — every few frames: mip-downsample the HDR frame to 16×16 and
//              read it back ASYNC (PBO + fence, no stall) → mean displayed
//              luminance → the exposure governor (governExposure): global
//              brightness may only drift ≤2%/update. WCAG 2.3.1: the music
//              never drives brightness; this is the backstop for density.
//   4. COMP  — tonemap 1-e^(-x·exposure), sRGB, black-gated dither → canvas.
//
// The audio contract is SpectrumFrame (spectrum.ts). Pass a getter in
// options.audio; null = silence (the field idles, alive but calm).
//
// Probe: `stats()` (fps, count, bands, swell, lum, sampled particle state) —
// the dream proto mirrors it to window.__resonanceParticles.
// ─────────────────────────────────────────────────────────────────────────────

import {
  QUAD_VS,
  buildSimFS,
  EXPO_FS,
  SEED_INIT_FS,
  POS_INIT_FS,
  DRAW_VS,
  DRAW_FS,
  FADE_FS,
  LUM_FS,
  COMP_FS,
} from "./shaders";
import {
  SOULS,
  soulById,
  lerpPalette,
  texSideFor,
  dissolveEnvelope,
  DISSOLVE_SEC,
  DISSOLVE_SNAP_SEC,
  type SoulId,
  type ParticlePalette,
} from "./souls";
import type { SpectrumFrame } from "./spectrum";

export interface ParticleEngineOptions {
  /** Requested particle count (rounded to a square texture). Default 409,600. */
  count?: number;
  /** Device-pixel-ratio cap. Default min(devicePixelRatio, 2). */
  dpr?: number;
  soul?: SoulId;
  /** Override the soul palettes (casting into a journey's colours). */
  palette?: ParticlePalette | null;
  /** Audio source, polled once per frame. Return null for silence. */
  audio?: (dt: number) => SpectrumFrame | null;
  /** Sprite base diameter in CSS px. Default 2.2. */
  pointSize?: number;
  onContextLost?: () => void;
  /** Transparent canvas (premultiplied; black = see-through) so the field can
   *  composite additively over a journey's scene. Default false (opaque black). */
  transparent?: boolean;
  /** Multiplier on every soul's trail persistence (0 = no trails). Default 1. */
  trailScale?: number;
  /** Overall energy multiplier (layer gain). Default 1. */
  gain?: number;
  /** Camera distance multiplier (>1 = smaller, denser forms). Default 1. */
  camScale?: number;
  /** Speed cap (world units/s). Default 3.5. */
  maxSpeed?: number;
  /** Verification probe: async state + luminance read-back. OFF in journeys —
   *  getBufferSubData is a synchronous round trip in Chrome (the kiosk hang). */
  probe?: boolean;
  /** Frame-time watchdog: called (once) when a frame's CPU time or the rAF gap
   *  while running exceeds the budget, or a program fails. */
  watchdog?: { cpuMs: number; gapMs: number; onStall: (why: string) => void };
}

export interface ParticleStats {
  fps: number;
  /** 5th-percentile fps over the last ~2 s (stutter detector). */
  fpsLow: number;
  frameMs: number;
  count: number;
  texSide: number;
  dpr: number;
  width: number;
  height: number;
  soul: SoulId;
  transition: number;
  bands: { bass: number; mid: number; treble: number };
  bandLevels: { bass: number; mid: number; treble: number };
  rates: { bass: number; mid: number; treble: number };
  swell: number;
  onsets: number;
  audio: boolean;
  exposure: number;
  meanLum: number;
  /** Largest |Δ meanLum| between consecutive lum readings so far. */
  maxLumStep: number;
  /** Sampled particle state (one texture row, async readback). */
  state: {
    meanSpeed: number;
    /** fastest sampled particle (no-burst check) */
    maxSpeed: number;
    speedByBand: [number, number, number];
    meanRadius: number;
    radiusByBand: [number, number, number];
    samples: number;
    t: number;
  };
  frames: number;
  density: number;
  dissolve: number | null;
  hue: number;
  sat: number;
  scatter: number;
  bounce: number;
  programs: { compiling: number; ready: number; warm: number; failed: number };
  /** [program, t (ms), call ms] for each warm draw */
  warmLog: [string, number, number][];
}

export interface ParticleEngine {
  start(): void;
  stop(): void;
  dispose(): void;
  setSoul(id: SoulId, seconds?: number): void;
  setPalette(p: ParticlePalette | null): void;
  setCount(n: number): void;
  setAudio(fn: ParticleEngineOptions["audio"]): void;
  /** World visibility fraction 0..1 (sparse motes ↔ full field); glides. */
  setDensity(d: number): void;
  /**
   * Image dissolve ↔ reform: the field becomes the PREVIOUS still, breaks
   * into a music-driven swirl and reassembles into `next`. The first call
   * only primes the outgoing slot (returns false). Returns true when a
   * dissolve started; false if one is already running.
   */
  dissolveTo(next: HTMLCanvasElement | HTMLImageElement | ImageBitmap | ImageData, aspect: number, start?: boolean): boolean;
  /** Seconds into the running dissolve, or null. */
  dissolveTime(): number | null;
  /** Start a dissolve between the two stills already loaded (A → B). */
  startDissolve(): boolean;
  /** Luma-preserving colour: hue rotation (rad) + saturation; glides ~3 s. */
  setHue(hue: number, sat?: number): void;
  /** Soul form parameters (cymatic plate mode n,m · lissajous ratios); glide. */
  setForm(form: [number, number, number, number]): void;
  /** Per-appearance shape seed (0..1 ×4): petals, gears, symmetry, solid — glides. */
  setShape(shape: [number, number, number, number], snap?: boolean): void;
  /** Motion intensity multiplier (tempo / feel), 0.5..1.6. */
  setMotion(k: number): void;
  /** Playful impulse — motion only. */
  impulse(kind: "scatter" | "bounce", strength?: number): void;
  /** Melodic attractor for ~14% follower particles (null = off). */
  setMelody(pos: [number, number, number] | null, weight?: number): void;
  /** An entrance: scatter wide (invisible at presence 0) and GATHER into the
   *  current soul with the speed cap ramping up over ~5 s — never a burst. */
  enter(): void;
  /** Hue gradient across the form (rad). */
  setHueSpread(spread: number): void;
  /** Layer gain (energy), glides ~1.5 s — e.g. lifted over bright imagery. */
  setGain(k: number): void;
  /** Queue async compiles for these souls (and the blends between neighbours
   *  in the list) — call at journey start, long before they are visible. */
  prepare(souls: SoulId[]): void;
  /** Idle step while the field is invisible: poll compiles, warm ONE program
   *  (a 1-pixel draw builds its GPU pipeline). Cheap; call ~10×/s. */
  prewarm(): void;
  /** Every queued program compiled + warmed. */
  isWarm(): boolean;
  resize(): void;
  stats(): ParticleStats;
}

// ── tiny mat4 helpers (column-major) ─────────────────────────────────────────
function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(e: number[], c: number[], up: number[]): Float32Array {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
  ]);
}
function mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  return o;
}

// ── GL helpers ───────────────────────────────────────────────────────────────
type GL = WebGL2RenderingContext;

// ── programs: compiled ASYNCHRONOUSLY, never blocking the main thread ──────
// (kiosk hang 2026-10-05: a synchronous compile/link of one giant shader, then
// its Metal pipeline built at first draw, froze real Chrome). Programs are
// compiled with KHR_parallel_shader_compile; status is only queried once the
// driver says it is complete, and every program is "warmed" (one 1-pixel
// draw) while the field is invisible before it is ever used on screen.
interface Prog {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
  vs: WebGLShader | null;
  fs: WebGLShader | null;
  state: "compiling" | "ready" | "failed";
  warm: boolean;
  error?: string;
}

function startProgram(gl: GL, vsSrc: string, fsSrc: string): Prog {
  const p = gl.createProgram()!;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(vs);
  gl.compileShader(fs);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  return { p, u: {}, vs, fs, state: "compiling", warm: false };
}

/** Non-blocking: true once linked. Without the parallel-compile extension the
 *  first status query waits for the compile (the only blocking fallback). */
function pollProgram(gl: GL, pr: Prog, par: { COMPLETION_STATUS_KHR: number } | null): boolean {
  if (pr.state === "ready") return true;
  if (pr.state === "failed") return false;
  if (par && !gl.getProgramParameter(pr.p, par.COMPLETION_STATUS_KHR)) return false;
  if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
    pr.state = "failed";
    pr.error = `${gl.getProgramInfoLog(pr.p) ?? ""} ${pr.fs ? gl.getShaderInfoLog(pr.fs) ?? "" : ""}`.slice(0, 400);
    return false;
  }
  const n = gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(pr.p, i);
    if (info) pr.u[info.name] = gl.getUniformLocation(pr.p, info.name);
  }
  if (pr.vs) gl.deleteShader(pr.vs);
  if (pr.fs) gl.deleteShader(pr.fs);
  pr.vs = pr.fs = null;
  pr.state = "ready";
  return true;
}

function floatTex(gl: GL, w: number, h: number, data: Float32Array | null): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  return t;
}

/** Async GPU→CPU read: PBO + fence, polled on later frames (never stalls). */
class AsyncRead {
  private pbo: WebGLBuffer;
  private sync: WebGLSync | null = null;
  readonly out: Float32Array;
  constructor(private gl: GL, floats: number) {
    this.out = new Float32Array(floats);
    this.pbo = gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, floats * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }
  get busy() { return this.sync !== null; }
  /** Read from the currently bound READ_FRAMEBUFFER / readBuffer. */
  request(x: number, y: number, w: number, h: number) {
    const gl = this.gl;
    if (this.sync) return;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }
  /** True when fresh data landed in `out`. */
  poll(): boolean {
    const gl = this.gl;
    if (!this.sync) return false;
    const st = gl.getSyncParameter(this.sync, gl.SYNC_STATUS);
    if (st !== gl.SIGNALED) return false;
    gl.deleteSync(this.sync);
    this.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return true;
  }
  dispose() {
    if (this.sync) this.gl.deleteSync(this.sync);
    this.gl.deleteBuffer(this.pbo);
  }
}

export class ParticleEngineUnsupported extends Error {}

/** JS mirror of SEED_INIT_FS's hash (probe only). */
function seedHash(px: number, py: number, k: number): number {
  const fr = (x: number) => x - Math.floor(x);
  let qx = fr(px * 0.1031 + k), qy = fr(py * 0.1030 + k), qz = fr(px * 0.0973 + k);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fr((qx + qy) * qz);
}

/** Throws ParticleEngineUnsupported when WebGL2 float render targets are missing. */
export function createParticleEngine(
  canvas: HTMLCanvasElement,
  opts: ParticleEngineOptions = {},
): ParticleEngine {
  const transparent = !!opts.transparent;
  const trailScale = opts.trailScale ?? 1;
  let layerGain = opts.gain ?? 1;
  let layerGainTarget = layerGain;
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: transparent,
    depth: false,
    stencil: false,
    premultipliedAlpha: transparent,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new ParticleEngineUnsupported("WebGL2 unavailable");
  if (!gl.getExtension("EXT_color_buffer_float"))
    throw new ParticleEngineUnsupported("float render targets unavailable");

  const BINS = 128;
  let audioFn = opts.audio ?? null;
  let paletteOverride: ParticlePalette | null = opts.palette ?? null;
  const pointCss = opts.pointSize ?? 2.2;

  const par = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  const probe = !!opts.probe;
  const draw = startProgram(gl, DRAW_VS, DRAW_FS);
  const fade = startProgram(gl, QUAD_VS, FADE_FS);
  const lum = startProgram(gl, QUAD_VS, LUM_FS);
  const expo = startProgram(gl, QUAD_VS, EXPO_FS);
  const comp = startProgram(gl, QUAD_VS, COMP_FS);
  const seedInit = startProgram(gl, QUAD_VS, SEED_INIT_FS);
  const posInit = startProgram(gl, QUAD_VS, POS_INIT_FS);
  const fixedProgs = [seedInit, posInit, draw, fade, lum, expo, comp];
  let particlesInitialised = false;
  // which program warmed when, and how long the call took (diagnostics)
  const warmLog: [string, number, number][] = [];
  // simulation variants: one per soul pair, only the force laws they need
  const simProgs = new Map<string, Prog>();
  const simProgFor = (a: number, b: number): Prog => {
    const k = a <= b ? `${a},${b}` : `${b},${a}`;
    let pr = simProgs.get(k);
    if (!pr) {
      pr = startProgram(gl!, QUAD_VS, buildSimFS([a, b]));
      simProgs.set(k, pr);
    }
    return pr;
  };
  let stalled = false;
  const stall = (why: string) => {
    if (stalled) return;
    stalled = true;
    opts.watchdog?.onStall(why);
  };
  const vao = gl.createVertexArray();

  // ── spectrum texture ─────────────────────────────────────────────────────
  const specData = new Float32Array(BINS * 2);
  const specTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, specTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, BINS, 1, 0, gl.RG, gl.FLOAT, specData);

  // ── particle state ───────────────────────────────────────────────────────
  let side = texSideFor(opts.count ?? 409_600);
  let count = side * side;
  let posTex: WebGLTexture[] = [];
  let velTex: WebGLTexture[] = [];
  let seedTex: WebGLTexture | null = null;
  let simFbo: WebGLFramebuffer[] = [];
  let seedFbo: WebGLFramebuffer | null = null;
  let seedBand = new Float32Array(0); // CPU copy of row 0 bands (probe)
  let cur = 0;
  let stateRead: AsyncRead | null = null;
  let velRead: AsyncRead | null = null;

  function buildParticles() {
    for (const t of [...posTex, ...velTex]) gl!.deleteTexture(t);
    if (seedTex) gl!.deleteTexture(seedTex);
    for (const f of simFbo) gl!.deleteFramebuffer(f);
    stateRead?.dispose();
    velRead?.dispose();

    count = side * side;
    // contents are written on the GPU (SEED_INIT / POS_INIT) once those
    // programs are ready — no JS loop, no multi-MB uploads on the main thread
    seedBand = new Float32Array(side);
    for (let x = 0; x < side; x++) seedBand[x] = Math.pow(seedHash(x + 0.5, 0.5, 0.17), 1.25); // probe: row-0 bands (mirrors SEED_INIT)
    posTex = [floatTex(gl!, side, side, null), floatTex(gl!, side, side, null)];
    velTex = [floatTex(gl!, side, side, null), floatTex(gl!, side, side, null)];
    seedTex = floatTex(gl!, side, side, null);
    particlesInitialised = false;
    simFbo = [0, 1].map((k) => {
      const f = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, posTex[k], 0);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT1, gl!.TEXTURE_2D, velTex[k], 0);
      gl!.drawBuffers([gl!.COLOR_ATTACHMENT0, gl!.COLOR_ATTACHMENT1]);
      // (no checkFramebufferStatus: a synchronous GPU round trip — RGBA32F MRT
      // is complete whenever EXT_color_buffer_float exists, checked above)
      return f;
    });
    if (seedFbo) gl!.deleteFramebuffer(seedFbo);
    seedFbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, seedFbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, seedTex, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    cur = 0;
    stateRead = probe ? new AsyncRead(gl!, side * 4) : null;
    velRead = probe ? new AsyncRead(gl!, side * 4) : null;
    fadeIn = 0;
  }

  // ── HDR targets ──────────────────────────────────────────────────────────
  let W = 1, H = 1, levels = 1;
  let hdrTex: WebGLTexture[] = [];
  let hdrFbo: WebGLFramebuffer[] = [];
  let hcur = 0;
  const lumTex = floatTex(gl, 16, 16, null);
  const lumFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, lumFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lumTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // GPU exposure governor: 1×1 ping-pong (r = exposure, g = mean luminance)
  const expTex = [floatTex(gl, 1, 1, new Float32Array([1, 0, 0, 1])), floatTex(gl, 1, 1, new Float32Array([1, 0, 0, 1]))];
  const expFbo = expTex.map((t) => {
    const f = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return f;
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let ecur = 0;
  let expInit = true;
  const lumRead = probe ? new AsyncRead(gl, 4) : null; // probe only: the 1×1 exposure/mean
  const dprCap = opts.dpr ?? Math.min(window.devicePixelRatio || 1, 2);
  let dpr = dprCap;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(16, Math.round(r.width * dpr));
    const h = Math.max(16, Math.round(r.height * dpr));
    if (w === W && h === H && hdrTex.length) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    for (const t of hdrTex) gl!.deleteTexture(t);
    for (const f of hdrFbo) gl!.deleteFramebuffer(f);
    levels = Math.floor(Math.log2(Math.max(W, H))) + 1;
    hdrTex = [0, 1].map(() => {
      const t = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texStorage2D(gl!.TEXTURE_2D, levels, gl!.RGBA16F, W, H);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      return t;
    });
    hdrFbo = hdrTex.map((t) => {
      const f = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, t, 0);
      gl!.clearColor(0, 0, 0, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      return f;
    });
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  // ── soul + camera state ─────────────────────────────────────────────────
  let soulA = soulById(opts.soul ?? "vortex");
  let soulB = soulA;
  let mix = 0;
  let mixDur = 7;
  // a requested soul waits here until its blend program is compiled + warm
  let pendingSoul: ReturnType<typeof soulById> | null = null;
  let pendingDur = 7;
  let framesSinceStart = 0;
  let az = 0;
  let exposure = 1;
  let meanLum = 0;
  let lastLum = -1;
  let maxLumStep = 0;
  let fadeIn = 0;
  const clocks = { bass: 0, mid: 0, treble: 0 };
  let lastFrame: SpectrumFrame | null = null;
  let density = 1;
  let densityTarget = 1;
  let hue = 0, hueTarget = 0, sat = 1, satTarget = 1;
  const form: [number, number, number, number] = [3, 5, 1.5, 2];
  const shape: [number, number, number, number] = [0, 0.3, 0.5, 0.5];
  let shapeTarget: [number, number, number, number] = [0, 0.3, 0.5, 0.5];
  let formTarget: [number, number, number, number] = [3, 5, 1.5, 2];
  let motion = 1, motionTarget = 1;
  let scatterEnv = 0, scatterTarget = 0, bounceEnv = 0, bounceSign = 1;
  const melody: [number, number, number] = [0, 0, 0];
  let melodyTarget: [number, number, number] = [0, 0, 0];
  let melodyW = 0, melodyWTarget = 0;
  const camScale = opts.camScale ?? 1;
  const speedCap = opts.maxSpeed ?? 3.5;
  let entryT = 1e9;
  let disperseNext = false;
  let hueSpread = 0.35, hueSpreadTarget = 0.35, hueWave = 0;

  // ── image slots (A = outgoing still, B = incoming) ──────────────────────
  const mkImgTex = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  };
  let imgTex: [WebGLTexture, WebGLTexture] = [mkImgTex(), mkImgTex()];
  let imgAspect: [number, number] = [16 / 9, 16 / 9];
  let haveB = false;
  let dissolveT: number | null = null;
  let snapped = false;

  const state: ParticleStats["state"] = {
    meanSpeed: 0, maxSpeed: 0, speedByBand: [0, 0, 0], meanRadius: 0, radiusByBand: [0, 0, 0], samples: 0, t: 0,
  };
  const frameTimes: number[] = [];
  let fpsEma = 60;
  let frames = 0;
  let time = 0;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let lost = false;

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    running = false;
    cancelAnimationFrame(raf);
    opts.onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  buildParticles();
  resize();
  simProgFor(soulA.index, soulA.index); // the opening soul starts compiling now

  function bindTex(unit: number, tex: WebGLTexture | null, loc: WebGLUniformLocation | null | undefined) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    if (loc) gl!.uniform1i(loc, unit);
  }

  function frame(now: number) {
    if (!running || lost || stalled) return;
    raf = requestAnimationFrame(frame);
    const g = gl!;
    const frameT0 = performance.now();
    const rawDt = lastT ? (now - lastT) / 1000 : 1 / 60;
    lastT = now;
    framesSinceStart++;
    // WATCHDOG: a long rAF gap while we run (the page was blocked) disarms us
    const wd = opts.watchdog;
    if (wd && framesSinceStart > 3 && rawDt * 1000 > wd.gapMs && typeof document !== "undefined" && document.visibilityState === "visible") {
      stall(`frame gap ${Math.round(rawDt * 1000)} ms`);
      return;
    }
    const dt = Math.min(1 / 20, Math.max(1 / 240, rawDt));
    time += dt;
    frames++;

    // fps bookkeeping (raw, unclamped)
    if (rawDt > 0 && rawDt < 1) {
      frameTimes.push(rawDt);
      if (frameTimes.length > 120) frameTimes.shift();
      fpsEma += (1 / rawDt - fpsEma) * 0.05;
    }

    resize();

    // ── audio → spectrum texture ───────────────────────────────────────────
    const f = audioFn ? audioFn(dt) : null;
    lastFrame = f;
    if (f) {
      for (let i = 0; i < BINS; i++) {
        const k = Math.min(f.bins - 1, Math.floor((i / BINS) * f.bins));
        specData[i * 2] = f.levels[k];
        specData[i * 2 + 1] = f.drive[k];
      }
    } else {
      for (let i = 0; i < BINS * 2; i++) specData[i] *= 0.94;
    }
    g.bindTexture(g.TEXTURE_2D, specTex);
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, BINS, 1, g.RG, g.FLOAT, specData);
    const rates = f?.rates ?? { bass: 1, mid: 1, treble: 1 };
    clocks.bass += dt * rates.bass;
    clocks.mid += dt * rates.mid;
    clocks.treble += dt * rates.treble;

    // ── readiness: never draw with a program that is not compiled + warm ────
    for (const pr of fixedProgs) pollProgram(g, pr, par);
    if (pendingSoul && soulB === soulA) {
      const pp = simProgFor(soulA.index, pendingSoul.index);
      if (pollProgram(g, pp, par) && !pp.warm) prewarmStep(); // not pre-queued: warm it now (one small program)
      if (pp.state === "ready" && pp.warm) {
        soulB = pendingSoul;
        mix = 0;
        mixDur = pendingDur;
        pendingSoul = null;
      }
    }
    {
      const sp = simProgFor(soulA.index, soulB.index);
      pollProgram(g, sp, par);
      if (!fixedProgs.every((pr) => pr.warm) || !sp.warm || !particlesInitialised) {
        prewarmStep(); // warm one program, draw nothing yet (the layer keeps us hidden)
        return;
      }
    }

    // ── soul transition ───────────────────────────────────────────────────
    if (soulB !== soulA) {
      mix = Math.min(1, mix + dt / mixDur);
      if (mix >= 1) { soulA = soulB; mix = 0; }
    }
    const e = mix * mix * (3 - 2 * mix);
    const soulW = (id: SoulId) => (soulA.id === id ? 1 - e : 0) + (soulB !== soulA && soulB.id === id ? e : 0);
    const smokeW = soulW("smoke");
    const lerpS = (k: (x: typeof soulA) => number) => k(soulA) + (k(soulB) - k(soulA)) * (soulB === soulA ? 0 : e);
    const wrap = [0, 1, 2].map((i) => lerpS((x) => x.wrap[i]));
    const inkW = lerpS((x) => (x.respawn === "ink" ? 1 : 0));
    const fountainW = lerpS((x) => (x.respawn === "fountain" ? 1 : 0));
    const sizeK = lerpS((x) => x.size);
    const densityCap = lerpS((x) => x.maxDensity);

    // world density glides (~2.5 s) — motes appear/vanish one by one
    density += (densityTarget - density) * (1 - Math.exp(-dt / 2.5));
    const kHue = 1 - Math.exp(-dt / 3);
    hue += (hueTarget - hue) * kHue;
    sat += (satTarget - sat) * kHue;
    for (let i = 0; i < 4; i++) form[i] += (formTarget[i] - form[i]) * (1 - Math.exp(-dt / 4));
    for (let i = 0; i < 4; i++) shape[i] += (shapeTarget[i] - shape[i]) * (1 - Math.exp(-dt / 2.5));
    motion += (motionTarget - motion) * (1 - Math.exp(-dt / 2));
    // impulses: scatter rises ~0.3 s then the target decays (~1.8 s); bounce rings ~0.35 s
    scatterEnv += (scatterTarget - scatterEnv) * (1 - Math.exp(-dt / 0.3));
    scatterTarget *= Math.exp(-dt / 1.8);
    bounceEnv *= Math.exp(-dt / 0.35);
    for (let i = 0; i < 3; i++) melody[i] += (melodyTarget[i] - melody[i]) * (1 - Math.exp(-dt / 0.6));
    melodyW += (melodyWTarget - melodyW) * (1 - Math.exp(-dt / 1.5));
    const simDt = dt * motion;
    entryT += dt;
    const entryK = Math.min(1, entryT / 5);
    const maxSpeedNow = 0.45 + (speedCap - 0.45) * entryK * entryK * (3 - 2 * entryK);
    const disperseNow = disperseNext;
    disperseNext = false;
    hueSpread += (hueSpreadTarget - hueSpread) * kHue;
    layerGain += (layerGainTarget - layerGain) * (1 - Math.exp(-dt / 1.5));
    hueWave += ((lastFrame?.swell ?? 0) * 0.6 - hueWave) * (1 - Math.exp(-dt / 1.2));

    // dissolve timeline
    let snapNow = false;
    if (dissolveT !== null) {
      const prevT = dissolveT;
      dissolveT += dt;
      if (!snapped && prevT < DISSOLVE_SNAP_SEC && dissolveT >= DISSOLVE_SNAP_SEC) { snapNow = true; snapped = true; }
      if (dissolveT >= DISSOLVE_SEC) dissolveT = null;
    }
    const env = dissolveEnvelope(dissolveT);

    // camera (the image plane faces it, so compute before the sim)
    const lerp = (a: number, b: number) => a + (b - a) * e;
    az += dt * lerp(soulA.camSpin, soulB.camSpin);
    const elev = lerp(soulA.camElev, soulB.camElev);
    const dist = lerp(soulA.camDist, soulB.camDist) * camScale;
    const eye = [Math.cos(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.sin(az) * Math.cos(elev) * dist];
    const FOV = 0.85;
    const proj = perspective(FOV, W / H, 0.05, 50);
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const vp = mul(proj, view);
    // camera basis from the view matrix rows (column-major)
    const right = [view[0], view[4], view[8]];
    const up = [view[1], view[5], view[9]];
    const halfH = dist * Math.tan(FOV / 2);
    const halfW = halfH * (W / H);

    // ── 1. SIM ────────────────────────────────────────────────────────────
    const nxt = 1 - cur;
    g.disable(g.BLEND);
    g.bindVertexArray(vao);
    g.bindFramebuffer(g.FRAMEBUFFER, simFbo[nxt]);
    g.viewport(0, 0, side, side);
    const sim = simProgFor(soulA.index, soulB.index);
    g.useProgram(sim.p);
    bindTex(0, posTex[cur], sim.u.uPos);
    bindTex(1, velTex[cur], sim.u.uVel);
    bindTex(2, seedTex, sim.u.uSeed);
    bindTex(3, specTex, sim.u.uSpec);
    g.uniform1f(sim.u.uDt, simDt);
    g.uniform1f(sim.u.uTime, time);
    g.uniform3f(sim.u.uClock, clocks.bass, clocks.mid, clocks.treble);
    g.uniform3f(sim.u.uBands, f?.bands.bass ?? 0, f?.bands.mid ?? 0, f?.bands.treble ?? 0);
    g.uniform3f(sim.u.uBandLv, f?.bandLevels.bass ?? 0, f?.bandLevels.mid ?? 0, f?.bandLevels.treble ?? 0);
    g.uniform1f(sim.u.uSwell, f?.swell ?? 0);
    g.uniform1i(sim.u.uSoulA, soulA.index);
    g.uniform1i(sim.u.uSoulB, soulB.index);
    g.uniform1f(sim.u.uMix, soulB === soulA ? 0 : e);
    g.uniform1i(sim.u.uTexW, side);
    g.uniform1f(sim.u.uCount, count);
    g.uniform1f(sim.u.uSmokeW, smokeW);
    g.uniform3f(sim.u.uWrap, wrap[0], wrap[1], wrap[2]);
    g.uniform1f(sim.u.uInkW, inkW);
    g.uniform1f(sim.u.uFountainW, fountainW);
    g.uniform4f(sim.u.uForm, form[0], form[1], form[2], form[3]);
    if (sim.u.uShape) g.uniform4f(sim.u.uShape, shape[0], shape[1], shape[2], shape[3]);
    if (sim.u.uCamAz) g.uniform1f(sim.u.uCamAz, az);
    g.uniform1f(sim.u.uMaxSpeed, maxSpeedNow);
    g.uniform1f(sim.u.uDisperse, disperseNow ? 1 : 0);
    g.uniform1f(sim.u.uScatter, scatterEnv);
    g.uniform1f(sim.u.uBounce, bounceEnv * bounceSign);
    g.uniform3f(sim.u.uMelody, melody[0], melody[1], melody[2]);
    g.uniform1f(sim.u.uMelodyW, melodyW);
    g.uniform1f(sim.u.uImgForm, env.imgForm);
    g.uniform1f(sim.u.uImgShow, env.imgShow);
    g.uniform1f(sim.u.uSnap, snapNow ? 1 : 0);
    g.uniform3f(sim.u.uPlaneC, 0, 0, 0);
    g.uniform3f(sim.u.uPlaneR, right[0] * halfW, right[1] * halfW, right[2] * halfW);
    g.uniform3f(sim.u.uPlaneU, up[0] * halfH, up[1] * halfH, up[2] * halfH);
    g.uniform1f(sim.u.uImgAspect, imgAspect[1]);
    g.uniform1f(sim.u.uScrAspect, W / H);
    g.drawArrays(g.TRIANGLES, 0, 3);
    cur = nxt;

    // sampled particle state for the probe (row 0, async)
    if (stateRead && velRead) {
      if (stateRead.poll()) digestState(stateRead.out, "pos");
      if (velRead.poll()) digestState(velRead.out, "vel");
      if (frames % 12 === 0 && !stateRead.busy && !velRead.busy) {
        g.bindFramebuffer(g.READ_FRAMEBUFFER, simFbo[cur]);
        g.readBuffer(g.COLOR_ATTACHMENT0);
        stateRead.request(0, 0, side, 1);
        g.readBuffer(g.COLOR_ATTACHMENT1);
        velRead.request(0, 0, side, 1);
        g.bindFramebuffer(g.READ_FRAMEBUFFER, null);
      }
    }

    // ── palette ───────────────────────────────────────────────────────────
    const pal = paletteOverride ?? lerpPalette(soulA.palette, soulB.palette, e);
    const trail = lerp(soulA.trail, soulB.trail) * trailScale;
    const intensity = lerp(soulA.intensity, soulB.intensity);
    fadeIn = Math.min(1, fadeIn + dt / 2.5);

    // ── 2. FADE + DRAW into HDR ───────────────────────────────────────────
    const hn = 1 - hcur;
    g.bindFramebuffer(g.FRAMEBUFFER, hdrFbo[hn]);
    g.viewport(0, 0, W, H);
    g.useProgram(fade.p);
    bindTex(0, hdrTex[hcur], fade.u.uPrev);
    g.uniform1f(fade.u.uDecay, Math.pow(trail, dt * 60));
    g.drawArrays(g.TRIANGLES, 0, 3);

    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.useProgram(draw.p);
    bindTex(0, posTex[cur], draw.u.uPos);
    bindTex(1, velTex[cur], draw.u.uVel);
    bindTex(2, seedTex, draw.u.uSeed);
    g.uniformMatrix4fv(draw.u.uVP, false, vp);
    g.uniform1i(draw.u.uTexW, side);
    g.uniform1f(draw.u.uPointPx, pointCss * dpr);
    g.uniform1f(draw.u.uFocal, dist);
    // energy normalised to count so density presets stay in the same budget;
    // trails accumulate ~1/(1-trail), compensate so souls sit at equal energy
    const alpha = 0.06 * layerGain * intensity * fadeIn * (409_600 / count) * (1 - trail * 0.85);
    g.uniform1f(draw.u.uAlpha, alpha);
    g.uniform3fv(draw.u.uPalLow, pal.low);
    g.uniform3fv(draw.u.uPalMid, pal.mid);
    g.uniform3fv(draw.u.uPalHigh, pal.high);
    g.uniform1f(draw.u.uSmokeW, smokeW);
    g.uniform1f(draw.u.uInkW, inkW);
    g.uniform3f(draw.u.uWrap, wrap[0], wrap[1], wrap[2]);
    g.uniform1f(draw.u.uSize, sizeK);
    g.uniform1f(draw.u.uHue, hue);
    g.uniform1f(draw.u.uSat, sat);
    g.uniform1f(draw.u.uHueSpread, hueSpread);
    g.uniform1f(draw.u.uHueWave, hueWave);
    g.uniform1f(draw.u.uTimeD, time);
    g.uniform1f(draw.u.uDensity, Math.min(density, densityCap));
    g.uniform1f(draw.u.uWorldFade, env.worldFade);
    bindTex(3, imgTex[0], draw.u.uImgA);
    bindTex(4, imgTex[1], draw.u.uImgB);
    g.uniform1f(draw.u.uColorMix, env.colorMix);
    g.uniform1f(draw.u.uImgShow, env.imgShow);
    // an image formed by ~N soft sprites: per-sprite gain so the particle
    // still sits near (below) the real still's brightness
    g.uniform1f(draw.u.uImgGain, 0.5 * (409_600 / count) * fadeIn * (W * H) / (2880 * 1800));
    g.uniform1f(draw.u.uImgAspect, imgAspect[1]);
    g.uniform1f(draw.u.uScrAspect, W / H);
    g.drawArrays(g.POINTS, 0, count);
    g.disable(g.BLEND);
    hcur = hn;

    // ── 3. LUM governor — entirely on the GPU, no read-back ────────────────
    if (frames % 4 === 0) {
      g.bindTexture(g.TEXTURE_2D, hdrTex[hcur]);
      g.generateMipmap(g.TEXTURE_2D);
      g.bindFramebuffer(g.FRAMEBUFFER, lumFbo);
      g.viewport(0, 0, 16, 16);
      g.useProgram(lum.p);
      bindTex(0, hdrTex[hcur], lum.u.uHdr);
      bindTex(1, expTex[ecur], lum.u.uExp);
      g.uniform1f(lum.u.uLod, Math.max(0, Math.log2(Math.max(W, H) / 16)));
      g.drawArrays(g.TRIANGLES, 0, 3);
      const en = 1 - ecur;
      g.bindFramebuffer(g.FRAMEBUFFER, expFbo[en]);
      g.viewport(0, 0, 1, 1);
      g.useProgram(expo.p);
      bindTex(0, lumTex, expo.u.uLum);
      bindTex(1, expTex[ecur], expo.u.uPrev);
      g.uniform1f(expo.u.uCap, 0.13);
      g.uniform1f(expo.u.uMaxStep, 0.02);
      g.uniform1f(expo.u.uInit, expInit ? 1 : 0);
      g.drawArrays(g.TRIANGLES, 0, 3);
      expInit = false;
      ecur = en;
      // probe only (verification runs): read the 1×1 back, async
      if (lumRead) {
        if (lumRead.poll()) {
          exposure = lumRead.out[0];
          const m = lumRead.out[1];
          if (lastLum >= 0) maxLumStep = Math.max(maxLumStep, Math.abs(m - lastLum));
          lastLum = m;
          meanLum = m;
        }
        if (!lumRead.busy && frames % 16 === 0) {
          g.bindFramebuffer(g.READ_FRAMEBUFFER, expFbo[ecur]);
          g.readBuffer(g.COLOR_ATTACHMENT0);
          lumRead.request(0, 0, 1, 1);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, null);
        }
      }
    }

    // ── 4. COMPOSITE ──────────────────────────────────────────────────────
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, W, H);
    g.useProgram(comp.p);
    bindTex(0, hdrTex[hcur], comp.u.uHdr);
    bindTex(1, expTex[ecur], comp.u.uExp);
    g.uniform1f(comp.u.uTransparent, transparent ? 1 : 0);
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.bindVertexArray(null);
    const cpu = performance.now() - frameT0;
    if (wd && framesSinceStart > 3 && cpu > wd.cpuMs) stall(`frame cpu ${Math.round(cpu)} ms`);
  }

  // ── prewarm: compile polling + ONE 1-pixel warm draw per call ──────────────
  // A program's GPU pipeline is built at its first draw (ANGLE/Metal); doing
  // that here, while the field is invisible and one program at a time, keeps
  // it off every visible frame (the kiosk hang).
  let lastWarmAt = -1e9;
  function prewarmStep() {
    if (lost || stalled) return;
    const g = gl!;
    const t0 = performance.now();
    // at most one GPU pipeline build per 350 ms, visible or not
    if (t0 - lastWarmAt < 350) return;
    const all = [...fixedProgs, ...simProgs.values()];
    for (const pr of all) {
      pollProgram(g, pr, par);
      if (pr.state === "failed") { stall(`program failed: ${pr.error ?? ""}`); return; }
    }
    if (!particlesInitialised && seedInit.warm && posInit.warm) {
      // re-initialise after setCount (programs already warm): two full passes
      g.bindVertexArray(vao);
      g.bindFramebuffer(g.FRAMEBUFFER, seedFbo);
      g.viewport(0, 0, side, side);
      g.useProgram(seedInit.p);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.bindFramebuffer(g.FRAMEBUFFER, simFbo[cur]);
      g.useProgram(posInit.p);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.bindVertexArray(null);
      particlesInitialised = true;
      return;
    }
    const cold = all.find((pr) => pr.state === "ready" && !pr.warm);
    if (!cold) return;
    g.bindVertexArray(vao);
    g.enable(g.SCISSOR_TEST);
    g.scissor(0, 0, 1, 1);
    const hn = 1 - hcur;
    const tw = performance.now();
    if (cold === seedInit) {
      g.disable(g.SCISSOR_TEST); // full pass: this IS the initialisation
      g.bindFramebuffer(g.FRAMEBUFFER, seedFbo);
      g.viewport(0, 0, side, side);
      g.useProgram(seedInit.p);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else if (cold === posInit) {
      g.disable(g.SCISSOR_TEST);
      g.bindFramebuffer(g.FRAMEBUFFER, simFbo[cur]);
      g.viewport(0, 0, side, side);
      g.useProgram(posInit.p);
      g.drawArrays(g.TRIANGLES, 0, 3);
      particlesInitialised = true;
    } else if (cold === draw) {
      g.bindFramebuffer(g.FRAMEBUFFER, hdrFbo[hn]);
      g.viewport(0, 0, W, H);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE);
      g.useProgram(draw.p);
      bindTex(0, posTex[cur], draw.u.uPos);
      bindTex(1, velTex[cur], draw.u.uVel);
      bindTex(2, seedTex, draw.u.uSeed);
      bindTex(3, imgTex[0], draw.u.uImgA);
      bindTex(4, imgTex[1], draw.u.uImgB);
      g.uniform1i(draw.u.uTexW, side);
      g.uniform1f(draw.u.uAlpha, 0);
      g.drawArrays(g.POINTS, 0, 1);
      g.disable(g.BLEND);
    } else if (cold === fade) {
      g.bindFramebuffer(g.FRAMEBUFFER, hdrFbo[hn]);
      g.viewport(0, 0, W, H);
      g.useProgram(fade.p);
      bindTex(0, hdrTex[hcur], fade.u.uPrev);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else if (cold === lum) {
      g.bindFramebuffer(g.FRAMEBUFFER, lumFbo);
      g.viewport(0, 0, 16, 16);
      g.useProgram(lum.p);
      bindTex(0, hdrTex[hcur], lum.u.uHdr);
      bindTex(1, expTex[ecur], lum.u.uExp);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else if (cold === expo) {
      g.bindFramebuffer(g.FRAMEBUFFER, expFbo[1 - ecur]);
      g.viewport(0, 0, 1, 1);
      g.useProgram(expo.p);
      bindTex(0, lumTex, expo.u.uLum);
      bindTex(1, expTex[ecur], expo.u.uPrev);
      g.uniform1f(expo.u.uInit, 1);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else if (cold === comp) {
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, W, H);
      g.useProgram(comp.p);
      bindTex(0, hdrTex[hcur], comp.u.uHdr);
      bindTex(1, expTex[ecur], comp.u.uExp);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else {
      // a simulation variant: one texel of the NEXT state (overwritten next step)
      g.bindFramebuffer(g.FRAMEBUFFER, simFbo[1 - cur]);
      g.viewport(0, 0, side, side);
      g.useProgram(cold.p);
      bindTex(0, posTex[cur], cold.u.uPos);
      bindTex(1, velTex[cur], cold.u.uVel);
      bindTex(2, seedTex, cold.u.uSeed);
      bindTex(3, specTex, cold.u.uSpec);
      g.uniform1i(cold.u.uTexW, side);
      g.uniform1f(cold.u.uCount, count);
      g.drawArrays(g.TRIANGLES, 0, 3);
    }
    g.disable(g.SCISSOR_TEST);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.bindVertexArray(null);
    cold.warm = true;
    lastWarmAt = performance.now();
    warmLog.push([cold === seedInit ? "seedInit" : cold === posInit ? "posInit" : cold === draw ? "draw" : cold === fade ? "fade" : cold === lum ? "lum" : cold === expo ? "expo" : cold === comp ? "comp" : "sim", Math.round(tw), Math.round((performance.now() - tw) * 10) / 10]);
    if (warmLog.length > 40) warmLog.shift();
    const cpu = performance.now() - t0;
    if (opts.watchdog && cpu > opts.watchdog.cpuMs) stall(`prewarm cpu ${Math.round(cpu)} ms`);
  }

  let pendingPos: Float32Array | null = null;
  function digestState(buf: Float32Array, kind: "pos" | "vel") {
    if (kind === "pos") { pendingPos = buf.slice(); return; }
    const n = side;
    let sp = 0, rr = 0, mx = 0;
    const sb = [0, 0, 0], rb = [0, 0, 0], cb = [0, 0, 0];
    for (let x = 0; x < n; x++) {
      const v = Math.hypot(buf[x * 4], buf[x * 4 + 1], buf[x * 4 + 2]);
      const r = pendingPos ? Math.hypot(pendingPos[x * 4], pendingPos[x * 4 + 1], pendingPos[x * 4 + 2]) : 0;
      const b = seedBand[x] < 0.33 ? 0 : seedBand[x] < 0.66 ? 1 : 2;
      sp += v; rr += r; sb[b] += v; rb[b] += r; cb[b]++;
      if (v > mx) mx = v;
    }
    state.meanSpeed = sp / n;
    state.maxSpeed = mx;
    state.meanRadius = rr / n;
    state.speedByBand = [0, 1, 2].map((k) => (cb[k] ? sb[k] / cb[k] : 0)) as [number, number, number];
    state.radiusByBand = [0, 1, 2].map((k) => (cb[k] ? rb[k] / cb[k] : 0)) as [number, number, number];
    state.samples = n;
    state.t = time;
  }

  return {
    start() {
      if (running || lost || stalled) return;
      running = true;
      framesSinceStart = 0;
      lastT = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (lost) return;
      stateRead?.dispose();
      velRead?.dispose();
      lumRead?.dispose();
      for (const t of [...posTex, ...velTex, ...hdrTex, lumTex, specTex, ...imgTex, ...expTex]) gl.deleteTexture(t);
      if (seedTex) gl.deleteTexture(seedTex);
      if (seedFbo) gl.deleteFramebuffer(seedFbo);
      for (const fb of [...simFbo, ...hdrFbo, lumFbo, ...expFbo]) gl.deleteFramebuffer(fb);
      for (const p of [...fixedProgs, ...simProgs.values()]) gl.deleteProgram(p.p);
      gl.deleteVertexArray(vao);
    },
    setSoul(id, seconds = 7) {
      const next = soulById(id);
      if (soulB !== soulA) { soulA = soulB; mix = 0; } // settle a transition in flight
      pendingSoul = next === soulA ? null : next;
      pendingDur = Math.max(0.5, seconds);
      if (pendingSoul) simProgFor(soulA.index, next.index); // queue its compile now
    },
    prepare(souls) {
      const idx = souls.map((x) => soulById(x).index);
      idx.forEach((a, i) => {
        simProgFor(a, a);
        if (i > 0 && idx[i - 1] !== a) simProgFor(idx[i - 1], a);
      });
    },
    prewarm() {
      if (!running) prewarmStep();
    },
    isWarm() {
      return [...fixedProgs, ...simProgs.values()].every((pr) => pr.warm);
    },
    setPalette(p) { paletteOverride = p; },
    setCount(n) {
      const s = texSideFor(n);
      if (s === side) return;
      side = s;
      buildParticles();
    },
    setAudio(fn) { audioFn = fn ?? null; },
    setDensity(d) { densityTarget = Math.max(0, Math.min(1, d)); },
    dissolveTo(next, aspect, start = true) {
      if (dissolveT !== null || lost) return false;
      // B becomes A (the outgoing still), the new still lands in B
      imgTex = [imgTex[1], imgTex[0]];
      imgAspect = [imgAspect[1], aspect > 0 ? aspect : 16 / 9];
      gl.bindTexture(gl.TEXTURE_2D, imgTex[1]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, next);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (!haveB || !start) { haveB = true; return false; }
      dissolveT = 0;
      snapped = false;
      return true;
    },
    dissolveTime() { return dissolveT; },
    startDissolve() {
      if (dissolveT !== null || lost || !haveB) return false;
      dissolveT = 0;
      snapped = false;
      return true;
    },
    setHue(h, sv = 1) { hueTarget = h; satTarget = Math.max(0.3, Math.min(1.6, sv)); },
    setForm(f) { formTarget = [...f] as [number, number, number, number]; },
    setShape(sh, snap = false) {
      shapeTarget = sh.map((x) => Math.max(0, Math.min(0.999, x))) as [number, number, number, number];
      if (snap) for (let i = 0; i < 4; i++) shape[i] = shapeTarget[i];
    },
    setMotion(k) { motionTarget = Math.max(0.5, Math.min(1.6, k)); },
    impulse(kind, strength = 1) {
      const k = Math.max(0, Math.min(1, strength));
      if (kind === "scatter") scatterTarget = Math.max(scatterTarget, k);
      else { bounceSign = -bounceSign; bounceEnv = Math.max(bounceEnv, k); }
    },
    enter() { disperseNext = true; entryT = 0; },
    setHueSpread(sp) { hueSpreadTarget = Math.max(0, Math.min(1.2, sp)); },
    setGain(k) { layerGainTarget = Math.max(0.2, Math.min(5, k)); },
    setMelody(pos, w = 0.6) {
      if (!pos) { melodyWTarget = 0; return; }
      melodyTarget = [...pos] as [number, number, number];
      melodyWTarget = Math.max(0, Math.min(1, w));
    },
    resize,
    stats(): ParticleStats {
      const sorted = [...frameTimes].sort((a, b) => b - a);
      const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.05)] : 1 / 60;
      const lf = lastFrame;
      return {
        fps: Math.round(fpsEma * 10) / 10,
        fpsLow: Math.round((1 / p95) * 10) / 10,
        frameMs: Math.round((1000 / fpsEma) * 100) / 100,
        count,
        texSide: side,
        dpr,
        width: W,
        height: H,
        soul: (soulB !== soulA ? soulB : soulA).id,
        transition: soulB !== soulA ? mix : 0,
        bands: lf ? { ...lf.bands } : { bass: 0, mid: 0, treble: 0 },
        bandLevels: lf ? { ...lf.bandLevels } : { bass: 0, mid: 0, treble: 0 },
        rates: lf ? { ...lf.rates } : { bass: 1, mid: 1, treble: 1 },
        swell: lf?.swell ?? 0,
        onsets: lf?.onsets ?? 0,
        audio: !!lf,
        exposure,
        meanLum,
        maxLumStep,
        state: { ...state, speedByBand: [...state.speedByBand], radiusByBand: [...state.radiusByBand] },
        frames,
        density,
        dissolve: dissolveT,
        hue,
        sat,
        scatter: scatterEnv,
        bounce: bounceEnv,
        warmLog: warmLog.slice(),
        programs: (() => {
          const all = [...fixedProgs, ...simProgs.values()];
          return {
            compiling: all.filter((x) => x.state === "compiling").length,
            ready: all.filter((x) => x.state === "ready").length,
            warm: all.filter((x) => x.warm).length,
            failed: all.filter((x) => x.state === "failed").length,
          };
        })(),
      };
    },
  };
}

export { SOULS };
export type { SoulId, ParticlePalette };
