// ════════════════════════════════════════════════════════════════════════════
// Goad (2578) — WebGL2 scrolling tension landscape
//
// The payload visual. The whole dialogue's tension scalar is drawn as a filled
// "mountain range" that scrolls left as the conversation grows: height = the
// psychoacoustic tension at that instant, colour = the same value mapped
// through the canonical violet→magenta ramp (hot magenta crests are the cliffs
// the AI banked; deep-violet valleys are resolution). A brighter crest line
// rides the top. Note markers, the playhead and text sit in an SVG overlay in
// the page, aligned to the same view window.
//
// Hand-rolled GL2 — no three.js, no libs. Geometry is rebuilt each frame from
// the visible sample window and drawn as one TRIANGLE_STRIP + one LINE_STRIP.
// ════════════════════════════════════════════════════════════════════════════

import { PALETTE_GLSL } from "../_shared/palette";

const VERT = `#version 300 es
in vec2 a_pos;
in float a_h;
out float v_h;
out float v_y;
void main() {
  v_h = a_h;
  v_y = a_pos.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_h;
in float v_y;
uniform float u_crest;   // 0 = filled body, 1 = bright crest line
out vec4 frag;
${PALETTE_GLSL}
void main() {
  float t = clamp(0.12 + v_h * 0.9, 0.0, 1.0);
  vec3 col = dreamPalette(t);
  if (u_crest > 0.5) {
    // Crest: brighten toward the hot end so cliffs glow.
    col = mix(col, vec3(0.95, 0.85, 1.0), 0.35) * (1.1 + v_h * 0.6);
    frag = vec4(col, 1.0);
    return;
  }
  // Body: gently darken toward the baseline for depth.
  float depth = smoothstep(-1.0, 0.6, v_y);
  col *= 0.35 + 0.65 * depth;
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface LandscapeView {
  samples: number[]; // tension per column across the WHOLE timeline (0..1)
  viewStart: number; // first visible sample index (fractional ok)
  viewCount: number; // number of samples spanning the canvas width
}

export class TensionGL {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private uCrest: WebGLUniformLocation | null = null;
  private loseCtx: WEBGL_lose_context | null = null;

  /** Returns false if WebGL2 is unavailable (caller shows the SVG fallback). */
  init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return false;
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "a_pos");
    gl.bindAttribLocation(prog, 1, "a_h");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;
    this.uCrest = gl.getUniformLocation(prog, "u_crest");

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    // interleaved: x, y, h  (stride 12 bytes)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);

    this.loseCtx = gl.getExtension("WEBGL_lose_context");
    return true;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const gl = this.gl;
    if (!gl) return;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  /** Sample the tension at a fractional column via linear interpolation. */
  private sampleAt(samples: number[], x: number): number {
    if (samples.length === 0) return 0;
    if (x <= 0) return samples[0];
    if (x >= samples.length - 1) return samples[samples.length - 1];
    const i = Math.floor(x);
    const f = x - i;
    return samples[i] * (1 - f) + samples[i + 1] * f;
  }

  render(view: LandscapeView): void {
    const gl = this.gl;
    const prog = this.prog;
    if (!gl || !prog) return;

    gl.clearColor(0.043, 0.027, 0.075, 1); // VIOLET 950 wash
    gl.clear(gl.COLOR_BUFFER_BIT);

    const { samples, viewStart, viewCount } = view;
    if (samples.length < 2 || viewCount < 2) return;

    // Resolve the mountain at ~2px columns for a smooth crest.
    const canvasW = (gl.canvas as HTMLCanvasElement).width;
    const cols = Math.max(2, Math.min(1200, Math.floor(canvasW / 2)));

    const strip = new Float32Array(cols * 2 * 3); // 2 verts (base, top) per col
    const crest = new Float32Array(cols * 3);
    for (let c = 0; c < cols; c++) {
      const frac = c / (cols - 1);
      const sampleX = viewStart + frac * viewCount;
      const h = Math.max(0, Math.min(1, this.sampleAt(samples, sampleX)));
      const x = frac * 2 - 1;
      const yTop = -0.92 + 1.72 * h;
      // base vertex
      const bi = c * 6;
      strip[bi] = x;
      strip[bi + 1] = -1.0;
      strip[bi + 2] = 0.0;
      // top vertex
      strip[bi + 3] = x;
      strip[bi + 4] = yTop;
      strip[bi + 5] = h;
      // crest
      const ci = c * 3;
      crest[ci] = x;
      crest[ci + 1] = yTop;
      crest[ci + 2] = h;
    }

    gl.useProgram(prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // Filled body.
    gl.bufferData(gl.ARRAY_BUFFER, strip, gl.DYNAMIC_DRAW);
    gl.uniform1f(this.uCrest, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, cols * 2);

    // Crest line (additive glow).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bufferData(gl.ARRAY_BUFFER, crest, gl.DYNAMIC_DRAW);
    gl.uniform1f(this.uCrest, 1);
    gl.drawArrays(gl.LINE_STRIP, 0, cols);
    gl.disable(gl.BLEND);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.prog) gl.deleteProgram(this.prog);
    this.vbo = null;
    this.vao = null;
    this.prog = null;
    this.loseCtx?.loseContext();
    this.gl = null;
  }
}
