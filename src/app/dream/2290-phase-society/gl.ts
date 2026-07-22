// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — raw WebGL2 renderer for the phase society. Ryoji Ikeda *datamatics*
// register: near-black plate, thin grey precision grid, monochrome phase-dots,
// exactly ONE restrained accent (a muted red) marking the rival community.
//
// The hero view is the classic Kuramoto phase circle: every oscillator is a dot
// at its phase angle. Community A rides an inner radius band, community B an outer
// one. Three centroid vectors are drawn from the centre — the length of each IS
// its order parameter r. A thin r(t) timeline scrolls along the bottom.
// ─────────────────────────────────────────────────────────────────────────────

import type { PhaseSociety } from "./kuramoto";

const POINT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColor;
layout(location=2) in float aSize;
uniform vec2 uAspect;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = vec4(aPos * uAspect, 0.0, 1.0);
  gl_PointSize = aSize;
}`;

const POINT_FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 frag;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.32, r);
  frag = vec4(vColor.rgb, vColor.a * a);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColor;
uniform vec2 uAspect;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = vec4(aPos * uAspect, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 frag;
void main() { frag = vColor; }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const p = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program link failed: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

const HIST_LEN = 240;
const RING = 0.86; // world radius the outer band maps to

export class FieldRenderer {
  private gl: WebGL2RenderingContext;
  private pointProg: WebGLProgram;
  private lineProg: WebGLProgram;
  private pointVao: WebGLVertexArrayObject;
  private lineVao: WebGLVertexArrayObject;
  private pointBuf: WebGLBuffer;
  private lineBuf: WebGLBuffer;
  private gridBuf: WebGLBuffer;
  private gridVao: WebGLVertexArrayObject;
  private gridCount: number;
  private uAspectPoint: WebGLUniformLocation;
  private uAspectLine: WebGLUniformLocation;
  private uAspectGrid: WebGLUniformLocation;

  private n: number;
  private pointData: Float32Array; // interleaved x,y,r,g,b,a,size (7 floats)
  private lineData: Float32Array; // interleaved x,y,r,g,b,a (6 floats)
  private hist = new Float32Array(HIST_LEN);
  private histHead = 0;
  private histFill = 0;
  private aspect: [number, number] = [1, 1];
  private dpr = 1;
  private dotSize = 3;

  constructor(canvas: HTMLCanvasElement, society: PhaseSociety) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.n = society.n;

    this.pointProg = link(gl, POINT_VS, POINT_FS);
    this.lineProg = link(gl, LINE_VS, LINE_FS);
    this.uAspectPoint = gl.getUniformLocation(this.pointProg, "uAspect")!;
    this.uAspectLine = gl.getUniformLocation(this.lineProg, "uAspect")!;
    this.uAspectGrid = this.uAspectLine;

    // ── points ──
    this.pointData = new Float32Array(this.n * 7);
    this.pointBuf = gl.createBuffer()!;
    this.pointVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pointData.byteLength, gl.DYNAMIC_DRAW);
    const stride7 = 7 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride7, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride7, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride7, 6 * 4);

    // ── dynamic lines (centroid vectors + r timeline) ──
    const maxLineVerts = 6 + HIST_LEN * 2 + 8;
    this.lineData = new Float32Array(maxLineVerts * 6);
    this.lineBuf = gl.createBuffer()!;
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW);
    const stride6 = 6 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride6, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride6, 2 * 4);

    // ── static precision grid ──
    const grid = this.makeGrid();
    this.gridCount = grid.length / 6;
    this.gridBuf = gl.createBuffer()!;
    this.gridVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.gridVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride6, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride6, 2 * 4);

    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private makeGrid(): Float32Array {
    const verts: number[] = [];
    const gc: [number, number, number, number] = [0.32, 0.34, 0.36, 0.5];
    const push = (x: number, y: number, c = gc) => {
      verts.push(x, y, c[0], c[1], c[2], c[3]);
    };
    // concentric circles
    const rings = [0.3, 0.58, RING];
    for (const rr of rings) {
      const seg = 96;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        push(Math.cos(a0) * rr, Math.sin(a0) * rr);
        push(Math.cos(a1) * rr, Math.sin(a1) * rr);
      }
    }
    // radial ticks every 30°
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const inner = k % 3 === 0 ? 0.0 : 0.8;
      push(Math.cos(a) * inner, Math.sin(a) * inner);
      push(Math.cos(a) * (RING + 0.05), Math.sin(a) * (RING + 0.05));
    }
    // timeline baseline frame at the bottom
    const yb = -0.97;
    const yt = -0.88;
    const fc: [number, number, number, number] = [0.28, 0.3, 0.32, 0.45];
    push(-0.86, yb, fc);
    push(0.86, yb, fc);
    push(-0.86, yt, fc);
    push(0.86, yt, fc);
    const ym = (yb + yt) / 2;
    const mc: [number, number, number, number] = [0.24, 0.26, 0.28, 0.35];
    push(-0.86, ym, mc);
    push(0.86, ym, mc);
    return new Float32Array(verts);
  }

  resize(): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    // keep the ring circular within the plate
    if (w > h) this.aspect = [h / w, 1];
    else this.aspect = [1, w / h];
    const minDim = Math.min(w, h);
    this.dotSize = Math.max(2.2, minDim * 0.007);
  }

  pushHistory(r: number): void {
    this.hist[this.histHead] = r;
    this.histHead = (this.histHead + 1) % HIST_LEN;
    if (this.histFill < HIST_LEN) this.histFill++;
  }

  render(society: PhaseSociety): void {
    const gl = this.gl;
    const ro = society.readout;

    gl.clearColor(0.02, 0.022, 0.025, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ── grid ──
    gl.useProgram(this.lineProg);
    gl.uniform2f(this.uAspectGrid, this.aspect[0], this.aspect[1]);
    gl.bindVertexArray(this.gridVao);
    gl.drawArrays(gl.LINES, 0, this.gridCount);

    // ── phase dots ──
    const pd = this.pointData;
    const theta = society.theta;
    const radius = society.radius;
    const pop = society.pop;
    for (let i = 0; i < this.n; i++) {
      const th = theta[i];
      const rr = radius[i] * RING;
      const x = Math.cos(th) * rr;
      const y = Math.sin(th) * rr;
      const isA = pop[i] === 0;
      // brightness by alignment with the community's own centroid (the pack glows)
      const psi = isA ? ro.psiA : ro.psiB;
      const align = 0.5 + 0.5 * Math.cos(th - psi);
      const b = 0.28 + 0.72 * align;
      const o = i * 7;
      pd[o] = x;
      pd[o + 1] = y;
      if (isA) {
        pd[o + 2] = 0.92 * b;
        pd[o + 3] = 0.94 * b;
        pd[o + 4] = 0.97 * b;
      } else {
        // the single restrained accent — a muted red rival community
        pd[o + 2] = 0.9 * b;
        pd[o + 3] = 0.34 * b;
        pd[o + 4] = 0.3 * b;
      }
      pd[o + 5] = 0.5 + 0.5 * align;
      pd[o + 6] = this.dotSize * (0.85 + 0.5 * align);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pd);
    gl.useProgram(this.pointProg);
    gl.uniform2f(this.uAspectPoint, this.aspect[0], this.aspect[1]);
    gl.bindVertexArray(this.pointVao);
    gl.drawArrays(gl.POINTS, 0, this.n);

    // ── centroid vectors + r timeline ──
    const ld = this.lineData;
    let v = 0;
    const seg = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      c: [number, number, number, number],
    ) => {
      ld[v++] = x0;
      ld[v++] = y0;
      ld[v++] = c[0];
      ld[v++] = c[1];
      ld[v++] = c[2];
      ld[v++] = c[3];
      ld[v++] = x1;
      ld[v++] = y1;
      ld[v++] = c[0];
      ld[v++] = c[1];
      ld[v++] = c[2];
      ld[v++] = c[3];
    };
    // community A centroid (grey)
    seg(0, 0, Math.cos(ro.psiA) * ro.rA * RING, Math.sin(ro.psiA) * ro.rA * RING, [
      0.7, 0.72, 0.75, 0.85,
    ]);
    // community B centroid (accent)
    seg(0, 0, Math.cos(ro.psiB) * ro.rB * RING, Math.sin(ro.psiB) * ro.rB * RING, [
      0.85, 0.34, 0.3, 0.85,
    ]);
    // global order vector (bright white — the master readout)
    seg(
      0,
      0,
      Math.cos(ro.psiGlobal) * ro.rGlobal * RING,
      Math.sin(ro.psiGlobal) * ro.rGlobal * RING,
      [1, 1, 1, 0.95],
    );

    // r(t) timeline along the bottom
    const yb = -0.965;
    const yt = -0.885;
    const x0 = -0.855;
    const x1 = 0.855;
    const span = x1 - x0;
    const count = this.histFill;
    if (count > 1) {
      let prevX = 0;
      let prevY = 0;
      for (let k = 0; k < count; k++) {
        const idx = (this.histHead - count + k + HIST_LEN) % HIST_LEN;
        const val = this.hist[idx];
        const fx = x0 + span * (k / (HIST_LEN - 1));
        const fy = yb + (yt - yb) * val;
        if (k > 0) {
          seg(prevX, prevY, fx, fy, [0.82, 0.84, 0.87, 0.8]);
        }
        prevX = fx;
        prevY = fy;
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ld.subarray(0, v));
    gl.useProgram(this.lineProg);
    gl.uniform2f(this.uAspectLine, this.aspect[0], this.aspect[1]);
    gl.bindVertexArray(this.lineVao);
    gl.drawArrays(gl.LINES, 0, v / 6);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.pointBuf);
    gl.deleteBuffer(this.lineBuf);
    gl.deleteBuffer(this.gridBuf);
    gl.deleteVertexArray(this.pointVao);
    gl.deleteVertexArray(this.lineVao);
    gl.deleteVertexArray(this.gridVao);
    gl.deleteProgram(this.pointProg);
    gl.deleteProgram(this.lineProg);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}
