// gl.ts — WebGL2 log-polar form-constant "melt" renderer for 1300-carrier-bloom,
// with a real Canvas2D fallback. This is the Bressloff–Cowan engine: plane-wave
// stripes / a hex lattice generated in cortical (log r, theta) space, warped back
// to the screen by the inverse exp() map, so ONE shader yields tunnels, spirals
// and honeycombs. Karel's piano FFT drives it every frame; the entropy arc blends
// the form constants over the piece; pointer/tilt perturbs the warp center.
//
// Hand-written GLSL ES 3.00 (no three.js, no CDN). The log-polar math is imported
// read-only from ../_shared/psych/logpolar.ts — the GLSL prelude (LOGPOLAR_GLSL)
// and its JS mirrors (formConstant/honeycomb/screenToCortex) so the Canvas2D
// fallback agrees with the GPU path.

import {
  LOGPOLAR_GLSL,
  formConstant,
  honeycomb as honeycombJs,
  screenToCortex,
} from "../_shared/psych/logpolar";

/** All the per-frame drive the melt needs — shared by both backends. */
export interface MeltParams {
  time: number; // seconds
  bass: number; // 0..1  → global flow + warp amplitude
  mid: number; // 0..1  → stripe frequency k
  high: number; // 0..1  → fine grain + saturation/brightness
  onset: number; // 0..1  (unused directly; folded into bloom)
  bloom: number; // 0..1  decaying center-out pulse from onsets
  wTunnel: number; // form-constant blend weights (sum ~1)
  wSpiral: number;
  wHoney: number;
  entropy: number; // 0..1  relaxed-priors arc
  jitter: number; // symmetry-loosening warp jitter
  flick: number; // SafeFlicker luminance multiplier [floor,1]; 1 = steady
  noiseOct: number; // turbulence octaves (1..4)
  centerX: number; // warp center offset (pointer/tilt), aspect-space
  centerY: number;
}

export interface MeltScene {
  backend: "webgl2" | "canvas2d";
  render(p: MeltParams): void;
  resize(): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fragment: the melt. Everything upstream of the color is the log-polar engine.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform vec2 u_res;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_bloom;
uniform float u_wTunnel;
uniform float u_wSpiral;
uniform float u_wHoney;
uniform float u_entropy;
uniform float u_jitter;
uniform float u_flick;
uniform int u_noiseOct;
uniform vec2 u_center;

${LOGPOLAR_GLSL}

// --- value noise / fbm for domain warp + symmetry loosening ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    if (i >= oct) break;
    sum += amp * vnoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

// DMT neon-iridescent cosine palette (thin-film-ish rainbow on near-black).
vec3 iridescence(float t) {
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318530718 * (c * t + d));
}

void main() {
  // aspect-corrected centered coords, warp center pushed by pointer/tilt.
  vec2 p = v_uv * 2.0 - 1.0;
  p.x *= u_res.x / u_res.y;
  p -= u_center;

  // Domain warp: fbm displacement. bass → amplitude; entropy jitter loosens it.
  float warpAmt = 0.05 + 0.45 * u_bass + 0.35 * u_bloom;
  vec2 warp = vec2(
    fbm(p * 1.7 + u_time * 0.10, u_noiseOct),
    fbm(p * 1.7 - u_time * 0.12 + 5.2, u_noiseOct)
  ) - 0.5;
  p += warp * (warpAmt + u_jitter);

  vec2 cx = screenToCortex(p); // (log r, theta)

  // bass → global inward flow speed; mid → stripe frequency k.
  float flow = u_time * (0.3 + 2.4 * u_bass);
  float k = 6.0 + 20.0 * u_mid + 4.0 * u_entropy;

  // Three form constants, blended by the entropy arc.
  float ft = formConstant(cx, 0.0,          k,        -flow);
  float fs = formConstant(cx, 0.78539816,   k,        -flow * 0.8);
  float fh = honeycomb(cx, k * 0.6, -flow * 0.5);
  float field = ft * u_wTunnel + fs * u_wSpiral + fh * u_wHoney;

  // high → fine grain / turbulence detail.
  field += (u_high * 0.25) * (fbm(p * 8.0 + u_time * 0.5, u_noiseOct) - 0.5);

  float r = length(p);
  // onset bloom: a bright ring expanding center-out.
  float ring = exp(-pow((r - u_bloom * 2.6) * 3.0, 2.0)) * u_bloom;

  // Iridescent color; hue advances with the field, entropy, radius, slow time.
  float hue = field * 0.6 + u_entropy * 0.3 + u_time * 0.03 + r * 0.15;
  vec3 col = iridescence(hue);
  // high → saturation lift (desaturate toward luma at low highs).
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.65 + 0.5 * u_high);

  // Neon on near-black: only the crests of the field light up.
  float lum = smoothstep(0.35, 0.92, field);
  col *= 0.14 + 1.3 * lum;
  col += iridescence(hue + 0.3) * ring * 1.6;

  // Cheap chromatic aberration on the radius, scaled by highs (subtle).
  float ca = 0.02 * u_high;
  col.r *= 1.0 + ca;
  col.b *= 1.0 - ca;

  // Vignette.
  float vig = smoothstep(1.75, 0.2, r);
  col *= 0.4 + 0.6 * vig;

  // SAFETY: smooth luminance drift only. u_flick is SafeFlicker's soft [floor,1]
  // multiplier (steady 1.0 unless opted in; never a hard strobe).
  col *= u_flick;

  // Soft rolloff → no blown-white full-screen flashes (photosensitive-safe).
  col = col / (1.0 + col * 0.6);
  frag = vec4(col, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

/** Build the WebGL2 melt. Throws if WebGL2 is unavailable (caller falls back). */
export function createGlScene(canvas: HTMLCanvasElement): MeltScene {
  const glCtx = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!glCtx) throw new Error("WebGL2 unavailable");
  const gl: WebGL2RenderingContext = glCtx;

  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  const uRes = u("u_res");
  const uTime = u("u_time");
  const uBass = u("u_bass");
  const uMid = u("u_mid");
  const uHigh = u("u_high");
  const uBloom = u("u_bloom");
  const uWT = u("u_wTunnel");
  const uWS = u("u_wSpiral");
  const uWH = u("u_wHoney");
  const uEntropy = u("u_entropy");
  const uJitter = u("u_jitter");
  const uFlick = u("u_flick");
  const uNoiseOct = u("u_noiseOct");
  const uCenter = u("u_center");

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(p: MeltParams): void {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, p.time);
    gl.uniform1f(uBass, p.bass);
    gl.uniform1f(uMid, p.mid);
    gl.uniform1f(uHigh, p.high);
    gl.uniform1f(uBloom, p.bloom);
    gl.uniform1f(uWT, p.wTunnel);
    gl.uniform1f(uWS, p.wSpiral);
    gl.uniform1f(uWH, p.wHoney);
    gl.uniform1f(uEntropy, p.entropy);
    gl.uniform1f(uJitter, p.jitter);
    gl.uniform1f(uFlick, p.flick);
    gl.uniform1i(uNoiseOct, p.noiseOct);
    gl.uniform2f(uCenter, p.centerX, p.centerY);

    gl.clearColor(0.01, 0.012, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteProgram(prog);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
  }

  resize();
  return { backend: "webgl2", render, resize, dispose };
}

// ─── Canvas2D fallback ───────────────────────────────────────────────────────
// Same log-polar engine, computed in JS on a small buffer (mirrors the GLSL via
// the shared JS functions) and scaled up. Coarser, but the identical geometry —
// tunnels/spirals/honeycomb morphing over the entropy arc, warped and pushable.

function iridescenceJs(t: number, out: [number, number, number]): void {
  const TAU = 6.28318530718;
  out[0] = 0.5 + 0.5 * Math.cos(TAU * (t + 0.0));
  out[1] = 0.5 + 0.5 * Math.cos(TAU * (t + 0.33));
  out[2] = 0.5 + 0.5 * Math.cos(TAU * (t + 0.67));
}

export function createCanvas2dScene(canvas: HTMLCanvasElement): MeltScene {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D unavailable");
  const c2d: CanvasRenderingContext2D = ctx;

  // Fixed low-res compute buffer; scaled to the canvas each frame.
  const GW = 200;
  const GH = 120;
  const img = c2d.createImageData(GW, GH);
  const data = img.data;
  const off = document.createElement("canvas");
  off.width = GW;
  off.height = GH;
  const offCtx = off.getContext("2d")!;
  const rgb: [number, number, number] = [0, 0, 0];

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function render(p: MeltParams): void {
    const aspect = GW / GH;
    const flow = p.time * (0.3 + 2.4 * p.bass);
    const k = 6.0 + 20.0 * p.mid + 4.0 * p.entropy;
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let px = (x / (GW - 1)) * 2 - 1;
        let py = (y / (GH - 1)) * 2 - 1;
        px *= aspect;
        px -= p.centerX;
        py -= p.centerY;
        // Cheap warp: a low-freq sine displacement (stands in for fbm).
        const wa = 0.05 + 0.45 * p.bass + 0.35 * p.bloom + p.jitter;
        px += Math.sin(py * 2.3 + p.time * 0.5) * wa * 0.25;
        py += Math.cos(px * 2.1 - p.time * 0.4) * wa * 0.25;

        const cx = screenToCortex(px, py); // [log r, theta]
        const ft = formConstant(cx[0], cx[1], 0.0, k, -flow);
        const fs = formConstant(cx[0], cx[1], 0.78539816, k, -flow * 0.8);
        const fh = honeycombJs(cx[0], cx[1], k * 0.6, -flow * 0.5);
        const field = ft * p.wTunnel + fs * p.wSpiral + fh * p.wHoney;

        const r = Math.hypot(px, py);
        const hue = field * 0.6 + p.entropy * 0.3 + p.time * 0.03 + r * 0.15;
        iridescenceJs(hue, rgb);
        const lum = smoothstepJs(0.35, 0.92, field);
        let cr = rgb[0] * (0.14 + 1.3 * lum);
        let cg = rgb[1] * (0.14 + 1.3 * lum);
        let cb = rgb[2] * (0.14 + 1.3 * lum);
        // onset ring.
        const ring = Math.exp(-Math.pow((r - p.bloom * 2.6) * 3, 2)) * p.bloom;
        cr += ring * 1.2;
        cg += ring * 0.9;
        cb += ring * 1.4;
        const vig = smoothstepJs(1.75, 0.2, r);
        const v = (0.4 + 0.6 * vig) * p.flick;
        cr *= v;
        cg *= v;
        cb *= v;
        // soft rolloff.
        cr = cr / (1 + cr * 0.6);
        cg = cg / (1 + cg * 0.6);
        cb = cb / (1 + cb * 0.6);
        const o = (y * GW + x) * 4;
        data[o] = Math.min(255, cr * 255);
        data[o + 1] = Math.min(255, cg * 255);
        data[o + 2] = Math.min(255, cb * 255);
        data[o + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    c2d.imageSmoothingEnabled = true;
    c2d.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function dispose(): void {
    /* nothing to release for 2d */
  }

  resize();
  return { backend: "canvas2d", render, resize, dispose };
}

function smoothstepJs(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Best available melt scene (WebGL2 preferred, Canvas2D fallback). */
export function createMeltScene(canvas: HTMLCanvasElement): MeltScene {
  try {
    return createGlScene(canvas);
  } catch {
    return createCanvas2dScene(canvas);
  }
}
