// ─────────────────────────────────────────────────────────────────────────────
// 4904-criticality — field.ts
//
// A WebGL2 fullscreen fragment shader that paints the phase-transition field.
// It is driven entirely from four scalar uniforms handed down from the CPU
// criticality model (order / crit / spread) plus a slow, safety-gated time
// accumulator — so it always paints in a headless / no-GPU review (no compute
// shaders, no WebGPU, no readback).
//
// The metaphor, rendered:
//   • order → 1 : a bright, centred, symmetric standing-wave mandala — visible
//     LONG-RANGE ORDER, a localised "self" figure with a clear boundary against
//     a dark surround (the boundary between you and everything).
//   • near the critical point : the figure swells (correlation length grows),
//     large slow fluctuations bloom (critical opalescence), the edge softens.
//   • order → 0 : the figure shatters into multi-octave, scale-free entropic
//     turbulence that fills the whole frame. No centre, no boundary — a
//     boundless glowing medium. This crossing IS the ego-dissolution.
//
// SAFETY: every temporal term uses a small angular coefficient and the CPU only
// advances uTime by dt * a clamped speed, so per-pixel luminance never
// oscillates near the photosensitive danger band (see page.tsx + README).
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;
void main() {
  // Fullscreen triangle from gl_VertexID — no attribute buffers needed.
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;    // slow, safety-gated phase accumulator (seconds-ish)
uniform float uOrder;   // 1 = coherent self, 0 = dissolved
uniform float uCrit;    // 0..1 critical-opalescence bloom (peaks at crossing)
uniform float uSpread;  // 0..1 how far past the critical point

out vec4 frag;

// -- value noise + fbm (scale-free multi-octave) ------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  // 1/f octave weighting => scale-free structure (no privileged length scale).
  for (int i = 0; i < 6; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return v;
}

// violet ramp (Resonance accent) — dark wash -> indigo -> magenta -> soft light
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.043, 0.027, 0.075); // violet-950
  vec3 c1 = vec3(0.141, 0.070, 0.290); // ~violet-800
  vec3 c2 = vec3(0.388, 0.180, 0.788); // indigo/violet-600
  vec3 c3 = vec3(0.690, 0.263, 0.878); // magenta
  vec3 c4 = vec3(0.769, 0.710, 0.992); // violet-300
  vec3 col;
  if (t < 0.25)      col = mix(c0, c1, t / 0.25);
  else if (t < 0.5)  col = mix(c1, c2, (t - 0.25) / 0.25);
  else if (t < 0.78) col = mix(c2, c3, (t - 0.5) / 0.28);
  else               col = mix(c3, c4, (t - 0.78) / 0.22);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y; // centred, aspect-correct
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float order = uOrder;

  // ── coherent "self": a symmetric radial standing wave ────────────────────
  // As we approach criticality the rings coarsen (correlation length grows),
  // so ring frequency scales with order (fine + crisp when deeply ordered).
  float ringFreq = mix(4.5, 13.0, order);
  float angMod = cos(a * 6.0) * mix(0.2, 1.4, order);     // 6-fold petals
  float wave = cos(r * ringFreq * 6.28318 - uTime * 0.85 + angMod);
  float coherent = 0.5 + 0.5 * wave;
  // A bright core so the "self" reads as a luminous figure.
  coherent += 0.6 * exp(-r * r * 5.0);
  // Localise it: a soft-edged disc = the boundary between self and surround.
  float selfEdge = smoothstep(1.15, 0.15, r);
  coherent *= selfEdge;

  // ── dissolved: scale-free entropic turbulence filling the whole frame ────
  float zoom = mix(1.1, 2.6, uSpread);
  vec2 q = uv * zoom;
  // domain warp for turbulent, boundary-less flow
  vec2 warp = vec2(
    fbm(q + vec2(0.0, uTime * 0.06)),
    fbm(q + vec2(4.7, 1.3) - uTime * 0.05)
  );
  float turb = fbm(q * 1.8 + warp * 1.6 + uTime * 0.04);
  turb = 0.5 + 0.72 * (turb - 0.5);
  // Entropic medium glows everywhere — no localisation, no centre.
  turb += 0.10 * uSpread;

  // ── blend order -> entropy; localisation dissolves with the self ─────────
  float field = mix(turb, coherent, order);

  // Critical opalescence: large, slow, all-scale fluctuations at the edge.
  float opal = uCrit * (fbm(uv * 1.25 + vec2(uTime * 0.08, -uTime * 0.05)) - 0.35);
  field += opal * 0.55;

  // Colour + luminance. The self is bright and concentrated; the dissolved
  // field is a dimmer but boundless wash threaded with glow.
  float lum = clamp(field, 0.0, 1.4);
  float t = clamp(0.16 + lum * 0.72 + uCrit * 0.12, 0.0, 1.0);
  vec3 col = ramp(t);

  // Glow filaments in the entropic phase (bright ridges of the turbulence).
  float fil = smoothstep(0.62, 0.95, turb) * (1.0 - order);
  col += vec3(0.34, 0.22, 0.5) * fil;

  // A gentle overall brightness: ordered self peaks brighter than the wash.
  float bright = mix(0.72, 1.06, order) + uCrit * 0.18;
  col *= bright;

  // Faint dithering to kill banding on the dark violet wash.
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;

  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // Surface the reason once; caller falls back to Canvas2D.
    console.error("shader compile failed:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface FieldUniforms {
  time: number;
  order: number;
  crit: number;
  spread: number;
}

/** WebGL2 fullscreen field renderer. Returns null from create() if WebGL2 or
 *  the program is unavailable, so the page can drop to a Canvas2D fallback. */
export class CriticalityField {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private loc: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    order: WebGLUniformLocation | null;
    crit: WebGLUniformLocation | null;
    spread: WebGLUniformLocation | null;
  };

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    vao: WebGLVertexArrayObject,
  ) {
    this.gl = gl;
    this.program = program;
    this.vao = vao;
    this.loc = {
      res: gl.getUniformLocation(program, "uRes"),
      time: gl.getUniformLocation(program, "uTime"),
      order: gl.getUniformLocation(program, "uOrder"),
      crit: gl.getUniformLocation(program, "uCrit"),
      spread: gl.getUniformLocation(program, "uSpread"),
    };
  }

  static create(canvas: HTMLCanvasElement): CriticalityField | null {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("program link failed:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    // An (empty) VAO must be bound for attribute-less draws in WebGL2.
    const vao = gl.createVertexArray();
    if (!vao) {
      gl.deleteProgram(program);
      return null;
    }

    return new CriticalityField(gl, program, vao);
  }

  render(width: number, height: number, u: FieldUniforms): void {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.loc.res, width, height);
    gl.uniform1f(this.loc.time, u.time);
    gl.uniform1f(this.loc.order, u.order);
    gl.uniform1f(this.loc.crit, u.crit);
    gl.uniform1f(this.loc.spread, u.spread);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    // Free the context proactively on unmount.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
// If WebGL2 is unavailable we still show order -> entropy: a coherent radial
// ring pattern that decoheres into seeded noise as order drops. Lower fidelity,
// but the phase transition still reads.

export class CriticalityField2D {
  private ctx: CanvasRenderingContext2D;
  private noise: Float32Array;
  private nW = 96;
  private nH = 96;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    // Seeded static noise field (deterministic — no Math.random).
    this.noise = new Float32Array(this.nW * this.nH);
    let a = 0x4904 >>> 0;
    for (let i = 0; i < this.noise.length; i++) {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      this.noise[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  }

  render(width: number, height: number, u: FieldUniforms): void {
    const ctx = this.ctx;
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(cx, cy);
    // Base wash.
    ctx.fillStyle = "#0b0713";
    ctx.fillRect(0, 0, width, height);

    const cell = 6; // coarse blocks for speed
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const dx = (x - cx) / maxR;
        const dy = (y - cy) / maxR;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        // coherent standing wave
        const ringFreq = 5 + u.order * 10;
        const wave =
          0.5 +
          0.5 * Math.cos(r * ringFreq * 6.283 - u.time * 0.85 + Math.cos(ang * 6) * u.order);
        const core = 0.6 * Math.exp(-r * r * 5);
        const selfEdge = Math.max(0, Math.min(1, (1.15 - r) / 1.0));
        const coherent = (wave + core) * selfEdge;
        // entropic noise
        const nx = ((x / cell) | 0) % this.nW;
        const ny = ((y / cell) | 0) % this.nH;
        const n = this.noise[ny * this.nW + nx];
        const turb = 0.35 + 0.5 * n;
        const field = coherent * u.order + turb * (1 - u.order) + u.crit * (n - 0.3) * 0.5;
        const t = Math.max(0, Math.min(1, 0.16 + field * 0.7 + u.crit * 0.12));
        // violet ramp (approx)
        const rr = Math.round((0.25 + t * 0.6) * 210 * (0.7 + u.order * 0.4));
        const gg = Math.round((0.1 + t * 0.35) * 150);
        const bb = Math.round((0.35 + t * 0.55) * 245);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  dispose(): void {
    /* nothing to free */
  }
}
