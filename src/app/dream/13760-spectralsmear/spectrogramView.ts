// ─────────────────────────────────────────────────────────────────────────────
// spectrogramView.ts — blits the precomputed spectrogram of Karel's real STFT
// magnitudes as a scrolling WebGL2 texture with a cool "ice" colormap and a
// frozen-frame shimmer. This is a DATA render (his magnitudes, time × frequency),
// not a generative fragment field: the shader only samples the texture, maps it
// to violet→cyan→ice, pans it by the playhead, and highlights the frozen column.
//
// A Canvas2D fallback (ImageData through an offscreen buffer) draws the same
// viewport when WebGL2 is unavailable, so the piece never blanks.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpectrogramData } from "./spectralEngine";

export interface ViewState {
  offset: number; // playhead position, fraction of the track 0..1
  span: number; // fraction of the track visible in the viewport
  frozen: number; // 0..1 frozen intensity
  spread: number; // 0..1 spectral spread (vertical bloom)
  time: number; // seconds, for the freeze shimmer
  motion: number; // 1 = animate shimmer, 0 = reduced motion
}

const VERT = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_spec;
uniform float u_offset, u_span, u_frozen, u_spread, u_time, u_motion;

vec3 coolmap(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.015, 0.020, 0.055); // near-black cool ground
  vec3 c1 = vec3(0.140, 0.100, 0.420); // deep indigo
  vec3 c2 = vec3(0.360, 0.300, 0.850); // violet
  vec3 c3 = vec3(0.280, 0.760, 0.900); // cyan / teal
  vec3 c4 = vec3(0.820, 0.980, 1.000); // icy white
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

void main() {
  float tx = u_offset + (v_uv.x - 0.5) * u_span;
  float fy = v_uv.y;
  float m = texture(u_spec, vec2(tx, fy)).r;
  if (u_spread > 0.001) {
    float s = u_spread * 0.06;
    float a = texture(u_spec, vec2(tx, clamp(fy + s, 0.0, 1.0))).r;
    float b = texture(u_spec, vec2(tx, clamp(fy - s, 0.0, 1.0))).r;
    m = max(m, (a + b) * 0.5 * 0.9);
  }
  m = clamp(pow(m, 0.9), 0.0, 1.0);
  vec3 col = coolmap(m);

  float d = abs(v_uv.x - 0.5);
  float shimmer = 0.6 + 0.4 * sin(u_time * 2.2 + fy * 34.0);
  shimmer = mix(1.0, shimmer, u_motion * u_frozen);
  float head = smoothstep(0.007, 0.0, d);
  float glow = smoothstep(0.055, 0.0, d) * (0.18 + 0.82 * u_frozen);
  vec3 ice = vec3(0.78, 0.95, 1.0);
  col += ice * head * (0.45 + 0.55 * u_frozen) * shimmer;
  col += vec3(0.35, 0.6, 0.95) * glow * 0.55 * shimmer;

  col = mix(col, col * vec3(0.86, 0.96, 1.14), u_frozen * 0.28);

  float vig = smoothstep(1.25, 0.25, length(v_uv - 0.5));
  col *= mix(0.82, 1.0, vig);

  frag = vec4(col, 1.0);
}`;

interface GLState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  tex: WebGLTexture;
  vao: WebGLVertexArrayObject;
  u: Record<string, WebGLUniformLocation | null>;
}

export class SpectrogramView {
  readonly kind: "webgl" | "canvas2d";
  private readonly canvas: HTMLCanvasElement;
  private readonly spec: SpectrogramData;
  private gls: GLState | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private off: HTMLCanvasElement | null = null;
  private offCtx: CanvasRenderingContext2D | null = null;
  private offImg: ImageData | null = null;

  private constructor(
    canvas: HTMLCanvasElement,
    spec: SpectrogramData,
    kind: "webgl" | "canvas2d",
  ) {
    this.canvas = canvas;
    this.spec = spec;
    this.kind = kind;
  }

  static create(
    canvas: HTMLCanvasElement,
    spec: SpectrogramData,
  ): SpectrogramView {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (gl) {
      const view = new SpectrogramView(canvas, spec, "webgl");
      if (view.initGL(gl)) return view;
    }
    const view = new SpectrogramView(canvas, spec, "canvas2d");
    view.initCanvas2D();
    return view;
  }

  // ── WebGL2 setup ───────────────────────────────────────────────────────────
  private initGL(gl: WebGL2RenderingContext): boolean {
    const program = makeProgram(gl, VERT, FRAG);
    if (!program) return false;

    const tex = gl.createTexture();
    if (!tex) return false;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      this.spec.width,
      this.spec.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.spec.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const vao = gl.createVertexArray();
    if (!vao) return false;

    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of [
      "u_spec",
      "u_offset",
      "u_span",
      "u_frozen",
      "u_spread",
      "u_time",
      "u_motion",
    ]) {
      u[name] = gl.getUniformLocation(program, name);
    }
    this.gls = { gl, program, tex, vao, u };
    return true;
  }

  private initCanvas2D(): void {
    this.ctx2d = this.canvas.getContext("2d");
    const off = document.createElement("canvas");
    off.width = 640;
    off.height = this.spec.height;
    this.off = off;
    this.offCtx = off.getContext("2d");
    if (this.offCtx) this.offImg = this.offCtx.createImageData(640, off.height);
  }

  // ── draw one frame ─────────────────────────────────────────────────────────
  draw(view: ViewState): void {
    if (this.kind === "webgl" && this.gls) this.drawGL(view);
    else this.drawCanvas2D(view);
  }

  private drawGL(view: ViewState): void {
    const s = this.gls;
    if (!s) return;
    const { gl, program, tex, vao, u } = s;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.u_spec, 0);
    gl.uniform1f(u.u_offset, view.offset);
    gl.uniform1f(u.u_span, view.span);
    gl.uniform1f(u.u_frozen, view.frozen);
    gl.uniform1f(u.u_spread, view.spread);
    gl.uniform1f(u.u_time, view.time);
    gl.uniform1f(u.u_motion, view.motion);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawCanvas2D(view: ViewState): void {
    const ctx = this.ctx2d;
    const off = this.off;
    const offCtx = this.offCtx;
    const img = this.offImg;
    if (!ctx || !off || !offCtx || !img) return;
    const { width: sw, height: sh, data } = this.spec;
    const fw = off.width;
    const px = img.data;
    for (let x = 0; x < fw; x++) {
      const tx = view.offset + (x / (fw - 1) - 0.5) * view.span;
      const col = clampIdx(Math.round(tx * (sw - 1)), sw - 1);
      for (let y = 0; y < sh; y++) {
        // screen y=0 is top → high freq; texture row 0 is low freq
        const row = sh - 1 - y;
        let m = data[row * sw + col] / 255;
        if (view.spread > 0.001) {
          const s = Math.max(1, Math.round(view.spread * sh * 0.06));
          const a = data[clampIdx(row + s, sh - 1) * sw + col] / 255;
          const b = data[clampIdx(row - s, sh - 1) * sw + col] / 255;
          m = Math.max(m, (a + b) * 0.5 * 0.9);
        }
        m = Math.pow(m, 0.9);
        const [r, g, bl] = coolmapJS(m);
        const o = (y * fw + x) * 4;
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = bl;
        px[o + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, this.canvas.width, this.canvas.height);

    // playhead (bright, brighter when frozen)
    const cx = this.canvas.width * 0.5;
    const a = 0.45 + 0.55 * view.frozen;
    ctx.fillStyle = `rgba(200,242,255,${a})`;
    ctx.fillRect(cx - 1.5, 0, 3, this.canvas.height);
    ctx.fillStyle = `rgba(90,153,242,${0.14 + 0.2 * view.frozen})`;
    ctx.fillRect(cx - 14, 0, 28, this.canvas.height);
  }

  dispose(): void {
    const s = this.gls;
    if (s) {
      const { gl } = s;
      try {
        gl.deleteTexture(s.tex);
        gl.deleteVertexArray(s.vao);
        gl.deleteProgram(s.program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already gone */
      }
      this.gls = null;
    }
    this.ctx2d = null;
    this.offCtx = null;
    this.off = null;
    this.offImg = null;
  }
}

function coolmapJS(t: number): [number, number, number] {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const stops: [number, number, number][] = [
    [4, 5, 14],
    [36, 26, 107],
    [92, 77, 217],
    [71, 194, 230],
    [209, 250, 255],
  ];
  const seg = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function clampIdx(v: number, hi: number): number {
  return v < 0 ? 0 : v > hi ? hi : v;
}

function makeProgram(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
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
