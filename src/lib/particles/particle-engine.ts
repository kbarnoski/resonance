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

import { hiddenSince } from "@/lib/journeys/visibility-epoch";
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
  /** Jump tripwire (2026-10-07 zero-glitch audit): row-0 motes' mean speed
   *  (world u/s), the share rushing near the speed cap, the retarget glide
   *  (0.25 = just retargeted … 1 = free) and the last retarget event. */
  motion: { meanSpeed: number; fastFrac: number; glide: number; lastEvent: string; lastEventAgo: number; cap: number };
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
  setShape(shape: [number, number, number, number], snap?: boolean, withSoul?: boolean): void;
  /** Camera distance multiplier (near/large ↔ far/small) — glides ~5 s. */
  setCamScale(k: number): void;
  /** Off-centre placement: screen fractions of half-width / half-height. */
  setOffset(x: number, y: number): void;
  /** Image-form plane size (1 = full frame). */
  setImageScale(k: number): void;
  /** Particle sprite size multiplier. */
  setSizeScale(k: number): void;
  /** Sound reactivity multiplier (motion only — never luminance). */
  setReact(k: number): void;
  /** Infinite unfolding blossom (flower imagery): layers keep growing from the centre. */
  setUnfold(on: boolean): void;
  /** Field mode: n copies of the form (1 = one), laid out by seed. */
  setInstances(n: number, seed: number): void;
  /** Opt-in velocity read-back for the jump tripwire (diagnostic runs only —
   *  journeys never read back from the GPU by default). */
  setTripwire(on: boolean): void;
  /** The last retarget the engine glided (event name, seconds ago). */
  lastRetarget(): { event: string; ago: number; at: number };
  /** Seconds the field has been ARRIVED (no blend / glide / image pull in flight); 0 while moving. */
  settledFor(): number;
  /** Image-form variety: mirrored, tilted (radians). */
  setImageVariant(mirror: boolean, tilt: number): void;
  /** 1 = image forms take the journey palette (luminance kept), 0 = true colours. */
  setImageTint(k: number): void;
  /** Follow a screen point (NDC −1..1) with a trailing stream; w = 0 releases. */
  setFollow(x: number, y: number, w: number): void;
  /** Load an image the field can form into (no dissolve timeline). */
  /** `glide` (default true): the arrival is a retarget — motes ease onto it
   *  (false only for the flash, which must meet the flash image on the beat). */
  loadFormImage(src: HTMLCanvasElement | HTMLImageElement, aspect: number, uv?: Float32Array, glide?: boolean): void;
  /** How many image samples loadFormImage's `uv` needs (2 floats each). */
  imageSampleCount(): number;
  /** Conducted image form: form = spring onto the image 0..1, show = wear its colours 0..1. */
  setImageForm(form: number, show: number): void;
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
  /** Warm every compiled program NOW in one burst (screen black); true when all warm. */
  warmBurst(maxSteps?: number): boolean;
  /** Minimum ms between warm draws (faster while the screen is black). */
  setWarmPace(ms: number): void;
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
  // EVERY colour change glides (Karel 2026-10-08: "ensure color changes are
  // always smooth not abrupt" — an emblem snapped to the new image's colour):
  // setPalette sets a TARGET; the shown palette follows per frame on a
  // critically damped spring (gentle start AND landing, ~90 % in 3.3 s,
  // settled ~5 s), whatever the source — image change, section re-voicing,
  // journey handoff. 9 channels: low/mid/high × rgb.
  const PAL_OMEGA = 1.2;
  const palShown = new Float32Array(9), palVel = new Float32Array(9);
  let palPrimed = false;
  const palFlat = (p: ParticlePalette, i: number) => (i < 3 ? p.low[i] : i < 6 ? p.mid[i - 3] : p.high[i - 6]);
  const palOut: ParticlePalette = { low: [0, 0, 0], mid: [0, 0, 0], high: [0, 0, 0] };
  function glidePalette(target: ParticlePalette, dt: number): ParticlePalette {
    if (!palPrimed) {
      for (let i = 0; i < 9; i++) { palShown[i] = palFlat(target, i); palVel[i] = 0; }
      palPrimed = true;
    } else {
      const h = Math.min(dt, 0.05), w = PAL_OMEGA;
      for (let i = 0; i < 9; i++) {
        // semi-implicit critically damped step
        palVel[i] += (w * w * (palFlat(target, i) - palShown[i]) - 2 * w * palVel[i]) * h;
        palShown[i] += palVel[i] * h;
      }
    }
    for (let i = 0; i < 3; i++) { palOut.low[i] = palShown[i]; palOut.mid[i] = palShown[3 + i]; palOut.high[i] = palShown[6 + i]; }
    return palOut;
  }
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
  // ONE SMALL PROGRAM PER SOUL (2026-10-06, after a 49 s kiosk freeze with a
  // per-journey union program): every soul's program is built and warmed ONCE
  // per session while the screen is black (warmSouls, the loop's intro), and a
  // form change runs only the TARGET soul's force — particles GLIDE from the
  // old form to the new one under a speed cap (no pair/union programs, no
  // pipeline build can ever land mid-journey). `a` is kept for call-site parity.
  const simProgFor = (_a: number, b: number): Prog => {
    const k = `s:${b}`;
    let pr = simProgs.get(k);
    if (!pr) {
      pr = startProgram(gl!, QUAD_VS, buildSimFS([b]));
      simProgs.set(k, pr);
    }
    return pr;
  };
  let warmGapMs = 350;
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
  let jumpRead: AsyncRead | null = null;
  let tripwireOn = false;
  let jumpSpeed = 0, jumpFast = 0;
  // RETARGET GLIDE (2026-10-07 zero-glitch audit, Karel: "i see some glitches
  // where they jump to a new form or shape"): the sim chases its targets at a
  // speed cap that only a SOUL blend used to lower — every other retarget (a
  // discrete shape crossing, an instance layout, an image arriving, a setSoul
  // landing mid-blend) sent every mote rushing at the full cap = a visible jump.
  // Every retarget now restarts this envelope: the cap drops to 25 % and opens
  // over 3 s, so motes always GLIDE onto the new form.
  let glideT = 99;
  let flashPace = false;
  const GLIDE_SEC = 4;
  // EVERY GLIDE HAS A GENTLE START AND LANDING (Karel 2026-10-08: "studder
  // stepping"): an exponential follow starts at full speed the instant its
  // target moves — each form/shape/placement re-aim began with a jolt. These
  // follow on a critically damped spring (ω = 2/τ, settles like the old τ).
  const sv = new Float64Array(24);
  function sp(i: number, x: number, target: number, tau: number, dt: number): number {
    const w = 2 / tau, h = Math.min(dt, 0.05);
    sv[i] += (w * w * (target - x) - 2 * w * sv[i]) * h;
    return x + sv[i] * h;
  }
  let capNow = 0; // the speed cap this frame (diag)
  let pullT = 99; // seconds since a new figure (shape step)
  let settledSince = -1; // engine time the field last ARRIVED (no transition in flight)
  let pendingShape: [number, number, number, number] | null = null; // a new figure waiting its turn
  let lastEvent = "";
  let lastEventAt = -99;
  const retarget = (ev: string) => { glideT = 0; lastEvent = ev; lastEventAt = timeNow(); };
  // discrete shape seeds (floor(uShape.* × N) in the souls) — any change that
  // crosses a step is a NEW figure, not a drift
  const crossesStep = (a: readonly number[], b: readonly number[]) => {
    for (let i = 0; i < 3; i++) for (let n = 2; n <= 17; n++) if (Math.floor(a[i] * n) !== Math.floor(b[i] * n)) return true;
    return false;
  };

  function buildParticles() {
    for (const t of [...posTex, ...velTex]) gl!.deleteTexture(t);
    if (seedTex) gl!.deleteTexture(seedTex);
    for (const f of simFbo) gl!.deleteFramebuffer(f);
    stateRead?.dispose();
    velRead?.dispose();
    jumpRead?.dispose();

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
    // opt-in (setTripwire): journeys never read back from the GPU (no-sync law)
    jumpRead = tripwireOn ? new AsyncRead(gl!, side * 4) : null;
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
  let hue = 0, hueTarget = 0, sat = 1, satTarget = 1, hueVel = 0, satVel = 0, spreadVel = 0;
  const form: [number, number, number, number] = [3, 5, 1.5, 2];
  const shape: [number, number, number, number] = [0, 0.3, 0.5, 0.5];
  let shapeTarget: [number, number, number, number] = [0, 0.3, 0.5, 0.5];
  let formTarget: [number, number, number, number] = [3, 5, 1.5, 2];
  let motion = 1, motionTarget = 1;
  let scatterEnv = 0, scatterTarget = 0, bounceEnv = 0, bounceSign = 1;
  const melody: [number, number, number] = [0, 0, 0];
  let melodyTarget: [number, number, number] = [0, 0, 0];
  let melodyW = 0, melodyWTarget = 0;
  let followX = 0, followY = 0, followT = 0, followS = 0, followTX = 0, followTY = 0;
  const camScaleBase = opts.camScale ?? 1;
  let camScale = camScaleBase;
  let camScaleTarget = camScaleBase;
  // v6 dynamics (Karel 2026-10-06): off-centre placement (asymmetry), image
  // plane scale, particle size scale, sound reactivity — all glide
  let offX = 0, offY = 0, offTX = 0, offTY = 0;
  let imgScaleS = 1, imgScaleT = 1;
  let sizeScaleS = 1, sizeScaleT = 1;
  let reactS = 1, reactT = 1;
  // field mode + image-form variety (Karel 2026-10-06: many blossoms, the
  // angel never the same twice)
  let instN = 1, instSeed = 0;
  let unfoldOn = false, unfoldT = 0, unfoldS = 0;
  let imgMirror = 1, imgMirrorT = 1, imgTiltS = 0, imgTiltT = 0;
  let imgTintS = 0, imgTintT = 0;
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
  // per-particle sampled image coordinates (RG32F, side × side) — crisp image forms
  const imgUvTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, imgUvTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array([0.5, 0.5]));
  let imgSampled = 0;
  let imgAspect: [number, number] = [16 / 9, 16 / 9];
  let haveB = false;
  let imgFormExt = 0, imgFormVel = 0, imgShowVel = 0;
  let imgShowExt = 0;
  let imgFormTgt = 0;
  let imgShowTgt = 0;
  let dissolveT: number | null = null;
  let snapped = false;

  const state: ParticleStats["state"] = {
    meanSpeed: 0, maxSpeed: 0, speedByBand: [0, 0, 0], meanRadius: 0, radiusByBand: [0, 0, 0], samples: 0, t: 0,
  };
  const frameTimes: number[] = [];
  const gapLog: number[] = [];
  const cpuLog: number[] = [];
  let fpsEma = 60;
  let frames = 0;
  let time = 0;
  function timeNow() { return time; }
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
    // Only REPEATED severe gaps (or one very long one) count: the page has
    // ~0.6–0.8 s hitches without particles (still decodes) and a single one
    // switched the field off for the session (kiosk 2026-10-06)
    // a gap spanning a hidden window (another app / Space in front) is the
    // browser pausing rAF, never a GPU stall — it must not switch particles off
    if (wd && framesSinceStart > 3 && rawDt * 1000 > wd.gapMs && typeof document !== "undefined" && !hiddenSince(performance.now() - rawDt * 1000 - 50)) {
      const nowMs = performance.now();
      gapLog.push(nowMs);
      while (gapLog.length && nowMs - gapLog[0] > 60_000) gapLog.shift();
      if (rawDt > 4 || gapLog.length >= 3) {
        stall(`frame gap ${Math.round(rawDt * 1000)} ms (${gapLog.length} in 60 s)`);
        return;
      }
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
        specData[i * 2 + 1] = f.drive[k] * reactS;
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
    const riseW = lerpS((x) => (x.respawn === "rise" ? 1 : 0));
    const riseTop = lerpS((x) => x.riseTop ?? 1);
    const heightCol = lerpS((x) => (x.heightColor ? 1 : 0));
    const sizeK = lerpS((x) => x.size);
    const densityCap = lerpS((x) => x.maxDensity);

    // world density glides (~2.5 s) — motes appear/vanish one by one
    density = sp(17, density, densityTarget, 2.5, dt);
    // hue / saturation / rainbow spread ride the same gentle spring as the palette
    {
      const h = Math.min(dt, 0.05), w = PAL_OMEGA;
      hueVel += (w * w * (hueTarget - hue) - 2 * w * hueVel) * h; hue += hueVel * h;
      satVel += (w * w * (satTarget - sat) - 2 * w * satVel) * h; sat += satVel * h;
      spreadVel += (w * w * (hueSpreadTarget - hueSpread) - 2 * w * spreadVel) * h; hueSpread += spreadVel * h;
    }
    for (let i = 0; i < 4; i++) form[i] = sp(i, form[i], formTarget[i], 4, dt);
    for (let i = 0; i < 4; i++) shape[i] = sp(4 + i, shape[i], shapeTarget[i], 2.5, dt);
    motion = sp(8, motion, motionTarget, 2, dt);
    // impulses: scatter rises ~0.3 s then the target decays (~1.8 s); bounce rings ~0.35 s
    scatterEnv += (scatterTarget - scatterEnv) * (1 - Math.exp(-dt / 0.3));
    scatterTarget *= Math.exp(-dt / 1.8);
    bounceEnv *= Math.exp(-dt / 0.35);
    for (let i = 0; i < 3; i++) melody[i] += (melodyTarget[i] - melody[i]) * (1 - Math.exp(-dt / 0.6));
    melodyW += (melodyWTarget - melodyW) * (1 - Math.exp(-dt / 1.5));
    const simDt = dt * motion;
    entryT += dt;
    const entryK = Math.min(1, entryT / 5);
    // a form change GLIDES: the cap starts low and opens with the blend
    // (the tripwire readback is MEASUREMENT ONLY — it used to also hold the
    // glide while motes travelled, so switching it on changed what it measured;
    // in production the tripwire is off and that hold never ran)
    glideT += dt;
    // a re-aim still eases the cap, but gently (floor 55 %, smoothstep over
    // 4 s): the old 22 % floor opening quadratically over 5 s WAS the visible
    // crawl-then-surge; transitions are now smooth at their source
    const gr = Math.min(1, glideT / GLIDE_SEC);
    // (v3: transitions are acceleration-limited — uAccCap — so the cap barely
    // needs to bind: floor 80 %)
    const retargetK = 0.8 + 0.2 * gr * gr * (3 - 2 * gr);
    const glideK = Math.min(soulB !== soulA ? 0.3 + 0.7 * e : 1, retargetK);
    const maxSpeedNow = (0.45 + (speedCap - 0.45) * entryK * entryK * (3 - 2 * entryK)) * glideK;
    capNow = maxSpeedNow;
    const disperseNow = disperseNext;
    disperseNext = false;
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
    let env = dissolveEnvelope(dissolveT);
    // externally conducted image form (Ghost's angel flashes): particles
    // gather into the image, wear it, then release and dissipate
    // engaging OR releasing an image re-aims the whole field: hold the retarget
    // glide low while the image form is still moving (harness 2026-10-07: an
    // image release sent the mean mote speed 0.05 → 3.2 u/s, i.e. the cap).
    // The flash alone keeps its pace (it meets the flash image on the beat).
    // NO CONTINUOUS BRAKE (Karel 2026-10-08 stutter: "moves slower a bit than
    // catches up faster"): this used to pin the speed cap at ~25 % for as long
    // as the image form was still moving — i.e. through every emblem / echo /
    // motif ramp — then release it, so the field crawled and then surged. The
    // jump it guarded against (an image engage/release sending motes to the cap)
    // is now prevented at the SOURCE: the image pull itself rises and falls on a
    // critically damped spring (gentle start and landing, ~2 s), so the force
    // never steps. The flash keeps its fast pace (it meets the flash image).
    if (imgFormTgt < 0.01 && imgFormExt < 0.02) flashPace = false;
    {
      const h = Math.min(dt, 0.05);
      const wF = flashPace ? 6 : 3, wS = flashPace ? 4 : 2.4;
      imgFormVel += (wF * wF * (imgFormTgt - imgFormExt) - 2 * wF * imgFormVel) * h; imgFormExt += imgFormVel * h; if (imgFormExt < 0 || imgFormExt > 1) { imgFormExt = Math.max(0, Math.min(1, imgFormExt)); imgFormVel = 0; }
      imgShowVel += (wS * wS * (imgShowTgt - imgShowExt) - 2 * wS * imgShowVel) * h; imgShowExt += imgShowVel * h; if (imgShowExt < 0 || imgShowExt > 1) { imgShowExt = Math.max(0, Math.min(1, imgShowExt)); imgShowVel = 0; }
    }
    // SETTLED (Karel 2026-10-08, Snowflake: "you morph towards something it
    // never takes form and then yet again transitions into yet another thing.
    // its like it changes its mind"): the conductor may only start the next
    // change once the field has ARRIVED — no soul blend, shape glide, new-figure
    // pull, re-aim glide or image pull still in flight
    {
      let shapeMoving = false;
      // (> 0.05: the conductor's breathing micro-drift nudges ≤ 0.035 — a breath, not a change)
      for (let i = 0; i < 4; i++) if (Math.abs(shape[i] - shapeTarget[i]) > 0.05) shapeMoving = true;
      const moving = soulB !== soulA || shapeMoving || pullT < 2.5 || glideT < 2.5 || Math.abs(imgFormTgt - imgFormExt) > 0.02 || Math.abs(imgShowTgt - imgShowExt) > 0.02;
      if (moving) settledSince = -1; else if (settledSince < 0) settledSince = time;
    }
    if (dissolveT === null && (imgFormExt > 0.001 || imgShowExt > 0.001)) {
      env = { worldFade: 1 - 0.85 * imgShowExt, imgShow: imgShowExt, imgForm: imgFormExt, colorMix: 1 };
    }
    camScale = sp(9, camScale, camScaleTarget, 5, dt);
    {
      offX = sp(10, offX, offTX, 4, dt); offY = sp(11, offY, offTY, 4, dt);
      imgScaleS = sp(12, imgScaleS, imgScaleT, 1.5, dt);
      sizeScaleS = sp(13, sizeScaleS, sizeScaleT, 4, dt);
      // NEVER INSTANT (2026-10-07 transition audit): the image mirror and the
      // blossom unfold glide — a flipped mirror sent every mote across the form
      imgMirror = sp(14, imgMirror, imgMirrorT, 0.9, dt);
      unfoldS = sp(15, unfoldS, unfoldOn && soulB.id === "blossom" ? 1 : 0, 2, dt);
      reactS += (reactT - reactS) * (1 - Math.exp(-dt / 1.2));
    }

    // camera (the image plane faces it, so compute before the sim)
    const lerp = (a: number, b: number) => a + (b - a) * e;
    az += dt * lerp(soulA.camSpin, soulB.camSpin);
    const elev = lerp(soulA.camElev, soulB.camElev);
    const dist = lerp(soulA.camDist, soulB.camDist) * camScale;
    const eye = [Math.cos(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.sin(az) * Math.cos(elev) * dist];
    const FOV = 0.85;
    const proj = perspective(FOV, W / H, 0.05, 50);
    const view0 = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    // camera basis from the view matrix rows (column-major)
    const right = [view0[0], view0[4], view0[8]];
    const up = [view0[1], view0[5], view0[9]];
    const halfH = dist * Math.tan(FOV / 2);
    const halfW = halfH * (W / H);
    // asymmetric placement: translate the camera in its own plane, so the
    // form sits off-centre (it appears opposite the offset)
    const o3 = [0, 1, 2].map((i) => right[i] * offX * halfW + up[i] * offY * halfH);
    const view = lookAt([eye[0] + o3[0], eye[1] + o3[1], eye[2] + o3[2]], o3, [0, 1, 0]);
    const vp = mul(proj, view);

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
    if (sim.u.uImgUv) { bindTex(5, imgUvTex, sim.u.uImgUv); g.uniform1f(sim.u.uImgSampled, dissolveT === null ? imgSampled : 0); }
    g.uniform1f(sim.u.uDt, simDt);
    g.uniform1f(sim.u.uTime, time);
    g.uniform3f(sim.u.uClock, clocks.bass, clocks.mid, clocks.treble);
    g.uniform3f(sim.u.uBands, (f?.bands.bass ?? 0) * reactS, (f?.bands.mid ?? 0) * reactS, (f?.bands.treble ?? 0) * reactS);
    g.uniform3f(sim.u.uBandLv, Math.min(1, (f?.bandLevels.bass ?? 0) * reactS), Math.min(1, (f?.bandLevels.mid ?? 0) * reactS), Math.min(1, (f?.bandLevels.treble ?? 0) * reactS));
    g.uniform1f(sim.u.uSwell, Math.min(1, (f?.swell ?? 0) * reactS));
    // single-soul program: the TARGET soul's force only (the glide does the blend)
    g.uniform1i(sim.u.uSoulA, soulB.index);
    g.uniform1i(sim.u.uSoulB, soulB.index);
    g.uniform1f(sim.u.uMix, 0);
    g.uniform1i(sim.u.uPasses, 1);
    g.uniform1i(sim.u.uTexW, side);
    g.uniform1f(sim.u.uCount, count);
    g.uniform1f(sim.u.uSmokeW, smokeW);
    if (sim.u.uRiseW) { g.uniform1f(sim.u.uRiseW, riseW); g.uniform1f(sim.u.uRiseTop, riseTop); }
    g.uniform3f(sim.u.uWrap, wrap[0], wrap[1], wrap[2]);
    g.uniform1f(sim.u.uInkW, inkW);
    g.uniform1f(sim.u.uFountainW, fountainW);
    g.uniform4f(sim.u.uForm, form[0], form[1], form[2], form[3]);
    if (sim.u.uShape) g.uniform4f(sim.u.uShape, shape[0], shape[1], shape[2], shape[3]);
    if (sim.u.uCamAz) g.uniform1f(sim.u.uCamAz, az);
    g.uniform1f(sim.u.uMaxSpeed, maxSpeedNow);
    pullT += dt;
    if (pendingShape && pullT >= 6) {
      const ps = pendingShape;
      pendingShape = null;
      shapeTarget = ps;
      for (let i = 0; i < 4; i++) { shape[i] = ps[i]; sv[4 + i] = 0; }
      pullT = 0; lastEvent = "shape"; lastEventAt = timeNow();
    }
    if (sim.u.uPull) { const pk = Math.min(1, pullT / 2); g.uniform1f(sim.u.uPull, 0.5 + 0.5 * pk * pk * (3 - 2 * pk)); }
    if (sim.u.uAccCap) {
      // since the latest re-aim (shape step or glide event): 1.0 u/s² at first,
      // opening smoothly to unlimited over 5 s (steady forms keep full forces)
      // (Karel 2026-10-08: "it takes a tad bit too long for the forms to take
      // shape" — 1.0 u/s² over 5 s → 1.6 over 3 s)
      const ts = Math.min(pullT, glideT), ak = Math.min(1, ts / 3);
      g.uniform1f(sim.u.uAccCap, ak >= 1 ? 1e6 : 1.6 / Math.max(0.02, 1 - ak * ak * (3 - 2 * ak)));
    }
    g.uniform1f(sim.u.uDisperse, disperseNow ? 1 : 0);
    g.uniform1f(sim.u.uScatter, scatterEnv);
    g.uniform1f(sim.u.uBounce, bounceEnv * bounceSign);
    // FOLLOW a moving shader element (screen point → world, on the focal
    // plane): a stream of the field chases and trails it; wins over melody
    followS += (followT - followS) * (1 - Math.exp(-dt / 0.8));
    // the follow point glides per FRAME (it used to step 4×/s with each sample)
    { const kf = 1 - Math.exp(-dt / 0.45); followX += (followTX - followX) * kf; followY += (followTY - followY) * kf; }
    if (followS > 0.01) {
      const fx = [0, 1, 2].map((i) => o3[i] + right[i] * followX * halfW + up[i] * followY * halfH);
      g.uniform3f(sim.u.uMelody, fx[0], fx[1], fx[2]);
      g.uniform1f(sim.u.uMelodyW, Math.max(melodyW, 1.4 * followS));
    } else {
      g.uniform3f(sim.u.uMelody, melody[0], melody[1], melody[2]);
      g.uniform1f(sim.u.uMelodyW, melodyW);
    }
    g.uniform1f(sim.u.uImgForm, env.imgForm);
    g.uniform1f(sim.u.uImgShow, env.imgShow);
    g.uniform1f(sim.u.uSnap, snapNow ? 1 : 0);
    g.uniform3f(sim.u.uPlaneC, 0, 0, 0);
    {
      // image plane: scale, mirror, a gentle tilt (rotation within the plane)
      imgTiltS = sp(16, imgTiltS, imgTiltT, 2, dt);
      const ca = Math.cos(imgTiltS), sa = Math.sin(imgTiltS);
      const R = [0, 1, 2].map((i) => (ca * right[i] + sa * up[i]) * halfW * imgScaleS * imgMirror);
      const U = [0, 1, 2].map((i) => (-sa * right[i] + ca * up[i]) * halfH * imgScaleS);
      g.uniform3f(sim.u.uPlaneR, R[0], R[1], R[2]);
      g.uniform3f(sim.u.uPlaneU, U[0], U[1], U[2]);
    }
    if (sim.u.uInst) { g.uniform1f(sim.u.uInst, instN); g.uniform1f(sim.u.uInstSeed, instSeed); }
    unfoldT += dt;
    if (sim.u.uUnfold) { g.uniform1f(sim.u.uUnfold, unfoldS); g.uniform1f(sim.u.uUnfoldT, unfoldT); }
    g.uniform1f(sim.u.uImgAspect, imgAspect[1]);
    g.uniform1f(sim.u.uScrAspect, W / H);
    g.drawArrays(g.TRIANGLES, 0, 3);
    cur = nxt;

    // jump tripwire: row-0 velocities every 6 frames (async, never stalls)
    if (jumpRead) {
      if (jumpRead.poll()) {
        const o = jumpRead.out;
        let sum = 0, fast = 0;
        for (let x = 0; x < side; x++) {
          const v = Math.hypot(o[x * 4], o[x * 4 + 1], o[x * 4 + 2]);
          sum += v;
          if (v > 0.7 * speedCap) fast++;
        }
        jumpSpeed = sum / Math.max(1, side);
        jumpFast = fast / Math.max(1, side);
      }
      if (frames % 6 === 3 && !jumpRead.busy) {
        g.bindFramebuffer(g.READ_FRAMEBUFFER, simFbo[cur]);
        g.readBuffer(g.COLOR_ATTACHMENT1);
        jumpRead.request(0, 0, side, 1);
        g.bindFramebuffer(g.READ_FRAMEBUFFER, null);
      }
    }

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
    const pal = glidePalette(paletteOverride ?? lerpPalette(soulA.palette, soulB.palette, e), dt);
    const trail = lerp(soulA.trail, soulB.trail) * trailScale * (1 - 0.7 * env.imgShow);
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
    g.uniform1f(draw.u.uRiseW, riseW);
    g.uniform1f(draw.u.uRiseTop, riseTop);
    g.uniform1f(draw.u.uHeightCol, heightCol);
    g.uniform1f(draw.u.uInst, instN);
    if (draw.u.uUnfold) { g.uniform1f(draw.u.uUnfold, unfoldS); g.uniform1f(draw.u.uUnfoldT, unfoldT); }
    g.uniform1f(draw.u.uInstSeed, instSeed);
    g.uniform1f(draw.u.uInkW, inkW);
    g.uniform3f(draw.u.uWrap, wrap[0], wrap[1], wrap[2]);
    g.uniform1f(draw.u.uSize, sizeK * sizeScaleS);
    g.uniform1f(draw.u.uHue, hue);
    g.uniform1f(draw.u.uSat, sat);
    g.uniform1f(draw.u.uHueSpread, hueSpread);
    g.uniform1f(draw.u.uHueWave, hueWave);
    g.uniform1f(draw.u.uTimeD, time);
    g.uniform1f(draw.u.uDensity, Math.min(density, densityCap));
    g.uniform1f(draw.u.uWorldFade, env.worldFade);
    bindTex(3, imgTex[0], draw.u.uImgA);
    bindTex(4, imgTex[1], draw.u.uImgB); if (draw.u.uImgUv) { bindTex(5, imgUvTex, draw.u.uImgUv); g.uniform1f(draw.u.uImgSampled, dissolveT === null ? imgSampled : 0); }
    g.uniform1f(draw.u.uColorMix, env.colorMix);
    g.uniform1f(draw.u.uImgShow, env.imgShow);
    // an image formed by ~N soft sprites: per-sprite gain so the particle
    // still sits near (below) the real still's brightness
    g.uniform1f(draw.u.uImgGain, 0.5 * (409_600 / count) * fadeIn * (W * H) / (2880 * 1800));
    imgTintS += (imgTintT - imgTintS) * (1 - Math.exp(-dt / 0.8));
    if (draw.u.uImgTint) g.uniform1f(draw.u.uImgTint, imgTintS);
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
      // TIME-based glide (Karel 2026-10-06: particles "drop out"): 2 % per
      // update was ~45 %/s at 120 fps — a close or dense form dimmed in
      // under a second. Now ≤ ~25 %/s either way; cap raised a touch so
      // near forms are not throttled into the dark.
      g.uniform1f(expo.u.uCap, 0.16);
      g.uniform1f(expo.u.uMaxStep, 1 - Math.exp(-0.3 * 4 * Math.min(dt, 0.05)));
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
    if (wd && framesSinceStart > 3 && cpu > wd.cpuMs) {
      const nowMs = performance.now();
      cpuLog.push(nowMs);
      while (cpuLog.length && nowMs - cpuLog[0] > 60_000) cpuLog.shift();
      if (cpuLog.length >= 5) stall(`frame cpu ${Math.round(cpu)} ms (${cpuLog.length} in 60 s)`);
    }
  }

  // ── prewarm: compile polling + ONE 1-pixel warm draw per call ──────────────
  // A program's GPU pipeline is built at its first draw (ANGLE/Metal); doing
  // that here, while the field is invisible and one program at a time, keeps
  // it off every visible frame (the kiosk hang).
  let lastWarmAt = -1e9;
  function prewarmStep(force = false) {
    if (lost || stalled) return;
    const g = gl!;
    const t0 = performance.now();
    // at most one GPU pipeline build per 350 ms, visible or not (unless forced:
    // the session warm-up bursts while nothing is on screen)
    if (!force && t0 - lastWarmAt < warmGapMs) return;
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
      bindTex(4, imgTex[1], draw.u.uImgB); if (draw.u.uImgUv) { bindTex(5, imgUvTex, draw.u.uImgUv); g.uniform1f(draw.u.uImgSampled, dissolveT === null ? imgSampled : 0); }
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
    // a warm draw is a pipeline build by design (invisible, once per program) — logged, never fatal
    if (cpu > 50) warmLog.push(["slow-warm", Math.round(tw), Math.round(cpu)]);
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
      jumpRead?.dispose();
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
      const settled = soulB !== soulA;
      if (settled) { soulA = soulB; mix = 0; } // settle a transition in flight
      pendingSoul = next === soulA ? null : next;
      pendingDur = Math.max(0.5, seconds);
      // settling an in-flight blend re-aims every mote — glide it
      if (pendingSoul || settled) retarget(`soul:${id}`);
      if (pendingSoul) simProgFor(soulA.index, next.index); // queue its compile now
    },
    prepare(souls) {
      // queue each soul's own small program (shared across journeys, kept for the session)
      for (const id of new Set(souls)) simProgFor(0, soulById(id).index);
    },
    setWarmPace(ms) { warmGapMs = Math.max(60, Math.min(1000, ms)); },
    prewarm() {
      if (!running) prewarmStep();
    },
    warmBurst(maxSteps = 80) {
      if (running) return false;
      for (let i = 0; i < maxSteps; i++) {
        const before = [...fixedProgs, ...simProgs.values()].filter((p) => p.warm).length;
        prewarmStep(true);
        const after = [...fixedProgs, ...simProgs.values()].filter((p) => p.warm).length;
        if (after === before && particlesInitialised) break; // nothing ready to warm right now
      }
      return [...fixedProgs, ...simProgs.values()].every((p) => p.warm);
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
    setCamScale(k) { camScaleTarget = camScaleBase * Math.max(0.3, Math.min(2.6, k)); },
    setOffset(x, y) { offTX = Math.max(-0.7, Math.min(0.7, x)); offTY = Math.max(-0.5, Math.min(0.5, y)); },
    setImageScale(k) { imgScaleT = Math.max(0.2, Math.min(1.2, k)); },
    setSizeScale(k) { sizeScaleT = Math.max(0.4, Math.min(2.5, k)); },
    setReact(k) { reactT = Math.max(0.5, Math.min(4, k)); },
    setUnfold(on) { unfoldOn = on; },
    setTripwire(on) {
      if (on === tripwireOn || lost) return;
      tripwireOn = on;
      jumpRead?.dispose();
      jumpRead = on ? new AsyncRead(gl, side * 4) : null;
    },
    lastRetarget() { return { event: lastEvent, ago: time - lastEventAt, at: lastEventAt }; },
    settledFor() { return settledSince < 0 ? 0 : time - settledSince; },
    setInstances(n, seed) {
      const nn = Math.max(1, Math.min(9, Math.round(n)));
      if (nn !== instN || (nn > 1 && seed !== instSeed)) retarget("instances");
      instN = nn; instSeed = seed;
    },
    setImageVariant(mirror, tilt) { imgMirrorT = mirror ? -1 : 1; imgTiltT = Math.max(-3.2, Math.min(3.2, tilt)); },
    setImageTint(k) { imgTintT = Math.max(0, Math.min(1, k)); },
    setFollow(x, y, w) {
      // glide the target point itself (the sampled centroid jumps 4×/s)
      followTX = Math.max(-1.2, Math.min(1.2, x));
      followTY = Math.max(-1.2, Math.min(1.2, y));
      followT = Math.max(0, Math.min(1, w));
    },
    imageSampleCount() { return side * side; },
    loadFormImage(src, aspect, uv, glide = true) {
      if (lost) return;
      if (glide) { retarget("image"); flashPace = false; } else flashPace = true;
      if (uv && uv.length === side * side * 2) {
        gl.bindTexture(gl.TEXTURE_2D, imgUvTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, side, side, 0, gl.RG, gl.FLOAT, uv);
        imgSampled = 1;
      } else imgSampled = 0;
      gl.bindTexture(gl.TEXTURE_2D, imgTex[1]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      imgAspect = [imgAspect[0], aspect > 0 ? aspect : 1];
      haveB = true;
    },
    setImageForm(form, show) {
      imgFormTgt = Math.max(0, Math.min(1, form));
      imgShowTgt = Math.max(0, Math.min(1, show));
    },
    setShape(sh, snap = false, withSoul = false) {
      const nt = sh.map((x) => Math.max(0, Math.min(0.999, x))) as [number, number, number, number];
      // a step crossing is a new figure: easing THROUGH steps re-aimed the
      // form several times in a row — take it once, and glide onto it
      const discrete = crossesStep(shape, nt);
      // NO BACK-TO-BACK FIGURES (Karel 2026-10-08: "it never takes form and then
      // yet again transitions into yet another thing"): a new figure within 6 s
      // of the last one waits (applied once the first has had its moment)
      // (a soul change carries its own figure — never deferred)
      if (discrete && !snap && !withSoul && pullT < 6) { pendingShape = nt; return; }
      pendingShape = null;
      shapeTarget = nt;
      if (snap || discrete) {
        for (let i = 0; i < 4; i++) { shape[i] = shapeTarget[i]; sv[4 + i] = 0; }
        // a new figure: the PULL eases in (uPull) — no speed-cap glide, which
        // pinned the field and then dragged it faster as it opened
        if (discrete) { pullT = 0; lastEvent = "shape"; lastEventAt = timeNow(); }
      }
    },
    setMotion(k) { motionTarget = Math.max(0.4, Math.min(1.6, k)); },
    impulse(kind, strength = 1) {
      const k = Math.max(0, Math.min(1, strength));
      if (kind === "scatter") scatterTarget = Math.max(scatterTarget, k);
      else { bounceSign = -bounceSign; bounceEnv = Math.max(bounceEnv, k); }
    },
    enter() { disperseNext = true; entryT = 0; },
    setHueSpread(sp) { hueSpreadTarget = Math.max(0, Math.min(3.2, sp)); },
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
        motion: { meanSpeed: jumpSpeed, fastFrac: jumpFast, glide: (() => { const g2 = Math.min(1, glideT / GLIDE_SEC); return 0.8 + 0.2 * g2 * g2 * (3 - 2 * g2); })(), lastEvent, lastEventAgo: time - lastEventAt, cap: capNow },
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
