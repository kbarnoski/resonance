// Raw WebGL2 additive point-sprite glow field (no three.js, no libs) with a
// Canvas2D fallback. Warm gold/amber bells over a breathing deep blue-violet
// night. Each ladder bell is a soft radial glow point; a struck bell blooms
// (grows + brightens) then decays. Glow is driven by the audio amplitude
// estimate ONLY — audio is never driven from the visual.

import { LADDER_LEN, LADDER_HEX } from "./audio";

export interface BellFieldRenderer {
  draw: (glow: Float32Array, time: number, lull: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
  kind: "webgl2" | "canvas2d";
}

// Parse "hsl(h s% l%)" -> linear-ish rgb 0..1 for the shader / canvas.
function hslToRgb(hsl: string): [number, number, number] {
  const m = hsl.match(/hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)/);
  if (!m) return [1, 0.8, 0.4];
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [hk(h + 1 / 3), hk(h), hk(h - 1 / 3)];
}

const BELL_RGB: [number, number, number][] = LADDER_HEX.map(hslToRgb);

// Lay the ladder out as a gentle climbing arc across the canvas (0..1 space).
function bellLayout(i: number): { x: number; y: number } {
  const t = i / Math.max(1, LADDER_LEN - 1);
  // Up then visually wraps in a soft S so 2 octaves fit pleasantly.
  const cols = Math.ceil(Math.sqrt(LADDER_LEN) * 1.4);
  const row = Math.floor(i / cols);
  const rows = Math.ceil(LADDER_LEN / cols);
  const colInRow = i % cols;
  const x = 0.12 + (colInRow / Math.max(1, cols - 1)) * 0.76;
  const yBase = rows > 1 ? row / (rows - 1) : 0.5;
  const y = 0.78 - yBase * 0.56 + Math.sin(t * Math.PI * 2) * 0.03;
  return { x, y };
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;     // 0..1 canvas space
layout(location=1) in vec3 a_color;
layout(location=2) in float a_glow;   // 0..1
uniform vec2 u_res;
uniform float u_time;
out vec3 v_color;
out float v_glow;
void main(){
  vec2 p = a_pos;
  float breathe = 0.004 * sin(u_time*0.6 + a_pos.x*8.0);
  p.y += breathe;
  vec2 clip = vec2(p.x*2.0-1.0, 1.0-p.y*2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  float base = 26.0;
  float bloom = a_glow * 120.0;
  float minDim = min(u_res.x, u_res.y);
  gl_PointSize = (base + bloom) * (minDim/720.0);
  v_color = a_color;
  v_glow = a_glow;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_glow;
out vec4 frag;
void main(){
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  // Soft radial falloff, additive glow.
  float a = smoothstep(0.5, 0.0, r);
  a = pow(a, 1.6);
  float bright = 0.25 + v_glow*1.6;
  vec3 col = v_color * bright;
  // Warm white-hot core when struck.
  col += vec3(1.0,0.92,0.7) * v_glow * smoothstep(0.18,0.0,r);
  frag = vec4(col, a);
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

function makeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function makeWebGLRenderer(canvas: HTMLCanvasElement): BellFieldRenderer | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
  if (!gl) return null;

  const prog = makeProgram(gl);
  if (!prog) return null;

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  // uRes / uTime may be null if optimized out — guard at use sites.

  // Static positions + colors, dynamic glow.
  const posArr = new Float32Array(LADDER_LEN * 2);
  const colArr = new Float32Array(LADDER_LEN * 3);
  for (let i = 0; i < LADDER_LEN; i++) {
    const { x, y } = bellLayout(i);
    posArr[i * 2] = x;
    posArr[i * 2 + 1] = y;
    colArr[i * 3] = BELL_RGB[i][0];
    colArr[i * 3 + 1] = BELL_RGB[i][1];
    colArr[i * 3 + 2] = BELL_RGB[i][2];
  }
  const glowArr = new Float32Array(LADDER_LEN);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, posArr, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const colBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, colArr, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const glowBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
  gl.bufferData(gl.ARRAY_BUFFER, glowArr, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive

  let w = canvas.width;
  let h = canvas.height;

  return {
    kind: "webgl2",
    resize(nw: number, nh: number) {
      w = nw;
      h = nh;
      gl.viewport(0, 0, w, h);
    },
    draw(glow: Float32Array, time: number, lull: number) {
      // Breathing deep blue-violet night; dims toward goodnight.
      const nb = 0.04 * (1 - 0.6 * lull) + 0.01 * Math.sin(time * 0.4);
      gl.clearColor(0.04 + nb * 0.2, 0.03, 0.08 + nb, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      glowArr.set(glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowArr);

      gl.useProgram(prog);
      if (uRes) gl.uniform2f(uRes, w, h);
      if (uTime) gl.uniform1f(uTime, time);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, LADDER_LEN);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(colBuf);
      gl.deleteBuffer(glowBuf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
}

// --- Canvas2D fallback: BellField2D ---
export function makeCanvas2DRenderer(canvas: HTMLCanvasElement): BellFieldRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let w = canvas.width;
  let h = canvas.height;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  return {
    kind: "canvas2d",
    resize(nw: number, nh: number) {
      w = nw;
      h = nh;
    },
    draw(glow: Float32Array, time: number, lull: number) {
      const nb = 0.6 * (1 - 0.5 * lull);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = w / dpr;
      const ch = h / dpr;
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, `rgba(14,8,30,1)`);
      g.addColorStop(1, `rgba(${Math.round(10 * nb)},6,${Math.round(26 * nb)},1)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < LADDER_LEN; i++) {
        const { x, y } = bellLayout(i);
        const px = x * cw;
        const py = (y + 0.004 * Math.sin(time * 0.6 + x * 8)) * ch;
        const gv = glow[i];
        const minDim = Math.min(cw, ch);
        const rad = (10 + gv * 60) * (minDim / 720);
        const [r, gg, b] = BELL_RGB[i];
        const bright = 0.25 + gv * 1.4;
        const rg = ctx.createRadialGradient(px, py, 0, px, py, rad);
        rg.addColorStop(0, `rgba(${Math.round(255 * Math.min(1, r * bright + gv))},${Math.round(255 * Math.min(1, gg * bright + gv * 0.9))},${Math.round(255 * Math.min(1, b * bright + gv * 0.7))},0.95)`);
        rg.addColorStop(1, `rgba(${Math.round(255 * r)},${Math.round(255 * gg)},${Math.round(255 * b)},0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
    dispose() {
      /* nothing persistent to free */
    },
  };
}
