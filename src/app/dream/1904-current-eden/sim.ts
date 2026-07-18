// ─────────────────────────────────────────────────────────────────────────────
// 1904-current-eden · simulation engine
//
// Multi-kernel Flow-Lenia continuous cellular automaton on the GPU. Three
// dye-tagged species live in a persistent RGBA16F state field (R,G,B = per-
// species mass, A = total). Every frame:
//   0. seed once into three separate home clusters
//   1. paint / decay a human "current" (velocity) field
//   2. potential pass — each species convolves its OWN ring kernel (distinct
//      radii → distinct organisms) into a growth potential g_s
//   3. advection pass — per-species flow F_s = k·∇g_s − p·∇M + c·current is
//      resolved with mass-conserving reintegration tracking (Plantec et al.,
//      Flow-Lenia). No birth term adds mass from nothing → without conducting,
//      species sit in their wells and never meet.
//   4. every 4th frame a tiny 32×32 reduction is read back for cross-species
//      overlap (encounter energy), per-species mass and a 2-scale variance.
//   5. display pass — subtractive dye on warm linen, combed along the current.
//
// Deterministic: geometry / autopilot use a mulberry32 PRNG on a fixed seed and
// an integer frame counter. No Math.random, Date.now or performance.now here.
// ─────────────────────────────────────────────────────────────────────────────

export type SimMetrics = {
  /** per-species relative mass, roughly 0..1 each */
  mass: [number, number, number];
  /** cross-species overlap this frame ("encounter energy"), 0..~1 */
  encounter: number;
  /** MSPD-lite: ratio of fine-scale to coarse-scale activity variance */
  complexity: number;
  /** index 0..2 of the most-massive species */
  lead: number;
};

export type PointerBrush = {
  /** true while the human is actively dragging */
  active: boolean;
  /** brush centre in 0..1 texture space */
  x: number;
  y: number;
  /** drag velocity in texture space / frame */
  vx: number;
  vy: number;
};

const SIM = 256; // state grid (power of two → toroidal REPEAT wrap)
const CURR = 128; // current field grid
const RED = 32; // readback reduction grid

// ── deterministic PRNG ───────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── GLSL ─────────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main(){
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  v_uv = vec2((x + 1.0) * 0.5, (y + 1.0) * 0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}`;

// seed three gaussian home clusters
const FRAG_SEED = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 uC0, uC1, uC2;
uniform vec3 uR;   // per-species blob radius
uniform float uAmp;
float blob(vec2 p, vec2 c, float r){ vec2 d = p - c; return exp(-dot(d,d)/(r*r)); }
void main(){
  float r = uAmp * blob(v_uv, uC0, uR.x);
  float g = uAmp * blob(v_uv, uC1, uR.y);
  float b = uAmp * blob(v_uv, uC2, uR.z);
  o = vec4(r, g, b, r + g + b);
}`;

// current field: decay + gaussian velocity splat
const FRAG_CURRENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uBrush;    // centre 0..1
uniform vec2 uVel;      // velocity to splat
uniform float uRadius;  // splat radius (uv)
uniform float uDecay;   // per-frame retention
void main(){
  vec2 prev = texture(uPrev, v_uv).rg * uDecay;
  vec2 d = v_uv - uBrush;
  float f = exp(-dot(d,d)/(uRadius*uRadius));
  o = vec4(prev + uVel * f, 0.0, 1.0);
}`;

// potential pass: per-species ring convolution → growth potential g_s
const FRAG_POT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec3 uRadius; // per-species kernel radius (texels)
uniform vec3 uMu;
uniform vec3 uSigma;
const int RING = 16;
void main(){
  vec3 U = vec3(0.0);
  for(int i=0;i<RING;i++){
    float a = (float(i) + 0.5) / float(RING) * 6.28318530718;
    vec2 dir = vec2(cos(a), sin(a));
    U.r += texture(uState, v_uv + dir * uRadius.x * uTexel).r;
    U.g += texture(uState, v_uv + dir * uRadius.y * uTexel).g;
    U.b += texture(uState, v_uv + dir * uRadius.z * uTexel).b;
  }
  U /= float(RING);
  vec3 dv = U - uMu;
  vec3 g = 2.0 * exp(-(dv*dv) / (2.0 * uSigma * uSigma)) - 1.0; // growth in (-1,1]
  float m = dot(texture(uState, v_uv).rgb, vec3(1.0));
  o = vec4(g, m);
}`;

// advection: mass-conserving reintegration tracking with per-species flow
const FRAG_ADVECT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D uState;
uniform sampler2D uPot;
uniform sampler2D uCurrent;
uniform vec2 uTexel;
uniform float uCohesion;
uniform float uPressure;
uniform float uCurrentK;
uniform float uMotion; // reduced-motion / global speed scale
float tri(float t){ return max(0.0, 1.0 - abs(t)); }
void main(){
  vec3 acc = vec3(0.0);
  for(int oy=-1;oy<=1;oy++){
    for(int ox=-1;ox<=1;ox++){
      vec2 off = vec2(float(ox), float(oy));
      vec2 suv = v_uv + off * uTexel;
      vec4 px  = texture(uPot, suv + vec2(uTexel.x, 0.0));
      vec4 pxm = texture(uPot, suv - vec2(uTexel.x, 0.0));
      vec4 py  = texture(uPot, suv + vec2(0.0, uTexel.y));
      vec4 pym = texture(uPot, suv - vec2(0.0, uTexel.y));
      vec3 gx = 0.5 * (px.rgb - pxm.rgb);   // ∂g_s/∂x
      vec3 gy = 0.5 * (py.rgb - pym.rgb);
      float mx = 0.5 * (px.a - pxm.a);      // ∂M/∂x
      float my = 0.5 * (py.a - pym.a);
      vec2 cur = texture(uCurrent, suv).rg;
      vec3 ms = texture(uState, suv).rgb;
      // per-species displacement; target sits at offset -off from this source
      // r
      float dxr = clamp((uCohesion*gx.r - uPressure*mx + uCurrentK*cur.x)*uMotion, -0.9, 0.9);
      float dyr = clamp((uCohesion*gy.r - uPressure*my + uCurrentK*cur.y)*uMotion, -0.9, 0.9);
      acc.r += ms.r * tri(off.x + dxr) * tri(off.y + dyr);
      // g
      float dxg = clamp((uCohesion*gx.g - uPressure*mx + uCurrentK*cur.x)*uMotion, -0.9, 0.9);
      float dyg = clamp((uCohesion*gy.g - uPressure*my + uCurrentK*cur.y)*uMotion, -0.9, 0.9);
      acc.g += ms.g * tri(off.x + dxg) * tri(off.y + dyg);
      // b
      float dxb = clamp((uCohesion*gx.b - uPressure*mx + uCurrentK*cur.x)*uMotion, -0.9, 0.9);
      float dyb = clamp((uCohesion*gy.b - uPressure*my + uCurrentK*cur.y)*uMotion, -0.9, 0.9);
      acc.b += ms.b * tri(off.x + dxb) * tri(off.y + dyb);
    }
  }
  o = vec4(acc, acc.r + acc.g + acc.b);
}`;

// reduction: 8×8 block average → mass + cross-species overlap
const FRAG_REDUCE = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uState;
uniform float uSimSize;
void main(){
  ivec2 oc = ivec2(gl_FragCoord.xy); // 0..RED-1
  vec3 sm = vec3(0.0);
  float ov = 0.0;
  for(int jy=0;jy<8;jy++){
    for(int jx=0;jx<8;jx++){
      vec2 suv = (vec2(oc * 8) + vec2(float(jx), float(jy)) + 0.5) / uSimSize;
      vec3 m = texture(uState, suv).rgb;
      sm += m;
      ov += min(m.r, m.g) + min(m.g, m.b) + min(m.r, m.b);
    }
  }
  o = vec4(sm / 64.0, ov / 64.0);
}`;

// display: subtractive dye on warm linen, combed along the current field
const FRAG_DISPLAY = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D uState;
uniform sampler2D uCurrent;
uniform float uWarp;
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  vec2 warp = texture(uCurrent, v_uv).rg * uWarp;
  vec2 uv = v_uv + warp;
  vec3 m = texture(uState, uv).rgb;
  // woven thread modulation (fine, static, no flicker)
  float thread = 0.85 + 0.15 * hash(floor(uv * 512.0));
  vec3 col = vec3(0.955, 0.930, 0.865); // linen / cream
  vec3 madder = vec3(0.62, 0.13, 0.10);
  vec3 saffron = vec3(0.86, 0.60, 0.16);
  vec3 indigo  = vec3(0.15, 0.20, 0.42);
  col = mix(col, madder, clamp(m.r * 1.8 * thread, 0.0, 0.92));
  col = mix(col, saffron, clamp(m.g * 1.8 * thread, 0.0, 0.92));
  col = mix(col, indigo,  clamp(m.b * 1.8 * thread, 0.0, 0.92));
  // encounter bloom: where two dyes co-occur, a soft saffron glow
  float ov = min(m.r,m.g) + min(m.g,m.b) + min(m.r,m.b);
  col = mix(col, vec3(0.98, 0.82, 0.42), clamp(ov * 2.2, 0.0, 0.5));
  col = clamp(col, 0.0, 0.965); // peak clamped below pure white
  o = vec4(col, 1.0);
}`;

// ── GL helpers ────────────────────────────────────────────────────────────────
function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, VERT);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "unknown";
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

function makeTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internal: number,
  format: number,
  type: number,
): Target {
  const tex = gl.createTexture();
  if (!tex) throw new Error("texture alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("fbo alloc failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

// ── engine ───────────────────────────────────────────────────────────────────
export type SimInit = { ok: true; sim: EdenSim } | { ok: false; reason: string };

export function createSim(canvas: HTMLCanvasElement, seed = 0x1904ede0): SimInit {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });
  if (!gl) return { ok: false, reason: "WebGL2 is not available in this browser." };
  if (!gl.getExtension("EXT_color_buffer_float")) {
    return { ok: false, reason: "Float render targets (EXT_color_buffer_float) are unavailable." };
  }
  try {
    return { ok: true, sim: new EdenSim(gl, seed) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "GL init failed." };
  }
}

export class EdenSim {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private progSeed: WebGLProgram;
  private progCurrent: WebGLProgram;
  private progPot: WebGLProgram;
  private progAdvect: WebGLProgram;
  private progReduce: WebGLProgram;
  private progDisplay: WebGLProgram;

  private stateA: Target;
  private stateB: Target;
  private currA: Target;
  private currB: Target;
  private pot: Target;
  private reduce: Target;

  private readBuf = new Float32Array(RED * RED * 4);
  private frame = 0;

  metrics: SimMetrics = { mass: [0, 0, 0], encounter: 0, complexity: 0, lead: 0 };

  constructor(gl: WebGL2RenderingContext, seed: number) {
    this.gl = gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;

    this.progSeed = program(gl, FRAG_SEED);
    this.progCurrent = program(gl, FRAG_CURRENT);
    this.progPot = program(gl, FRAG_POT);
    this.progAdvect = program(gl, FRAG_ADVECT);
    this.progReduce = program(gl, FRAG_REDUCE);
    this.progDisplay = program(gl, FRAG_DISPLAY);

    const RGBA16F = gl.RGBA16F,
      RGBA = gl.RGBA,
      HF = gl.HALF_FLOAT;
    this.stateA = makeTarget(gl, SIM, SIM, RGBA16F, RGBA, HF);
    this.stateB = makeTarget(gl, SIM, SIM, RGBA16F, RGBA, HF);
    this.currA = makeTarget(gl, CURR, CURR, RGBA16F, RGBA, HF);
    this.currB = makeTarget(gl, CURR, CURR, RGBA16F, RGBA, HF);
    this.pot = makeTarget(gl, SIM, SIM, RGBA16F, RGBA, HF);
    this.reduce = makeTarget(gl, RED, RED, gl.RGBA32F, RGBA, gl.FLOAT);

    this.seed(seed);
  }

  private draw(target: Target | null, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private seed(seed: number) {
    const gl = this.gl;
    const rnd = mulberry32(seed);
    // three home clusters spread around the torus with a little jitter
    const c0: [number, number] = [0.26 + 0.04 * (rnd() - 0.5), 0.30 + 0.04 * (rnd() - 0.5)];
    const c1: [number, number] = [0.74 + 0.04 * (rnd() - 0.5), 0.36 + 0.04 * (rnd() - 0.5)];
    const c2: [number, number] = [0.5 + 0.04 * (rnd() - 0.5), 0.74 + 0.04 * (rnd() - 0.5)];
    gl.useProgram(this.progSeed);
    gl.uniform2f(this.loc(this.progSeed, "uC0"), c0[0], c0[1]);
    gl.uniform2f(this.loc(this.progSeed, "uC1"), c1[0], c1[1]);
    gl.uniform2f(this.loc(this.progSeed, "uC2"), c2[0], c2[1]);
    gl.uniform3f(this.loc(this.progSeed, "uR"), 0.085, 0.075, 0.095);
    gl.uniform1f(this.loc(this.progSeed, "uAmp"), 0.34);
    this.draw(this.stateA, SIM, SIM);
    // clear current fields to zero
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currA.fbo);
    gl.viewport(0, 0, CURR, CURR);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currB.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private locCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    let inner = this.locCache.get(p);
    if (!inner) {
      inner = new Map();
      this.locCache.set(p, inner);
    }
    if (inner.has(name)) return inner.get(name) ?? null;
    const l = this.gl.getUniformLocation(p, name);
    inner.set(name, l);
    return l;
  }

  private bindTex(unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  /** advance one frame; returns true on frames where metrics were refreshed */
  step(brush: PointerBrush, motion: number): boolean {
    const gl = this.gl;
    const texel = 1 / SIM;

    // 1 · current field: decay + splat (human brush or autopilot brush upstream)
    gl.useProgram(this.progCurrent);
    this.bindTex(0, this.currA.tex);
    gl.uniform1i(this.loc(this.progCurrent, "uPrev"), 0);
    gl.uniform2f(this.loc(this.progCurrent, "uBrush"), brush.x, brush.y);
    gl.uniform2f(this.loc(this.progCurrent, "uVel"), brush.active ? brush.vx : 0, brush.active ? brush.vy : 0);
    gl.uniform1f(this.loc(this.progCurrent, "uRadius"), 0.11);
    gl.uniform1f(this.loc(this.progCurrent, "uDecay"), 0.982); // ~2.5s half-life @60fps
    this.draw(this.currB, CURR, CURR);
    [this.currA, this.currB] = [this.currB, this.currA];

    // 2 · potential
    gl.useProgram(this.progPot);
    this.bindTex(0, this.stateA.tex);
    gl.uniform1i(this.loc(this.progPot, "uState"), 0);
    gl.uniform2f(this.loc(this.progPot, "uTexel"), texel, texel);
    gl.uniform3f(this.loc(this.progPot, "uRadius"), 3.0, 5.0, 7.0); // distinct organism scales
    gl.uniform3f(this.loc(this.progPot, "uMu"), 0.16, 0.20, 0.24);
    gl.uniform3f(this.loc(this.progPot, "uSigma"), 0.045, 0.05, 0.055);
    this.draw(this.pot, SIM, SIM);

    // 3 · advection (mass-conserving)
    gl.useProgram(this.progAdvect);
    this.bindTex(0, this.stateA.tex);
    this.bindTex(1, this.pot.tex);
    this.bindTex(2, this.currA.tex);
    gl.uniform1i(this.loc(this.progAdvect, "uState"), 0);
    gl.uniform1i(this.loc(this.progAdvect, "uPot"), 1);
    gl.uniform1i(this.loc(this.progAdvect, "uCurrent"), 2);
    gl.uniform2f(this.loc(this.progAdvect, "uTexel"), texel, texel);
    gl.uniform1f(this.loc(this.progAdvect, "uCohesion"), 0.85);
    gl.uniform1f(this.loc(this.progAdvect, "uPressure"), 0.6);
    gl.uniform1f(this.loc(this.progAdvect, "uCurrentK"), 26.0);
    gl.uniform1f(this.loc(this.progAdvect, "uMotion"), motion);
    this.draw(this.stateB, SIM, SIM);
    [this.stateA, this.stateB] = [this.stateB, this.stateA];

    // 4 · reduction + readback every 4th frame
    let refreshed = false;
    if (this.frame % 4 === 0) {
      gl.useProgram(this.progReduce);
      this.bindTex(0, this.stateA.tex);
      gl.uniform1i(this.loc(this.progReduce, "uState"), 0);
      gl.uniform1f(this.loc(this.progReduce, "uSimSize"), SIM);
      this.draw(this.reduce, RED, RED);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.reduce.fbo);
      gl.readPixels(0, 0, RED, RED, gl.RGBA, gl.FLOAT, this.readBuf);
      this.computeMetrics();
      refreshed = true;
    }

    // 5 · display to screen
    gl.useProgram(this.progDisplay);
    this.bindTex(0, this.stateA.tex);
    this.bindTex(1, this.currA.tex);
    gl.uniform1i(this.loc(this.progDisplay, "uState"), 0);
    gl.uniform1i(this.loc(this.progDisplay, "uCurrent"), 1);
    gl.uniform1f(this.loc(this.progDisplay, "uWarp"), 0.9);
    this.draw(null, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);

    this.frame++;
    return refreshed;
  }

  private computeMetrics() {
    const buf = this.readBuf;
    const n = RED * RED;
    let mR = 0,
      mG = 0,
      mB = 0,
      enc = 0;
    const totals = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = buf[i * 4],
        g = buf[i * 4 + 1],
        b = buf[i * 4 + 2],
        a = buf[i * 4 + 3];
      mR += r;
      mG += g;
      mB += b;
      enc += a;
      totals[i] = r + g + b;
    }
    // 2-scale variance (MSPD-lite): fine per-cell vs coarse 4×4-block means
    let meanFine = 0;
    for (let i = 0; i < n; i++) meanFine += totals[i];
    meanFine /= n;
    let varFine = 0;
    for (let i = 0; i < n; i++) {
      const d = totals[i] - meanFine;
      varFine += d * d;
    }
    varFine /= n;
    const CB = RED / 4; // 8 coarse blocks per axis
    const coarse = new Float32Array(CB * CB);
    for (let y = 0; y < RED; y++) {
      for (let x = 0; x < RED; x++) {
        coarse[((y / 4) | 0) * CB + ((x / 4) | 0)] += totals[y * RED + x] / 16;
      }
    }
    let meanC = 0;
    for (let i = 0; i < coarse.length; i++) meanC += coarse[i];
    meanC /= coarse.length;
    let varC = 0;
    for (let i = 0; i < coarse.length; i++) {
      const d = coarse[i] - meanC;
      varC += d * d;
    }
    varC /= coarse.length;
    const complexity = varFine / (varC + 1e-4);

    const scale = 1 / n;
    this.metrics = {
      mass: [mR * scale, mG * scale, mB * scale],
      encounter: enc * scale,
      complexity: Math.min(complexity, 20),
      lead: mR >= mG && mR >= mB ? 0 : mG >= mB ? 1 : 2,
    };
  }

  dispose() {
    const gl = this.gl;
    for (const t of [this.stateA, this.stateB, this.currA, this.currB, this.pot, this.reduce]) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    for (const p of [
      this.progSeed,
      this.progCurrent,
      this.progPot,
      this.progAdvect,
      this.progReduce,
      this.progDisplay,
    ]) {
      gl.deleteProgram(p);
    }
    gl.deleteVertexArray(this.vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
