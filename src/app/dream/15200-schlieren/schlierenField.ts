// ─────────────────────────────────────────────────────────────────────────────
// schlierenField.ts — a self-contained WebGL2 fragment-shader field simulation
// plus a knife-edge schlieren render pass.
//
// Two half-float textures are ping-ponged as a damped 2D wave field (the "air").
// Each frame we inject pressure at a handful of fixed emitter points, forced by
// the live band energies of Karel's recording. A second pass reads the field,
// takes its spatial gradient (central differences), projects that onto a
// knife-edge direction, and maps the signed scalar to a luminous grayscale —
// the classic synthetic knife-edge schlieren look: near-black at rest, bright
// where ∇ρ points into the knife, dark where it points away, plumes glowing.
//
// Everything here is achromatic on purpose (schlieren imaging is monochrome).
// No color hues. No external assets. Full teardown via dispose().
// ─────────────────────────────────────────────────────────────────────────────

/** Live drive values, all roughly 0..1, read from the audio each frame. */
export interface FieldDrive {
  low: number;
  mid: number;
  high: number;
  rms: number;
  /** Transient onset amount 0..1 — spikes on loud attacks for shockwave ripples. */
  onset: number;
}

export interface RenderParams {
  /** Knife-edge angle in radians. Gradients along this axis are revealed. */
  knifeAngle: number;
  /** Contrast of the signed gradient around the resting shade. */
  sensitivity: number;
  /** Luminous plume glow from gradient magnitude. */
  glow: number;
  /** Overall exposure / contrast. */
  exposure: number;
  /** Motion scale 0..1 — reduced-motion calms the field. */
  motion: number;
  /** Extra pointer-driven emitter, in field UV [0..1]; null = none. */
  pointer: { x: number; y: number; amp: number } | null;
  /** Seconds since last frame (clamped), for framerate-independent motion. */
  dt: number;
  /** Elapsed seconds (for gentle idle breathing). */
  time: number;
}

const SIM_RES = 256;

// Fullscreen triangle — position derived from gl_VertexID, no attributes.
const VERT = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Damped wave step with audio-forced emitters + soft absorbing border.
const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uField;
uniform vec2 uTexel;
uniform vec4 uEmX;      // up to 4 emitter x positions (UV)
uniform vec4 uEmY;      // emitter y
uniform vec4 uEmAmp;    // emitter amplitude (signed)
uniform vec4 uEmRad;    // emitter gaussian radius
uniform float uC2;      // wave speed^2 * dt^2 (CFL-safe)
uniform float uDamp;    // velocity damping (<1)
uniform float uInject;  // injection scale
uniform float uPtrX;    // pointer emitter (UV); amp 0 = inactive
uniform float uPtrY;
uniform float uPtrAmp;

float bump(vec2 uv, vec2 e, float rad){
  vec2 d = uv - e;
  return exp(-dot(d, d) / (rad * rad));
}

void main(){
  vec4 c = texture(uField, vUv);
  float u = c.r;      // current
  float uprev = c.g;  // previous
  float l = texture(uField, vUv + vec2(-uTexel.x, 0.0)).r;
  float r = texture(uField, vUv + vec2( uTexel.x, 0.0)).r;
  float d = texture(uField, vUv + vec2(0.0, -uTexel.y)).r;
  float t = texture(uField, vUv + vec2(0.0,  uTexel.y)).r;
  float lap = (l + r + d + t - 4.0 * u);

  // damped wave equation, leapfrog form
  float vel = (u - uprev) * uDamp;
  float un = u + vel + uC2 * lap;

  // audio-forced injection at the fixed emitters
  float inj = 0.0;
  inj += uEmAmp.x * bump(vUv, vec2(uEmX.x, uEmY.x), uEmRad.x);
  inj += uEmAmp.y * bump(vUv, vec2(uEmX.y, uEmY.y), uEmRad.y);
  inj += uEmAmp.z * bump(vUv, vec2(uEmX.z, uEmY.z), uEmRad.z);
  inj += uEmAmp.w * bump(vUv, vec2(uEmX.w, uEmY.w), uEmRad.w);
  if (uPtrAmp > 0.0001) inj += uPtrAmp * bump(vUv, vec2(uPtrX, uPtrY), 0.06);
  un += inj * uInject;

  // soft absorbing border so ripples fade at the walls instead of ringing
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, 0.06, min(e.x, e.y));
  un *= mix(0.9, 1.0, edge);

  un = clamp(un, -6.0, 6.0);
  frag = vec4(un, u, 0.0, 1.0);
}`;

// Knife-edge schlieren render — signed gradient projected on the knife axis.
const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uField;
uniform vec2 uTexel;
uniform vec2 uKnife;   // unit knife-edge direction
uniform float uSens;
uniform float uGlow;
uniform float uExposure;
uniform float uBase;   // resting shade (near-black)

float fieldAt(vec2 uv){ return texture(uField, uv).r; }

void main(){
  // central-difference spatial gradient of the density field
  float gx = (fieldAt(vUv + vec2(uTexel.x, 0.0)) - fieldAt(vUv - vec2(uTexel.x, 0.0))) * 0.5;
  float gy = (fieldAt(vUv + vec2(0.0, uTexel.y)) - fieldAt(vUv - vec2(0.0, uTexel.y))) * 0.5;
  vec2 g = vec2(gx, gy);

  float knife = dot(g, uKnife);   // signed: bright one side, dark the other
  float mag = length(g);

  // tone curve: resting near-black, gradient pushes toward white / black
  float shade = uBase + knife * uSens;
  float glow = mag * uGlow;       // luminous plume structure
  float v = shade + glow;

  // exposure / contrast around the resting shade
  v = (v - uBase) * uExposure + uBase;

  // faint film grain + vignette for the photographic schlieren feel
  vec2 dv = vUv - 0.5;
  float vig = 1.0 - dot(dv, dv) * 0.7;
  v *= vig;

  v = clamp(v, 0.0, 1.0);
  frag = vec4(vec3(v), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

/** Reason a field could not be created — surfaced for an on-brand notice. */
export type FieldFailure = "no-webgl2" | "no-float-render" | "gl-error";

export class SchlierenField {
  private gl: WebGL2RenderingContext;
  private simProg: WebGLProgram;
  private renderProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private a: Target;
  private b: Target;
  private readFrom: Target;
  private texel: [number, number];

  // fixed emitter home positions in field UV — a loose scatter across the frame
  private emX = new Float32Array([0.3, 0.72, 0.5, 0.22]);
  private emY = new Float32Array([0.35, 0.32, 0.7, 0.7]);
  private emRad = new Float32Array([0.09, 0.08, 0.1, 0.07]);
  private emAmp = new Float32Array(4);
  private disposed = false;

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.simProg = link(gl, SIM_FRAG);
    this.renderProg = link(gl, RENDER_FRAG);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;
    this.a = this.makeTarget();
    this.b = this.makeTarget();
    this.readFrom = this.a;
    this.texel = [1 / SIM_RES, 1 / SIM_RES];
  }

  /** Try to create a field on `canvas`. Returns the field, or a failure reason. */
  static create(canvas: HTMLCanvasElement): SchlierenField | FieldFailure {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) as WebGL2RenderingContext | null;
    if (!gl) return "no-webgl2";
    // rendering into a half-float texture requires this extension
    if (!gl.getExtension("EXT_color_buffer_float")) {
      return "no-float-render";
    }
    try {
      return new SchlierenField(gl);
    } catch {
      return "gl-error";
    }
  }

  private makeTarget(): Target {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error("target alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      SIM_RES,
      SIM_RES,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  /** Reset the field to rest (used when swapping tracks). */
  reset(): void {
    if (this.disposed) return;
    const gl = this.gl;
    for (const tgt of [this.a, this.b]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.readFrom = this.a;
  }

  /** Advance the field one simulation step, forced by the audio drive. */
  private simStep(drive: FieldDrive, params: RenderParams): void {
    const gl = this.gl;
    const motion = params.motion;

    // map bands to the fixed emitters; onset spikes them into shockwave pulses
    const onsetKick = drive.onset * 2.4;
    this.emAmp[0] = (drive.low * 0.9 + onsetKick * 0.5) * motion;
    this.emAmp[1] = (drive.mid * 0.8 + onsetKick * 0.4) * motion;
    this.emAmp[2] = (drive.high * 0.7 + onsetKick * 0.35) * motion;
    this.emAmp[3] = (drive.rms * 1.0 + onsetKick * 0.6) * motion;

    // idle breathing so the field never sits perfectly dead
    const breath = 0.02 * motion * (0.5 + 0.5 * Math.sin(params.time * 0.6));
    for (let i = 0; i < 4; i++) this.emAmp[i] += breath;

    const writeTo = this.readFrom === this.a ? this.b : this.a;

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTo.fbo);
    gl.viewport(0, 0, SIM_RES, SIM_RES);
    gl.useProgram(this.simProg);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.readFrom.tex);
    this.u1i("uField", 0, this.simProg);
    this.u2f("uTexel", this.texel[0], this.texel[1], this.simProg);
    this.u4f("uEmX", this.emX, this.simProg);
    this.u4f("uEmY", this.emY, this.simProg);
    this.u4f("uEmAmp", this.emAmp, this.simProg);
    this.u4f("uEmRad", this.emRad, this.simProg);
    // CFL-safe wave speed; a touch slower under reduced motion
    this.u1f("uC2", 0.22 * (0.6 + 0.4 * motion), this.simProg);
    this.u1f("uDamp", 0.9955, this.simProg);
    this.u1f("uInject", 0.6, this.simProg);
    const ptr = params.pointer;
    this.u1f("uPtrX", ptr ? ptr.x : 0, this.simProg);
    this.u1f("uPtrY", ptr ? ptr.y : 0, this.simProg);
    this.u1f("uPtrAmp", ptr ? ptr.amp * motion : 0, this.simProg);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.readFrom = writeTo;
  }

  /** Step the sim `substeps` times, then paint the schlieren image to screen. */
  render(
    drive: FieldDrive,
    params: RenderParams,
    viewW: number,
    viewH: number,
    substeps: number,
  ): void {
    if (this.disposed) return;
    const gl = this.gl;

    for (let s = 0; s < substeps; s++) this.simStep(drive, params);

    // schlieren pass → default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewW, viewH);
    gl.useProgram(this.renderProg);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.readFrom.tex);
    this.u1i("uField", 0, this.renderProg);
    this.u2f("uTexel", this.texel[0], this.texel[1], this.renderProg);
    this.u2f(
      "uKnife",
      Math.cos(params.knifeAngle),
      Math.sin(params.knifeAngle),
      this.renderProg,
    );
    this.u1f("uSens", params.sensitivity, this.renderProg);
    this.u1f("uGlow", params.glow, this.renderProg);
    this.u1f("uExposure", params.exposure, this.renderProg);
    this.u1f("uBase", 0.16, this.renderProg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    try {
      gl.deleteProgram(this.simProg);
      gl.deleteProgram(this.renderProg);
      gl.deleteVertexArray(this.vao);
      for (const tgt of [this.a, this.b]) {
        gl.deleteTexture(tgt.tex);
        gl.deleteFramebuffer(tgt.fbo);
      }
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      /* context already gone */
    }
  }

  // ── tiny uniform helpers (locations cached per program) ────────────────────
  private locCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private loc(name: string, prog: WebGLProgram): WebGLUniformLocation | null {
    let m = this.locCache.get(prog);
    if (!m) {
      m = new Map();
      this.locCache.set(prog, m);
    }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name));
    return m.get(name) ?? null;
  }
  private u1i(n: string, v: number, p: WebGLProgram) {
    this.gl.uniform1i(this.loc(n, p), v);
  }
  private u1f(n: string, v: number, p: WebGLProgram) {
    this.gl.uniform1f(this.loc(n, p), v);
  }
  private u2f(n: string, a: number, b: number, p: WebGLProgram) {
    this.gl.uniform2f(this.loc(n, p), a, b);
  }
  private u4f(n: string, v: Float32Array, p: WebGLProgram) {
    this.gl.uniform4f(this.loc(n, p), v[0], v[1], v[2], v[3]);
  }
}
