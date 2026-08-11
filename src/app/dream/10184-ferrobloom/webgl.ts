// ─────────────────────────────────────────────────────────────────────────────
// webgl.ts — the WebGL2 substrate for Ferrobloom.
//
//   Two things live here:
//   1. A GPU height-field SIMULATION of the Rosensweig (normal-field) ferrofluid
//      instability, evolved on ping-pong framebuffer textures. The rule is a
//      Swift–Hohenberg-type pattern former: below a critical field the flat
//      interface is stable; above it, a preferred wavelength (capillary-vs-
//      magnetic balance) is amplified and a quadratic term breaks up/down
//      symmetry so the surface self-organises into a HEXAGONAL LATTICE OF UP-
//      SPIKES — the classic ferrofluid peaks (Cowley & Rosensweig, 1967).
//   2. A screen-space METALLIC render: surface normals are reconstructed from
//      the height field and shaded as warm liquid metal — dark bronze/basalt
//      base, amber/copper/gold speculars, a Fresnel rim, and a faint slow heat-
//      glow at the sharpest peak tips. Reads as a real 3D molten surface.
//
//   State is stored as (h, q) where q = s²·∇²h from the previous step, so the
//   biharmonic ∇⁴h needed by the (1 + s²∇²)² operator is available in one pass.
//   Prefers RGBA16F (EXT_color_buffer_float); falls back to an 8-bit PACKED
//   height encoding so it still runs where float render targets are absent.
// ─────────────────────────────────────────────────────────────────────────────

export const SIM_RES = 160;

export interface StepParams {
  /** dt per substep. */
  dt: number;
  /** substeps this frame. */
  substeps: number;
  /** control parameter r — the effective magnetic field. r<~0 flat, r>0 spikes. */
  field: number;
  /** s² — wavelength selector. Larger = coarser spikes (lower voice). */
  s2: number;
  /** quadratic hex-forming coefficient (up-spike bias). */
  gQuad: number;
  /** constant seeded nucleation noise amplitude. */
  noise: number;
  /** running time (s) for noise animation. */
  time: number;
  /** active onset ripples: [x, y, strength] in 0..1, up to 6. */
  onsets: number[];
}

export interface RenderParams {
  time: number;
  /** bump strength: smaller = sharper spikes. */
  heightScale: number;
  /** peak heat-glow intensity 0..1. */
  glow: number;
  /** overall field energy 0..1 — warms the metal as spikes erupt. */
  energy: number;
}

export interface FerroBackend {
  ok: boolean;
  packed: boolean;
  step(p: StepParams): void;
  render(p: RenderParams): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

// ── Simulation fragment shader ───────────────────────────────────────────────
// The {{CODEC}} placeholder is swapped for float or packed read/write helpers.
const SIM_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDt, uR, uS2, uG, uNoise, uTime, uSeed;
uniform int uOnsetCount;
uniform vec3 uOnsets[6];
in vec2 vUv;
out vec4 frag;

{{CODEC}}

float hash(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}

void main(){
  vec2 t = uTexel;
  float hC = readH(vUv);
  float hL = readH(vUv - vec2(t.x,0.0));
  float hR = readH(vUv + vec2(t.x,0.0));
  float hD = readH(vUv - vec2(0.0,t.y));
  float hU = readH(vUv + vec2(0.0,t.y));
  float lap = (hL+hR+hU+hD) - 4.0*hC;

  float qL = readQ(vUv - vec2(t.x,0.0));
  float qR = readQ(vUv + vec2(t.x,0.0));
  float qD = readQ(vUv - vec2(0.0,t.y));
  float qU = readQ(vUv + vec2(0.0,t.y));
  float qC = readQ(vUv);
  float lapQ = (qL+qR+qU+qD) - 4.0*qC;

  float q = uS2 * lap;            // s^2 * lap(h)
  float biharm = uS2 * lapQ;      // s^2 * lap(q) ~= s^4 * lap^2(h)
  float shOp = hC + 2.0*q + biharm; // (1 + s^2 * lap)^2 applied to h

  // seeded nucleation + a faint dc bias so hexagons pick UP-spikes
  float n = hash(vUv*vec2(uSeed, uSeed+7.0) + uTime*0.37) - 0.5;
  float force = uNoise * n;

  for(int i=0;i<6;i++){
    if(i>=uOnsetCount) break;
    vec3 o = uOnsets[i];
    float d = distance(vUv, o.xy);
    force += o.z * cos(d*70.0) * exp(-d*7.0);
  }

  float dh = uR*hC - shOp + uG*hC*hC - hC*hC*hC + force;
  float hNew = clamp(hC + uDt*dh, -3.0, 3.0);
  float qNew = uS2 * lap;

  writeState(hNew, qNew);
}`;

const CODEC_FLOAT = `
float readH(vec2 uv){ return texture(uState, uv).r; }
float readQ(vec2 uv){ return texture(uState, uv).g; }
void writeState(float h, float q){ frag = vec4(h, q, 0.0, 1.0); }
`;

// packed: h and q each stored as a 16-bit value across two bytes, mapped [-4,4].
const CODEC_PACKED = `
vec2 pack16(float v){ float u=clamp(v*0.125+0.5,0.0,1.0)*255.0; return vec2(floor(u)/255.0, fract(u)); }
float unpack16(vec2 p){ return ((p.x*255.0 + p.y)/255.0 - 0.5)*8.0; }
float readH(vec2 uv){ vec4 c=texture(uState, uv); return unpack16(c.rg); }
float readQ(vec2 uv){ vec4 c=texture(uState, uv); return unpack16(c.ba); }
void writeState(float h, float q){ frag = vec4(pack16(h), pack16(q)); }
`;

// ── Metallic render shader ───────────────────────────────────────────────────
const RENDER_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uTime, uHeightScale, uGlow, uEnergy;
in vec2 vUv;
out vec4 frag;

{{CODEC}}

void main(){
  vec2 t = uTexel;
  float hC = readH(vUv);
  float hL = readH(vUv - vec2(t.x,0.0));
  float hR = readH(vUv + vec2(t.x,0.0));
  float hD = readH(vUv - vec2(0.0,t.y));
  float hU = readH(vUv + vec2(0.0,t.y));

  // surface normal from the height field
  vec3 n = normalize(vec3((hL-hR), (hD-hU), uHeightScale));

  // curvature — sharp peak tips have strongly negative curvature
  float curv = (hL+hR+hU+hD) - 4.0*hC;

  // warm key light from upper-left, plus a cool-ish fill from below
  vec3 L = normalize(vec3(-0.45, 0.62, 0.65));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 48.0);
  float spec2 = pow(max(dot(n, H), 0.0), 220.0); // tight hot highlight
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);

  // warm liquid-metal palette (raw art colors — shader only)
  vec3 basalt = vec3(0.055, 0.035, 0.028);     // dark bronze/basalt base
  vec3 bronze = vec3(0.34, 0.20, 0.10);
  vec3 amber  = vec3(1.00, 0.66, 0.30);
  vec3 gold   = vec3(1.00, 0.82, 0.45);
  vec3 copper = vec3(0.92, 0.42, 0.18);

  // ambient occlusion-ish: valleys sit in shadow, ridges catch light
  float ao = smoothstep(-0.7, 0.9, hC)*0.6 + 0.4;

  vec3 col = basalt;
  col += bronze * (0.10 + 0.90*diff) * ao;
  col += amber * spec * (0.6 + 0.7*uEnergy);
  col += gold  * spec2 * 1.4;
  col += copper * fres * (0.35 + 0.4*uEnergy);

  // faint slow heat-glow at the sharpest peak tips (high h + concave tip)
  float tip = smoothstep(0.35, 1.1, hC) * smoothstep(0.0, -0.25, curv);
  float breathe = 0.55 + 0.45*sin(uTime*0.7 + hC*3.0);
  vec3 heat = mix(vec3(1.0,0.30,0.08), vec3(1.0,0.62,0.22), breathe);
  col += heat * tip * uGlow * (0.5 + 0.8*uEnergy);

  // gentle vignette to seat the pool
  vec2 d = vUv - 0.5;
  col *= 1.0 - 0.85*dot(d,d);

  // soft filmic-ish tone curve, keep it warm
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.90));
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[ferrobloom] shader compile failed:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[ferrobloom] link failed:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/** Build the WebGL2 backend. Returns a stub with ok=false if unusable. */
export function createFerroBackend(
  canvas: HTMLCanvasElement,
  initSeed: Float32Array, // length SIM_RES*SIM_RES, initial h values
): FerroBackend {
  const stub: FerroBackend = {
    ok: false,
    packed: false,
    step() {},
    render() {},
    resize() {},
    destroy() {},
  };

  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (gl === null) return stub;

  const floatOk = gl.getExtension("EXT_color_buffer_float") !== null;
  const packed = !floatOk;

  const codec = packed ? CODEC_PACKED : CODEC_FLOAT;
  const simProg = link(gl, QUAD_VS, SIM_FS.replace("{{CODEC}}", codec));
  const renderProg = link(gl, QUAD_VS, RENDER_FS.replace("{{CODEC}}", codec));
  if (!simProg || !renderProg) {
    if (simProg) gl.deleteProgram(simProg);
    if (renderProg) gl.deleteProgram(renderProg);
    return stub;
  }

  // fullscreen triangle
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // ping-pong state textures
  const internalFormat = packed ? gl.RGBA8 : gl.RGBA16F;
  const type = packed ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT;
  const filter = packed ? gl.NEAREST : gl.LINEAR;

  function makeStateTex(seed: Float32Array | null): WebGLTexture {
    const g = gl as WebGL2RenderingContext;
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    let data: ArrayBufferView | null = null;
    if (seed) {
      if (packed) {
        const buf = new Uint8Array(SIM_RES * SIM_RES * 4);
        for (let i = 0; i < seed.length; i++) {
          const u = Math.min(1, Math.max(0, seed[i] * 0.125 + 0.5)) * 255;
          const hi = Math.floor(u);
          const lo = Math.round((u - hi) * 255);
          buf[i * 4] = hi;
          buf[i * 4 + 1] = lo;
          buf[i * 4 + 2] = 128; // q=0
          buf[i * 4 + 3] = 0;
        }
        data = buf;
      } else {
        // HALF_FLOAT upload path is awkward; upload zeros then seed via a float
        // scratch is overkill. Instead pack seed into a Float32 and let the GPU
        // read it as half by uploading via FLOAT then converting is not allowed.
        // Simplest reliable route: upload a Uint16 half-float buffer.
        const buf = new Uint16Array(SIM_RES * SIM_RES * 4);
        for (let i = 0; i < seed.length; i++) {
          buf[i * 4] = floatToHalf(seed[i]);
          buf[i * 4 + 1] = floatToHalf(0);
          buf[i * 4 + 2] = 0;
          buf[i * 4 + 3] = floatToHalf(1);
        }
        data = buf;
      }
    }
    g.texImage2D(
      g.TEXTURE_2D,
      0,
      internalFormat,
      SIM_RES,
      SIM_RES,
      0,
      g.RGBA,
      type,
      data,
    );
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, filter);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, filter);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return tex;
  }

  let texA = makeStateTex(initSeed);
  let texB = makeStateTex(null);
  const fbo = gl.createFramebuffer()!;

  // uniform locations
  gl.useProgram(simProg);
  const sU = {
    state: gl.getUniformLocation(simProg, "uState"),
    texel: gl.getUniformLocation(simProg, "uTexel"),
    dt: gl.getUniformLocation(simProg, "uDt"),
    r: gl.getUniformLocation(simProg, "uR"),
    s2: gl.getUniformLocation(simProg, "uS2"),
    g: gl.getUniformLocation(simProg, "uG"),
    noise: gl.getUniformLocation(simProg, "uNoise"),
    time: gl.getUniformLocation(simProg, "uTime"),
    seed: gl.getUniformLocation(simProg, "uSeed"),
    onsetCount: gl.getUniformLocation(simProg, "uOnsetCount"),
    onsets: gl.getUniformLocation(simProg, "uOnsets"),
  };
  gl.useProgram(renderProg);
  const rU = {
    state: gl.getUniformLocation(renderProg, "uState"),
    texel: gl.getUniformLocation(renderProg, "uTexel"),
    time: gl.getUniformLocation(renderProg, "uTime"),
    heightScale: gl.getUniformLocation(renderProg, "uHeightScale"),
    glow: gl.getUniformLocation(renderProg, "uGlow"),
    energy: gl.getUniformLocation(renderProg, "uEnergy"),
  };

  const texel = 1 / SIM_RES;
  let viewW = canvas.width;
  let viewH = canvas.height;

  const backend: FerroBackend = {
    ok: true,
    packed,
    step(p: StepParams) {
      gl.useProgram(simProg);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, SIM_RES, SIM_RES);
      gl.uniform2f(sU.texel, texel, texel);
      gl.uniform1f(sU.dt, p.dt);
      gl.uniform1f(sU.r, p.field);
      gl.uniform1f(sU.s2, p.s2);
      gl.uniform1f(sU.g, p.gQuad);
      gl.uniform1f(sU.noise, p.noise);
      gl.uniform1f(sU.seed, 0x10184 % 1000);
      const oc = Math.min(6, Math.floor(p.onsets.length / 3));
      gl.uniform1i(sU.onsetCount, oc);
      if (oc > 0) gl.uniform3fv(sU.onsets, p.onsets.slice(0, oc * 3));
      for (let s = 0; s < p.substeps; s++) {
        gl.uniform1f(sU.time, p.time + s * p.dt);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texB,
          0,
        );
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texA);
        gl.uniform1i(sU.state, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const tmp = texA;
        texA = texB;
        texB = tmp;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    render(p: RenderParams) {
      gl.useProgram(renderProg);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewW, viewH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.uniform1i(rU.state, 0);
      gl.uniform2f(rU.texel, texel, texel);
      gl.uniform1f(rU.time, p.time);
      gl.uniform1f(rU.heightScale, p.heightScale);
      gl.uniform1f(rU.glow, p.glow);
      gl.uniform1f(rU.energy, p.energy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w: number, h: number) {
      viewW = w;
      viewH = h;
    },
    destroy() {
      gl.deleteProgram(simProg);
      gl.deleteProgram(renderProg);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteFramebuffer(fbo);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
  return backend;
}

// IEEE-754 float32 → half (float16) bits, for HALF_FLOAT texture uploads.
function floatToHalf(val: number): number {
  const f = new Float32Array(1);
  const i = new Int32Array(f.buffer);
  f[0] = val;
  const x = i[0];
  const sign = (x >> 16) & 0x8000;
  let mant = x & 0x007fffff;
  let exp = (x >> 23) & 0xff;
  if (exp === 255) return sign | 0x7c00 | (mant ? 0x0200 : 0); // inf/nan
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00; // overflow → inf
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x00800000) >> (1 - exp);
    return sign | (mant >> 13);
  }
  return sign | (exp << 10) | (mant >> 13);
}
