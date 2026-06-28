// render.ts — WebGL2 visualiser for the FM aurora, with a Canvas2D fallback.
//
// Draws two things on near-black: (1) a luminous spectral ridge from the
// AnalyserNode's frequency data — bars that bloom into more sidebands as the
// modulation index rises; (2) the operator-algorithm graph as glowing
// orbiting nodes with pulsing modulation links. DX7-chrome palette:
// cyan/magenta/white-hot.

import type { Algorithm } from "./fm";

export interface RenderState {
  /** Linearised spectrum magnitudes in [0,1], low → high frequency. */
  spectrum: Float32Array;
  /** Current algorithm being voiced. */
  algorithm: Algorithm;
  /** Normalised modulation index [0,1]. */
  index: number;
  /** Normalised ratio axis [0,1]. */
  ratio: number;
  /** Snapped musical ratio value (for the label glow). */
  ratioValue: number;
  /** Monotonic time in seconds. */
  time: number;
}

export interface Renderer {
  draw(state: RenderState): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
  readonly mode: "webgl2" | "canvas2d";
}

/* ── WebGL2 background (chrome aurora wash driven by index/ratio) ─────── */

const VERT = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  u_res;
uniform float u_time;
uniform float u_index;   // 0..1 modulation index
uniform float u_ratio;   // 0..1 ratio axis
uniform float u_centroid;// 0..1 brightness

// cheap value noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p  = uv - 0.5;
  p.x *= u_res.x / u_res.y;

  // vertical aurora curtains that flow upward; density grows with index
  float t = u_time * 0.18;
  float bands = 0.0;
  for (float i = 0.0; i < 4.0; i++){
    float sp = 1.5 + i * (1.0 + u_index * 3.0);
    float n  = noise(vec2(p.x * sp + i * 7.3, p.y * 1.2 - t * (1.0 + i*0.4)));
    float curtain = smoothstep(0.45, 0.95, n) * (0.5 / (i + 1.0));
    bands += curtain;
  }
  bands *= (0.25 + u_index * 0.9);

  // chrome palette: cyan low, magenta high, white-hot peaks
  vec3 cyan    = vec3(0.20, 0.85, 1.0);
  vec3 magenta = vec3(1.0, 0.25, 0.85);
  vec3 col = mix(cyan, magenta, clamp(u_ratio * 0.7 + u_centroid * 0.5, 0.0, 1.0));
  col += vec3(1.0) * pow(bands, 2.0) * 0.8;       // white-hot crests
  col *= bands;

  // subtle vignette toward near-black
  float vig = smoothstep(1.3, 0.2, length(p));
  col *= 0.85 + 0.15 * vig;
  col += vec3(0.02, 0.03, 0.06);                  // cold base glow

  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

/** Try to build a WebGL2 renderer; returns null if WebGL2 is unavailable. */
export function makeWebGLRenderer(
  glCanvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
): Renderer | null {
  const gl = glCanvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  const ctx = overlay.getContext("2d");
  if (!ctx) return null;

  let prog: WebGLProgram;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  } catch {
    return null;
  }

  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, "u_res"),
    time: gl.getUniformLocation(prog, "u_time"),
    index: gl.getUniformLocation(prog, "u_index"),
    ratio: gl.getUniformLocation(prog, "u_ratio"),
    centroid: gl.getUniformLocation(prog, "u_centroid"),
  };

  let cssW = glCanvas.width;
  let cssH = glCanvas.height;

  return {
    mode: "webgl2",
    resize(w, h, dpr) {
      cssW = w;
      cssH = h;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      glCanvas.width = pw;
      glCanvas.height = ph;
      overlay.width = pw;
      overlay.height = ph;
      gl.viewport(0, 0, pw, ph);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    draw(state) {
      // 1) WebGL aurora wash
      gl.useProgram(prog);
      gl.uniform2f(u.res, glCanvas.width, glCanvas.height);
      gl.uniform1f(u.time, state.time);
      gl.uniform1f(u.index, state.index);
      gl.uniform1f(u.ratio, state.ratio);
      gl.uniform1f(u.centroid, brightness(state.spectrum));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2) Canvas2D overlay: spectral ridge + operator graph
      ctx.clearRect(0, 0, cssW, cssH);
      drawSpectrum(ctx, cssW, cssH, state);
      drawGraph(ctx, cssW, cssH, state);
    },
    dispose() {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}

/* ── Canvas2D fallback (single canvas, no WebGL) ─────────────────────── */

export function makeCanvas2DRenderer(
  canvas: HTMLCanvasElement,
): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let cssW = canvas.width;
  let cssH = canvas.height;

  return {
    mode: "canvas2d",
    resize(w, h, dpr) {
      cssW = w;
      cssH = h;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    draw(state) {
      // dark wash with a faint chrome tint
      const g = ctx.createLinearGradient(0, 0, 0, cssH);
      g.addColorStop(0, "#05070d");
      g.addColorStop(1, "#02030a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
      drawSpectrum(ctx, cssW, cssH, state);
      drawGraph(ctx, cssW, cssH, state);
    },
    dispose() {},
  };
}

/* ── shared 2D drawing routines ──────────────────────────────────────── */

function brightness(spectrum: Float32Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < spectrum.length; i++) {
    num += i * spectrum[i];
    den += spectrum[i];
  }
  return den > 0 ? num / den / spectrum.length : 0;
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: RenderState,
) {
  const spec = state.spectrum;
  const n = spec.length;
  if (n === 0) return;
  const baseY = h * 0.92;
  const maxH = h * 0.6;
  const barW = w / n;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const v = spec[i];
    if (v <= 0.002) continue;
    const x = i * barW;
    const bh = Math.pow(v, 0.85) * maxH;
    // hue ramps cyan → magenta across the band; higher partials hotter
    const t = i / n;
    const r = Math.round(60 + t * 195 + v * 60);
    const gr = Math.round(220 - t * 140 + v * 30);
    const b = Math.round(255 - t * 40);
    const a = 0.35 + v * 0.55;
    ctx.fillStyle = `rgba(${r},${Math.min(255, gr)},${b},${a})`;
    ctx.fillRect(x, baseY - bh, Math.max(1, barW * 0.8), bh);
    // white-hot cap
    if (v > 0.4) {
      ctx.fillStyle = `rgba(255,255,255,${(v - 0.4) * 0.9})`;
      ctx.fillRect(x, baseY - bh, Math.max(1, barW * 0.8), 2);
    }
  }
  // luminous ridge line tracing the partial tops
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = i * barW + barW * 0.4;
    const bh = Math.pow(spec[i], 0.85) * maxH;
    const y = baseY - bh;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "rgba(180,240,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(120,220,255,0.9)";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: RenderState,
) {
  const algo = state.algorithm;
  const cx = w * 0.5;
  const cy = h * 0.32;
  const radius = Math.min(w, h) * 0.16;
  const opCount = algo.operators;

  // position operators on a ring, slowly orbiting
  const nodes: { x: number; y: number; carrier: boolean }[] = [];
  for (let i = 0; i < opCount; i++) {
    const ang = (i / opCount) * Math.PI * 2 + state.time * 0.25;
    nodes.push({
      x: cx + Math.cos(ang) * radius,
      y: cy + Math.sin(ang) * radius * 0.7,
      carrier: algo.carriers.includes(i),
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // modulation links, pulsing with the modulation index
  for (const [from, to] of algo.links) {
    const a = nodes[from];
    const b = nodes[to];
    if (!a || !b) continue;
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(state.time * 2.4 + from));
    const strength = 0.3 + state.index * 0.7;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(255,120,230,${0.25 + pulse * strength * 0.6})`;
    ctx.lineWidth = 1 + strength * 2.5;
    ctx.shadowColor = "rgba(255,90,220,0.8)";
    ctx.shadowBlur = 10 * strength;
    ctx.stroke();
  }

  // operator nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3 + i);
    const rad = node.carrier ? 11 : 8;
    const grad = ctx.createRadialGradient(
      node.x,
      node.y,
      0,
      node.x,
      node.y,
      rad * 2.2,
    );
    if (node.carrier) {
      grad.addColorStop(0, `rgba(255,255,255,${0.9 * pulse})`);
      grad.addColorStop(0.4, "rgba(120,230,255,0.7)");
      grad.addColorStop(1, "rgba(40,120,200,0)");
    } else {
      grad.addColorStop(0, `rgba(255,180,255,${0.85 * pulse})`);
      grad.addColorStop(0.5, "rgba(220,90,230,0.5)");
      grad.addColorStop(1, "rgba(120,40,160,0)");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(node.x, node.y, rad * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // routing label
  ctx.save();
  ctx.font =
    "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(220,235,255,0.9)";
  ctx.textAlign = "center";
  ctx.fillText(
    `${algo.name}  ·  ${algo.routing}`,
    cx,
    cy + radius * 0.7 + 26,
  );
  ctx.fillStyle = "rgba(180,210,255,0.7)";
  ctx.fillText(
    `index ${(state.index * 12).toFixed(1)}   ratio ${state.ratioValue}:1`,
    cx,
    cy + radius * 0.7 + 44,
  );
  ctx.restore();
}
