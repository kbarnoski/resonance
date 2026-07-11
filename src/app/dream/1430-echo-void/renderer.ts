// ─────────────────────────────────────────────────────────────────────────────
// renderer.ts — the echo-reveal point-cloud renderer.
//
//   PRIMARY: WebGL2 gl.POINTS with additive glow. One static vertex buffer holds
//   every point's position + colour; a per-point BRIGHTNESS attribute is updated
//   each frame — it decays toward darkness, and every active ping's expanding
//   spherical wavefront bumps the brightness of points it is currently crossing
//   (radius ≈ distance-from-listener). The fragment shader draws a soft round
//   glow. At rest the whole cloud sits at a near-invisible floor, so the space is
//   only really seen while an echo passes.
//
//   FALLBACK: if a WebGL2 context can't be had, a Canvas2D "sonar sweep" draws the
//   same projected points with the same wavefront brightness. `tier` reports which
//   path is live so the UI can badge it.
// ─────────────────────────────────────────────────────────────────────────────

import { projectPoint, type Mat4 } from "./camera";
import { SHELL, type Cathedral } from "./geometry";

export type Tier = "webgl2" | "canvas2d";

interface Ping {
  t0: number; // seconds (renderer clock)
}

interface StepOpts {
  vp: Mat4;
  speed: number;
  reduced: boolean;
}

const VERT_SRC = `#version 300 es
in vec3 a_pos;
in vec3 a_col;
in float a_bri;
uniform mat4 u_vp;
uniform float u_scale;
out vec3 v_col;
out float v_bri;
void main() {
  vec4 clip = u_vp * vec4(a_pos, 1.0);
  gl_Position = clip;
  float w = max(clip.w, 0.02);
  float sz = (1.6 + 24.0 * a_bri) * (u_scale / w);
  gl_PointSize = clamp(sz, 1.0, 46.0);
  v_col = a_col;
  v_bri = a_bri;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec3 v_col;
in float v_bri;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  float glow = 0.04 + v_bri;      // faint resting ghost + full reveal
  outColor = vec4(v_col * glow, a * glow);
}`;

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
    console.error("echo-void shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export class EchoRenderer {
  readonly tier: Tier;
  private canvas: HTMLCanvasElement;
  private cath: Cathedral;
  private bri: Float32Array;
  private pings: Ping[] = [];
  private disposed = false;

  // GL state (only when tier === "webgl2")
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private briBuf: WebGLBuffer | null = null;
  private uVp: WebGLUniformLocation | null = null;
  private uScale: WebGLUniformLocation | null = null;

  // Canvas2D state
  private ctx2d: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement, cath: Cathedral) {
    this.canvas = canvas;
    this.cath = cath;
    this.bri = new Float32Array(cath.pointCount);

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (gl && this.initGL(gl)) {
      this.tier = "webgl2";
    } else {
      this.ctx2d = canvas.getContext("2d");
      this.tier = "canvas2d";
    }
  }

  private initGL(gl: WebGL2RenderingContext): boolean {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("echo-void link:", gl.getProgramInfoLog(prog));
      return false;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.cath.positions, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.cath.colors, gl.STATIC_DRAW);
    const aCol = gl.getAttribLocation(prog, "a_col");
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

    this.briBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.briBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.bri, gl.DYNAMIC_DRAW);
    const aBri = gl.getAttribLocation(prog, "a_bri");
    gl.enableVertexAttribArray(aBri);
    gl.vertexAttribPointer(aBri, 1, gl.FLOAT, false, 0, 0);

    this.uVp = gl.getUniformLocation(prog, "u_vp");
    this.uScale = gl.getUniformLocation(prog, "u_scale");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
    gl.disable(gl.DEPTH_TEST);

    this.gl = gl;
    this.program = prog;
    return true;
  }

  /** Emit a ping wavefront at time `nowSec` (renderer clock). */
  ping(nowSec: number): void {
    this.pings.push({ t0: nowSec });
    if (this.pings.length > 8) this.pings.shift();
  }

  /** Match the drawing buffer to the on-screen (CSS) size × dpr. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private stepBrightness(now: number, dt: number, opts: StepOpts): void {
    const { speed, reduced } = opts;
    const bri = this.bri;
    const dists = this.cath.distances;
    const halfLife = reduced ? 1.35 : 0.85;
    const decay = Math.pow(0.5, dt / halfLife);
    for (let i = 0; i < bri.length; i++) bri[i] *= decay;

    // Drop pings whose wavefront has passed the whole space.
    const maxR = this.cath.maxDist + SHELL + 1;
    this.pings = this.pings.filter((p) => speed * (now - p.t0) < maxR);

    for (const p of this.pings) {
      const r = speed * (now - p.t0);
      if (r < 0) continue;
      for (let i = 0; i < bri.length; i++) {
        const dd = Math.abs(dists[i] - r);
        if (dd < SHELL) {
          const d = dists[i];
          // depth attenuation so the far apse still shows but reads distant
          const atten = Math.min(1, 1.25 / (1 + d * 0.028));
          const add = (1 - dd / SHELL) * atten * (reduced ? 0.82 : 1);
          const v = bri[i] + add;
          bri[i] = v > 1 ? 1 : v;
        }
      }
    }
  }

  /** Advance + draw one frame. */
  step(now: number, dt: number, opts: StepOpts): void {
    if (this.disposed) return;
    this.stepBrightness(now, dt, opts);
    if (this.gl && this.program) this.drawGL(opts.vp);
    else this.drawCanvas(opts.vp);
  }

  private drawGL(vp: Mat4): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.briBuf) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.012, 0.012, 0.022, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.briBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.bri);
    gl.uniformMatrix4fv(this.uVp, false, vp);
    gl.uniform1f(this.uScale, h * 0.09);
    gl.drawArrays(gl.POINTS, 0, this.cath.pointCount);
  }

  private drawCanvas(vp: Mat4): void {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "rgb(3,3,6)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const pos = this.cath.positions;
    const col = this.cath.colors;
    const bri = this.bri;
    for (let i = 0; i < bri.length; i++) {
      const b = bri[i];
      if (b < 0.05) continue; // resting cloud stays dark in the fallback
      const pr = projectPoint(
        vp,
        pos[i * 3],
        pos[i * 3 + 1],
        pos[i * 3 + 2],
        w,
        h,
      );
      if (!pr.visible) continue;
      const r = Math.floor(col[i * 3] * 255);
      const g = Math.floor(col[i * 3 + 1] * 255);
      const bl = Math.floor(col[i * 3 + 2] * 255);
      const rad = 1.2 + b * 6;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${bl},${(0.15 + 0.85 * b).toFixed(3)})`;
      ctx.arc(pr.x, pr.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.disposed = true;
    const gl = this.gl;
    if (gl) {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    }
    this.gl = null;
    this.ctx2d = null;
    this.pings = [];
  }
}
