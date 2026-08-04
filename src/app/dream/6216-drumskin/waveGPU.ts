// waveGPU.ts — the drumhead itself: a real 2-D finite-difference wave equation
// solved on the GPU (WebGL2), rendered as a luminous displacement field.
//
// Each cell integrates the discrete membrane equation
//     u_next = 2u - u_prev + c2 * laplacian(u) - damping * (u - u_prev)
// with a fixed circular rim (Dirichlet boundary => reflections). Two RG32F
// textures ping-pong: R channel = current height, G channel = previous height,
// so one texture carries everything the solver needs. Strikes and strokes are
// injected as Gaussian bumps directly in the step shader. Multiple simultaneous
// touches interfere and beat for free — the physics gives us the polyphony.
//
// This is the visual half of a digital-waveguide-mesh drum (see README). If the
// GPU cannot render to float textures, the caller falls back to the Canvas2D
// solver in waveCPU.ts.

export interface Touch {
  x: number; // 0..1 in texture space
  y: number; // 0..1 in texture space
  strength: number; // signed impulse amplitude
  radius: number; // Gaussian sigma in uv units
}

const GRID = 256;
const MAX_TOUCH = 16;

const VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle from gl_VertexID — no vertex buffers needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const STEP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outField; // (u_next, u_current, -, -)

uniform sampler2D uField;
uniform vec2 uTexel;
uniform int uTouchCount;
uniform vec4 uTouch[${MAX_TOUCH}]; // xy = uv, z = strength, w = radius

const float DISCR = 0.985;
const float C2 = 0.30;      // (c*dt/dx)^2 — below the 2-D CFL limit of 0.5
const float DAMP = 0.0009;  // velocity damping
const float EDGE = 0.9993;  // gentle global energy bleed
const float CLAMP = 3.0;    // hard clamp — the membrane can never explode

float curAt(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  if (dot(p, p) > DISCR * DISCR) return 0.0; // fixed rim => reflection
  return texture(uField, uv).r;
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  if (dot(p, p) > DISCR * DISCR) { outField = vec4(0.0); return; }

  vec2 self = texture(uField, uv).rg;
  float cur = self.r;
  float prev = self.g;

  float n = curAt(uv + vec2(0.0, uTexel.y));
  float s = curAt(uv - vec2(0.0, uTexel.y));
  float e = curAt(uv + vec2(uTexel.x, 0.0));
  float w = curAt(uv - vec2(uTexel.x, 0.0));
  float lap = n + s + e + w - 4.0 * cur;

  float nx = 2.0 * cur - prev + C2 * lap - DAMP * (cur - prev);
  nx *= EDGE;

  for (int i = 0; i < ${MAX_TOUCH}; i++) {
    if (i >= uTouchCount) break;
    vec4 t = uTouch[i];
    float d = distance(uv, t.xy);
    nx += t.z * exp(-(d * d) / (t.w * t.w));
  }

  nx = clamp(nx, -CLAMP, CLAMP);
  outField = vec4(nx, cur, 0.0, 1.0);
}`;

const RENDER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uField;
uniform float uGrid;
uniform float uGlow;   // motion intensity (reduced-motion -> lower)
uniform vec2 uAspect;  // canvas aspect correction so the head stays circular

vec3 dreamPalette(float t) {
  vec3 deep    = vec3(0.043, 0.027, 0.075);
  vec3 indigo  = vec3(0.388, 0.400, 0.945);
  vec3 violet  = vec3(0.545, 0.361, 0.965);
  vec3 magenta = vec3(0.690, 0.263, 0.878);
  vec3 light   = vec3(0.769, 0.710, 0.992);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}

ivec2 clampi(ivec2 c) {
  int m = int(uGrid) - 1;
  return ivec2(clamp(c.x, 0, m), clamp(c.y, 0, m));
}

// 4-tap bilinear fetch of a channel (sim texture is NEAREST for exact stencils).
float bil(vec2 uv, int ch) {
  vec2 g = uv * uGrid - 0.5;
  vec2 i = floor(g);
  vec2 f = fract(g);
  ivec2 b = ivec2(i);
  float h00 = texelFetch(uField, clampi(b + ivec2(0, 0)), 0)[ch];
  float h10 = texelFetch(uField, clampi(b + ivec2(1, 0)), 0)[ch];
  float h01 = texelFetch(uField, clampi(b + ivec2(0, 1)), 0)[ch];
  float h11 = texelFetch(uField, clampi(b + ivec2(1, 1)), 0)[ch];
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

void main() {
  // Map screen uv into a centred, aspect-correct disc space. Flip Y so the
  // field reads top-down like the pointer coordinates the page feeds in.
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);
  vec2 c = (s - 0.5) * uAspect;
  float rr = length(c);
  vec2 duv = c + 0.5; // back to field uv

  // Outside the head: quiet violet backdrop with a soft vignette.
  if (rr > 0.5) {
    float v = smoothstep(0.9, 0.4, rr);
    fragColor = vec4(vec3(0.02, 0.014, 0.04) * (0.4 + 0.6 * v), 1.0);
    return;
  }

  float h = bil(duv, 0);
  float hp = bil(duv, 1);
  float vel = h - hp;

  // Surface normal from the height gradient -> raking light.
  float ex = 1.5 / uGrid, ey = 1.5 / uGrid;
  float hx = bil(duv + vec2(ex, 0.0), 0) - bil(duv - vec2(ex, 0.0), 0);
  float hy = bil(duv + vec2(0.0, ey), 0) - bil(duv - vec2(0.0, ey), 0);
  vec3 nrm = normalize(vec3(-hx * 4.0, -hy * 4.0, 0.5));
  float lit = clamp(dot(nrm, normalize(vec3(0.45, 0.55, 1.0))), 0.0, 1.0);

  float amp = abs(h);
  float energy = abs(vel);

  // Height tints the ramp; velocity (moving skin) makes it glow.
  float tone = 0.42 + h * 0.85;
  vec3 base = dreamPalette(tone);
  base *= 0.28 + lit * 0.85;

  float glow = (amp * 1.2 + energy * 7.0) * uGlow;
  vec3 hot = dreamPalette(clamp(0.55 + energy * 3.5, 0.0, 1.0));
  vec3 col = base + hot * glow * 0.6;

  // Rim ring + soft edge into the backdrop.
  float ring = smoothstep(0.5, 0.47, rr) - smoothstep(0.47, 0.4, rr);
  col += vec3(0.35, 0.26, 0.62) * max(ring, 0.0) * 0.5;
  float edge = smoothstep(0.5, 0.47, rr);
  col *= 0.15 + 0.85 * edge;

  fragColor = vec4(col, 1.0);
}`;

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

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  return p;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export class WaveGPU {
  readonly grid = GRID;
  private gl: WebGL2RenderingContext;
  private stepProg: WebGLProgram;
  private renderProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private a: Target;
  private b: Target;
  private touchBuf = new Float32Array(MAX_TOUCH * 4);
  private readBuf = new Float32Array(4 * 4 * 4); // 4x4 RGBA probe
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("webgl2 unavailable");
    // Float-render capability is required for the RG32F ping-pong.
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float unavailable");
    }
    this.gl = gl;

    this.stepProg = link(gl, VERT, STEP_FRAG);
    this.renderProg = link(gl, VERT, RENDER_FRAG);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;

    this.a = this.makeTarget();
    this.b = this.makeTarget();

    // Cache uniform locations.
    gl.useProgram(this.stepProg);
    this.uni.field = gl.getUniformLocation(this.stepProg, "uField");
    this.uni.texel = gl.getUniformLocation(this.stepProg, "uTexel");
    this.uni.touchCount = gl.getUniformLocation(this.stepProg, "uTouchCount");
    this.uni.touch = gl.getUniformLocation(this.stepProg, "uTouch");
    gl.useProgram(this.renderProg);
    this.uni.rField = gl.getUniformLocation(this.renderProg, "uField");
    this.uni.rGrid = gl.getUniformLocation(this.renderProg, "uGrid");
    this.uni.rGlow = gl.getUniformLocation(this.renderProg, "uGlow");
    this.uni.rAspect = gl.getUniformLocation(this.renderProg, "uAspect");
  }

  private makeTarget(): Target {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error("target alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, GRID, GRID, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    // Clear to zero (flat membrane).
    gl.viewport(0, 0, GRID, GRID);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const gl = this.gl;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    gl.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    gl.canvas.height = Math.max(1, Math.floor(cssH * dpr));
  }

  /** One physics step, injecting the active touches. */
  step(touches: Touch[]): void {
    if (this.disposed) return;
    const gl = this.gl;
    const n = Math.min(touches.length, MAX_TOUCH);
    for (let i = 0; i < n; i++) {
      const t = touches[i];
      this.touchBuf[i * 4] = t.x;
      this.touchBuf[i * 4 + 1] = t.y;
      this.touchBuf[i * 4 + 2] = t.strength;
      this.touchBuf[i * 4 + 3] = Math.max(t.radius, 0.004);
    }

    gl.useProgram(this.stepProg);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fbo);
    gl.viewport(0, 0, GRID, GRID);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.uni.field!, 0);
    gl.uniform2f(this.uni.texel!, 1 / GRID, 1 / GRID);
    gl.uniform1i(this.uni.touchCount!, n);
    gl.uniform4fv(this.uni.touch!, this.touchBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Swap: b (just written) becomes the current field.
    const tmp = this.a;
    this.a = this.b;
    this.b = tmp;
  }

  /** Draw the current height field to the screen. */
  render(glow: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    // Aspect correction keeps the drumhead a true circle on any viewport.
    const min = Math.min(w, h);
    const ax = w / min;
    const ay = h / min;

    gl.useProgram(this.renderProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.uni.rField!, 0);
    gl.uniform1f(this.uni.rGrid!, GRID);
    gl.uniform1f(this.uni.rGlow!, glow);
    gl.uniform2f(this.uni.rAspect!, ax, ay);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Tap the field near a central pickup: returns a 0..1 energy envelope. */
  readEnergy(): number {
    if (this.disposed) return 0;
    const gl = this.gl;
    const c = Math.floor(GRID / 2) - 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.fbo);
    try {
      gl.readPixels(c, c, 4, 4, gl.RGBA, gl.FLOAT, this.readBuf);
    } catch {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return 0;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      const cur = this.readBuf[i * 4];
      const prev = this.readBuf[i * 4 + 1];
      sum += Math.abs(cur - prev);
    }
    return Math.min(1, (sum / 16) * 12);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const t of [this.a, this.b]) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    gl.deleteProgram(this.stepProg);
    gl.deleteProgram(this.renderProg);
    gl.deleteVertexArray(this.vao);
  }
}
