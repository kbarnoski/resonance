// render.ts — draws the mass-spring lattice. Prefers WebGL2 (additive point +
// line glow); falls back to Canvas2D when WebGL2 is unavailable. Colour encodes
// state: cool violet crystal ordered on the grid; warm liquid-ember where the
// lattice has melted and slumped. Strain adds bloom. Luminance drifts slowly —
// no strobe or flicker (photosensitive-safe).

import type { Lattice } from "./physics";

export type Renderer = {
  resize: (w: number, h: number, dpr: number) => void;
  draw: (L: Lattice, t: number, avgMelt: number) => void;
  dispose: () => void;
};

// physics coords span ±aspect*0.8 (x) / ±0.8 (y). Map to clip ±0.9.
const VIEW = 1.125;

// crystal (cool) and molten (warm) endpoint colours, in linear-ish rgb.
function nodeColor(melt: number, strain: number, out: [number, number, number]) {
  const cr = 0.42;
  const cg = 0.6;
  const cb = 1.0; // violet-cyan crystal
  const mr = 1.0;
  const mg = 0.42;
  const mb = 0.72; // magenta ember
  const glow = 0.35 + Math.min(1.4, strain * 0.9);
  out[0] = (cr * (1 - melt) + mr * melt) * glow;
  out[1] = (cg * (1 - melt) + mg * melt) * glow;
  out[2] = (cb * (1 - melt) + mb * melt) * glow;
}

const VERT = `#version 300 es
in vec2 a_pos;
in vec3 a_col;
in float a_size;
uniform vec2 u_scale;
uniform float u_lum;
out vec3 v_col;
void main() {
  gl_Position = vec4(a_pos * u_scale, 0.0, 1.0);
  gl_PointSize = a_size;
  v_col = a_col * u_lum;
}`;

const FRAG_POINT = `#version 300 es
precision mediump float;
in vec3 v_col;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  o = vec4(v_col * a, 1.0);
}`;

const FRAG_LINE = `#version 300 es
precision mediump float;
in vec3 v_col;
out vec4 o;
void main() { o = vec4(v_col, 1.0); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

function makeProgram(gl: WebGL2RenderingContext, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  return p;
}

export function createGlRenderer(
  canvas: HTMLCanvasElement,
): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const pointProg = makeProgram(gl, FRAG_POINT);
  const lineProg = makeProgram(gl, FRAG_LINE);

  const vbo = gl.createBuffer()!;
  const lbo = gl.createBuffer()!;
  let pointData = new Float32Array(0);
  let lineData = new Float32Array(0);
  let dpr = 1;
  let aspect = 1;

  const bindAttribs = (prog: WebGLProgram) => {
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    const colLoc = gl.getAttribLocation(prog, "a_col");
    const sizeLoc = gl.getAttribLocation(prog, "a_size");
    const stride = 6 * 4;
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, stride, 2 * 4);
    if (sizeLoc >= 0) {
      gl.enableVertexAttribArray(sizeLoc);
      gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, stride, 5 * 4);
    }
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive glow

  const col: [number, number, number] = [0, 0, 0];

  const resize = (w: number, h: number, d: number) => {
    dpr = d;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    aspect = w / h;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const draw = (L: Lattice, t: number, avgMelt: number) => {
    const { px, py, melt, strain, springs, count } = L;
    if (pointData.length !== count * 6) pointData = new Float32Array(count * 6);
    const lineVerts = springs.length * 2;
    if (lineData.length !== lineVerts * 6)
      lineData = new Float32Array(lineVerts * 6);

    // nodes
    for (let i = 0; i < count; i++) {
      nodeColor(melt[i], strain[i], col);
      const o = i * 6;
      pointData[o] = px[i];
      pointData[o + 1] = py[i];
      pointData[o + 2] = col[0];
      pointData[o + 3] = col[1];
      pointData[o + 4] = col[2];
      const sz = (3.5 + melt[i] * 9 + Math.min(6, strain[i] * 5)) * dpr;
      pointData[o + 5] = sz;
    }

    // springs (dim, averaged colour of endpoints)
    for (let s = 0; s < springs.length; s++) {
      const sp = springs[s];
      const a = sp.a;
      const b = sp.b;
      const mm = (melt[a] + melt[b]) * 0.5;
      const ss = (strain[a] + strain[b]) * 0.5;
      nodeColor(mm, ss, col);
      const dim = 0.22 + 0.18 * mm;
      const base = s * 12;
      // vertex a
      lineData[base] = px[a];
      lineData[base + 1] = py[a];
      lineData[base + 2] = col[0] * dim;
      lineData[base + 3] = col[1] * dim;
      lineData[base + 4] = col[2] * dim;
      lineData[base + 5] = 0;
      // vertex b
      lineData[base + 6] = px[b];
      lineData[base + 7] = py[b];
      lineData[base + 8] = col[0] * dim;
      lineData[base + 9] = col[1] * dim;
      lineData[base + 10] = col[2] * dim;
      lineData[base + 11] = 0;
    }

    // very slow luminance drift (safe, no flicker) + tiny lift as it melts
    const lum = 0.9 + 0.08 * Math.sin(t * 0.0004) + 0.12 * avgMelt;
    const scale: [number, number] = [VIEW / aspect, VIEW];

    gl.clearColor(0.015, 0.017, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // lines
    gl.useProgram(lineProg);
    gl.uniform2f(gl.getUniformLocation(lineProg, "u_scale"), scale[0], scale[1]);
    gl.uniform1f(gl.getUniformLocation(lineProg, "u_lum"), lum);
    gl.bindBuffer(gl.ARRAY_BUFFER, lbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
    bindAttribs(lineProg);
    gl.drawArrays(gl.LINES, 0, lineVerts);

    // points
    gl.useProgram(pointProg);
    gl.uniform2f(
      gl.getUniformLocation(pointProg, "u_scale"),
      scale[0],
      scale[1],
    );
    gl.uniform1f(gl.getUniformLocation(pointProg, "u_lum"), lum);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.DYNAMIC_DRAW);
    bindAttribs(pointProg);
    gl.drawArrays(gl.POINTS, 0, count);
  };

  const dispose = () => {
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(lbo);
    gl.deleteProgram(pointProg);
    gl.deleteProgram(lineProg);
  };

  return { resize, draw, dispose };
}

export function createCanvas2dRenderer(
  canvas: HTMLCanvasElement,
): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let dpr = 1;
  let w = 1;
  let h = 1;
  const col: [number, number, number] = [0, 0, 0];

  const resize = (cw: number, ch: number, d: number) => {
    dpr = d;
    w = cw;
    h = ch;
    canvas.width = Math.max(1, Math.floor(cw * dpr));
    canvas.height = Math.max(1, Math.floor(ch * dpr));
  };

  // physics coord -> screen px
  const toScreen = (x: number, y: number, aspect: number) => {
    const sx = (x * (VIEW / aspect)) * 0.5 + 0.5;
    const sy = 0.5 - y * VIEW * 0.5;
    return [sx * w, sy * h] as const;
  };

  const draw = (L: Lattice, t: number, avgMelt: number) => {
    const aspect = w / h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const lum = 0.9 + 0.08 * Math.sin(t * 0.0004) + 0.12 * avgMelt;
    const { px, py, melt, strain, springs, count } = L;

    // springs
    ctx.lineWidth = 1;
    for (let s = 0; s < springs.length; s++) {
      const sp = springs[s];
      const a = sp.a;
      const b = sp.b;
      const mm = (melt[a] + melt[b]) * 0.5;
      const ss = (strain[a] + strain[b]) * 0.5;
      nodeColor(mm, ss, col);
      const dim = (0.22 + 0.18 * mm) * lum;
      const [x1, y1] = toScreen(px[a], py[a], aspect);
      const [x2, y2] = toScreen(px[b], py[b], aspect);
      ctx.strokeStyle = `rgb(${(col[0] * dim * 255) | 0},${(col[1] * dim * 255) | 0},${(col[2] * dim * 255) | 0})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // nodes
    for (let i = 0; i < count; i++) {
      nodeColor(melt[i], strain[i], col);
      const [x, y] = toScreen(px[i], py[i], aspect);
      const sz = 1.6 + melt[i] * 4 + Math.min(3, strain[i] * 3);
      ctx.fillStyle = `rgb(${Math.min(255, (col[0] * lum * 255) | 0)},${Math.min(255, (col[1] * lum * 255) | 0)},${Math.min(255, (col[2] * lum * 255) | 0)})`;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const dispose = () => {};
  return { resize, draw, dispose };
}
