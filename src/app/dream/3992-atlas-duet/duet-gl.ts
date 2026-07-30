// ════════════════════════════════════════════════════════════════════════════
// ATLAS·DUET (3992) — WebGL2 GPU point-cloud renderer for a two-voice duet.
//
// Deepened from 3608-atlas' single-cursor renderer. The corpus is drawn as
// thousands of glowing additive point sprites via raw WebGL2 gl.POINTS; each is
// coloured by descriptor on the violet ramp, and grains near the HUMAN cursor
// swell and brighten. On top of the cloud the duet is drawn:
//   • HUMAN — a bright violet halo (you).
//   • AGENT — a softer violet bead with a short fading trailing tail (the
//     self-listening machine partner).
//   • A faint connecting line between the two cursors that brightens with
//     harmonic CONSONANCE, so you SEE the moment the two voices agree.
//
// "Map as score" surface — TENOR 2023, "Maps as Scores: Timbre-Space
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
uniform float uMode;       // 0 cloud · 1 human halo · 2 agent bead · 3 agent tail · 4 line
uniform float uActive;
uniform float uPresence;
uniform float uConsonance;
uniform float uTailCount;
out float vT;
out float vBright;
out float vShape;
out float vAlpha;
void main(){
  vec2 p = aPos * uFit;
  gl_Position = vec4(p, 0.0, 1.0);
  vShape = uMode;
  vAlpha = 1.0;
  if (uMode < 0.5) {
    // Corpus cloud — grains near the human cursor swell + brighten.
    float d = distance(aPos, uCursor);
    float near = smoothstep(0.32, 0.0, d);
    float twinkle = 0.88 + 0.12 * sin(uTime * 2.2 + aT * 40.0);
    gl_PointSize = (4.5 + aLoud * 20.0) * (1.0 + near * 2.4) * uPointScale;
    vT = clamp(aT + near * 0.22, 0.0, 1.0);
    vBright = (0.16 + aLoud * 0.5 + near * 1.15) * twinkle;
  } else if (uMode < 1.5) {
    // Human halo.
    gl_PointSize = (90.0 + 44.0 * uActive) * uPointScale;
    vT = 0.66;
    vBright = 0.55 + 0.55 * uActive;
  } else if (uMode < 2.5) {
    // Agent bead — smaller, softer, warmer violet; fades with presence.
    gl_PointSize = (34.0 + 26.0 * uActive) * uPointScale;
    vT = 0.86;
    vBright = 0.40 + 0.55 * uActive;
    vAlpha = 0.25 + 0.75 * uPresence;
  } else if (uMode < 3.5) {
    // Agent trailing tail — newer samples brighter + bigger (gl_VertexID age).
    float age = (float(gl_VertexID) + 1.0) / max(1.0, uTailCount);
    gl_PointSize = (5.0 + 16.0 * age) * uPointScale;
    vT = 0.82;
    vBright = 0.12 + 0.5 * age;
    vAlpha = age * (0.25 + 0.75 * uPresence);
  } else {
    // Connecting line — brightness rides harmonic consonance.
    gl_PointSize = 1.0;
    vT = 0.55 + 0.35 * uConsonance;
    vBright = 0.5 + 0.9 * uConsonance;
    vAlpha = 0.10 + 0.65 * uConsonance;
  }
}`;

const FRAG = `#version 300 es
precision highp float;
in float vT;
in float vBright;
in float vShape;
in float vAlpha;
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
  float a;
  if (vShape > 3.5) {
    // Line — no point sprite; flat alpha from consonance.
    a = vAlpha;
  } else {
    vec2 pc = gl_PointCoord - 0.5;
    float r = length(pc);
    if (vShape > 2.5) {
      a = pow(smoothstep(0.5, 0.0, r), 1.5) * vAlpha; // tail
    } else if (vShape > 1.5) {
      a = pow(smoothstep(0.5, 0.0, r), 1.3) * vAlpha; // agent bead
    } else if (vShape > 0.5) {
      a = smoothstep(0.5, 0.0, r) * 0.24 * vAlpha;    // human halo
    } else {
      a = pow(smoothstep(0.5, 0.0, r), 1.5);          // cloud grain
    }
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

export interface DuetFrame {
  human: [number, number];
  humanActive: number;
  agent: [number, number];
  agentActive: number;
  /** Interleaved [x,y,…] agent trail, oldest → newest. */
  tail: Float32Array;
  tailCount: number;
  /** 0..1 harmonic agreement between the two voices → line brightness. */
  consonance: number;
  /** 0..1 agent presence → agent bead + tail visibility. */
  presence: number;
  timeSec: number;
}

export class DuetRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private prog: WebGLProgram;
  private cloudVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private tBuf: WebGLBuffer;
  private loudBuf: WebGLBuffer;
  private dynVao: WebGLVertexArrayObject;
  private dynPosBuf: WebGLBuffer;
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
      "uMode",
      "uActive",
      "uPresence",
      "uConsonance",
      "uTailCount",
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

    // Dynamic VAO — reused for halo, bead, tail, and the connecting line. Only
    // position is per-vertex; t/loud are supplied as constant attributes.
    this.dynVao = gl.createVertexArray()!;
    this.dynPosBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.dynVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynPosBuf);
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

  static create(canvas: HTMLCanvasElement): DuetRenderer | null {
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
    return new DuetRenderer(gl, canvas, prog);
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

  private uploadDyn(data: Float32Array): void {
    const gl = this.gl;
    gl.bindVertexArray(this.dynVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.vertexAttrib1f(1, 0.7);
    gl.vertexAttrib1f(2, 1.0);
  }

  render(f: DuetFrame): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.n === 0) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uFit, this.fitX, this.fitY);
    gl.uniform1f(this.u.uPointScale, this.dpr);
    gl.uniform1f(this.u.uTime, f.timeSec);
    gl.uniform2f(this.u.uCursor, f.human[0], f.human[1]);
    gl.uniform1f(this.u.uPresence, f.presence);
    gl.uniform1f(this.u.uConsonance, f.consonance);
    gl.uniform1f(this.u.uTailCount, Math.max(1, f.tailCount));

    // Corpus cloud (highlighted around the human cursor).
    gl.uniform1f(this.u.uMode, 0);
    gl.uniform1f(this.u.uActive, f.humanActive);
    gl.bindVertexArray(this.cloudVao);
    gl.drawArrays(gl.POINTS, 0, this.n);

    // Connecting consonance line between the two cursors.
    gl.uniform1f(this.u.uMode, 4);
    this.uploadDyn(new Float32Array([f.human[0], f.human[1], f.agent[0], f.agent[1]]));
    gl.drawArrays(gl.LINES, 0, 2);

    // Agent trailing tail.
    if (f.tailCount > 0) {
      gl.uniform1f(this.u.uMode, 3);
      this.uploadDyn(f.tail.subarray(0, f.tailCount * 2));
      gl.drawArrays(gl.POINTS, 0, f.tailCount);
    }

    // Agent bead.
    gl.uniform1f(this.u.uMode, 2);
    gl.uniform1f(this.u.uActive, f.agentActive);
    this.uploadDyn(new Float32Array([f.agent[0], f.agent[1]]));
    gl.drawArrays(gl.POINTS, 0, 1);

    // Human halo (drawn last — brightest, on top).
    gl.uniform1f(this.u.uMode, 1);
    gl.uniform1f(this.u.uActive, f.humanActive);
    this.uploadDyn(new Float32Array([f.human[0], f.human[1]]));
    gl.drawArrays(gl.POINTS, 0, 1);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
