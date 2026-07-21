// render.ts — 2108-remap-field WebGL2 parcellation renderer.
//
// The whole "self-map" is computed per-pixel in a fragment shader. ~40 seed
// points are passed as uniforms (position + precomputed colour). Each pixel:
//
//   * finds its nearest seed = its territory (crisp Voronoi cells);
//   * blends toward a distance-weighted softmin of ALL seeds — the softmin
//     temperature rises as `coherence` falls, so at coherence≈0 every seed
//     contributes ≈equally and the frame homogenises into one plasma field;
//   * darkens a thin border where the nearest two seeds are ~equidistant, but
//     that border fades out entirely as coherence → 0 (the borders melt);
//   * is domain-warped by a couple of animated value-noise octaves so the
//     field breathes and drifts like plasma, more strongly when incoherent.
//
// All luminance changes are slow drifts (coherence is slew-limited upstream,
// the warp/breath run at fractions of a Hz) — no strobe, no fast flashing.
//
// GLSL ES 3.00, fullscreen triangle from gl_VertexID (no vertex buffers), no
// external textures (noise is procedural). Throws if WebGL2 is unavailable.

import type { Seed } from "./arc";
import { SEED_COUNT } from "./arc";

export interface RenderInput {
  seeds: Seed[];
  coherence: number;
  timeSec: number;
}

export interface FieldRenderer {
  render(input: RenderInput): void;
  resize(): void;
  dispose(): void;
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2 uRes;
uniform float uTime;
uniform float uCoherence;
uniform int uCount;
uniform vec2 uPos[${SEED_COUNT}];
uniform vec3 uCol[${SEED_COUNT}];

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float coh = clamp(uCoherence, 0.0, 1.0);

  // Domain warp — plasma breathing, stronger when incoherent.
  float warpAmp = mix(0.11, 0.022, coh);
  float t = uTime * 0.055;
  vec2 w;
  w.x = vnoise(uv * 3.0 + vec2(t, 0.0)) + 0.5 * vnoise(uv * 6.0 - vec2(0.0, t * 1.3));
  w.y = vnoise(uv * 3.0 + vec2(10.0 - t, 5.0)) + 0.5 * vnoise(uv * 6.0 + vec2(t * 1.1, 0.0));
  w -= 0.75;
  p += w * warpAmp * vec2(aspect, 1.0);

  // Softmin temperature: tiny (hard cells) when coherent, large (one field)
  // when not. This single term is the dissolution mechanism.
  float temp = mix(0.006, 0.55, pow(1.0 - coh, 1.3)) + 0.0025;

  float d1 = 1e9;
  float d2 = 1e9;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < ${SEED_COUNT}; i++) {
    if (i >= uCount) break;
    vec2 sp = vec2(uPos[i].x * aspect, uPos[i].y);
    float d = distance(p, sp);
    if (d < d1) { d2 = d1; d1 = d; }
    else if (d < d2) { d2 = d; }
    float wt = exp(-d / temp);
    acc += uCol[i] * wt;
    wsum += wt;
  }
  vec3 col = acc / max(wsum, 1e-5);

  // Thin dark border where the nearest two territories are ~equal — fades to
  // nothing as coherence drops (borders diffuse and dissolve).
  float bw = 0.006;
  float inside = smoothstep(0.0, bw, d2 - d1);
  float border = mix(1.0, inside, coh);
  col *= mix(0.22, 1.0, border);

  // Unify toward one violet plasma at the floor.
  float unify = pow(1.0 - coh, 1.5);
  float breath = 0.5 + 0.5 * sin(uTime * 0.12 + vnoise(uv * 1.5 + t) * 6.2831);
  vec3 plasma = vec3(0.34, 0.17, 0.6) * (0.62 + 0.5 * breath);
  col = mix(col, plasma, unify * 0.6);

  // Gentle glow + vignette. Bounded luminance, no harsh flashing.
  col *= mix(0.85, 1.06, coh * 0.5 + 0.28);
  vec2 cc = uv - 0.5;
  float vig = smoothstep(0.98, 0.32, length(cc));
  col *= mix(0.68, 1.0, vig);

  // Soft filmic-ish tone map keeps highlights from clipping to a flash.
  col = col / (col + vec3(0.6)) * 1.42;
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("Failed to create shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

export function createFieldRenderer(canvas: HTMLCanvasElement): FieldRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) throw new Error("Failed to create program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    throw new Error("Program link error: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uCoherence = gl.getUniformLocation(prog, "uCoherence");
  const uCount = gl.getUniformLocation(prog, "uCount");
  const uPos = gl.getUniformLocation(prog, "uPos");
  const uCol = gl.getUniformLocation(prog, "uCol");

  const posArr = new Float32Array(SEED_COUNT * 2);
  const colArr = new Float32Array(SEED_COUNT * 3);

  let w = 1;
  let h = 1;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const nw = Math.max(2, Math.round(cssW * dpr));
    const nh = Math.max(2, Math.round(cssH * dpr));
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  };
  resize();

  const render = (input: RenderInput) => {
    const { seeds, coherence, timeSec } = input;
    const n = Math.min(seeds.length, SEED_COUNT);
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      posArr[i * 2] = s.x;
      posArr[i * 2 + 1] = s.y;
      colArr[i * 3] = s.r;
      colArr[i * 3 + 1] = s.g;
      colArr[i * 3 + 2] = s.b;
    }

    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, timeSec);
    gl.uniform1f(uCoherence, coherence);
    gl.uniform1i(uCount, n);
    gl.uniform2fv(uPos, posArr);
    gl.uniform3fv(uCol, colArr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    gl.useProgram(null);
    gl.bindVertexArray(null);
    if (vao) gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  };

  return { render, resize, dispose };
}
