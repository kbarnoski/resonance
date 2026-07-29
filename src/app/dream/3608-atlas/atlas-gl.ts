// ════════════════════════════════════════════════════════════════════════════
// ATLAS (3608) — WebGL2 GPU point-cloud renderer.
//
// The corpus is drawn as thousands of glowing additive point sprites via raw
// WebGL2 gl.POINTS (three.js is not a dependency here). Each point is coloured
// by descriptor on the violet ramp; the grains nearest the cursor swell and
// brighten (the currently-sounding voice); a soft halo marks the cursor. This
// is the "map as score" surface — TENOR 2023, "Maps as Scores: Timbre-Space
// Representations."
// ════════════════════════════════════════════════════════════════════════════

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in float aT;
layout(location=2) in float aLoud;
uniform vec2 uCursor;
uniform vec2 uFit;
uniform float uPointScale;
uniform float uTime;
uniform float uIsHalo;
uniform float uActive;
out float vT;
out float vBright;
out float vHalo;
void main(){
  vec2 p = aPos * uFit;
  gl_Position = vec4(p, 0.0, 1.0);
  if (uIsHalo > 0.5) {
    gl_PointSize = (90.0 + 40.0 * uActive) * uPointScale;
    vT = 0.7;
    vBright = 0.5 + 0.5 * uActive;
    vHalo = 1.0;
  } else {
    float d = distance(aPos, uCursor);
    float near = smoothstep(0.32, 0.0, d);
    float twinkle = 0.88 + 0.12 * sin(uTime * 2.2 + aT * 40.0);
    gl_PointSize = (4.5 + aLoud * 20.0) * (1.0 + near * 2.4) * uPointScale;
    vT = clamp(aT + near * 0.22, 0.0, 1.0);
    vBright = (0.16 + aLoud * 0.5 + near * 1.15) * twinkle;
    vHalo = 0.0;
  }
}`;

const FRAG = `#version 300 es
precision highp float;
in float vT;
in float vBright;
in float vHalo;
out vec4 fragColor;
vec3 dreamPalette(float t){
  vec3 deep    = vec3(0.075, 0.045, 0.145);
  vec3 indigo  = vec3(0.388, 0.400, 0.945);
  vec3 violet  = vec3(0.545, 0.361, 0.965);
  vec3 magenta = vec3(0.690, 0.263, 0.878);
  vec3 light   = vec3(0.867, 0.839, 0.996);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float r = length(pc);
  float a;
  if (vHalo > 0.5) {
    a = smoothstep(0.5, 0.0, r) * 0.22;
  } else {
    a = smoothstep(0.5, 0.0, r);
    a = pow(a, 1.5);
  }
  vec3 col = dreamPalette(vT) * vBright;
  fragColor = vec4(col * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

export class PointCloudRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private prog: WebGLProgram;
  private cloudVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private tBuf: WebGLBuffer;
  private loudBuf: WebGLBuffer;
  private haloVao: WebGLVertexArrayObject;
  private haloPosBuf: WebGLBuffer;
  private n = 0;
  private dpr = 1;
  private fitX = 1;
  private fitY = 1;
  private u: Record<string, WebGLUniformLocation | null> = {};

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, prog: WebGLProgram) {
    this.gl = gl;
    this.canvas = canvas;
    this.prog = prog;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (const name of [
      "uCursor",
      "uFit",
      "uPointScale",
      "uTime",
      "uIsHalo",
      "uActive",
    ]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    // Cloud VAO (per-grain attributes filled by setCorpus).
    this.cloudVao = gl.createVertexArray()!;
    this.posBuf = gl.createBuffer()!;
    this.tBuf = gl.createBuffer()!;
    this.loudBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.cloudVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.loudBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    // Halo VAO — a single point whose position tracks the cursor.
    this.haloVao = gl.createVertexArray()!;
    this.haloPosBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.haloVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.haloPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0]), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.vertexAttrib1f(1, 0.7);
    gl.vertexAttrib1f(2, 1.0);

    gl.bindVertexArray(null);

    gl.clearColor(0, 0, 0, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }

  static create(canvas: HTMLCanvasElement): PointCloudRenderer | null {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) return null;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return new PointCloudRenderer(gl, canvas, prog);
  }

  setCorpus(positions: Float32Array, colorT: Float32Array, loud: Float32Array, n: number): void {
    const gl = this.gl;
    this.n = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colorT, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.loudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, loud, gl.STATIC_DRAW);
  }

  resize(): void {
    const gl = this.gl;
    const w = Math.floor(this.canvas.clientWidth * this.dpr);
    const h = Math.floor(this.canvas.clientHeight * this.dpr);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Fit the atlas into a centred square so it is never stretched.
    const cw = this.canvas.width || 1;
    const ch = this.canvas.height || 1;
    if (cw > ch) {
      this.fitX = (ch / cw) * 0.92;
      this.fitY = 0.92;
    } else {
      this.fitX = 0.92;
      this.fitY = (cw / ch) * 0.92;
    }
  }

  /** Convert a screen pixel (relative to the canvas rect) to atlas coords. */
  screenToAtlas(px: number, py: number, rect: DOMRect): [number, number] {
    const clipX = (px / rect.width) * 2 - 1;
    const clipY = -((py / rect.height) * 2 - 1);
    return [clipX / this.fitX, clipY / this.fitY];
  }

  render(cursorX: number, cursorY: number, active: number, timeSec: number): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.n === 0) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uFit, this.fitX, this.fitY);
    gl.uniform1f(this.u.uPointScale, this.dpr);
    gl.uniform1f(this.u.uTime, timeSec);
    gl.uniform2f(this.u.uCursor, cursorX, cursorY);
    gl.uniform1f(this.u.uActive, active);

    // Cloud.
    gl.uniform1f(this.u.uIsHalo, 0);
    gl.bindVertexArray(this.cloudVao);
    gl.drawArrays(gl.POINTS, 0, this.n);

    // Cursor halo.
    gl.uniform1f(this.u.uIsHalo, 1);
    gl.bindVertexArray(this.haloVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.haloPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([cursorX, cursorY]), gl.DYNAMIC_DRAW);
    gl.vertexAttrib1f(1, 0.7);
    gl.vertexAttrib1f(2, 1.0);
    gl.drawArrays(gl.POINTS, 0, 1);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
