// ─────────────────────────────────────────────────────────────────────────────
// sim.ts — a faithful Flow-Lenia sonic ecology on a WebGL2 grid.
//
//   The whole ecology lives in one RGBA16F "field" texture that ping-pongs
//   through render-to-texture passes. Channels:
//       R = m   local MASS (the finite, conserved resource)
//       G = q   mass-weighted GENOME  (q = m * s, s ∈ [0,1] the species param)
//   Species s is EMBEDDED IN THE MATTER: wherever mass flows, its rule
//   parameters (kernel ring radius, growth μ/σ) flow with it, and where two
//   populations mix their genomes blend by mass — the Flow-Lenia mechanism
//   that yields drift / speciation over minutes.
//
//   One simulation tick is three GPU passes:
//     A  perceive : radial-kernel convolution → potential U and growth G,
//                   using the per-cell genome s (rules travel with the matter)
//     B  flow     : F = kA·∇U − kM·∇m  (up the affinity gradient, minus a
//                   concentration/pressure term so mass never piles to white)
//     C  transport: REINTEGRATION TRACKING — every source cell deposits its
//                   mass into a unit box shifted by dt·F and hands its share to
//                   the destination cells it overlaps. Overlaps sum to 1, so
//                   TOTAL MASS IS CONSERVED EXACTLY. A tiny genome mutation is
//                   folded in here so the ecology keeps evolving.
//
//   A fourth pass D periodically shrinks the field to a 48² RGBA8 texture that
//   is read back (readPixels) so the CPU can hand cheap per-species statistics
//   to the audio engine — sound and image are two views of ONE simulation.
//
//   Everything is deterministic: all seeding + the mutation-noise field are
//   generated from a mulberry32 PRNG seeded 0x1836.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeciesStat {
  mass: number; // fraction of total mass held by this species band
  cx: number; // center of mass x (0..1)
  cy: number; // center of mass y (0..1)
}

export interface FieldStats {
  total: number; // mean mass per cell (kept ~constant by conservation)
  motion: number; // mean |Δ| of the reduced field since last readback
  species: SpeciesStat[]; // one entry per species band
}

export interface Sim {
  readonly field: number;
  readonly speciesCount: number;
  /** Advance the ecology one tick (three passes). */
  step(dt: number): void;
  /** Draw the current field to the canvas. `time` drives only slow glow drift. */
  render(time: number): void;
  /** Reduce + read back cheap per-species stats (call every few frames). */
  sample(): FieldStats;
  /** Drop a gaussian blob of a species' matter at normalized (nx,ny). */
  seed(nx: number, ny: number, radius: number, mass: number, species: number): void;
  /** Re-seed the whole field to the deterministic starting ecology. */
  reset(): void;
  resize(cssW: number, cssH: number): void;
  destroy(): void;
}

// deterministic PRNG — mulberry32, seeded 0x1836 as required.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIES_COUNT = 3;
// Genome band centers (s values) that name each "species".
const SPECIES_S = [0.16, 0.5, 0.84];

// ── GLSL shared header ───────────────────────────────────────────────────────
const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform int uN;          // field size
out vec4 o;
ivec2 wrap(ivec2 c){ return (c % uN + ivec2(uN)) % ivec2(uN); }
`;

// Fullscreen-triangle vertex shader (no attributes needed).
const VERT = `#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Per-cell rule parameters as smooth functions of the genome s.
// Kept close to a known-viable Lenia regime and varied modestly per species so
// the three populations are distinct yet all alive.
const GENOME_GLSL = `
float g_mu(float s){    return 0.135 + 0.045 * s; }      // growth center
float g_sigma(float s){ return 0.015 + 0.006 * s; }      // growth width
float g_peak(float s){  return 0.42 + 0.30 * s; }        // kernel ring radius
float g_wid(float s){   return 0.16 + 0.04 * s; }        // kernel ring width
`;

// Pass A — perceive: convolution → potential U + growth G with per-cell genome.
function passA(R: number) {
  return `${HEAD}
uniform sampler2D uField;
${GENOME_GLSL}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = texelFetch(uField, c, 0);
  float m = f.r;
  float s = (m > 1e-5) ? clamp(f.g / m, 0.0, 1.0) : 0.5;
  float peak = g_peak(s), wid = g_wid(s);
  float wsum = 0.0, ksum = 0.0;
  const int R = ${R};
  for(int dy=-R; dy<=R; dy++){
    for(int dx=-R; dx<=R; dx++){
      float rr = length(vec2(float(dx), float(dy))) / float(R);
      if(rr > 1.0) continue;
      float w = exp(-(rr - peak) * (rr - peak) / (2.0 * wid * wid));
      float mn = texelFetch(uField, wrap(c + ivec2(dx, dy)), 0).r;
      wsum += w * mn;
      ksum += w;
    }
  }
  float U = (ksum > 0.0) ? wsum / ksum : 0.0;
  float d = (U - g_mu(s)) / g_sigma(s);
  float G = 2.0 * exp(-0.5 * d * d) - 1.0;   // growth in [-1,1]
  o = vec4(U, G, m, s);
}`;
}

// Pass B — flow field F = kA·∇U − kM·∇m, clamped to a max displacement.
const PASS_B = `${HEAD}
uniform sampler2D uUA;      // (U, G, m, s)
uniform float uKA;          // affinity gain
uniform float uKM;          // concentration/pressure gain
uniform float uMaxDisp;     // max displacement (cells)
uniform float uDt;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 ct = texelFetch(uUA, c, 0);
  float m = ct.b, s = ct.a;
  float uxp = texelFetch(uUA, wrap(c + ivec2(1,0)), 0).r;
  float uxm = texelFetch(uUA, wrap(c + ivec2(-1,0)), 0).r;
  float uyp = texelFetch(uUA, wrap(c + ivec2(0,1)), 0).r;
  float uym = texelFetch(uUA, wrap(c + ivec2(0,-1)), 0).r;
  vec2 gradU = 0.5 * vec2(uxp - uxm, uyp - uym);
  float mxp = texelFetch(uUA, wrap(c + ivec2(1,0)), 0).b;
  float mxm = texelFetch(uUA, wrap(c + ivec2(-1,0)), 0).b;
  float myp = texelFetch(uUA, wrap(c + ivec2(0,1)), 0).b;
  float mym = texelFetch(uUA, wrap(c + ivec2(0,-1)), 0).b;
  vec2 gradM = 0.5 * vec2(mxp - mxm, myp - mym);
  vec2 F = uKA * gradU - uKM * gradM;
  vec2 disp = clamp(F * uDt, -uMaxDisp, uMaxDisp);
  o = vec4(disp.x, disp.y, m, m * s);   // carry mass and genome-weighted q
}`;

// overlap of two 1-D unit intervals, used by the reintegration kernel.
const OVERLAP_GLSL = `
float ov(float a0, float a1, float b0, float b1){
  return max(0.0, min(a1, b1) - max(a0, b0));
}`;

// Pass C — transport by reintegration tracking (mass-conserving) + mutation.
const PASS_C = `${HEAD}
uniform sampler2D uFlow;    // (dispx, dispy, m, q)
uniform sampler2D uNoise;   // static mutation noise
uniform float uMut;         // mutation rate
${OVERLAP_GLSL}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  float newM = 0.0, newQ = 0.0;
  for(int sy=-1; sy<=1; sy++){
    for(int sx=-1; sx<=1; sx++){
      vec4 src = texelFetch(uFlow, wrap(c + ivec2(sx, sy)), 0);
      vec2 tgt = vec2(float(sx), float(sy)) + 0.5 + src.rg; // box center, dest-local
      float w = ov(tgt.x - 0.5, tgt.x + 0.5, 0.0, 1.0) *
                ov(tgt.y - 0.5, tgt.y + 0.5, 0.0, 1.0);
      newM += src.b * w;
      newQ += src.a * w;
    }
  }
  float s = (newM > 1e-5) ? clamp(newQ / newM, 0.0, 1.0) : 0.5;
  // small genome mutation keeps the ecology drifting / speciating over minutes.
  float n = texelFetch(uNoise, c, 0).r - 0.5;
  s = clamp(s + uMut * n, 0.0, 1.0);
  o = vec4(newM, newM * s, 0.0, 1.0);
}`;

// Pass D — downsample field to a small RGBA8 texture for cheap CPU readback.
const PASS_D = `${HEAD}
uniform sampler2D uField;
uniform int uBlock;
uniform float uScale;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  float mAcc = 0.0, qAcc = 0.0;
  for(int by=0; by<uBlock; by++){
    for(int bx=0; bx<uBlock; bx++){
      vec4 f = texelFetch(uField, c * uBlock + ivec2(bx, by), 0);
      mAcc += f.r;
      qAcc += f.g;
    }
  }
  float sMean = (mAcc > 1e-5) ? clamp(qAcc / mAcc, 0.0, 1.0) : 0.5;
  o = vec4(clamp(mAcc * uScale, 0.0, 1.0), sMean, clamp(mAcc * uScale * 3.0, 0.0, 1.0), 1.0);
}`;

// Render — smooth upscale, species → hue, mass → tone-mapped luminance.
const RENDER = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform float uTime;
uniform float uExpo;
out vec4 o;
vec3 speciesColor(float s){
  vec3 teal   = vec3(0.10, 0.80, 0.74);
  vec3 violet = vec3(0.62, 0.36, 0.98);
  vec3 amber  = vec3(1.00, 0.72, 0.34);
  return (s < 0.5) ? mix(teal, violet, s * 2.0)
                   : mix(violet, amber, (s - 0.5) * 2.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 f = texture(uField, uv);
  float m = f.r;
  float s = (m > 1e-5) ? clamp(f.g / m, 0.0, 1.0) : 0.5;
  // tone map — bright organism cores, but capped well below full white.
  float b = (1.0 - exp(-m * uExpo));
  float glow = 0.10 + 0.03 * sin(uTime * 0.15 + uv.x * 3.0 + uv.y * 2.0);
  vec3 bg = vec3(0.018, 0.015, 0.045);
  vec3 col = bg + speciesColor(s) * (b * 0.86 + glow * b);
  // gentle vignette for depth
  vec2 d = uv - 0.5;
  col *= 1.0 - 0.35 * dot(d, d);
  o = vec4(clamp(col, 0.0, 0.92), 1.0);
}`;

// Fallback plasma — a slow WebGL2 shader that needs NO float RTT, so the screen
// is never blank when EXT_color_buffer_float is missing.
const PLASMA = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime * 0.08;
  float v = sin(uv.x * 4.0 + t) + sin(uv.y * 5.0 - t * 0.7)
          + sin((uv.x + uv.y) * 3.0 + t * 1.3);
  float s = 0.5 + 0.35 * sin(v);
  vec3 teal = vec3(0.10, 0.55, 0.60);
  vec3 violet = vec3(0.42, 0.28, 0.72);
  vec3 col = vec3(0.02, 0.015, 0.04) + mix(teal, violet, s) * (0.18 + 0.14 * sin(v * 1.3));
  o = vec4(col, 1.0);
}`;

// ── WebGL helpers ────────────────────────────────────────────────────────────
function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}
function program(gl: WebGL2RenderingContext, frag: string) {
  const p = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    throw new Error("link: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function makeFloatTex(gl: WebGL2RenderingContext, n: number, data: Float32Array | null) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, n, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function makeFbo(gl: WebGL2RenderingContext, tex: WebGLTexture) {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fb;
}

interface BuildOpts {
  field?: number;
  read?: number;
  kernelR?: number;
}

// Build the full Flow-Lenia sim. Returns null if WebGL2 / float RTT unavailable
// (the page then shows the on-brand notice + plasma fallback).
export function buildSim(canvas: HTMLCanvasElement, opts: BuildOpts = {}): Sim | null {
  const glMaybe = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!glMaybe) return null;
  // float color-buffer support is required to render into RGBA16F.
  if (!glMaybe.getExtension("EXT_color_buffer_float")) return null;
  // Non-null binding: every nested closure below captures a definitely-present
  // context (TS won't preserve the guard-narrowing of a nullable const into
  // nested function declarations).
  const gl: WebGL2RenderingContext = glMaybe;

  const N = opts.field ?? 192;
  const READ = opts.read ?? 48;
  const R = opts.kernelR ?? 10;
  const BLOCK = Math.max(1, Math.round(N / READ));

  // tunables (defaults tuned for a living, slowly evolving field)
  const params = {
    kA: 0.85,
    kM: 0.42,
    maxDisp: 0.7,
    mut: 0.02,
    expo: 2.6,
  };

  const rng = mulberry32(0x1836);

  const progA = program(gl, passA(R));
  const progB = program(gl, PASS_B);
  const progC = program(gl, PASS_C);
  const progD = program(gl, PASS_D);
  const progR = program(gl, RENDER);

  // shared empty VAO — the fullscreen triangle uses only gl_VertexID.
  const vao = gl.createVertexArray()!;

  // textures + fbos
  let fieldA = makeFloatTex(gl, N, null);
  let fieldB = makeFloatTex(gl, N, null);
  const uaTex = makeFloatTex(gl, N, null);
  const flowTex = makeFloatTex(gl, N, null);
  const noiseTex = makeFloatTex(gl, N, buildNoise(N, rng));
  let fboA = makeFbo(gl, fieldA);
  let fboB = makeFbo(gl, fieldB);
  const fboUA = makeFbo(gl, uaTex);
  const fboFlow = makeFbo(gl, flowTex);

  const reducedTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, reducedTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, READ, READ, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fboReduced = makeFbo(gl, reducedTex);

  const readBuf = new Uint8Array(READ * READ * 4);
  const prevReduced = new Float32Array(READ * READ);
  let havePrev = false;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // resolution of the on-screen draw buffer
  function resize(cssW: number, cssH: number) {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1);
    const w = Math.max(1, Math.round(Math.min(cssW, 720) * dpr));
    const h = Math.max(1, Math.round(Math.min(cssH, 720) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function draw() {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ── deterministic seeding into a CPU buffer, then upload ──
  function buildSeed(): Float32Array {
    const buf = new Float32Array(N * N * 4);
    // a warm nebula of low background mass so the field is never empty,
    const bg = 0.02;
    for (let i = 0; i < N * N; i++) buf[i * 4] = bg;
    // then several gliders/blobs, 2–4 per species, at deterministic spots.
    const blobs = 11;
    for (let b = 0; b < blobs; b++) {
      const sp = b % SPECIES_COUNT;
      const s = SPECIES_S[sp];
      const cx = (0.12 + 0.76 * rng()) * N;
      const cy = (0.12 + 0.76 * rng()) * N;
      const rad = (0.04 + 0.05 * rng()) * N;
      const amp = 0.55 + 0.35 * rng();
      const r2 = rad * rad;
      const x0 = Math.max(0, Math.floor(cx - rad * 3));
      const x1 = Math.min(N - 1, Math.ceil(cx + rad * 3));
      const y0 = Math.max(0, Math.floor(cy - rad * 3));
      const y1 = Math.min(N - 1, Math.ceil(cy + rad * 3));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const add = amp * Math.exp((-(dx * dx + dy * dy)) / (2 * r2));
          const idx = (y * N + x) * 4;
          // mass-weighted genome: accumulate q = Σ add·s alongside m = Σ add.
          buf[idx] = Math.min(1.4, buf[idx] + add);
          buf[idx + 1] = buf[idx + 1] + add * s;
        }
      }
    }
    // ensure q consistent: where we only set background, genome defaults 0.5.
    for (let i = 0; i < N * N; i++) {
      const m = buf[i * 4];
      if (buf[i * 4 + 1] === 0 && m > 0) buf[i * 4 + 1] = m * 0.5;
    }
    return buf;
  }

  function uploadField(tex: WebGLTexture, data: Float32Array) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.FLOAT, data);
  }

  function reset() {
    const seed = buildSeed();
    uploadField(fieldA, seed);
    uploadField(fieldB, new Float32Array(N * N * 4));
    havePrev = false;
  }
  reset();

  // add a blob at runtime (pointer seeding) — done on CPU then re-uploaded is
  // costly; instead we do a tiny additive pass by reading back? Simpler: keep a
  // CPU shadow only for seeding. We render into fieldA via a quick blit pass.
  // To keep it cheap and dependency-free we re-seed via a small additive draw.
  const progSeed = program(
    gl,
    `${HEAD}
uniform sampler2D uField;
uniform vec2 uC; uniform float uRad; uniform float uAmp; uniform float uS;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = texelFetch(uField, c, 0);
  vec2 d = (vec2(c) - uC);
  float add = uAmp * exp(-dot(d,d)/(2.0*uRad*uRad));
  float m = f.r + add;
  float q = f.g + add * uS;
  o = vec4(m, q, 0.0, 1.0);
}`,
  );

  function seed(nx: number, ny: number, radius: number, mass: number, species: number) {
    const s = SPECIES_S[((species % SPECIES_COUNT) + SPECIES_COUNT) % SPECIES_COUNT];
    // draw fieldA -> fieldB with additive blob, then swap.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
    gl.viewport(0, 0, N, N);
    gl.useProgram(progSeed);
    gl.uniform1i(gl.getUniformLocation(progSeed, "uN"), N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldA);
    gl.uniform1i(gl.getUniformLocation(progSeed, "uField"), 0);
    gl.uniform2f(gl.getUniformLocation(progSeed, "uC"), nx * N, (1 - ny) * N);
    gl.uniform1f(gl.getUniformLocation(progSeed, "uRad"), Math.max(1.5, radius * N));
    gl.uniform1f(gl.getUniformLocation(progSeed, "uAmp"), mass);
    gl.uniform1f(gl.getUniformLocation(progSeed, "uS"), s);
    draw();
    [fieldA, fieldB] = [fieldB, fieldA];
    [fboA, fboB] = [fboB, fboA];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function bindTex(prog: WebGLProgram, name: string, unit: number, tex: WebGLTexture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  function step(dt: number) {
    const cdt = Math.min(0.12, Math.max(0.0, dt)) || 0.06;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, N, N);

    // A: perceive -> uaTex
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboUA);
    gl.useProgram(progA);
    gl.uniform1i(gl.getUniformLocation(progA, "uN"), N);
    bindTex(progA, "uField", 0, fieldA);
    draw();

    // B: flow -> flowTex
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboFlow);
    gl.useProgram(progB);
    gl.uniform1i(gl.getUniformLocation(progB, "uN"), N);
    gl.uniform1f(gl.getUniformLocation(progB, "uKA"), params.kA);
    gl.uniform1f(gl.getUniformLocation(progB, "uKM"), params.kM);
    gl.uniform1f(gl.getUniformLocation(progB, "uMaxDisp"), params.maxDisp);
    gl.uniform1f(gl.getUniformLocation(progB, "uDt"), cdt);
    bindTex(progB, "uUA", 0, uaTex);
    draw();

    // C: transport -> fieldB, then swap
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
    gl.useProgram(progC);
    gl.uniform1i(gl.getUniformLocation(progC, "uN"), N);
    gl.uniform1f(gl.getUniformLocation(progC, "uMut"), params.mut * cdt);
    bindTex(progC, "uFlow", 0, flowTex);
    bindTex(progC, "uNoise", 1, noiseTex);
    draw();
    [fieldA, fieldB] = [fieldB, fieldA];
    [fboA, fboB] = [fboB, fboA];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function render(time: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progR);
    gl.uniform2f(gl.getUniformLocation(progR, "uRes"), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(progR, "uTime"), time);
    gl.uniform1f(gl.getUniformLocation(progR, "uExpo"), params.expo);
    bindTex(progR, "uField", 0, fieldA);
    draw();
  }

  function sample(): FieldStats {
    // D: downsample -> reducedTex
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboReduced);
    gl.viewport(0, 0, READ, READ);
    gl.useProgram(progD);
    gl.uniform1i(gl.getUniformLocation(progD, "uN"), READ);
    gl.uniform1i(gl.getUniformLocation(progD, "uBlock"), BLOCK);
    gl.uniform1f(gl.getUniformLocation(progD, "uScale"), 1.0 / (BLOCK * BLOCK * 0.9));
    bindTex(progD, "uField", 0, fieldA);
    draw();
    gl.readPixels(0, 0, READ, READ, gl.RGBA, gl.UNSIGNED_BYTE, readBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const bandMass = [0, 0, 0];
    const bandX = [0, 0, 0];
    const bandY = [0, 0, 0];
    let total = 0;
    let motion = 0;
    for (let y = 0; y < READ; y++) {
      for (let x = 0; x < READ; x++) {
        const i = (y * READ + x) * 4;
        const m = readBuf[i] / 255;
        const s = readBuf[i + 1] / 255;
        total += m;
        if (havePrev) motion += Math.abs(m - prevReduced[y * READ + x]);
        prevReduced[y * READ + x] = m;
        // assign to nearest species band
        let band = 0;
        if (s >= 0.66) band = 2;
        else if (s >= 0.33) band = 1;
        bandMass[band] += m;
        bandX[band] += (m * x) / (READ - 1);
        bandY[band] += (m * (READ - 1 - y)) / (READ - 1); // flip to match render
      }
    }
    havePrev = true;
    const cells = READ * READ;
    const species: SpeciesStat[] = [];
    for (let b = 0; b < SPECIES_COUNT; b++) {
      const mm = bandMass[b];
      species.push({
        mass: mm / total > 0 ? mm / (total || 1) : 0,
        cx: mm > 1e-4 ? bandX[b] / mm : 0.5,
        cy: mm > 1e-4 ? bandY[b] / mm : 0.5,
      });
    }
    return { total: total / cells, motion: motion / cells, species };
  }

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const t of [fieldA, fieldB, uaTex, flowTex, noiseTex, reducedTex]) gl.deleteTexture(t);
    for (const f of [fboA, fboB, fboUA, fboFlow, fboReduced]) gl.deleteFramebuffer(f);
    for (const p of [progA, progB, progC, progD, progR, progSeed]) gl.deleteProgram(p);
    gl.deleteVertexArray(vao);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  }

  return {
    field: N,
    speciesCount: SPECIES_COUNT,
    step,
    render,
    sample,
    seed,
    reset,
    resize,
    destroy,
  };
}

function buildNoise(n: number, rng: () => number): Float32Array {
  const d = new Float32Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = rng();
    d[i * 4] = v;
    d[i * 4 + 1] = v;
    d[i * 4 + 2] = v;
    d[i * 4 + 3] = 1;
  }
  return d;
}

// ── Fallback plasma (no float RTT needed) ────────────────────────────────────
export interface Fallback {
  render(time: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

export function buildFallback(canvas: HTMLCanvasElement): Fallback | null {
  const glMaybe = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!glMaybe) return null;
  const gl: WebGL2RenderingContext = glMaybe;
  const prog = program(gl, PLASMA);
  const vao = gl.createVertexArray()!;
  function resize(w: number, h: number) {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1);
    canvas.width = Math.max(1, Math.round(Math.min(w, 720) * dpr));
    canvas.height = Math.max(1, Math.round(Math.min(h, 720) * dpr));
  }
  function render(time: number) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.uniform2f(gl.getUniformLocation(prog, "uRes"), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(prog, "uTime"), time);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return { render, resize, destroy };
}
