// ─────────────────────────────────────────────────────────────────────────────
// sim.ts — FLOW-EDEN II: a tended, multi-kernel Flow-Lenia herbarium ecology.
//
//   ONE mass-conserving simulation is BOTH the image and (via readback) the
//   score. The ecology lives in a ping-ponged RGBA16F "field" texture:
//       R = m   local MASS (finite, conserved)
//       G = q   mass-weighted GENOME  (q = m * s, s ∈ [0,1] the species param)
//
//   MULTI-KERNEL Lenia (Chan 1812.05433; Leniabreeder 2406.04235): each cell's
//   genome s blends TWO radial ring kernels (an inner and an outer ring at
//   different peak radius / width). Each kernel has its own Gaussian growth bump
//   G_k = 2·exp(−½((U_k−μ_k)/σ_k)²)−1; the affinity that drives flow is a
//   genome-weighted MIX of the two — richer morphologies + real speciation than
//   a single kernel.
//
//   THE GARDENER IS LOAD-BEARING. A second single-channel ENVIRONMENT texture
//   (R = resource, G = soil-genome) is painted by the pointer. Pass A biases the
//   affinity by the environment: growth is amplified where a cell's genome
//   MATCHES the local enriched soil, and suppressed toward a low baseline
//   everywhere else. The environment DIFFUSES and DECAYS toward that dull
//   baseline, so if the gardener stops tending, the affinity collapses to a flat
//   low field, only the −kM·∇m pressure term survives, and the conserved mass
//   diffuses to a near-uniform, quiet equilibrium within ~30 s. Tending is the
//   only thing that keeps distinct species — and distinct music — alive.
//
//   One tick = GPU passes on a fullscreen triangle (gl_VertexID only, empty VAO):
//     E  environment : diffuse + decay the resource/soil field toward baseline
//     A  perceive    : multi-kernel convolution → per-kernel U_k, growth G_k,
//                      blended affinity A, biased by the environment
//     B  flow        : F = kA·∇A − kM·∇m   (up the affinity gradient, minus a
//                      pressure term so mass never piles to white)
//     C  transport   : REINTEGRATION TRACKING — every source cell deposits its
//                      mass into a unit box shifted by dt·F; 1-D overlaps sum to
//                      1 so TOTAL MASS IS CONSERVED EXACTLY. A tiny genome
//                      mutation is folded in so the ecology keeps drifting.
//     D  downsample  → 48² RGBA8, readPixels for cheap per-species stats + a
//                      MSPD-lite complexity scalar (2606.17091).
//
//   Everything deterministic: mulberry32 seeded 0x1900.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeciesStat {
  mass: number; // fraction of total mass held by this species band
  cx: number; // center of mass x (0..1)
  cy: number; // center of mass y (0..1)
}

export interface FieldStats {
  total: number; // mean mass per cell (kept ~constant by conservation)
  motion: number; // mean |Δ| of the reduced field since last readback
  complexity: number; // MSPD-lite scalar in [0,1] — multi-scale structure
  species: SpeciesStat[]; // one entry per species band
}

export interface Sim {
  readonly field: number;
  readonly speciesCount: number;
  step(dt: number): void;
  render(time: number): void;
  sample(): FieldStats;
  /** Paint the environment/resource field at (nx,ny). soil ∈ [0,1] biases which
   *  genome thrives there; amount>0 enriches, amount<0 makes barren. */
  paintEnv(nx: number, ny: number, radius: number, amount: number, soil: number): void;
  /** Drop a gaussian blob of a species' matter at normalized (nx,ny). */
  seed(nx: number, ny: number, radius: number, mass: number, species: number): void;
  /** Erase (cull) mass in a region. */
  cull(nx: number, ny: number, radius: number): void;
  reset(): void;
  resize(cssW: number, cssH: number): void;
  destroy(): void;
}

// deterministic PRNG — mulberry32, seeded 0x1900 as required.
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

export const SPECIES_COUNT = 5;
// Genome band centers (s values) that name each "species".
export const SPECIES_S = [0.1, 0.3, 0.5, 0.7, 0.9];

// ── GLSL shared header ───────────────────────────────────────────────────────
const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform int uN;
out vec4 o;
ivec2 wrap(ivec2 c){ return (c % uN + ivec2(uN)) % ivec2(uN); }
`;

const VERT = `#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Per-cell MULTI-KERNEL rule parameters as smooth functions of the genome s.
// Two rings (inner / outer) plus a genome-driven blend weight — this is the
// "massively bigger" deepening: real speciation via kernel balance, not one ring.
const GENOME_GLSL = `
float k0_peak(float s){ return 0.26 + 0.12 * s; }   // inner ring radius
float k1_peak(float s){ return 0.62 + 0.16 * s; }   // outer ring radius
float k0_wid(float s){  return 0.055 + 0.020 * s; }
float k1_wid(float s){  return 0.050 + 0.020 * s; }
float k0_mu(float s){   return 0.130 + 0.060 * s; }        // growth center k0
float k1_mu(float s){   return 0.150 + 0.050 * (1.0 - s); } // growth center k1
float k0_sig(float s){  return 0.015 + 0.006 * s; }
float k1_sig(float s){  return 0.016 + 0.006 * s; }
float kw0(float s){     return 0.30 + 0.45 * s; }   // weight of INNER ring
`;

// Pass A — perceive: multi-kernel convolution → affinity A, biased by environment.
function passA(R: number) {
  return `${HEAD}
uniform sampler2D uField;
uniform sampler2D uEnv;
uniform float uBaseR;   // environment resource baseline
${GENOME_GLSL}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = texelFetch(uField, c, 0);
  float m = f.r;
  float s = (m > 1e-5) ? clamp(f.g / m, 0.0, 1.0) : 0.5;
  float p0 = k0_peak(s), w0 = k0_wid(s);
  float p1 = k1_peak(s), w1 = k1_wid(s);
  float a0 = 0.0, ks0 = 0.0, a1 = 0.0, ks1 = 0.0;
  const int R = ${R};
  for(int dy=-R; dy<=R; dy++){
    for(int dx=-R; dx<=R; dx++){
      float rr = length(vec2(float(dx), float(dy))) / float(R);
      if(rr > 1.0) continue;
      float mn = texelFetch(uField, wrap(c + ivec2(dx, dy)), 0).r;
      float e0 = exp(-(rr - p0) * (rr - p0) / (2.0 * w0 * w0));
      float e1 = exp(-(rr - p1) * (rr - p1) / (2.0 * w1 * w1));
      a0 += e0 * mn; ks0 += e0;
      a1 += e1 * mn; ks1 += e1;
    }
  }
  float U0 = (ks0 > 0.0) ? a0 / ks0 : 0.0;
  float U1 = (ks1 > 0.0) ? a1 / ks1 : 0.0;
  float d0 = (U0 - k0_mu(s)) / k0_sig(s);
  float d1 = (U1 - k1_mu(s)) / k1_sig(s);
  float G0 = 2.0 * exp(-0.5 * d0 * d0) - 1.0;
  float G1 = 2.0 * exp(-0.5 * d1 * d1) - 1.0;
  float kb = kw0(s);
  float G = kb * G0 + (1.0 - kb) * G1;   // blended growth in [-1,1]

  // ── environment bias: the human's shaping ──
  vec2 uv = (vec2(c) + 0.5) / float(uN);
  vec4 env = texture(uEnv, uv);
  float res = env.r;           // resource level
  float soil = env.g;          // soil-genome preference
  float match = exp(-(s - soil) * (s - soil) / (2.0 * 0.09));  // genome↔soil fit
  float boost = clamp((res - uBaseR) / max(1e-3, 1.0 - uBaseR), 0.0, 1.0) * match;
  // Affinity: growth amplified in enriched, genome-matched zones; suppressed to
  // a net-negative drift at baseline so an untended field flattens.
  float A = G * (0.28 + 1.75 * boost) - 0.11 * (1.0 - boost);
  o = vec4(A, m, s, boost);
}`;
}

// Pass B — flow field F = kA·∇A − kM·∇m, clamped to a max displacement.
const PASS_B = `${HEAD}
uniform sampler2D uP;       // (A, m, s, boost)
uniform float uKA;
uniform float uKM;
uniform float uMaxDisp;
uniform float uDt;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 ct = texelFetch(uP, c, 0);
  float m = ct.g, s = ct.b;
  float axp = texelFetch(uP, wrap(c + ivec2(1,0)), 0).r;
  float axm = texelFetch(uP, wrap(c + ivec2(-1,0)), 0).r;
  float ayp = texelFetch(uP, wrap(c + ivec2(0,1)), 0).r;
  float aym = texelFetch(uP, wrap(c + ivec2(0,-1)), 0).r;
  vec2 gradA = 0.5 * vec2(axp - axm, ayp - aym);
  float mxp = texelFetch(uP, wrap(c + ivec2(1,0)), 0).g;
  float mxm = texelFetch(uP, wrap(c + ivec2(-1,0)), 0).g;
  float myp = texelFetch(uP, wrap(c + ivec2(0,1)), 0).g;
  float mym = texelFetch(uP, wrap(c + ivec2(0,-1)), 0).g;
  vec2 gradM = 0.5 * vec2(mxp - mxm, myp - mym);
  vec2 F = uKA * gradA - uKM * gradM;
  vec2 disp = clamp(F * uDt, -uMaxDisp, uMaxDisp);
  o = vec4(disp.x, disp.y, m, m * s);
}`;

const OVERLAP_GLSL = `
float ov(float a0, float a1, float b0, float b1){
  return max(0.0, min(a1, b1) - max(a0, b0));
}`;

// Pass C — transport by reintegration tracking (mass-conserving) + mutation.
const PASS_C = `${HEAD}
uniform sampler2D uFlow;    // (dispx, dispy, m, q)
uniform sampler2D uNoise;
uniform float uMut;
${OVERLAP_GLSL}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  float newM = 0.0, newQ = 0.0;
  for(int sy=-1; sy<=1; sy++){
    for(int sx=-1; sx<=1; sx++){
      vec4 src = texelFetch(uFlow, wrap(c + ivec2(sx, sy)), 0);
      vec2 tgt = vec2(float(sx), float(sy)) + 0.5 + src.rg;
      float w = ov(tgt.x - 0.5, tgt.x + 0.5, 0.0, 1.0) *
                ov(tgt.y - 0.5, tgt.y + 0.5, 0.0, 1.0);
      newM += src.b * w;
      newQ += src.a * w;
    }
  }
  float s = (newM > 1e-5) ? clamp(newQ / newM, 0.0, 1.0) : 0.5;
  float n = texelFetch(uNoise, c, 0).r - 0.5;
  s = clamp(s + uMut * n, 0.0, 1.0);
  o = vec4(newM, newM * s, 0.0, 1.0);
}`;

// Pass E — environment diffusion + decay toward the dull baseline.
const PASS_E = `${HEAD}
uniform sampler2D uEnv;
uniform float uBaseR;   // resource baseline
uniform float uDiff;    // diffusion amount (0..0.25)
uniform float uMixR;    // resource decay-toward-baseline mix (0..0.2)
uniform float uMixS;    // soil decay-toward-neutral mix
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 e  = texelFetch(uEnv, c, 0);
  vec4 ep = texelFetch(uEnv, wrap(c + ivec2(1,0)), 0);
  vec4 em = texelFetch(uEnv, wrap(c + ivec2(-1,0)), 0);
  vec4 eu = texelFetch(uEnv, wrap(c + ivec2(0,1)), 0);
  vec4 ed = texelFetch(uEnv, wrap(c + ivec2(0,-1)), 0);
  vec4 nb = 0.25 * (ep + em + eu + ed);
  vec4 blur = mix(e, nb, uDiff);
  float r = mix(blur.r, uBaseR, uMixR);
  float soil = mix(blur.g, 0.5, uMixS);
  o = vec4(r, soil, 0.0, 1.0);
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
  o = vec4(clamp(mAcc * uScale, 0.0, 1.0), sMean, 0.0, 1.0);
}`;

// Render — HERBARIUM: sepia ink & wash on warm rag paper. A LIGHT palette.
const RENDER = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform sampler2D uEnv;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform float uTime;
uniform float uExpo;
uniform float uBaseR;
out vec4 o;
// botanical-plate inks: deep green → ochre/sepia → oxblood/madder
vec3 herbarium(float s){
  vec3 green   = vec3(0.24, 0.35, 0.19);
  vec3 ochre   = vec3(0.60, 0.45, 0.20);
  vec3 oxblood = vec3(0.42, 0.15, 0.13);
  return (s < 0.5) ? mix(green, ochre, s * 2.0)
                   : mix(ochre, oxblood, (s - 0.5) * 2.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 f = texture(uField, uv);
  float m = f.r;
  float s = (m > 1e-5) ? clamp(f.g / m, 0.0, 1.0) : 0.5;
  vec4 env = texture(uEnv, uv);
  float res = env.r;

  // warm rag paper ground, faintly warmed where the gardener has tended
  vec3 paper = vec3(0.930, 0.900, 0.820);
  float wash = clamp((res - uBaseR) / max(1e-3, 1.0 - uBaseR), 0.0, 1.0);
  paper += vec3(0.045, 0.020, -0.030) * wash;   // enriched soil reads warmer/deeper
  // faint paper grain
  float grain = texture(uNoise, uv * 1.7).r - 0.5;
  paper *= 1.0 + grain * 0.030;

  // ink density from mass, tone-mapped; soft ink-wash edge
  float dens = 1.0 - exp(-m * uExpo);
  dens = smoothstep(0.02, 0.95, dens);
  vec3 ink = herbarium(s);
  // subtractive wash: pigment settles onto the paper
  vec3 col = mix(paper, ink, clamp(dens * 0.92, 0.0, 0.92));
  // a hair of a darker wet edge where density is mid (ink pooling)
  float edge = dens * (1.0 - dens) * 4.0;
  col *= 1.0 - 0.06 * edge;
  // slow luminance drift (no flicker) + gentle vignette
  col *= 0.985 + 0.015 * sin(uTime * 0.12 + uv.x * 2.0 + uv.y * 1.7);
  vec2 d = uv - 0.5;
  col *= 1.0 - 0.18 * dot(d, d);
  o = vec4(clamp(col, 0.04, 0.960), 1.0);
}`;

// Fallback — light herbarium wash needing NO float RTT, so the screen is never blank.
const PLASMA = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime * 0.06;
  float v = sin(uv.x * 3.5 + t) + sin(uv.y * 4.0 - t * 0.7)
          + sin((uv.x + uv.y) * 2.5 + t * 1.1);
  float s = 0.5 + 0.35 * sin(v);
  vec3 paper = vec3(0.930, 0.900, 0.820);
  vec3 green = vec3(0.30, 0.40, 0.22);
  vec3 ochre = vec3(0.60, 0.45, 0.22);
  vec3 col = mix(paper, mix(green, ochre, s), 0.10 + 0.10 * (0.5 + 0.5 * sin(v * 1.3)));
  o = vec4(clamp(col, 0.04, 0.95), 1.0);
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
    throw new Error("link: " + gl.getProgramInfoLog(p));
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

const BASE_R = 0.12; // dull environment resource baseline

export function buildSim(canvas: HTMLCanvasElement, opts: BuildOpts = {}): Sim | null {
  const glMaybe = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!glMaybe) return null;
  if (!glMaybe.getExtension("EXT_color_buffer_float")) return null;
  const gl: WebGL2RenderingContext = glMaybe;

  const N = opts.field ?? 160;
  const READ = opts.read ?? 48;
  const R = opts.kernelR ?? 8;
  const BLOCK = Math.max(1, Math.round(N / READ));

  const params = {
    kA: 0.32,
    kM: 0.17,
    maxDisp: 0.85,
    mut: 0.006,
    expo: 2.3,
    step: 1.0, // fixed internal sim step (flow is not real-time scaled)
  };

  const rng = mulberry32(0x1900);

  const progE = program(gl, PASS_E);
  const progA = program(gl, passA(R));
  const progB = program(gl, PASS_B);
  const progC = program(gl, PASS_C);
  const progD = program(gl, PASS_D);
  const progR = program(gl, RENDER);
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
  const progCull = program(
    gl,
    `${HEAD}
uniform sampler2D uField;
uniform vec2 uC; uniform float uRad;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = texelFetch(uField, c, 0);
  vec2 d = (vec2(c) - uC);
  float g = exp(-dot(d,d)/(2.0*uRad*uRad));
  float k = 1.0 - 0.92 * g;
  o = vec4(f.r * k, f.g * k, 0.0, 1.0);
}`,
  );
  const progPaint = program(
    gl,
    `${HEAD}
uniform sampler2D uEnv;
uniform vec2 uC; uniform float uRad; uniform float uAmp; uniform float uSoil; uniform float uBaseR;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 e = texelFetch(uEnv, c, 0);
  vec2 d = (vec2(c) - uC);
  float g = exp(-dot(d,d)/(2.0*uRad*uRad));
  float r = clamp(e.r + uAmp * g, uBaseR * 0.25, 1.0);
  float soil = mix(e.g, uSoil, clamp(g * 0.7, 0.0, 1.0) * step(0.0, uAmp));
  o = vec4(r, soil, 0.0, 1.0);
}`,
  );

  const vao = gl.createVertexArray()!;

  // field ping-pong
  let fieldA = makeFloatTex(gl, N, null);
  let fieldB = makeFloatTex(gl, N, null);
  const percTex = makeFloatTex(gl, N, null);
  const flowTex = makeFloatTex(gl, N, null);
  const noiseTex = makeFloatTex(gl, N, buildNoise(N, rng));
  let fboA = makeFbo(gl, fieldA);
  let fboB = makeFbo(gl, fieldB);
  const fboPerc = makeFbo(gl, percTex);
  const fboFlow = makeFbo(gl, flowTex);

  // environment ping-pong
  let envA = makeFloatTex(gl, N, null);
  let envB = makeFloatTex(gl, N, null);
  let fboEnvA = makeFbo(gl, envA);
  let fboEnvB = makeFbo(gl, envB);

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
  let smoothComplexity = 0;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  function resize(cssW: number, cssH: number) {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1);
    const w = Math.max(1, Math.round(Math.min(cssW, 760) * dpr));
    const h = Math.max(1, Math.round(Math.min(cssH, 760) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function draw() {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function bindTex(prog: WebGLProgram, name: string, unit: number, tex: WebGLTexture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  function buildSeed(): Float32Array {
    const buf = new Float32Array(N * N * 4);
    const bg = 0.03;
    for (let i = 0; i < N * N; i++) buf[i * 4] = bg;
    const blobs = 16;
    for (let b = 0; b < blobs; b++) {
      const sp = b % SPECIES_COUNT;
      const s = SPECIES_S[sp];
      const cx = (0.12 + 0.76 * rng()) * N;
      const cy = (0.12 + 0.76 * rng()) * N;
      const rad = (0.035 + 0.045 * rng()) * N;
      const amp = 0.5 + 0.35 * rng();
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
          buf[idx] = Math.min(1.4, buf[idx] + add);
          buf[idx + 1] = buf[idx + 1] + add * s;
        }
      }
    }
    for (let i = 0; i < N * N; i++) {
      const m = buf[i * 4];
      if (buf[i * 4 + 1] === 0 && m > 0) buf[i * 4 + 1] = m * 0.5;
    }
    return buf;
  }

  function envSeed(): Float32Array {
    const buf = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      buf[i * 4] = BASE_R; // resource baseline
      buf[i * 4 + 1] = 0.5; // neutral soil
    }
    return buf;
  }

  function upload(tex: WebGLTexture, data: Float32Array) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.FLOAT, data);
  }

  function reset() {
    upload(fieldA, buildSeed());
    upload(fieldB, new Float32Array(N * N * 4));
    upload(envA, envSeed());
    upload(envB, envSeed());
    havePrev = false;
    smoothComplexity = 0;
  }
  reset();

  function step(dt: number) {
    const rdt = Math.min(0.05, Math.max(0.0, dt)) || 0.016;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, N, N);

    // E: environment diffuse + decay (real-time, so it settles in ~seconds)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboEnvB);
    gl.useProgram(progE);
    gl.uniform1i(gl.getUniformLocation(progE, "uN"), N);
    gl.uniform1f(gl.getUniformLocation(progE, "uBaseR"), BASE_R);
    gl.uniform1f(gl.getUniformLocation(progE, "uDiff"), Math.min(0.25, rdt * 2.2));
    gl.uniform1f(gl.getUniformLocation(progE, "uMixR"), Math.min(0.2, rdt / 7.0));
    gl.uniform1f(gl.getUniformLocation(progE, "uMixS"), Math.min(0.2, rdt / 6.0));
    bindTex(progE, "uEnv", 0, envA);
    draw();
    [envA, envB] = [envB, envA];
    [fboEnvA, fboEnvB] = [fboEnvB, fboEnvA];

    // A: perceive -> percTex
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboPerc);
    gl.useProgram(progA);
    gl.uniform1i(gl.getUniformLocation(progA, "uN"), N);
    gl.uniform1f(gl.getUniformLocation(progA, "uBaseR"), BASE_R);
    bindTex(progA, "uField", 0, fieldA);
    bindTex(progA, "uEnv", 1, envA);
    draw();

    // B: flow -> flowTex
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboFlow);
    gl.useProgram(progB);
    gl.uniform1i(gl.getUniformLocation(progB, "uN"), N);
    gl.uniform1f(gl.getUniformLocation(progB, "uKA"), params.kA);
    gl.uniform1f(gl.getUniformLocation(progB, "uKM"), params.kM);
    gl.uniform1f(gl.getUniformLocation(progB, "uMaxDisp"), params.maxDisp);
    gl.uniform1f(gl.getUniformLocation(progB, "uDt"), params.step);
    bindTex(progB, "uP", 0, percTex);
    draw();

    // C: transport -> fieldB, swap
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
    gl.useProgram(progC);
    gl.uniform1i(gl.getUniformLocation(progC, "uN"), N);
    gl.uniform1f(gl.getUniformLocation(progC, "uMut"), params.mut);
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
    gl.uniform1f(gl.getUniformLocation(progR, "uBaseR"), BASE_R);
    bindTex(progR, "uField", 0, fieldA);
    bindTex(progR, "uEnv", 1, envA);
    bindTex(progR, "uNoise", 2, noiseTex);
    draw();
  }

  function runField(prog: WebGLProgram, setup: () => void) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
    gl.viewport(0, 0, N, N);
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, "uN"), N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldA);
    gl.uniform1i(gl.getUniformLocation(prog, "uField"), 0);
    setup();
    draw();
    [fieldA, fieldB] = [fieldB, fieldA];
    [fboA, fboB] = [fboB, fboA];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function seed(nx: number, ny: number, radius: number, mass: number, species: number) {
    const s = SPECIES_S[((species % SPECIES_COUNT) + SPECIES_COUNT) % SPECIES_COUNT];
    runField(progSeed, () => {
      gl.uniform2f(gl.getUniformLocation(progSeed, "uC"), nx * N, (1 - ny) * N);
      gl.uniform1f(gl.getUniformLocation(progSeed, "uRad"), Math.max(1.5, radius * N));
      gl.uniform1f(gl.getUniformLocation(progSeed, "uAmp"), mass);
      gl.uniform1f(gl.getUniformLocation(progSeed, "uS"), s);
    });
  }

  function cull(nx: number, ny: number, radius: number) {
    runField(progCull, () => {
      gl.uniform2f(gl.getUniformLocation(progCull, "uC"), nx * N, (1 - ny) * N);
      gl.uniform1f(gl.getUniformLocation(progCull, "uRad"), Math.max(1.5, radius * N));
    });
  }

  function paintEnv(nx: number, ny: number, radius: number, amount: number, soil: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboEnvB);
    gl.viewport(0, 0, N, N);
    gl.useProgram(progPaint);
    gl.uniform1i(gl.getUniformLocation(progPaint, "uN"), N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, envA);
    gl.uniform1i(gl.getUniformLocation(progPaint, "uEnv"), 0);
    gl.uniform2f(gl.getUniformLocation(progPaint, "uC"), nx * N, (1 - ny) * N);
    gl.uniform1f(gl.getUniformLocation(progPaint, "uRad"), Math.max(1.5, radius * N));
    gl.uniform1f(gl.getUniformLocation(progPaint, "uAmp"), amount);
    gl.uniform1f(gl.getUniformLocation(progPaint, "uSoil"), soil);
    gl.uniform1f(gl.getUniformLocation(progPaint, "uBaseR"), BASE_R);
    draw();
    [envA, envB] = [envB, envA];
    [fboEnvA, fboEnvB] = [fboEnvB, fboEnvA];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function sample(): FieldStats {
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

    const bandMass = new Array(SPECIES_COUNT).fill(0);
    const bandX = new Array(SPECIES_COUNT).fill(0);
    const bandY = new Array(SPECIES_COUNT).fill(0);
    let total = 0;
    let motion = 0;
    // MSPD-lite: fine-scale mass field + a 12² blur of it
    const COARSE = 12;
    const cblock = READ / COARSE; // 4
    const coarse = new Float32Array(COARSE * COARSE);
    let mSum = 0;
    for (let y = 0; y < READ; y++) {
      for (let x = 0; x < READ; x++) {
        const i = (y * READ + x) * 4;
        const m = readBuf[i] / 255;
        const s = readBuf[i + 1] / 255;
        total += m;
        mSum += m;
        if (havePrev) motion += Math.abs(m - prevReduced[y * READ + x]);
        prevReduced[y * READ + x] = m;
        const band = Math.min(SPECIES_COUNT - 1, Math.floor(s * SPECIES_COUNT));
        bandMass[band] += m;
        bandX[band] += (m * x) / (READ - 1);
        bandY[band] += (m * (READ - 1 - y)) / (READ - 1);
        const cx = Math.floor(x / cblock);
        const cy = Math.floor(y / cblock);
        coarse[cy * COARSE + cx] += m / (cblock * cblock);
      }
    }
    havePrev = true;
    const cells = READ * READ;
    const meanFine = mSum / cells;
    // variance at fine (48²) scale
    let varFine = 0;
    for (let y = 0; y < READ; y++) {
      for (let x = 0; x < READ; x++) {
        const m = prevReduced[y * READ + x];
        varFine += (m - meanFine) * (m - meanFine);
      }
    }
    varFine /= cells;
    // variance at coarse (12²) scale
    let meanCoarse = 0;
    for (let i = 0; i < coarse.length; i++) meanCoarse += coarse[i];
    meanCoarse /= coarse.length;
    let varCoarse = 0;
    for (let i = 0; i < coarse.length; i++)
      varCoarse += (coarse[i] - meanCoarse) * (coarse[i] - meanCoarse);
    varCoarse /= coarse.length;
    // multi-scale path divergence (lite): fine-scale structure the coarse blur
    // misses, amplified by temporal change. A colony "becoming interesting" has
    // structure at the fine scale AND is moving.
    const detail = Math.max(0, varFine - varCoarse);
    const motionVar = motion / cells;
    const raw = Math.min(1, detail * 22.0 + motionVar * 14.0);
    smoothComplexity += (raw - smoothComplexity) * 0.12;

    const species: SpeciesStat[] = [];
    for (let b = 0; b < SPECIES_COUNT; b++) {
      const mm = bandMass[b];
      species.push({
        mass: total > 0 ? mm / total : 0,
        cx: mm > 1e-4 ? bandX[b] / mm : 0.5,
        cy: mm > 1e-4 ? bandY[b] / mm : 0.5,
      });
    }
    return {
      total: total / cells,
      motion: motionVar,
      complexity: smoothComplexity,
      species,
    };
  }

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const t of [fieldA, fieldB, percTex, flowTex, noiseTex, envA, envB, reducedTex])
      gl.deleteTexture(t);
    for (const f of [fboA, fboB, fboPerc, fboFlow, fboEnvA, fboEnvB, fboReduced])
      gl.deleteFramebuffer(f);
    for (const p of [progE, progA, progB, progC, progD, progR, progSeed, progCull, progPaint])
      gl.deleteProgram(p);
    gl.deleteVertexArray(vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return {
    field: N,
    speciesCount: SPECIES_COUNT,
    step,
    render,
    sample,
    paintEnv,
    seed,
    cull,
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
    d[i * 4 + 1] = rng();
    d[i * 4 + 2] = rng();
    d[i * 4 + 3] = 1;
  }
  return d;
}

// ── Fallback (no float RTT needed) ───────────────────────────────────────────
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
    canvas.width = Math.max(1, Math.round(Math.min(w, 760) * dpr));
    canvas.height = Math.max(1, Math.round(Math.min(h, 760) * dpr));
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
