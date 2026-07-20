// Real-time Diffusion-Curves field for "Slow Radiance".
//
// This is a genuine Poisson / Laplace relaxation solve, NOT a Gaussian blur.
// Each frame the currently-sounding audio voices are re-imposed as fixed
// Dirichlet colour cells; every other cell relaxes toward the average of its
// four texel neighbours over many Jacobi passes. The steady state of that
// system is the harmonic (Laplace) interpolation between the coloured sources
// — exactly the maths behind Diffusion Curves (Orzan et al., SIGGRAPH 2008).
//
// The field texture is NOT cleared between frames: we run a fixed number of
// passes on the persistent buffer, so the nebula relaxes and trails as the
// voices glide — a living field rather than a per-frame snapshot.

export interface VoiceSource {
  x: number; // 0..1 in field space
  y: number; // 0..1 in field space
  r: number; // 0..1 colour
  g: number; // 0..1 colour
  b: number; // 0..1 colour
  gain: number; // 0..1 current amplitude
}

export interface DiffusionField {
  readonly backend: "webgl2" | "cpu";
  setSources(sources: VoiceSource[]): void;
  render(timeSec: number): void;
  resize(): void;
  dispose(): void;
}

const GRID = 200; // GPU grid resolution (~200x200 per brief)
const GPU_PASSES = 24; // Jacobi relaxation passes per frame
const CPU_GRID = 100;
const CPU_PASSES = 12;

// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 ping-pong Jacobi solver
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// One Jacobi relaxation pass. Fixed (Dirichlet) cells are held at their
// constraint colour; free cells become the average of four neighbours.
const JACOBI_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_field;
uniform sampler2D u_constraint;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 con = texelFetch(u_constraint, c, 0);
  if (con.a > 0.5) {
    o = vec4(con.rgb, 1.0);
    return;
  }
  vec3 s = vec3(0.0);
  s += texelFetch(u_field, c + ivec2( 1, 0), 0).rgb;
  s += texelFetch(u_field, c + ivec2(-1, 0), 0).rgb;
  s += texelFetch(u_field, c + ivec2( 0, 1), 0).rgb;
  s += texelFetch(u_field, c + ivec2( 0,-1), 0).rgb;
  o = vec4(s * 0.25, 1.0);
}`;

// Painterly display: soft additive glow, Reinhard tone-map, vignette, grain.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_field;
uniform vec2 u_texel;
uniform float u_time;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 uv = v_uv;
  vec3 base = texture(u_field, uv).rgb;
  vec3 glow = vec3(0.0);
  glow += texture(u_field, uv + u_texel * vec2( 3.0, 0.0)).rgb;
  glow += texture(u_field, uv + u_texel * vec2(-3.0, 0.0)).rgb;
  glow += texture(u_field, uv + u_texel * vec2( 0.0, 3.0)).rgb;
  glow += texture(u_field, uv + u_texel * vec2( 0.0,-3.0)).rgb;
  glow += texture(u_field, uv + u_texel * vec2( 6.0, 6.0)).rgb;
  glow += texture(u_field, uv + u_texel * vec2(-6.0,-6.0)).rgb;
  glow /= 6.0;
  vec3 col = base * 1.15 + glow * 0.8;
  // Reinhard-ish tone-map with a gentle lift, then soft gamma.
  col = col / (col + vec3(0.62));
  col = pow(max(col, 0.0), vec3(0.86));
  // Warm the deep charcoal floor a touch so black is never dead.
  col += vec3(0.018, 0.012, 0.008);
  // Vignette.
  vec2 d = uv - 0.5;
  float vig = smoothstep(1.05, 0.18, dot(d, d) * 2.3);
  col *= vig;
  // Film grain.
  float gr = hash(gl_FragCoord.xy + fract(u_time) * vec2(37.0, 17.0));
  col += (gr - 0.5) * 0.022;
  o = vec4(max(col, 0.0), 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
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

function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, "a_pos");
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

function makeFieldTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("texture alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const zeros = new Uint8Array(GRID * GRID * 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, GRID, GRID, 0, gl.RGBA, gl.UNSIGNED_BYTE, zeros);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

class WebGLField implements DiffusionField {
  readonly backend = "webgl2" as const;
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private jacobi: WebGLProgram;
  private display: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private conTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private conData = new Uint8Array(GRID * GRID * 4);
  private uDisplayTexel: WebGLUniformLocation | null;
  private uDisplayTime: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    this.canvas = canvas;

    this.jacobi = linkProgram(gl, VERT, JACOBI_FRAG);
    this.display = linkProgram(gl, VERT, DISPLAY_FRAG);

    // Fullscreen triangle.
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("vao/vbo alloc failed");
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texA = makeFieldTexture(gl);
    this.texB = makeFieldTexture(gl);

    const conTex = gl.createTexture();
    if (!conTex) throw new Error("constraint texture alloc failed");
    this.conTex = conTex;
    gl.bindTexture(gl.TEXTURE_2D, conTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, GRID, GRID, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.conData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("fbo alloc failed");
    this.fbo = fbo;

    // Cache sampler bindings (texture units are fixed).
    gl.useProgram(this.jacobi);
    gl.uniform1i(gl.getUniformLocation(this.jacobi, "u_field"), 0);
    gl.uniform1i(gl.getUniformLocation(this.jacobi, "u_constraint"), 1);
    gl.useProgram(this.display);
    gl.uniform1i(gl.getUniformLocation(this.display, "u_field"), 0);
    this.uDisplayTexel = gl.getUniformLocation(this.display, "u_texel");
    this.uDisplayTime = gl.getUniformLocation(this.display, "u_time");

    this.resize();
  }

  setSources(sources: VoiceSource[]): void {
    const data = this.conData;
    data.fill(0);
    for (const s of sources) {
      if (s.gain < 0.02) continue;
      const cx = Math.round(s.x * (GRID - 1));
      const cy = Math.round(s.y * (GRID - 1));
      const rad = Math.round(3 + s.gain * 6);
      const inten = 0.45 + 0.55 * s.gain;
      const rr = Math.min(255, Math.round(s.r * inten * 255));
      const gg = Math.min(255, Math.round(s.g * inten * 255));
      const bb = Math.min(255, Math.round(s.b * inten * 255));
      for (let dy = -rad; dy <= rad; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= GRID) continue;
        for (let dx = -rad; dx <= rad; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= GRID) continue;
          if (dx * dx + dy * dy > rad * rad) continue;
          const i = (y * GRID + x) * 4;
          data[i] = rr;
          data[i + 1] = gg;
          data[i + 2] = bb;
          data[i + 3] = 255;
        }
      }
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.conTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GRID, GRID, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  render(timeSec: number): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    // ── Relaxation: ping-pong Jacobi passes on the persistent field ──────────
    gl.useProgram(this.jacobi);
    gl.viewport(0, 0, GRID, GRID);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.conTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    let read = this.texA;
    let write = this.texB;
    for (let p = 0; p < GPU_PASSES; p++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, write, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = read;
      read = write;
      write = t;
    }
    this.texA = read;
    this.texB = write;

    // ── Display the relaxed field to the screen ──────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.display);
    gl.uniform2f(this.uDisplayTexel, 1 / GRID, 1 / GRID);
    gl.uniform1f(this.uDisplayTime, timeSec);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.jacobi);
    gl.deleteProgram(this.display);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.texA);
    gl.deleteTexture(this.texB);
    gl.deleteTexture(this.conTex);
    gl.deleteFramebuffer(this.fbo);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas2D CPU fallback — same Jacobi relaxation rule on a smaller grid
// ─────────────────────────────────────────────────────────────────────────────

class CPUField implements DiffusionField {
  readonly backend = "cpu" as const;
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private small: HTMLCanvasElement;
  private smallCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private fieldA = new Float32Array(CPU_GRID * CPU_GRID * 3);
  private fieldB = new Float32Array(CPU_GRID * CPU_GRID * 3);
  private conCol = new Float32Array(CPU_GRID * CPU_GRID * 3);
  private conMask = new Uint8Array(CPU_GRID * CPU_GRID);

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D not available");
    this.ctx = ctx;
    this.canvas = canvas;
    const small = document.createElement("canvas");
    small.width = CPU_GRID;
    small.height = CPU_GRID;
    const sctx = small.getContext("2d");
    if (!sctx) throw new Error("Canvas2D not available");
    this.small = small;
    this.smallCtx = sctx;
    this.img = sctx.createImageData(CPU_GRID, CPU_GRID);
    this.resize();
  }

  setSources(sources: VoiceSource[]): void {
    this.conCol.fill(0);
    this.conMask.fill(0);
    for (const s of sources) {
      if (s.gain < 0.02) continue;
      const cx = Math.round(s.x * (CPU_GRID - 1));
      const cy = Math.round(s.y * (CPU_GRID - 1));
      const rad = Math.round(2 + s.gain * 3);
      const inten = 0.45 + 0.55 * s.gain;
      for (let dy = -rad; dy <= rad; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= CPU_GRID) continue;
        for (let dx = -rad; dx <= rad; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= CPU_GRID) continue;
          if (dx * dx + dy * dy > rad * rad) continue;
          const c = y * CPU_GRID + x;
          this.conMask[c] = 1;
          this.conCol[c * 3] = s.r * inten;
          this.conCol[c * 3 + 1] = s.g * inten;
          this.conCol[c * 3 + 2] = s.b * inten;
        }
      }
    }
  }

  private relaxOnce(src: Float32Array, dst: Float32Array): void {
    const N = CPU_GRID;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = y * N + x;
        const ci = c * 3;
        if (this.conMask[c]) {
          dst[ci] = this.conCol[ci];
          dst[ci + 1] = this.conCol[ci + 1];
          dst[ci + 2] = this.conCol[ci + 2];
          continue;
        }
        const l = x > 0 ? c - 1 : c;
        const r = x < N - 1 ? c + 1 : c;
        const u = y > 0 ? c - N : c;
        const d = y < N - 1 ? c + N : c;
        dst[ci] = (src[l * 3] + src[r * 3] + src[u * 3] + src[d * 3]) * 0.25;
        dst[ci + 1] = (src[l * 3 + 1] + src[r * 3 + 1] + src[u * 3 + 1] + src[d * 3 + 1]) * 0.25;
        dst[ci + 2] = (src[l * 3 + 2] + src[r * 3 + 2] + src[u * 3 + 2] + src[d * 3 + 2]) * 0.25;
      }
    }
  }

  render(timeSec: number): void {
    let a = this.fieldA;
    let b = this.fieldB;
    for (let p = 0; p < CPU_PASSES; p++) {
      this.relaxOnce(a, b);
      const t = a;
      a = b;
      b = t;
    }
    this.fieldA = a;
    this.fieldB = b;

    // Slow grain seed so the floor shimmers faintly, like the GPU display.
    const seed = Math.sin(timeSec * 1.7) * 0.008;
    const data = this.img.data;
    for (let i = 0; i < CPU_GRID * CPU_GRID; i++) {
      let rr = a[i * 3] * 1.15;
      let gg = a[i * 3 + 1] * 1.15;
      let bb = a[i * 3 + 2] * 1.15;
      // Reinhard tone-map + lift, matching the GPU display.
      rr = (rr / (rr + 0.62)) ** 0.86 + 0.018 + seed;
      gg = (gg / (gg + 0.62)) ** 0.86 + 0.012 + seed;
      bb = (bb / (bb + 0.62)) ** 0.86 + 0.008 + seed;
      data[i * 4] = Math.min(255, rr * 255);
      data[i * 4 + 1] = Math.min(255, gg * 255);
      data[i * 4 + 2] = Math.min(255, bb * 255);
      data[i * 4 + 3] = 255;
    }
    this.smallCtx.putImageData(this.img, 0, 0);

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; // upscale blur == soft glow
    ctx.drawImage(this.small, 0, 0, w, h);
    // Vignette.
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(5,4,3,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  dispose(): void {
    /* nothing retained beyond GC-able canvases */
  }
}

// Try WebGL2 first, then Canvas2D CPU. Throws only if neither is available.
export function createDiffusionField(canvas: HTMLCanvasElement): DiffusionField {
  try {
    return new WebGLField(canvas);
  } catch {
    return new CPUField(canvas);
  }
}
