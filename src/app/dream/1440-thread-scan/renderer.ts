// ─────────────────────────────────────────────────────────────────────────────
// renderer.ts — ThreadRenderer.
//
//   PRIMARY: WebGL2. Three additive layers on a near-black field:
//     1. the painted FIELD, uploaded as an RGBA texture and drawn as a
//        full-screen quad (glowing marks that breathe);
//     2. the whole Hilbert THREAD, a faint continuous LINE_STRIP so you see the
//        weave that unifies the field;
//     3. the reading-HEAD and its comet TRAIL, bright additive glow points — the
//        "little bloom" is the overlap of these soft radial sprites.
//
//   FALLBACK: if a WebGL2 context can't be created, a Canvas2D renderer draws the
//   same three layers so the piece still shows AND still plays. `tier` reports
//   which path is live.
// ─────────────────────────────────────────────────────────────────────────────

import type { HilbertCurve } from "./hilbert";
import type { PaintField } from "./field";

export type Tier = "webgl2" | "canvas2d";

export interface DrawState {
  /** head position, normalised field coords */
  headX: number;
  headY: number;
  /** recent head positions (normalised), newest last — the trail */
  trail: Float32Array; // [x0,y0,x1,y1,…]
  trailLen: number;
  /** slow breathing multiplier (≤3 Hz, soft) */
  breath: number;
  /** overall intensity 0..1 (order/speed melt axis) */
  intensity: number;
}

const FIELD_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FIELD_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_field;
uniform float u_breath;
void main(){
  vec4 c = texture(u_field, vec2(v_uv.x, 1.0 - v_uv.y));
  float b = c.a * u_breath;
  // faint base wash + painted glow
  vec3 col = c.rgb * (0.10 + 1.15 * b);
  // gentle vignette so edges settle into dark
  vec2 d = v_uv - 0.5;
  float vig = 1.0 - dot(d, d) * 0.7;
  o = vec4(col * vig, 1.0);
}`;

// One program for both the thread LINE_STRIP and the glow POINTS.
const LINE_VS = `#version 300 es
in vec2 a_pos;   // clip space
in float a_bri;
uniform float u_size;
out float v_bri;
void main(){
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = u_size;
  v_bri = a_bri;
}`;

const LINE_FS = `#version 300 es
precision highp float;
in float v_bri;
out vec4 o;
uniform vec3 u_color;
uniform int u_point;
void main(){
  if (u_point == 1) {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    float a = smoothstep(0.5, 0.0, r);
    a *= a;
    o = vec4(u_color * v_bri * a, a * v_bri);
  } else {
    o = vec4(u_color * v_bri, v_bri);
  }
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("thread-scan shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
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
    console.error("thread-scan link:", gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

// normalised field coord (0..1, y-down) → clip space (-1..1, y-up)
function toClipX(fx: number): number {
  return fx * 2 - 1;
}
function toClipY(fy: number): number {
  return 1 - fy * 2;
}

export class ThreadRenderer {
  readonly tier: Tier;
  private canvas: HTMLCanvasElement;
  private field: PaintField;

  // GL objects
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private fieldProg: WebGLProgram | null = null;
  private lineProg: WebGLProgram | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private curveBuf: WebGLBuffer | null = null;
  private curveBriBuf: WebGLBuffer | null = null;
  private headBuf: WebGLBuffer | null = null;
  private headBriBuf: WebGLBuffer | null = null;
  private curveCount = 0;
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement, field: PaintField) {
    this.canvas = canvas;
    this.field = field;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (gl) {
      this.gl = gl;
      this.tier = "webgl2";
      this.initGL();
    } else {
      this.ctx2d = canvas.getContext("2d");
      this.tier = "canvas2d";
    }
  }

  private initGL(): void {
    const gl = this.gl!;
    this.fieldProg = link(gl, FIELD_VS, FIELD_FS);
    this.lineProg = link(gl, LINE_VS, LINE_FS);

    // fullscreen quad
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    // field texture
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.curveBuf = gl.createBuffer();
    this.curveBriBuf = gl.createBuffer();
    this.headBuf = gl.createBuffer();
    this.headBriBuf = gl.createBuffer();
  }

  /** Upload a new Hilbert curve (order changed). */
  setCurve(curve: HilbertCurve): void {
    this.curveCount = curve.count;
    if (this.tier !== "webgl2" || !this.gl) return;
    const gl = this.gl;
    const verts = new Float32Array(curve.count * 2);
    const bri = new Float32Array(curve.count);
    const s = curve.side;
    for (let i = 0; i < curve.count; i++) {
      const gx = (curve.xy[i * 2] + 0.5) / s;
      const gy = (curve.xy[i * 2 + 1] + 0.5) / s;
      verts[i * 2] = toClipX(gx);
      verts[i * 2 + 1] = toClipY(gy);
      bri[i] = 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curveBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curveBriBuf);
    gl.bufferData(gl.ARRAY_BUFFER, bri, gl.STATIC_DRAW);
  }

  resize(cw: number, ch: number, dpr: number): void {
    const w = Math.max(1, Math.floor(cw * dpr));
    const h = Math.max(1, Math.floor(ch * dpr));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  private uploadField(): void {
    const gl = this.gl!;
    const data = this.field.buildTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.field.side,
      this.field.side,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  draw(state: DrawState): void {
    if (this.tier === "webgl2") this.drawGL(state);
    else this.draw2D(state);
  }

  private drawGL(state: DrawState): void {
    const gl = this.gl!;
    if (this.field.dirty) this.uploadField();

    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.01, 0.01, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ── layer 1: field (opaque base) ─────────────────────────────────────────
    gl.disable(gl.BLEND);
    gl.useProgram(this.fieldProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    const fpos = gl.getAttribLocation(this.fieldProg!, "a_pos");
    gl.enableVertexAttribArray(fpos);
    gl.vertexAttribPointer(fpos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(gl.getUniformLocation(this.fieldProg!, "u_field"), 0);
    gl.uniform1f(gl.getUniformLocation(this.fieldProg!, "u_breath"), state.breath);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── additive layers ──────────────────────────────────────────────────────
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.lineProg);
    const lp = this.lineProg!;
    const posLoc = gl.getAttribLocation(lp, "a_pos");
    const briLoc = gl.getAttribLocation(lp, "a_bri");
    const uColor = gl.getUniformLocation(lp, "u_color");
    const uSize = gl.getUniformLocation(lp, "u_size");
    const uPoint = gl.getUniformLocation(lp, "u_point");

    // layer 2: the whole thread (faint)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curveBuf);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curveBriBuf);
    gl.enableVertexAttribArray(briLoc);
    gl.vertexAttribPointer(briLoc, 1, gl.FLOAT, false, 0, 0);
    gl.uniform1i(uPoint, 0);
    gl.uniform1f(uSize, 1);
    const threadGlow = 0.06 + 0.14 * state.intensity;
    gl.uniform3f(uColor, 0.34 * threadGlow * 6, 0.28 * threadGlow * 6, 0.7 * threadGlow * 6);
    gl.drawArrays(gl.LINE_STRIP, 0, this.curveCount);

    // layer 3a: comet trail (fading glow points)
    const n = state.trailLen;
    if (n > 0) {
      const verts = new Float32Array(n * 2);
      const bri = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        verts[i * 2] = toClipX(state.trail[i * 2]);
        verts[i * 2 + 1] = toClipY(state.trail[i * 2 + 1]);
        bri[i] = ((i + 1) / n) * 0.55; // older → dimmer
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.headBuf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.headBriBuf);
      gl.bufferData(gl.ARRAY_BUFFER, bri, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(briLoc);
      gl.vertexAttribPointer(briLoc, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1i(uPoint, 1);
      gl.uniform1f(uSize, Math.max(6, this.h * 0.02));
      gl.uniform3f(uColor, 0.8, 0.7, 1.0);
      gl.drawArrays(gl.POINTS, 0, n);
    }

    // layer 3b: the bright reading-head
    const hv = new Float32Array([toClipX(state.headX), toClipY(state.headY)]);
    const hb = new Float32Array([1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.headBuf);
    gl.bufferData(gl.ARRAY_BUFFER, hv, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.headBriBuf);
    gl.bufferData(gl.ARRAY_BUFFER, hb, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(briLoc);
    gl.vertexAttribPointer(briLoc, 1, gl.FLOAT, false, 0, 0);
    gl.uniform1i(uPoint, 1);
    gl.uniform1f(uSize, Math.max(14, this.h * 0.05));
    gl.uniform3f(uColor, 1.0, 0.95, 1.0);
    gl.drawArrays(gl.POINTS, 0, 1);

    gl.disable(gl.BLEND);
  }

  // ── Canvas2D fallback ───────────────────────────────────────────────────────
  private draw2D(state: DrawState): void {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const W = this.w;
    const H = this.h;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#020207";
    ctx.fillRect(0, 0, W, H);

    // field marks (subsample the grid for speed)
    const f = this.field;
    const s = f.side;
    const cell = W / s;
    const cellH = H / s;
    ctx.globalCompositeOperation = "lighter";
    for (let y = 0; y < s; y += 1) {
      for (let x = 0; x < s; x += 1) {
        const b = f.bri[y * s + x] * state.breath;
        if (b < 0.05) continue;
        const hue = f.hue[y * s + x];
        ctx.fillStyle = `hsla(${hue * 300 + 210}, 70%, ${30 + b * 45}%, ${b})`;
        ctx.fillRect(x * cell, y * cellH, cell + 1, cellH + 1);
      }
    }

    // faint thread not traced in 2D (too heavy); draw trail + head
    const n = state.trailLen;
    ctx.strokeStyle = "rgba(180,160,255,0.5)";
    ctx.lineWidth = Math.max(1.5, H * 0.004);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = state.trail[i * 2] * W;
      const py = state.trail[i * 2 + 1] * H;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const hx = state.headX * W;
    const hy = state.headY * H;
    const r = Math.max(8, H * 0.025);
    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(1, "rgba(180,160,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteProgram(this.fieldProg);
    gl.deleteProgram(this.lineProg);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.curveBuf);
    gl.deleteBuffer(this.curveBriBuf);
    gl.deleteBuffer(this.headBuf);
    gl.deleteBuffer(this.headBriBuf);
    gl.deleteTexture(this.tex);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
    this.gl = null;
  }
}
