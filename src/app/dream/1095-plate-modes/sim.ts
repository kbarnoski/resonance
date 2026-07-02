// ─────────────────────────────────────────────────────────────────────────────
// sim.ts — hand-written WebGL2 FDTD of the 2D wave equation on a square plate.
//
//   The plate lives in a ping-pong pair of float textures. Each texel packs
//   three time-coupled quantities:
//       .r = u_curr   (displacement now)
//       .g = u_prev   (displacement one step ago)
//       .b = env      (a slowly-decaying envelope of |u| — the STANDING-WAVE
//                      amplitude, i.e. the very thing sand measures on a real
//                      Chladni plate: it piles up where the amplitude is ~0.)
//
//   The step shader integrates the discrete wave equation
//       u_next = 2*u_curr - u_prev + c^2 * laplacian(u_curr)
//   with a fixed (reflective, Dirichlet u=0) boundary so genuine square-plate
//   standing modes sin(mπx)sin(nπy) form. A continuous gaussian sinusoidal
//   driver at the centre (frequency slowly swept) rings up successive modes;
//   taps add gaussian impulses.
//
//   A reduction pass downsamples the whole state into a tiny READ×READ texture
//   which the CPU reads back once per frame. From that same field the audio
//   layer decomposes the plate into its spatial eigenmodes — so what you HEAR
//   is literally the modal content of what you SEE.
//
//   CFL: in 2D the scheme is stable for c^2 <= 0.5 (c = dt/dx <= 1/√2). We run
//   well under that (see C2 in page.tsx) and damp every step, so the field can
//   not blow up to NaN.
// ─────────────────────────────────────────────────────────────────────────────

export interface Impulse {
  /** normalized plate coord 0..1 */
  x: number;
  y: number;
  /** gaussian radius, normalized */
  r: number;
  /** signed amplitude */
  amp: number;
}

export interface StepParams {
  c2: number;
  damp: number;
  /** driver scalar this substep (sin(phase) * amplitude) */
  drive: number;
  driverX: number;
  driverY: number;
  driverR: number;
  envDecay: number;
  /** impulses to inject THIS substep (usually only the first substep of a frame) */
  impulses: Impulse[];
}

export interface RenderParams {
  /** 1 / (mean envelope) — normalizes node/antinode contrast */
  envScale: number;
  /** overall plate vibration level 0..1 (gates node glow so a dead plate is dark) */
  activity: number;
  /** global brightness multiplier (slowly varying, never strobes) */
  brightness: number;
  time: number;
}

/** A downsampled snapshot of the plate for the audio layer + visual normalization. */
export interface FieldSnapshot {
  /** READ*READ signed displacement (row-major), downsampled */
  u: Float32Array;
  /** READ*READ envelope */
  env: Float32Array;
  side: number;
  meanEnv: number;
}

const MAX_IMP = 8;

const QUAD_VS = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const STEP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_state;   // .r curr .g prev .b env
uniform vec2 u_texel;        // 1/grid
uniform float u_c2;
uniform float u_damp;
uniform float u_envDecay;
uniform float u_drive;       // sin(phase)*amp for this substep
uniform vec2 u_driverPos;
uniform float u_driverR;
uniform int u_impCount;
uniform vec4 u_imp[${MAX_IMP}]; // xy pos, z radius, w amp
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 s = texture(u_state, v_uv);
  float curr = s.r;
  float prev = s.g;
  float env  = s.b;

  float l = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r;
  float r = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r;
  float d = texture(u_state, v_uv - vec2(0.0, u_texel.y)).r;
  float t = texture(u_state, v_uv + vec2(0.0, u_texel.y)).r;
  float lap = l + r + d + t - 4.0 * curr;

  float nxt = (2.0 * curr - prev + u_c2 * lap) * u_damp;

  // continuous centre driver (gaussian footprint)
  vec2 dp = v_uv - u_driverPos;
  nxt += u_drive * exp(-dot(dp, dp) / (u_driverR * u_driverR));

  // transient tap impulses
  for (int i = 0; i < ${MAX_IMP}; i++) {
    if (i >= u_impCount) break;
    vec2 ip = v_uv - u_imp[i].xy;
    nxt += u_imp[i].w * exp(-dot(ip, ip) / (u_imp[i].z * u_imp[i].z));
  }

  // reflective fixed boundary: clamp outer ring to zero
  if (v_uv.x < u_texel.x || v_uv.x > 1.0 - u_texel.x ||
      v_uv.y < u_texel.y || v_uv.y > 1.0 - u_texel.y) {
    nxt = 0.0;
    curr = 0.0;
  }

  // guard against any stray non-finite value (keeps the sim NaN-free forever)
  if (!(nxt < 1.0e12 && nxt > -1.0e12)) nxt = 0.0;

  float a = abs(nxt);
  float newEnv = max(env * u_envDecay, a);

  o = vec4(nxt, curr, newEnv, 1.0);
}`;

// Downsample the state to READ×READ (linear filtered box). We read this back.
const REDUCE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_state;
in vec2 v_uv;
out vec4 o;
void main() {
  o = texture(u_state, v_uv);
}`;

// Present pass: luminous Chladni figures. Sand (nodes) glow cyan/white where the
// standing-wave envelope is low; antinodes read faint amber.
const PRESENT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float u_envScale;
uniform float u_activity;
uniform float u_brightness;
uniform float u_time;
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 s = texture(u_state, v_uv);
  float u = s.r;
  float env = s.b;
  float e = env * u_envScale;              // ~1 near a typical antinode

  // node proximity: bright where the standing amplitude is small
  float node = 1.0 - smoothstep(0.0, 0.30, e);
  node = pow(node, 1.6);
  node *= u_activity;                       // dark unless the plate is alive

  // antinode wash (faint amber, sign-tinted so the plate looks 3D-ish)
  float anti = smoothstep(0.45, 1.5, e);

  vec3 nodeCol = vec3(0.55, 0.95, 1.0);     // incandescent cyan-white
  vec3 hotCol  = vec3(1.0, 1.0, 1.0);
  vec3 amber   = vec3(1.0, 0.62, 0.20);

  // brightest sand lines tip toward white
  vec3 sand = mix(nodeCol, hotCol, smoothstep(0.55, 1.0, node));

  float shimmer = 0.9 + 0.1 * sin(u * 40.0 + u_time * 2.0);

  vec3 col = sand * node * 1.15 * shimmer;
  col += amber * anti * (0.10 + 0.06 * clamp(u * 6.0 + 0.5, 0.0, 1.0));

  // deep-black plate floor + faint vignette
  vec2 c = v_uv - 0.5;
  float vig = 1.0 - dot(c, c) * 0.5;
  col *= vig;

  col *= u_brightness;
  col = col / (1.0 + col);                  // soft tone-map, no clipping
  o = vec4(col, 1.0);
}`;

interface Program {
  prog: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  fs: string,
  attribs: string[],
  uniforms: string[],
): Program {
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, QUAD_VS);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link failed: " + log);
  }
  const a: Record<string, number> = {};
  for (const n of attribs) a[n] = gl.getAttribLocation(prog, n);
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
  return { prog, attribs: a, uniforms: u };
}

export class PlateSim {
  readonly gl: WebGL2RenderingContext;
  readonly grid: number;
  readonly read: number;

  private stepProg: Program;
  private reduceProg: Program;
  private presentProg: Program;
  private quad: WebGLBuffer;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private fboA: WebGLFramebuffer;
  private fboB: WebGLFramebuffer;
  private readTex: WebGLTexture;
  private readFbo: WebGLFramebuffer;
  private internalFmt: number;
  private texType: number;
  private linearOk = false;
  private readBuf: Float32Array;
  private snapU: Float32Array;
  private snapEnv: Float32Array;
  private readable = true;
  private disposed = false;

  constructor(gl: WebGL2RenderingContext, grid: number, read: number) {
    this.gl = gl;
    this.grid = grid;
    this.read = read;

    // Prefer full float; fall back to half float; the caller has already
    // verified one of the extensions is present.
    const has32 = !!gl.getExtension("EXT_color_buffer_float");
    const has16 = !!gl.getExtension("EXT_color_buffer_half_float");
    const floatLinear = !!gl.getExtension("OES_texture_float_linear");
    if (has32) {
      this.internalFmt = gl.RGBA32F;
      this.texType = gl.FLOAT;
      // RGBA32F is only LINEAR-filterable with OES_texture_float_linear
      this.linearOk = floatLinear;
    } else if (has16) {
      this.internalFmt = gl.RGBA16F;
      this.texType = gl.HALF_FLOAT;
      this.linearOk = true; // RGBA16F is filterable in core WebGL2
    } else {
      throw new Error("no float color buffer support");
    }

    this.stepProg = link(
      gl,
      STEP_FS,
      ["a_pos"],
      [
        "u_state", "u_texel", "u_c2", "u_damp", "u_envDecay",
        "u_drive", "u_driverPos", "u_driverR", "u_impCount", "u_imp",
      ],
    );
    this.reduceProg = link(gl, REDUCE_FS, ["a_pos"], ["u_state"]);
    this.presentProg = link(
      gl,
      PRESENT_FS,
      ["a_pos"],
      ["u_state", "u_envScale", "u_activity", "u_brightness", "u_time"],
    );

    const quad = gl.createBuffer();
    if (!quad) throw new Error("buffer alloc failed");
    this.quad = quad;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );

    const mk = (size: number, linear: boolean): [WebGLTexture, WebGLFramebuffer] => {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) throw new Error("fbo alloc failed");
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, this.internalFmt, size, size, 0,
        gl.RGBA, this.texType, null,
      );
      const filt = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0,
      );
      return [tex, fbo];
    };

    // linear filtering (when supported) so the reduction downsample averages
    [this.texA, this.fboA] = mk(grid, this.linearOk);
    [this.texB, this.fboB] = mk(grid, this.linearOk);
    [this.readTex, this.readFbo] = mk(read, false);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.readBuf = new Float32Array(read * read * 4);
    this.snapU = new Float32Array(read * read);
    this.snapEnv = new Float32Array(read * read);

    this.clear();
  }

  private drawQuad(p: Program): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(p.attribs.a_pos);
    gl.vertexAttribPointer(p.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  clear(): void {
    const gl = this.gl;
    for (const fbo of [this.fboA, this.fboB]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, this.grid, this.grid);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Advance one FDTD substep. Reads texA, writes texB, then swaps. */
  step(p: StepParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.useProgram(this.stepProg.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.viewport(0, 0, this.grid, this.grid);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    const u = this.stepProg.uniforms;
    gl.uniform1i(u.u_state, 0);
    gl.uniform2f(u.u_texel, 1 / this.grid, 1 / this.grid);
    gl.uniform1f(u.u_c2, p.c2);
    gl.uniform1f(u.u_damp, p.damp);
    gl.uniform1f(u.u_envDecay, p.envDecay);
    gl.uniform1f(u.u_drive, p.drive);
    gl.uniform2f(u.u_driverPos, p.driverX, p.driverY);
    gl.uniform1f(u.u_driverR, p.driverR);

    const n = Math.min(p.impulses.length, MAX_IMP);
    gl.uniform1i(u.u_impCount, n);
    if (n > 0) {
      const arr = new Float32Array(MAX_IMP * 4);
      for (let i = 0; i < n; i++) {
        const im = p.impulses[i];
        arr[i * 4] = im.x;
        arr[i * 4 + 1] = im.y;
        arr[i * 4 + 2] = Math.max(im.r, 1e-3);
        arr[i * 4 + 3] = im.amp;
      }
      gl.uniform4fv(u.u_imp, arr);
    }

    this.drawQuad(this.stepProg);

    // swap ping-pong
    const tt = this.texA; this.texA = this.texB; this.texB = tt;
    const tf = this.fboA; this.fboA = this.fboB; this.fboB = tf;
  }

  /** Render the current plate state to the bound (default) framebuffer. */
  present(w: number, h: number, r: RenderParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.presentProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    const u = this.presentProg.uniforms;
    gl.uniform1i(u.u_state, 0);
    gl.uniform1f(u.u_envScale, r.envScale);
    gl.uniform1f(u.u_activity, r.activity);
    gl.uniform1f(u.u_brightness, r.brightness);
    gl.uniform1f(u.u_time, r.time);
    this.drawQuad(this.presentProg);
  }

  /**
   * Downsample + read back the plate into a small CPU array. Returns null if
   * the GPU can't be read (some half-float paths); the caller then falls back
   * to a driver-derived estimate so audio never goes silent.
   */
  snapshot(): FieldSnapshot | null {
    if (this.disposed || !this.readable) return null;
    const gl = this.gl;
    // reduce texA -> readTex
    gl.useProgram(this.reduceProg.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFbo);
    gl.viewport(0, 0, this.read, this.read);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.uniform1i(this.reduceProg.uniforms.u_state, 0);
    this.drawQuad(this.reduceProg);

    // read back
    try {
      gl.readPixels(0, 0, this.read, this.read, gl.RGBA, gl.FLOAT, this.readBuf);
    } catch {
      this.readable = false;
      return null;
    }
    if (gl.getError() !== gl.NO_ERROR) {
      // FLOAT readback rejected on this device — give up gracefully.
      this.readable = false;
      return null;
    }

    let meanEnv = 0;
    const cells = this.read * this.read;
    for (let i = 0; i < cells; i++) {
      const uu = this.readBuf[i * 4];
      const ev = this.readBuf[i * 4 + 2];
      this.snapU[i] = Number.isFinite(uu) ? uu : 0;
      this.snapEnv[i] = Number.isFinite(ev) ? ev : 0;
      meanEnv += this.snapEnv[i];
    }
    meanEnv /= cells;
    return { u: this.snapU, env: this.snapEnv, side: this.read, meanEnv };
  }

  get canRead(): boolean {
    return this.readable;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.quad);
    gl.deleteTexture(this.texA);
    gl.deleteTexture(this.texB);
    gl.deleteTexture(this.readTex);
    gl.deleteFramebuffer(this.fboA);
    gl.deleteFramebuffer(this.fboB);
    gl.deleteFramebuffer(this.readFbo);
    gl.deleteProgram(this.stepProg.prog);
    gl.deleteProgram(this.reduceProg.prog);
    gl.deleteProgram(this.presentProg.prog);
  }
}
