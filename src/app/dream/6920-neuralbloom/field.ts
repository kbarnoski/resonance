// ─────────────────────────────────────────────────────────────────────────────
// field.ts — WebGL2 ping-pong Wilson–Cowan neural field + log-polar renderer.
//
// A 256×256 cortical sheet holds two coupled rates E (excitatory) and I
// (inhibitory) packed into the R / G channels of an RGBA8 texture (rates live in
// [0,1], so 8-bit UNORM is enough and — crucially — always color-renderable AND
// readback-able, so we need no float-texture extension). Two textures are
// ping-ponged by a reaction fragment shader that implements the Euler update
//
//   Ec = wEE·(KE*E) − wEI·(KI*I) + P + DRIVE + asym
//   Ic = wIE·(KE*E) − wII·(KI*I) + Q
//   E += (dt/tauE)(−E + f(Ec));  I += (dt/tauI)(−I + f(Ic))
//
// with a Mexican-hat kernel approximated by short-range excitation (radius rE)
// and longer-range inhibition (radius rI) sampled as 8-tap rings. The Turing
// WAVELENGTH is set by rE/rI, so driving rI (+ a hexagon-favouring bias) with
// the mic's spectral centroid walks the pattern's SYMMETRY CLASS: stripes → spots
// → hexagons. A render pass warps the sheet through the retino-cortical complex
// logarithm (Ermentrout–Cowan 1979; Bressloff et al. 2001) so those classes read
// out as tunnels → cobwebs → honeycombs, tone-mapped to the house violet ramp.
//
// A coarse regime read-back (structure-tensor coherence of a 48×48 patch) gives
// a live "which form-constant dominates" estimate from the field itself.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/visionary/logpolar";
import { PALETTE_GLSL } from "../_shared/palette";

export const GRID = 256;

/** Deterministic PRNG — seeded once, no Math.random / Date.now anywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StepParams {
  /** Excitation kernel radius (px). Short-range, roughly fixed. */
  rE: number;
  /** Inhibition kernel radius (px) — THE mic-centroid-driven Turing control. */
  rI: number;
  /** Hexagon-favouring excitatory bias — rises with pitch to break stripe symmetry. */
  asym: number;
  /** Excitatory drive (mic amplitude) — pushes the field across the bifurcation. */
  drive: number;
  /** Onset burst amplitude this frame (0 when no onset). */
  burstAmp: number;
  /** Onset burst centre in field UV [0,1]². */
  burstX: number;
  burstY: number;
  /** Simulation substeps this frame. */
  substeps: number;
}

export interface RenderParams {
  /** Slow inward cortical drift → tunnel motion. */
  drift: number;
  /** Global brightness multiplier (safe-flicker luminance, ≤3 Hz). */
  bright: number;
  /** Pitch-control position 0..1 (tints the palette a touch across the walk). */
  mu: number;
}

export type Regime = "tunnel" | "cobweb" | "honeycomb";

export interface RegimeReadout {
  regime: Regime;
  /** Structure-tensor coherence 0..1 (high = oriented stripes). */
  coherence: number;
  /** Mean field activity 0..1. */
  activity: number;
}

const REGIME_LABEL: Record<Regime, string> = {
  tunnel: "Tunnels — cortical stripes",
  cobweb: "Cobwebs — spots",
  honeycomb: "Honeycomb — hexagons",
};

export function regimeLabel(r: Regime): string {
  return REGIME_LABEL[r];
}

/** True when WebGL2 can be created in this environment. */
export function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

// ── shaders ──────────────────────────────────────────────────────────────────

const QUAD_VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Wilson–Cowan reaction step. Field packed R=E, G=I in [0,1].
const STEP_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uField;
uniform float uGrid;
uniform float uRE;
uniform float uRI;
uniform float uAsym;
uniform float uDrive;
uniform float uBurstAmp;
uniform vec2  uBurst;

// constants (per the specified model)
const float wEE = 10.0;
const float wEI = 10.0;
const float wIE = 10.0;
const float wII = -2.0;
const float tauE = 1.0;
const float tauI = 2.0;
const float dt   = 0.15;
const float P    = -0.2;
const float Q    = -0.9;
const float aSig = 8.0;
const float theta = 0.15;
const float TAU = 6.28318530718;

float f(float s){ return 1.0 / (1.0 + exp(-aSig * (s - theta))); }

// 8-tap ring blur of one channel at radius radPx (toroidal wrap via fract).
float ringBlur(vec2 uv, float radPx, int chan){
  float tx = 1.0 / uGrid;
  vec4 c = texture(uField, uv);
  float centre = (chan == 0) ? c.r : c.g;
  float acc = centre * 0.28;
  for(int i = 0; i < 8; i++){
    float ang = TAU * float(i) / 8.0;
    vec2 o = vec2(cos(ang), sin(ang)) * radPx * tx;
    vec4 s = texture(uField, fract(uv + o));
    acc += ((chan == 0) ? s.r : s.g) * 0.09;
  }
  return acc; // weights sum to 1.0 (0.28 + 8*0.09)
}

void main(){
  vec2 uv = gl_FragCoord.xy / uGrid;
  vec4 cur = texture(uField, uv);
  float E = cur.r;
  float I = cur.g;

  float KEE = ringBlur(uv, uRE, 0); // short-range excitation
  float KII = ringBlur(uv, uRI, 1); // long-range inhibition (pitch-driven radius)

  // localized onset burst — a breakthrough flash of excitation
  float bd = distance(uv, uBurst);
  float burst = uBurstAmp * exp(-(bd * bd) / (2.0 * 0.035 * 0.035));

  float Ec = wEE * KEE - wEI * KII + P + uDrive + uAsym + burst;
  float Ic = wIE * KEE - wII * KII + Q;

  E += (dt / tauE) * (-E + f(Ec));
  I += (dt / tauI) * (-I + f(Ic));

  fragColor = vec4(clamp(E, 0.0, 1.0), clamp(I, 0.0, 1.0), 0.0, 1.0);
}
`;

// Render pass — log-polar warp of E to the violet palette.
const RENDER_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uField;
uniform vec2 uRes;
uniform float uDrift;
uniform float uBright;
uniform float uMu;

${LOGPOLAR_GLSL}
${PALETTE_GLSL}

const float U_MIN = -3.5;
const float U_SPAN = 5.0; // u in [-3.5, 1.5]

void main(){
  // centered, aspect-normalized (y-based) screen coordinate
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec2 c = screenToCortex(p);          // (log r, theta)
  float u = c.x + uDrift;              // inward drift → tunnel motion
  float uN = clamp((u - U_MIN) / U_SPAN, 0.0, 1.0);
  float vN = fract((c.y + 3.14159265) / TAU_LP);

  float E = texture(uField, vec2(uN, vN)).r;
  float t = smoothstep(0.34, 0.78, E);

  // palette walks a touch with the pitch control so the morph is doubly legible
  vec3 col = dreamPalette(0.12 + 0.16 * uMu + 0.72 * t);

  float r = length(p);
  float coreGlow = 0.22 * exp(-r * 1.6);      // bright tunnel throat
  float vig = 1.0 - 0.20 * dot(p, p);
  col *= uBright * vig;
  col += vec3(0.35, 0.22, 0.55) * coreGlow * t;

  fragColor = vec4(col, 1.0);
}
`;

// ── the field ────────────────────────────────────────────────────────────────

export class NeuralField {
  private gl: WebGL2RenderingContext;
  private stepProg: WebGLProgram;
  private renderProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private fboA: WebGLFramebuffer;
  private fboB: WebGLFramebuffer;
  private uStep: Record<string, WebGLUniformLocation | null> = {};
  private uRender: Record<string, WebGLUniformLocation | null> = {};
  private readBuf = new Uint8Array(48 * 48 * 4);
  private disposed = false;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, seed: () => number) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

    this.stepProg = this.buildProgram(QUAD_VERT, STEP_FRAG);
    this.renderProg = this.buildProgram(QUAD_VERT, RENDER_FRAG);

    // full-screen triangle
    const verts = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("WebGL2 buffer alloc failed");
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    for (const prog of [this.stepProg, this.renderProg]) {
      const loc = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    // seed field with deterministic per-cell noise so symmetry breaks reproducibly
    const seedData = new Uint8Array(GRID * GRID * 4);
    for (let i = 0; i < GRID * GRID; i++) {
      const e = 0.08 + 0.30 * seed();
      const inh = 0.06 + 0.14 * seed();
      seedData[i * 4 + 0] = Math.floor(e * 255);
      seedData[i * 4 + 1] = Math.floor(inh * 255);
      seedData[i * 4 + 2] = 0;
      seedData[i * 4 + 3] = 255;
    }
    this.texA = this.makeFieldTex(seedData);
    this.texB = this.makeFieldTex(null);
    this.fboA = this.makeFbo(this.texA);
    this.fboB = this.makeFbo(this.texB);

    for (const name of ["uField", "uGrid", "uRE", "uRI", "uAsym", "uDrive", "uBurstAmp", "uBurst"]) {
      this.uStep[name] = gl.getUniformLocation(this.stepProg, name);
    }
    for (const name of ["uField", "uRes", "uDrift", "uBright", "uMu"]) {
      this.uRender[name] = gl.getUniformLocation(this.renderProg, name);
    }
  }

  private makeFieldTex(data: Uint8Array | null): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("WebGL2 texture alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRID, GRID, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return tex;
  }

  private makeFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("WebGL2 framebuffer alloc failed");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL2 framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader alloc failed");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("shader compile error: " + log);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("program link error: " + log);
    }
    return prog;
  }

  /** Advance the Wilson–Cowan field `p.substeps` iterations (ping-pong). */
  step(p: StepParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.useProgram(this.stepProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, GRID, GRID);
    gl.uniform1f(this.uStep.uGrid, GRID);
    gl.uniform1f(this.uStep.uRE, p.rE);
    gl.uniform1f(this.uStep.uRI, p.rI);
    gl.uniform1f(this.uStep.uAsym, p.asym);
    gl.uniform1f(this.uStep.uDrive, p.drive);

    for (let s = 0; s < p.substeps; s++) {
      // burst only on the first substep of the frame
      const amp = s === 0 ? p.burstAmp : 0;
      gl.uniform1f(this.uStep.uBurstAmp, amp);
      gl.uniform2f(this.uStep.uBurst, p.burstX, p.burstY);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texA);
      gl.uniform1i(this.uStep.uField, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // swap
      const tt = this.texA; this.texA = this.texB; this.texB = tt;
      const tf = this.fboA; this.fboA = this.fboB; this.fboB = tf;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Warp the current field to the canvas through the log-polar map. */
  render(p: RenderParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    this.resize();
    gl.useProgram(this.renderProg);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.uniform1i(this.uRender.uField, 0);
    gl.uniform2f(this.uRender.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uRender.uDrift, p.drift);
    gl.uniform1f(this.uRender.uBright, p.bright);
    gl.uniform1f(this.uRender.uMu, p.mu);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private resize(): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = Math.max(1, Math.floor(canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * this.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /**
   * Coarse regime estimate from the field itself: read a 48×48 patch and
   * measure structure-tensor coherence (oriented → stripes) plus mean activity.
   * `muControl` (the pitch position) breaks the spots↔hexagon tie, since both
   * are low-coherence blob lattices that a cheap CPU pass can't cleanly separate.
   */
  readRegime(muControl: number): RegimeReadout {
    const gl = this.gl;
    const N = 48;
    const x0 = (GRID - N) >> 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.readPixels(x0, x0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, this.readBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const buf = this.readBuf;
    let jxx = 0, jyy = 0, jxy = 0, sum = 0;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const idx = (y * N + x) * 4;
        const e = buf[idx] / 255;
        sum += e;
        const gx = (buf[idx + 4] - buf[idx - 4]) / 510; // (E[x+1]-E[x-1])/2 /255
        const gy = (buf[idx + N * 4] - buf[idx - N * 4]) / 510;
        jxx += gx * gx;
        jyy += gy * gy;
        jxy += gx * gy;
      }
    }
    const denom = jxx + jyy;
    const coherence = denom > 1e-6
      ? Math.sqrt((jxx - jyy) * (jxx - jyy) + 4 * jxy * jxy) / denom
      : 0;
    const activity = sum / ((N - 2) * (N - 2));

    let regime: Regime;
    if (coherence > 0.40) regime = "tunnel";
    else if (muControl < 0.5) regime = "cobweb";
    else regime = "honeycomb";

    return { regime, coherence, activity };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    try {
      gl.deleteFramebuffer(this.fboA);
      gl.deleteFramebuffer(this.fboB);
      gl.deleteTexture(this.texA);
      gl.deleteTexture(this.texB);
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.stepProg);
      gl.deleteProgram(this.renderProg);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* ignore */
    }
  }
}
