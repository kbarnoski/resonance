// ─────────────────────────────────────────────────────────────────────────────
// shader.ts — the "spectral ear" field for 1398-ear-of-static.
//
//   A WebGL2 full-screen triangle drives a GLSL ES 3.00 fragment shader. The x
//   axis is the listening ribbon (matching the audio focus). At rest it is a dim,
//   slowly-drifting bed of hiss. A lens around the focus position sharpens and
//   brightens the noise. Where a resonance resolves (its alignment climbs), a
//   bright pitched ridge rings out — a vertical band with harmonic striations
//   that glows and steadies as it locks.
//
//   SAFETY: the only global luminance motion is a < 0.5 Hz sine drift — never a
//   strobe, never near the photosensitive danger band. prefers-reduced-motion
//   freezes the hiss animation and drift (state.reduced).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RES = 8;

const VERT = `#version 300 es
precision highp float;
void main() {
  // full-screen triangle from gl_VertexID (no attributes)
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2 uRes;
uniform float uTime;
uniform float uFocusX;
uniform float uDwell;
uniform float uReduced;
uniform int uCount;
uniform float uResX[${MAX_RES}];
uniform float uResAlign[${MAX_RES}];

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// value noise
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // Animate more slowly (and freeze) under reduced motion.
  float mo = mix(1.0, 0.06, uReduced);
  float t = uTime * mo;

  // Vertical ribbon envelope — the "ear", brightest across the middle band.
  float band = smoothstep(0.0, 0.28, uv.y) * smoothstep(1.0, 0.72, uv.y);

  // ── dim animated hiss bed ──
  float grain = vnoise(vec2(uv.x * 220.0, uv.y * 90.0) + vec2(t * 7.0, -t * 3.0));
  float coarse = vnoise(vec2(uv.x * 24.0, uv.y * 12.0) - vec2(t * 0.6, t * 0.3));
  float hiss = mix(grain, coarse, 0.4);

  // ── focus lens: sharpen + brighten the hiss near the focus x ──
  float fd = uv.x - uFocusX;
  float lens = exp(-(fd * fd) / (2.0 * 0.045 * 0.045));
  // sharpen = push contrast up inside the lens
  float sharp = mix(hiss, smoothstep(0.35, 0.65, hiss), lens * 0.9);

  vec3 col = vec3(0.0);
  // cosmic/hypnagogic base: deep indigo hiss, cooler where sharpened
  vec3 hissCol = mix(vec3(0.06, 0.05, 0.11), vec3(0.16, 0.20, 0.34), sharp);
  col += hissCol * (0.35 + 0.65 * sharp) * (0.5 + 0.9 * lens);

  // faint vertical focus guide
  col += vec3(0.10, 0.14, 0.24) * lens * 0.5;

  // ── resonance ridges: bright pitched bands where alignment is high ──
  for (int i = 0; i < ${MAX_RES}; i++) {
    if (i >= uCount) break;
    float a = uResAlign[i];
    if (a < 0.01) continue;
    float rx = uResX[i];
    float dx = uv.x - rx;
    float w = mix(0.05, 0.014, a); // ridge sharpens as it resolves
    float ridge = exp(-(dx * dx) / (2.0 * w * w));
    // harmonic striations running up the ridge (steady when locked)
    float stri = 0.6 + 0.4 * sin(uv.y * 46.0 + t * (1.2 - a) * 2.5 + float(i) * 1.7);
    // pitched glow color — cyan-gold as it rings out
    vec3 ridgeCol = mix(vec3(0.35, 0.55, 0.85), vec3(0.95, 0.92, 0.72), a);
    col += ridgeCol * ridge * a * (0.55 + 0.45 * stri) * (0.6 + 0.6 * band);
    // a hot core line at full lock
    col += vec3(0.9, 0.95, 1.0) * exp(-(dx * dx) / (2.0 * 0.004 * 0.004)) * a * a * 0.5;
  }

  col *= band;

  // dwell warms the whole field slightly (held consonant weave)
  col += vec3(0.10, 0.07, 0.14) * uDwell * band * 0.4;

  // SLOW global luminance drift (< 0.5 Hz) — soft, never a strobe.
  float drift = 0.9 + 0.1 * sin(6.28318 * 0.4 * t) * (1.0 - uReduced);
  col *= drift;

  // vignette
  vec2 q = uv - 0.5;
  col *= 1.0 - 0.7 * dot(q, q);

  frag = vec4(col, 1.0);
}`;

export interface EarState {
  time: number; // seconds
  focusX: number; // 0..1
  dwell: number; // 0..1
  reduced: boolean;
  resX: number[]; // resonance ribbon positions
  resAlign: number[]; // resonance alignment 0..1
}

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

export class EarRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uni: Record<string, WebGLUniformLocation | null> = {};

  static create(canvas: HTMLCanvasElement): EarRenderer | null {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return null;
    try {
      return new EarRenderer(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;
    for (const name of [
      "uRes",
      "uTime",
      "uFocusX",
      "uDwell",
      "uReduced",
      "uCount",
      "uResX",
      "uResAlign",
    ]) {
      this.uni[name] = gl.getUniformLocation(prog, name);
    }
  }

  resize(w: number, h: number): void {
    this.gl.canvas.width = Math.max(1, Math.floor(w));
    this.gl.canvas.height = Math.max(1, Math.floor(h));
  }

  render(state: EarState): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.02, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);

    const count = Math.min(MAX_RES, state.resX.length);
    const xs = new Float32Array(MAX_RES);
    const al = new Float32Array(MAX_RES);
    for (let i = 0; i < count; i++) {
      xs[i] = state.resX[i];
      al[i] = state.resAlign[i] ?? 0;
    }

    gl.uniform2f(this.uni.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uni.uTime, state.time);
    gl.uniform1f(this.uni.uFocusX, state.focusX);
    gl.uniform1f(this.uni.uDwell, state.dwell);
    gl.uniform1f(this.uni.uReduced, state.reduced ? 1 : 0);
    gl.uniform1i(this.uni.uCount, count);
    gl.uniform1fv(this.uni.uResX, xs);
    gl.uniform1fv(this.uni.uResAlign, al);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.prog);
      gl.deleteVertexArray(this.vao);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {
      /* noop */
    }
  }
}
