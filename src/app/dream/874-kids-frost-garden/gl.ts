// gl.ts — raw WebGL2 (GLSL ES 3.00) additive point renderer for the frost
// garden. Two passes of gl.POINTS over a deep-dusk gradient background:
//   1) aggregate tips: soft glow, color by height (indigo -> teal -> gold),
//      with a brief bright flash when freshly stuck.
//   2) free walkers: faint cool sparkles drifting through the field.
// Blending is additive (SRC_ALPHA, ONE) with an exponential falloff in the
// fragment shader. Canvas2D is NOT used; this is the primary render surface.

import { StuckTip, GRID } from "./dla";

const BG_VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv;
void main() {
  vec2 p = verts[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uFill; // 0..1 garden density, lifts the glow floor
out vec4 frag;
void main() {
  // Deep dusk gradient: near-black indigo at top, warmer indigo low.
  vec3 top = vec3(0.012, 0.018, 0.045);
  vec3 bot = vec3(0.030, 0.020, 0.055);
  vec3 col = mix(bot, top, vUv.y);
  // Faint breathing aurora wash that grows with the garden.
  float w = 0.5 + 0.5 * sin(uTime * 0.18 + vUv.x * 2.2);
  col += vec3(0.01, 0.03, 0.04) * w * (0.3 + 0.7 * uFill);
  // Soft vignette.
  vec2 d = vUv - 0.5;
  col *= 1.0 - dot(d, d) * 0.55;
  frag = vec4(col, 1.0);
}`;

const PT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;   // grid coords 0..GRID
layout(location = 1) in float aData;  // packed: height(0..1) + flash + walker
uniform vec2 uRes;
uniform float uGrid;
uniform float uPixelScale;
out float vHeight;
out float vFlash;
out float vKind; // 0 aggregate, 1 walker
void main() {
  // Decode: integer part stores kind*2+flashBucket isn't needed; we pass via
  // separate channels using fract / floor.
  // aData = height + 10.0*flash + 100.0*kind  (height in [0,1), flash in {0,1}, kind in {0,1})
  float kind = floor(aData / 100.0);
  float rem = aData - kind * 100.0;
  float flash = floor(rem / 10.0);
  float height = rem - flash * 10.0;
  vHeight = clamp(height, 0.0, 1.0);
  vFlash = flash;
  vKind = kind;

  vec2 ndc = (aPos / uGrid) * 2.0 - 1.0;
  ndc.y = -ndc.y; // grid y=0 at top of array -> we want bottom; flip
  gl_Position = vec4(ndc, 0.0, 1.0);

  float base = (kind > 0.5) ? 4.0 : 7.0;
  float flashBoost = flash > 0.5 ? 9.0 : 0.0;
  gl_PointSize = (base + flashBoost) * uPixelScale;
}`;

const PT_FRAG = `#version 300 es
precision highp float;
in float vHeight;
in float vFlash;
in float vKind;
out vec4 frag;

vec3 palette(float t) {
  // deep indigo -> teal -> soft gold
  vec3 indigo = vec3(0.20, 0.28, 0.85);
  vec3 teal   = vec3(0.20, 0.85, 0.78);
  vec3 gold   = vec3(1.00, 0.84, 0.45);
  vec3 c = mix(indigo, teal, smoothstep(0.0, 0.55, t));
  c = mix(c, gold, smoothstep(0.55, 1.0, t));
  return c;
}

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Soft exponential falloff.
  float glow = exp(-r2 * 3.2);

  if (vKind > 0.5) {
    // Free walker: faint cool sparkle.
    vec3 c = vec3(0.45, 0.70, 0.95);
    frag = vec4(c * glow * 0.30, glow * 0.30);
    return;
  }

  vec3 c = palette(vHeight);
  float a = glow;
  if (vFlash > 0.5) {
    c = mix(c, vec3(1.0), 0.6);
    a *= 1.8;
  }
  frag = vec4(c * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program create failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

export class FrostRenderer {
  private gl: WebGL2RenderingContext;
  private bgProg: WebGLProgram;
  private ptProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private bgVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private dataBuf: WebGLBuffer;
  private posArr: Float32Array;
  private dataArr: Float32Array;
  private capacity: number;
  private loseExt: WEBGL_lose_context | null;

  private uRes: WebGLUniformLocation | null;
  private uGrid: WebGLUniformLocation | null;
  private uPixelScale: WebGLUniformLocation | null;
  private uTime: WebGLUniformLocation | null;
  private uFill: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext, maxPoints: number) {
    this.gl = gl;
    this.capacity = maxPoints;
    this.posArr = new Float32Array(maxPoints * 2);
    this.dataArr = new Float32Array(maxPoints);

    const bgVs = compile(gl, gl.VERTEX_SHADER, BG_VERT);
    const bgFs = compile(gl, gl.FRAGMENT_SHADER, BG_FRAG);
    this.bgProg = link(gl, bgVs, bgFs);
    gl.deleteShader(bgVs);
    gl.deleteShader(bgFs);

    const vs = compile(gl, gl.VERTEX_SHADER, PT_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, PT_FRAG);
    this.ptProg = link(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.uRes = gl.getUniformLocation(this.ptProg, "uRes");
    this.uGrid = gl.getUniformLocation(this.ptProg, "uGrid");
    this.uPixelScale = gl.getUniformLocation(this.ptProg, "uPixelScale");
    this.uTime = gl.getUniformLocation(this.bgProg, "uTime");
    this.uFill = gl.getUniformLocation(this.bgProg, "uFill");

    const bgVao = gl.createVertexArray();
    if (!bgVao) throw new Error("vao create failed");
    this.bgVao = bgVao;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao create failed");
    this.vao = vao;

    const posBuf = gl.createBuffer();
    const dataBuf = gl.createBuffer();
    if (!posBuf || !dataBuf) throw new Error("buffer create failed");
    this.posBuf = posBuf;
    this.dataBuf = dataBuf;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.posArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.dataBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dataArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.loseExt = gl.getExtension("WEBGL_lose_context");
  }

  resize(w: number, h: number, dpr: number): void {
    const gl = this.gl;
    gl.canvas.width = Math.floor(w * dpr);
    gl.canvas.height = Math.floor(h * dpr);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  // tips: aggregate points. walkers: free drifting points.
  draw(
    tips: StuckTip[],
    walkers: { gx: number; gy: number }[],
    time: number,
    fill: number,
    pixelScale: number,
  ): void {
    const gl = this.gl;

    // Background.
    gl.disable(gl.BLEND);
    gl.useProgram(this.bgProg);
    if (this.uTime) gl.uniform1f(this.uTime, time);
    if (this.uFill) gl.uniform1f(this.uFill, fill);
    gl.bindVertexArray(this.bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Build point buffers. Aggregate first, then walkers, capped to capacity.
    let n = 0;
    const cap = this.capacity;
    // Render a recent window of tips for cost control while keeping fullness.
    const tipStart = Math.max(0, tips.length - (cap - walkers.length));
    for (let i = tipStart; i < tips.length && n < cap; i++) {
      const t = tips[i];
      this.posArr[n * 2] = t.gx;
      this.posArr[n * 2 + 1] = t.gy;
      const height = Math.min(0.999, Math.max(0, 1 - t.ny)); // grid y small = top
      const flash = t.fresh ? 1 : 0;
      this.dataArr[n] = height + 10 * flash + 0; // kind 0
      n++;
    }
    for (let i = 0; i < walkers.length && n < cap; i++) {
      const w = walkers[i];
      this.posArr[n * 2] = w.gx;
      this.posArr[n * 2 + 1] = w.gy;
      this.dataArr[n] = 0 + 100; // kind 1, height 0, flash 0
      n++;
    }

    if (n === 0) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.ptProg);
    if (this.uRes) gl.uniform2f(this.uRes, gl.canvas.width, gl.canvas.height);
    if (this.uGrid) gl.uniform1f(this.uGrid, GRID);
    if (this.uPixelScale) gl.uniform1f(this.uPixelScale, pixelScale);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.posArr.subarray(0, n * 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dataBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dataArr.subarray(0, n));
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.dataBuf);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.bgVao);
    gl.deleteProgram(this.bgProg);
    gl.deleteProgram(this.ptProg);
    if (this.loseExt) this.loseExt.loseContext();
  }
}
