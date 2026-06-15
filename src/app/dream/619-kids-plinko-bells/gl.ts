// Renderer for 619-kids-plinko-bells.
// Primary: WebGL2 with raw hand-written GLSL ES 3.00 — instanced marbles +
// glowing pegs + bins. Fallback: Canvas2D drawing the same scene.
//
// All scene data arrives in normalized [0..1] coords; we map to pixels here.

import { BINS, ROWS, LAYOUT, type Marble, type Peg } from "./physics";
import { BIN_HUES } from "./audio";

export interface SceneState {
  marbles: Marble[];
  pegs: Peg[];
  binHeights: number[]; // 0..1 normalized fill per bin
  binFlash: number[]; // 0..1 bloom per bin
  time: number; // seconds
}

export interface Renderer {
  backend: "webgl2" | "canvas2d";
  resize: (w: number, h: number, dpr: number) => void;
  draw: (s: SceneState) => void;
  dispose: () => void;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

// ---------------------------------------------------------------------------
// WebGL2 renderer
// ---------------------------------------------------------------------------

const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;     // unit quad -1..1
layout(location=1) in vec3 aInstance;   // x,y (ndc-ish 0..1), radius(px-frac)
layout(location=2) in vec4 aColor;      // rgb + glow
uniform vec2 uRes;
out vec2 vLocal;
out vec4 vColor;
void main(){
  vLocal = aCorner;
  vColor = aColor;
  // convert normalized scene coord (0..1) to clip space
  vec2 px = vec2(aInstance.x, aInstance.y) * uRes;
  float r = aInstance.z; // radius in px
  vec2 pos = px + aCorner * r;
  vec2 clip = (pos / uRes) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const QUAD_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vColor;
out vec4 frag;
void main(){
  float d = length(vLocal);
  // soft disc with glow halo
  float core = smoothstep(1.0, 0.78, d);
  float halo = smoothstep(1.0, 0.0, d) * 0.5;
  float a = core + halo * vColor.a;
  if (a <= 0.001) discard;
  vec3 col = vColor.rgb * (0.6 + 0.7 * core) + vColor.rgb * halo * vColor.a;
  frag = vec4(col, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

function createGLRenderer(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
): Renderer {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, QUAD_VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, QUAD_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "link failed");
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // unit quad
  const quad = new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]);
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // instance buffers (interleaved: x,y,r, r,g,b,glow) -> 7 floats
  const instBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
  gl.vertexAttribDivisor(2, 1);

  gl.bindVertexArray(null);

  const uRes = gl.getUniformLocation(prog, "uRes");

  let W = canvas.width;
  let H = canvas.height;
  let DPR = 1;

  // bins drawn as quads too; reuse a CPU-side instance array.
  let instData = new Float32Array(0);

  function resize(w: number, h: number, dpr: number) {
    DPR = dpr;
    W = Math.floor(w * dpr);
    H = Math.floor(h * dpr);
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }

  function draw(s: SceneState) {
    gl.clearColor(0.03, 0.035, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow

    const minDim = Math.min(W, H);
    const pegR = minDim * 0.012;
    const marbleR = minDim * 0.018;

    // count instances: pegs + bin segments(BINS, drawn as stacked discs) + marbles
    const binDiscPerBin = 6;
    const total =
      s.pegs.length + s.marbles.length + BINS * binDiscPerBin;
    if (instData.length < total * 7) instData = new Float32Array(total * 7);

    let o = 0;
    const put = (
      x: number,
      y: number,
      r: number,
      cr: number,
      cg: number,
      cb: number,
      glow: number,
    ) => {
      instData[o++] = x;
      instData[o++] = y;
      instData[o++] = r;
      instData[o++] = cr;
      instData[o++] = cg;
      instData[o++] = cb;
      instData[o++] = glow;
    };

    // bins (draw first, behind): stacked colored discs as a "filling" column
    const binW = 1 / BINS;
    for (let b = 0; b < BINS; b++) {
      const [r, g, bl] = hslToRgb(BIN_HUES[b], 0.85, 0.55);
      const cx = (b + 0.5) * binW;
      const fill = s.binHeights[b];
      const flash = s.binFlash[b];
      const top = LAYOUT.BIN_TOP;
      const bottom = 0.98;
      for (let i = 0; i < binDiscPerBin; i++) {
        const t = i / (binDiscPerBin - 1);
        const yy = bottom - t * (bottom - top) * Math.max(0.05, fill);
        const bright = 0.7 + flash * 0.9;
        put(
          cx,
          yy,
          minDim * 0.026,
          r * bright,
          g * bright,
          bl * bright,
          0.5 + flash,
        );
      }
    }

    // pegs
    for (const p of s.pegs) {
      const glow = 0.25 + p.glow * 0.9;
      const c = 0.55 + p.glow * 0.45;
      put(p.x, p.y, pegR * (1 + p.glow * 0.4), 0.6 * c, 0.75 * c, 1.0 * c, glow);
    }

    // marbles
    for (const m of s.marbles) {
      const [r, g, b] = hslToRgb(m.hue, 0.85, 0.6);
      put(m.x, m.y, marbleR, r, g, b, 0.8);
    }

    gl.useProgram(prog);
    gl.uniform2f(uRes, W, H);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instData.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, o / 7);
    gl.bindVertexArray(null);
    void DPR;
  }

  function dispose() {
    gl.deleteProgram(prog);
    gl.deleteBuffer(quadBuf);
    gl.deleteBuffer(instBuf);
    gl.deleteVertexArray(vao);
  }

  return { backend: "webgl2", resize, draw, dispose };
}

// ---------------------------------------------------------------------------
// Canvas2D fallback renderer (same scene)
// ---------------------------------------------------------------------------

function createCanvas2DRenderer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Renderer {
  let W = canvas.width;
  let H = canvas.height;
  let DPR = 1;

  function resize(w: number, h: number, dpr: number) {
    DPR = dpr;
    W = w;
    H = h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(s: SceneState) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#080910";
    ctx.fillRect(0, 0, W, H);

    const minDim = Math.min(W, H);
    const px = (x: number) => x * W;
    const py = (y: number) => y * H;

    // bins
    const binW = 1 / BINS;
    for (let b = 0; b < BINS; b++) {
      const fill = s.binHeights[b];
      const flash = s.binFlash[b];
      const top = LAYOUT.BIN_TOP;
      const bottom = 0.98;
      const h = (bottom - top) * Math.max(0.04, fill);
      const x0 = px(b * binW) + 2;
      const w = px(binW) - 4;
      const y0 = py(bottom - h);
      const light = 50 + flash * 35;
      ctx.fillStyle = `hsl(${BIN_HUES[b]}, 85%, ${light}%)`;
      ctx.shadowColor = `hsl(${BIN_HUES[b]}, 90%, 60%)`;
      ctx.shadowBlur = 12 + flash * 30;
      ctx.fillRect(x0, y0, w, py(bottom) - y0);
    }
    ctx.shadowBlur = 0;

    // pegs
    for (const p of s.pegs) {
      const r = minDim * 0.012 * (1 + p.glow * 0.5);
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
      const g = 0.5 + p.glow * 0.5;
      ctx.fillStyle = `rgba(${Math.floor(150 * g)},${Math.floor(
        190 * g,
      )},255,${0.7 + p.glow * 0.3})`;
      if (p.glow > 0.01) {
        ctx.shadowColor = "rgba(120,170,255,0.9)";
        ctx.shadowBlur = 14 * p.glow;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // marbles
    for (const m of s.marbles) {
      const r = minDim * 0.018;
      ctx.beginPath();
      ctx.arc(px(m.x), py(m.y), r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${m.hue}, 85%, 62%)`;
      ctx.shadowColor = `hsl(${m.hue}, 90%, 65%)`;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    void DPR;
    void ROWS;
  }

  function dispose() {}

  return { backend: "canvas2d", resize, draw, dispose };
}

// ---------------------------------------------------------------------------

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  }) as WebGL2RenderingContext | null;
  if (gl) {
    try {
      return createGLRenderer(canvas, gl);
    } catch {
      // fall through to 2d
    }
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");
  return createCanvas2DRenderer(canvas, ctx);
}
