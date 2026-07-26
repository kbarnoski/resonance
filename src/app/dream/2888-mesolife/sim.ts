// Active-nematic field simulation.
//
// The director θ(x,y) is stored as the doubled-angle vector u = (cos 2θ, sin 2θ)
// encoded into a texture's RG channels as u*0.5+0.5 (so the exact same decode
// works for RGBA16F and the RGBA8 fallback). Doubling the angle is what makes
// ±½ defects natural: θ and θ+π are identical, so a 2π loop of u is a ±½ loop
// of θ.
//
// Two engines share the same physics:
//   • GpuSim   — WebGL2 ping-pong field, rendered as crossed-polarizer
//                birefringence with an iridescent thin-film palette.
//   • CoarseField — a small CPU mirror that yields the cheap global scalars
//                (mean flow speed, turbulence, defect birth/death events) that
//                drive the audio, and doubles as the Canvas2D fallback pixels.
//
// Determinism: every random draw comes from mulberry32(0x2888). No Math.random,
// no Date.now, no new Date anywhere in this file.

import {
  createProgram,
  createTarget,
  makeFullscreenTriangle,
  uniformMap,
  type Target,
} from "./gl";

export const SEED = 0x2888;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimParams {
  activity: number; // self-stirring strength
  confine: number; // tangential edge alignment strength
  shearX: number;
  shearY: number;
}

// ── shader sources ──────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// One simulation step: elastic relaxation + active self-advection + shear +
// seeded noise nucleation + soft radial confinement.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uK;
uniform float uActivity;
uniform float uDt;
uniform float uNoise;
uniform float uConfine;
uniform vec2 uShear;
uniform float uFrame;
in vec2 vUv;
out vec4 frag;

vec2 dec(vec4 t){ return t.rg * 2.0 - 1.0; }
vec4 enc(vec2 u){ return vec4(u * 0.5 + 0.5, 0.0, 1.0); }

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = vUv;
  vec2 px = uTexel;
  vec2 uC = dec(texture(uField, uv));
  vec2 uL = dec(texture(uField, uv - vec2(px.x, 0.0)));
  vec2 uR = dec(texture(uField, uv + vec2(px.x, 0.0)));
  vec2 uD = dec(texture(uField, uv - vec2(0.0, px.y)));
  vec2 uU = dec(texture(uField, uv + vec2(0.0, px.y)));

  // Frank one-constant elasticity ≈ Laplacian of u (heals distortion).
  vec2 lap = uL + uR + uU + uD - 4.0 * uC;
  vec2 u = uC + uK * lap;

  // Active stress ∝ ∇·Q. With Q = (s/2)[[u.x,u.y],[u.y,-u.x]] this reduces to
  // f = (∂x u.x + ∂y u.y, ∂x u.y − ∂y u.x). The director stirs its own flow.
  vec2 dUx = (uR - uL) * 0.5;
  vec2 dUy = (uU - uD) * 0.5;
  vec2 vel = vec2(dUx.x + dUy.y, dUx.y - dUy.x) * uActivity;
  vel += uShear;

  // Semi-Lagrangian back-sample: advect the director by that flow.
  vec2 back = uv - vel * uDt;
  vec2 uadv = dec(texture(uField, back));
  u = mix(u, uadv, 0.82);

  // Seeded noise → perpetual defect nucleation (deterministic hash of cell+frame).
  float n = hash(uv * 512.0 + uFrame * 1.7) - 0.5;
  float ang = 0.5 * atan(u.y, u.x) + n * uNoise;
  u = vec2(cos(2.0 * ang), sin(2.0 * ang));

  // Confinement: bias toward tangential alignment near the dish edge.
  vec2 c = uv - 0.5;
  float r = length(c) * 2.0;
  float edge = smoothstep(0.72, 1.0, r);
  float tang = atan(c.y, c.x) + 1.5707963;
  vec2 uT = vec2(cos(2.0 * tang), sin(2.0 * tang));
  u = mix(u, uT, edge * uConfine);

  float l = length(u);
  u = l > 1e-4 ? u / l : vec2(1.0, 0.0);
  frag = enc(u);
}`;

// Render: crossed-polarizer birefringence with an iridescent thin-film palette.
// I = sin²(2(θ−α)) · sin²(Γ/2), Γ growing with local distortion energy |∇θ|².
const RENDER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uAlpha;
uniform float uGamma;
uniform float uGammaGain;
uniform float uFeedback;
in vec2 vUv;
out vec4 frag;

vec2 dec(vec4 t){ return t.rg * 2.0 - 1.0; }

// Cosine palette (Inigo Quilez) tuned violet→magenta→gold→cyan for oil-film look.
vec3 pal(float t){
  return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 1.0, 1.0) * t + vec3(0.62, 0.40, 0.18)));
}

void main(){
  vec2 px = uTexel;
  vec2 u = dec(texture(uField, vUv));
  vec2 uL = dec(texture(uField, vUv - vec2(px.x, 0.0)));
  vec2 uR = dec(texture(uField, vUv + vec2(px.x, 0.0)));
  vec2 uD = dec(texture(uField, vUv - vec2(0.0, px.y)));
  vec2 uU = dec(texture(uField, vUv + vec2(0.0, px.y)));

  float theta = 0.5 * atan(u.y, u.x);
  vec2 gx = (uR - uL) * 0.5;
  vec2 gy = (uU - uD) * 0.5;
  float dist = dot(gx, gx) + dot(gy, gy); // ∝ |∇θ|²

  float gamma = uGamma + uGammaGain * dist * 40.0;
  float pol = sin(2.0 * (theta - uAlpha));
  pol *= pol;
  float ret = sin(gamma * 0.5);
  ret *= ret;
  float I = pol * ret;

  vec3 col = pal(gamma * 0.14 + theta * 0.16) * I;

  // Defect cores (distortion spikes) blaze as bright jeweled points.
  float defect = smoothstep(0.02, 0.13, dist);
  col += pal(gamma * 0.14 + 0.5) * defect * 0.7;

  // Dish vignette.
  float r = length(vUv - 0.5) * 2.0;
  col *= smoothstep(1.02, 0.78, r);

  // Gentle feedback bloom for luminous churn.
  vec3 prev = texture(uPrev, vUv).rgb;
  col = max(col, prev * uFeedback);

  frag = vec4(col, 1.0);
}`;

const COPY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 frag;
void main(){ frag = vec4(texture(uTex, vUv).rgb, 1.0); }`;

// ── GPU simulation ──────────────────────────────────────────────────────────

const SIM_RES = 256;
const DISP_RES = 512;

export class GpuSim {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private simProg: WebGLProgram;
  private renderProg: WebGLProgram;
  private copyProg: WebGLProgram;
  private simU: Record<string, WebGLUniformLocation | null>;
  private renderU: Record<string, WebGLUniformLocation | null>;
  private copyU: Record<string, WebGLUniformLocation | null>;
  private fieldA: Target;
  private fieldB: Target;
  private dispA: Target;
  private dispB: Target;
  private frame = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Float render targets need this extension; otherwise fall back to RGBA8.
    const useFloat = gl.getExtension("EXT_color_buffer_float") !== null;

    this.vao = makeFullscreenTriangle(gl);
    this.simProg = createProgram(gl, VERT, SIM_FRAG);
    this.renderProg = createProgram(gl, VERT, RENDER_FRAG);
    this.copyProg = createProgram(gl, VERT, COPY_FRAG);
    this.simU = uniformMap(gl, this.simProg);
    this.renderU = uniformMap(gl, this.renderProg);
    this.copyU = uniformMap(gl, this.copyProg);

    const seed = makeSeedField(SIM_RES, useFloat);
    this.fieldA = createTarget(gl, SIM_RES, SIM_RES, useFloat, seed);
    this.fieldB = createTarget(gl, SIM_RES, SIM_RES, useFloat, null);
    this.dispA = createTarget(gl, DISP_RES, DISP_RES, useFloat, null);
    this.dispB = createTarget(gl, DISP_RES, DISP_RES, useFloat, null);
  }

  // Advance the field `substeps` times then render birefringence to `dispA`.
  step(substeps: number, dt: number, alpha: number, params: SimParams): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    gl.useProgram(this.simProg);
    gl.uniform2f(this.simU.uTexel, 1 / SIM_RES, 1 / SIM_RES);
    gl.uniform1f(this.simU.uK, 0.16);
    gl.uniform1f(this.simU.uActivity, params.activity);
    gl.uniform1f(this.simU.uDt, dt);
    gl.uniform1f(this.simU.uNoise, 0.06);
    gl.uniform1f(this.simU.uConfine, params.confine);
    gl.uniform2f(this.simU.uShear, params.shearX, params.shearY);

    gl.viewport(0, 0, SIM_RES, SIM_RES);
    for (let s = 0; s < substeps; s++) {
      this.frame++;
      gl.uniform1f(this.simU.uFrame, this.frame);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldB.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fieldA.tex);
      gl.uniform1i(this.simU.uField, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = this.fieldA;
      this.fieldA = this.fieldB;
      this.fieldB = t;
    }

    // Birefringence render → dispB (reads dispA for feedback bloom).
    gl.useProgram(this.renderProg);
    gl.viewport(0, 0, DISP_RES, DISP_RES);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispB.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldA.tex);
    gl.uniform1i(this.renderU.uField, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dispA.tex);
    gl.uniform1i(this.renderU.uPrev, 1);
    gl.uniform2f(this.renderU.uTexel, 1 / SIM_RES, 1 / SIM_RES);
    gl.uniform1f(this.renderU.uAlpha, alpha);
    gl.uniform1f(this.renderU.uGamma, 2.4);
    gl.uniform1f(this.renderU.uGammaGain, 6.0);
    gl.uniform1f(this.renderU.uFeedback, 0.90);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const d = this.dispA;
    this.dispA = this.dispB;
    this.dispB = d;
  }

  // Blit the current display texture to the default framebuffer (canvas).
  present(vpW: number, vpH: number): void {
    const gl = this.gl;
    gl.useProgram(this.copyProg);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, vpW, vpH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dispA.tex);
    gl.uniform1i(this.copyU.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of [this.fieldA, this.fieldB, this.dispA, this.dispB]) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    gl.deleteProgram(this.simProg);
    gl.deleteProgram(this.renderProg);
    gl.deleteProgram(this.copyProg);
    gl.deleteVertexArray(this.vao);
  }
}

// Seed the field with a smooth-ish random director plus a couple of planted
// defects, so the churn has structure to work on from frame 0.
function makeSeedField(
  res: number,
  useFloat: boolean,
): Float32Array | Uint8Array {
  const rng = mulberry32(SEED);
  // Low-frequency angle field via a few random Fourier-ish lumps.
  const lumps = 6;
  const cx: number[] = [];
  const cy: number[] = [];
  const cw: number[] = [];
  for (let i = 0; i < lumps; i++) {
    cx.push(rng());
    cy.push(rng());
    cw.push((rng() - 0.5) * 6.0);
  }
  // Two planted ±½ defects.
  const dfx = [0.36 + rng() * 0.1, 0.64 - rng() * 0.1];
  const dfy = [0.5, 0.5];
  const dfc = [0.5, -0.5];

  const float = new Float32Array(res * res * 4);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const u = x / res;
      const v = y / res;
      let ang = 0;
      for (let i = 0; i < lumps; i++) {
        const dx = u - cx[i];
        const dy = v - cy[i];
        ang += cw[i] * Math.exp(-(dx * dx + dy * dy) * 8.0);
      }
      for (let i = 0; i < 2; i++) {
        ang += dfc[i] * Math.atan2(v - dfy[i], u - dfx[i]);
      }
      const idx = (y * res + x) * 4;
      float[idx] = Math.cos(2 * ang) * 0.5 + 0.5;
      float[idx + 1] = Math.sin(2 * ang) * 0.5 + 0.5;
      float[idx + 2] = 0;
      float[idx + 3] = 1;
    }
  }
  if (useFloat) return float;
  const bytes = new Uint8Array(res * res * 4);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round(float[i] * 255)));
  }
  return bytes;
}

// ── coarse CPU mirror (audio driver + Canvas2D fallback) ─────────────────────

export interface DefectEvent {
  x: number; // 0..1
  y: number; // 0..1
  birth: boolean;
}

export interface FieldScalars {
  speed: number; // mean flow speed  → drive/brightness
  turbulence: number; // distortion energy → roughness
  defects: number; // current defect count
  events: DefectEvent[]; // births / annihilations this step
}

// A small independent nematic field running the same physics, used both to
// synthesize the audio scalars and (if WebGL2 is missing) to draw the picture.
export class CoarseField {
  readonly n: number;
  private ux: Float32Array;
  private uy: Float32Array;
  private tux: Float32Array;
  private tuy: Float32Array;
  private occ: Uint8Array; // per-cell defect occupancy (previous step)
  private rng: () => number;
  private frame = 0;

  constructor(n = 44) {
    this.n = n;
    this.ux = new Float32Array(n * n);
    this.uy = new Float32Array(n * n);
    this.tux = new Float32Array(n * n);
    this.tuy = new Float32Array(n * n);
    this.occ = new Uint8Array(n * n);
    this.rng = mulberry32(SEED ^ 0x51f); // distinct but deterministic stream
    const r2 = mulberry32(SEED);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const ang = (r2() - 0.5) * 6.2831853 + x * 0.2 + y * 0.13;
        const i = y * n + x;
        this.ux[i] = Math.cos(2 * ang);
        this.uy[i] = Math.sin(2 * ang);
      }
    }
  }

  step(dt: number, params: SimParams): FieldScalars {
    const n = this.n;
    const ux = this.ux;
    const uy = this.uy;
    const tux = this.tux;
    const tuy = this.tuy;
    this.frame++;
    let speedSum = 0;
    let turbSum = 0;

    const at = (arr: Float32Array, x: number, y: number) => {
      const xx = x < 0 ? 0 : x >= n ? n - 1 : x;
      const yy = y < 0 ? 0 : y >= n ? n - 1 : y;
      return arr[yy * n + xx];
    };

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const cX = ux[i];
        const cY = uy[i];
        const lX = at(ux, x - 1, y);
        const rX = at(ux, x + 1, y);
        const dX = at(ux, x, y - 1);
        const uX = at(ux, x, y + 1);
        const lY = at(uy, x - 1, y);
        const rY = at(uy, x + 1, y);
        const dY = at(uy, x, y - 1);
        const uY = at(uy, x, y + 1);

        // Elastic relaxation.
        let nx = cX + 0.16 * (lX + rX + dX + uX - 4 * cX);
        let ny = cY + 0.16 * (lY + rY + dY + uY - 4 * cY);

        // Active flow from ∇·Q.
        const duxdx = (rX - lX) * 0.5;
        const duydx = (rY - lY) * 0.5;
        const duxdy = (uX - dX) * 0.5;
        const duydy = (uY - dY) * 0.5;
        const vx = (duxdx + duydy) * params.activity + params.shearX;
        const vy = (duydx - duxdy) * params.activity + params.shearY;
        speedSum += Math.hypot(vx, vy);
        turbSum += duxdx * duxdx + duydx * duydx + duxdy * duxdy + duydy * duydy;

        // Semi-Lagrangian advection (nearest back-sample; coarse is fine here).
        const bx = Math.round(x - vx * dt * n);
        const by = Math.round(y - vy * dt * n);
        const ax = at(ux, bx, by);
        const ay = at(uy, bx, by);
        nx = nx * 0.18 + ax * 0.82;
        ny = ny * 0.18 + ay * 0.82;

        // Seeded noise nucleation.
        let ang = 0.5 * Math.atan2(ny, nx) + (this.rng() - 0.5) * 0.06;

        // Confinement toward tangential near edge.
        const cx2 = x / (n - 1) - 0.5;
        const cy2 = y / (n - 1) - 0.5;
        const r = Math.hypot(cx2, cy2) * 2;
        const edge = smoothstep(0.72, 1.0, r) * params.confine;
        if (edge > 0) {
          const tang = Math.atan2(cy2, cx2) + Math.PI / 2;
          ang = ang * (1 - edge) + tang * edge;
        }
        tux[i] = Math.cos(2 * ang);
        tuy[i] = Math.sin(2 * ang);
      }
    }
    this.ux = tux;
    this.uy = tuy;
    this.tux = ux;
    this.tuy = uy;

    // Detect ±½ defects via plaquette winding of the line field.
    const events: DefectEvent[] = [];
    let count = 0;
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const a0 = this.angle(x, y);
        const a1 = this.angle(x + 1, y);
        const a2 = this.angle(x + 1, y + 1);
        const a3 = this.angle(x, y + 1);
        let w = 0;
        w += wrapHalf(a1 - a0);
        w += wrapHalf(a2 - a1);
        w += wrapHalf(a3 - a2);
        w += wrapHalf(a0 - a3);
        const isDefect = Math.abs(w) > 1.2 ? 1 : 0; // ±π ≈ ±½ winding
        const ci = y * n + x;
        if (isDefect) count++;
        if (isDefect !== this.occ[ci]) {
          events.push({
            x: (x + 0.5) / n,
            y: (y + 0.5) / n,
            birth: isDefect === 1,
          });
        }
        this.occ[ci] = isDefect as number;
      }
    }

    const cells = n * n;
    return {
      speed: speedSum / cells,
      turbulence: turbSum / cells,
      defects: count,
      events,
    };
  }

  private angle(x: number, y: number): number {
    const i = y * this.n + x;
    return 0.5 * Math.atan2(this.uy[i], this.ux[i]);
  }

  // Paint crossed-polarizer birefringence into an ImageData (Canvas2D fallback).
  paint(img: ImageData, alpha: number): void {
    const n = this.n;
    const w = img.width;
    const h = img.height;
    const data = img.data;
    for (let py = 0; py < h; py++) {
      const fy = (py / h) * (n - 1);
      const y0 = Math.floor(fy);
      for (let px = 0; px < w; px++) {
        const fx = (px / w) * (n - 1);
        const x0 = Math.floor(fx);
        const i = y0 * n + x0;
        const theta = 0.5 * Math.atan2(this.uy[i], this.ux[i]);
        const rgt =
          (this.ux[Math.min(i + 1, n * n - 1)] - this.ux[Math.max(i - 1, 0)]) *
          0.5;
        const dist = Math.abs(rgt) + 0.05;
        const gamma = 2.4 + dist * 30;
        const pol = Math.sin(2 * (theta - alpha)) ** 2;
        const ret = Math.sin(gamma * 0.5) ** 2;
        const I = pol * ret;
        const rr = Math.hypot(px / w - 0.5, py / h - 0.5) * 2;
        const vig = smoothstep(1.02, 0.78, rr);
        const [cr, cg, cb] = palette(gamma * 0.14 + theta * 0.16);
        const o = (py * w + px) * 4;
        data[o] = Math.min(255, cr * I * 255 * vig);
        data[o + 1] = Math.min(255, cg * I * 255 * vig);
        data[o + 2] = Math.min(255, cb * I * 255 * vig);
        data[o + 3] = 255;
      }
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Wrap a director angle difference into (−π/2, π/2] (line field, period π).
function wrapHalf(d: number): number {
  let x = d;
  while (x > Math.PI / 2) x -= Math.PI;
  while (x <= -Math.PI / 2) x += Math.PI;
  return x;
}

function palette(t: number): [number, number, number] {
  const tp = 6.28318 * t;
  return [
    0.5 + 0.5 * Math.cos(tp + 6.28318 * 0.62),
    0.5 + 0.5 * Math.cos(tp + 6.28318 * 0.4),
    0.5 + 0.5 * Math.cos(tp + 6.28318 * 0.18),
  ];
}
