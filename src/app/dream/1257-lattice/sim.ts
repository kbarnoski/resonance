// ─────────────────────────────────────────────────────────────────────────────
// 1257-lattice/sim.ts — the WebGL2 GPGPU reaction-diffusion field + phase arc.
//
//   A Gray-Scott simulation runs on the GPU via ping-pong framebuffers. Two
//   float textures (RGBA16F when EXT_color_buffer_float is present, otherwise
//   an RGBA8 degrade) hold U/V; the sim shader advances the reaction several
//   sub-steps per frame; the display shader warps the V field into a kaleido-
//   scopic honeycomb realm.  No GL objects are created at module scope — the
//   whole thing lives inside the ReactionField instance, built on a gesture-safe
//   effect in page.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";
import { VERT_SRC, SIM_FRAG_SRC, makeDisplayFrag } from "./shaders";

// ── deterministic RNG (no Math.random at module scope) ───────────────────────
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

// ── phase arc (Pearson feed/kill regimes) ────────────────────────────────────
export interface ArcState {
  F: number;
  K: number;
  symmetry: number;
  saturation: number;
  brightness: number;
  scale: number;
  flow: number;
  irid: number;
  drive: number; // 0..1 audio/energy intensity
  label: string;
  progress: number; // 0..1 through the full loop
  cycle: number;
}

interface Keyframe {
  t: number;
  label: string;
  F: number;
  K: number;
  symmetry: number;
  saturation: number;
  brightness: number;
  scale: number;
  flow: number;
  irid: number;
  drive: number;
}

// Feed/kill values walk Pearson's map: sparse spots -> mitosis (self-
// replication) -> maze/labyrinth -> a dense coherent realm that holds.
const KEYS: Keyframe[] = [
  { t: 0,   label: "Bloom",        F: 0.030,  K: 0.062,  symmetry: 3,  saturation: 0.55, brightness: 0.18, scale: 0.85, flow: 0.020, irid: 0.55, drive: 0.10 },
  { t: 42,  label: "Growth",       F: 0.0367, K: 0.0649, symmetry: 6,  saturation: 0.85, brightness: 0.45, scale: 0.70, flow: 0.038, irid: 0.78, drive: 0.42 },
  { t: 108, label: "Saturation",   F: 0.029,  K: 0.0565, symmetry: 9,  saturation: 1.18, brightness: 0.72, scale: 0.56, flow: 0.058, irid: 0.98, drive: 0.74 },
  { t: 162, label: "Breakthrough", F: 0.030,  K: 0.0545, symmetry: 12, saturation: 1.38, brightness: 0.96, scale: 0.50, flow: 0.050, irid: 1.12, drive: 1.00 },
];
const LOOP_LEN = 208; // seconds (~3.5 min), then re-seed and rise again.

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function computeArc(elapsedSec: number): ArcState {
  const cycle = Math.floor(elapsedSec / LOOP_LEN);
  const local = elapsedSec - cycle * LOOP_LEN;

  // Find the surrounding keyframes.
  let i = 0;
  while (i < KEYS.length - 1 && local >= KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const span = Math.max(1e-3, b.t - a.t);
  const t = a === b ? 1 : smoothstep(a.t, a.t + span, local);

  return {
    F: mix(a.F, b.F, t),
    K: mix(a.K, b.K, t),
    symmetry: mix(a.symmetry, b.symmetry, t),
    saturation: mix(a.saturation, b.saturation, t),
    brightness: mix(a.brightness, b.brightness, t),
    scale: mix(a.scale, b.scale, t),
    flow: mix(a.flow, b.flow, t),
    irid: mix(a.irid, b.irid, t),
    drive: mix(a.drive, b.drive, t),
    label: t < 0.5 ? a.label : b.label,
    progress: local / LOOP_LEN,
    cycle,
  };
}

export const ARC_LOOP_LEN = LOOP_LEN;

// ── display uniforms passed each frame ───────────────────────────────────────
export interface DisplayParams {
  time: number;
  symmetry: number;
  saturation: number;
  brightness: number;
  scale: number;
  flow: number;
  irid: number;
  flicker: number;
}

export interface SimParams {
  F: number;
  K: number;
  dt: number;
  seed: [number, number, number, number] | null; // x,y,radius,amount
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

const DU = 0.20;
const DV = 0.10;

export class ReactionField {
  readonly gl: WebGL2RenderingContext;
  readonly usesFloat: boolean;
  readonly simSize: number;

  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private simProg: WebGLProgram;
  private dispProg: WebGLProgram;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private fboA: WebGLFramebuffer;
  private fboB: WebGLFramebuffer;
  private readIsA = true;
  private simU: Record<string, WebGLUniformLocation | null> = {};
  private dispU: Record<string, WebGLUniformLocation | null> = {};
  private disposed = false;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    // Float-render capability. Fall back to RGBA8 (lossy but functional).
    const floatExt = gl.getExtension("EXT_color_buffer_float");
    this.usesFloat = !!floatExt;
    this.simSize = this.usesFloat ? 512 : 384;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const simFs = compile(gl, gl.FRAGMENT_SHADER, SIM_FRAG_SRC);
    const dispFs = compile(gl, gl.FRAGMENT_SHADER, makeDisplayFrag(LOGPOLAR_GLSL));
    if (!vs || !simFs || !dispFs) throw new Error("shader compile failed");
    const simProg = link(gl, vs, simFs);
    const dispProg = link(gl, vs, dispFs);
    if (!simProg || !dispProg) throw new Error("program link failed");
    gl.deleteShader(vs);
    gl.deleteShader(simFs);
    gl.deleteShader(dispFs);
    this.simProg = simProg;
    this.dispProg = dispProg;

    // Full-screen triangle.
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    if (!vao || !buf) throw new Error("buffer alloc failed");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;
    this.buf = buf;

    // State textures + FBOs.
    const internal = this.usesFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.usesFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const mk = (): { tex: WebGLTexture; fbo: WebGLFramebuffer } => {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) throw new Error("fbo alloc failed");
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, this.simSize, this.simSize, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (!ok) throw new Error("framebuffer incomplete");
      return { tex, fbo };
    };
    const A = mk();
    const B = mk();
    this.texA = A.tex;
    this.fboA = A.fbo;
    this.texB = B.tex;
    this.fboB = B.fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Cache uniform locations.
    for (const n of ["uState", "uF", "uK", "uDu", "uDv", "uDt", "uReset", "uSeed"]) {
      this.simU[n] = gl.getUniformLocation(simProg, n);
    }
    for (const n of ["uState", "uRes", "uTime", "uSymmetry", "uSaturation", "uBrightness", "uScale", "uFlow", "uIrid", "uFlicker"]) {
      this.dispU[n] = gl.getUniformLocation(dispProg, n);
    }

    this.reset();
  }

  private get readTex(): WebGLTexture {
    return this.readIsA ? this.texA : this.texB;
  }
  private get writeFbo(): WebGLFramebuffer {
    return this.readIsA ? this.fboB : this.fboA;
  }

  /** Re-seed the whole field (BLOOM). */
  reset(): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.useProgram(this.simProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.simSize, this.simSize);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.readTex);
    gl.uniform1i(this.simU.uState, 0);
    gl.uniform1i(this.simU.uReset, 1);
    gl.uniform4f(this.simU.uSeed, 0, 0, 0, 0);
    gl.uniform1f(this.simU.uF, 0.03);
    gl.uniform1f(this.simU.uK, 0.062);
    gl.uniform1f(this.simU.uDu, DU);
    gl.uniform1f(this.simU.uDv, DV);
    gl.uniform1f(this.simU.uDt, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.readIsA = !this.readIsA;
    gl.uniform1i(this.simU.uReset, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Advance the reaction `subSteps` times. */
  step(subSteps: number, p: SimParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.useProgram(this.simProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.simSize, this.simSize);
    gl.uniform1i(this.simU.uReset, 0);
    gl.uniform1f(this.simU.uF, p.F);
    gl.uniform1f(this.simU.uK, p.K);
    gl.uniform1f(this.simU.uDu, DU);
    gl.uniform1f(this.simU.uDv, DV);
    gl.uniform1f(this.simU.uDt, p.dt);

    for (let i = 0; i < subSteps; i++) {
      // Inject the onset seed only on the first sub-step of the frame.
      if (i === 0 && p.seed) {
        gl.uniform4f(this.simU.uSeed, p.seed[0], p.seed[1], p.seed[2], p.seed[3]);
      } else {
        gl.uniform4f(this.simU.uSeed, 0, 0, 0, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.readTex);
      gl.uniform1i(this.simU.uState, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.readIsA = !this.readIsA;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Render the warped, iridescent membrane to the default framebuffer. */
  draw(w: number, h: number, d: DisplayParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.useProgram(this.dispProg);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.readTex);
    gl.uniform1i(this.dispU.uState, 0);
    gl.uniform2f(this.dispU.uRes, w, h);
    gl.uniform1f(this.dispU.uTime, d.time);
    gl.uniform1f(this.dispU.uSymmetry, d.symmetry);
    gl.uniform1f(this.dispU.uSaturation, d.saturation);
    gl.uniform1f(this.dispU.uBrightness, d.brightness);
    gl.uniform1f(this.dispU.uScale, d.scale);
    gl.uniform1f(this.dispU.uFlow, d.flow);
    gl.uniform1f(this.dispU.uIrid, d.irid);
    gl.uniform1f(this.dispU.uFlicker, d.flicker);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Resize the display backing store (sim resolution is fixed/capped). */
  resize(cssW: number, cssH: number, dpr: number): { w: number; h: number } {
    this.dpr = Math.min(dpr, 1.6);
    const w = Math.max(1, Math.floor(cssW * this.dpr));
    const h = Math.max(1, Math.floor(cssH * this.dpr));
    const canvas = this.gl.canvas as HTMLCanvasElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.texA);
    gl.deleteTexture(this.texB);
    gl.deleteFramebuffer(this.fboA);
    gl.deleteFramebuffer(this.fboB);
    gl.deleteBuffer(this.buf);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.simProg);
    gl.deleteProgram(this.dispProg);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }
}
