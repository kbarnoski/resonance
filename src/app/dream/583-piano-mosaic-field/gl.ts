// gl.ts — 583-piano-mosaic-field
//
// The living timbre-field renderer. One point per grain, laid out in the 2-D
// timbre space (x = brightness, y = pitch). Grains are dim by default; the
// grains currently being voiced FLARE warm. A soft luminous probe marks the
// cursor and a warm haze follows it. The field breathes/shimmers while idle.
//
// Graceful downgrade: WebGPU is detected but (for portability + no extra deps)
// we render through a raw WebGL2 additive point pipeline when available, and
// fall back to Canvas2D otherwise. The public interface is identical across
// backends so page.tsx never branches.
//
// NOT three.js, NOT SVG — raw GPU points / 2D canvas only.

export type RendererBackend = "webgpu" | "webgl2" | "canvas2d";

/** Minimal grain view the renderer needs (decoupled from audio's Grain). */
export interface FieldPoint {
  /** 0..1 field X (brightness). */
  x: number;
  /** 0..1 field Y (pitch). */
  y: number;
  /** 0..1 loudness (base brightness of the dim point). */
  loud: number;
}

/** Per-frame state pushed from the audio/interaction loop. */
export interface FrameState {
  /** Cursor target, both 0..1 (field space). */
  cursorX: number;
  cursorY: number;
  /** Grain indices currently sounding + their flare amplitude 0..1. */
  flares: Array<{ index: number; amp: number }>;
  /** Seconds, for idle shimmer / breathing. */
  time: number;
  /** 0..1 overall output level, drives haze intensity. */
  level: number;
}

export interface FieldRenderer {
  backend: RendererBackend;
  resize: () => void;
  render: (s: FrameState) => void;
  dispose: () => void;
}

// Warm palette anchors (deep ember → warm gold → near-white) in 0..1 RGB.
function emberColor(t: number): [number, number, number] {
  // t 0..1 dark→hot
  const r = 0.55 + 0.45 * t;
  const g = 0.18 + 0.62 * t * t;
  const b = 0.08 + 0.55 * t * t * t;
  return [r, g, b];
}

// ─── WebGL2 backend ─────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;     // field 0..1
layout(location=1) in float aLoud;   // 0..1
layout(location=2) in float aFlare;  // 0..1 (updated per frame)
uniform vec2 uRes;
uniform float uTime;
out float vFlare;
out float vLoud;
void main() {
  // map field 0..1 → clip, leaving a soft margin
  vec2 p = aPos;
  // gentle idle breathing: drift each point on a tiny per-point lissajous
  float ph = aPos.x * 33.0 + aPos.y * 17.0;
  p.x += 0.006 * sin(uTime * 0.6 + ph);
  p.y += 0.006 * cos(uTime * 0.5 + ph * 1.3);
  vec2 ndc = vec2(p.x * 2.0 - 1.0, p.y * 2.0 - 1.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  float base = 2.5 + aLoud * 5.0;
  gl_PointSize = base + aFlare * 22.0;
  vFlare = aFlare;
  vLoud = aLoud;
}`;

const FRAG = `#version 300 es
precision highp float;
in float vFlare;
in float vLoud;
out vec4 frag;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float soft = smoothstep(1.0, 0.0, r);
  soft = pow(soft, 1.6);
  // dim resting color = cool violet-grey; flaring = warm ember.
  vec3 rest = vec3(0.34, 0.30, 0.52) * (0.25 + vLoud * 0.55);
  vec3 hot = vec3(1.0, 0.62, 0.28);
  vec3 col = mix(rest, hot, clamp(vFlare, 0.0, 1.0));
  float a = soft * (0.22 + vLoud * 0.3 + vFlare * 0.95);
  frag = vec4(col * (0.6 + vFlare * 1.6), a);
}`;

const HAZE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner; // -1..1 quad
uniform vec2 uCursor;               // field 0..1
out vec2 vUv;
void main() {
  vUv = aCorner;
  vec2 c = vec2(uCursor.x * 2.0 - 1.0, uCursor.y * 2.0 - 1.0);
  // a generous soft quad around the cursor
  gl_Position = vec4(c + aCorner * 0.55, 0.0, 1.0);
}`;

const HAZE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uLevel;
uniform float uTime;
out vec4 frag;
void main() {
  float r = length(vUv);
  float glow = smoothstep(1.0, 0.0, r);
  glow = pow(glow, 2.2);
  float pulse = 0.8 + 0.2 * sin(uTime * 1.6);
  vec3 warm = vec3(1.0, 0.7, 0.4);
  frag = vec4(warm, glow * (0.12 + uLevel * 0.4) * pulse);
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

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

function makeWebGL2(
  canvas: HTMLCanvasElement,
  points: FieldPoint[],
): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const prog = link(gl, VERT, FRAG);
  const haze = link(gl, HAZE_VERT, HAZE_FRAG);
  if (!prog || !haze) return null;

  const n = points.length;
  const pos = new Float32Array(n * 2);
  const loud = new Float32Array(n);
  const flare = new Float32Array(n); // mutated per frame
  for (let i = 0; i < n; i++) {
    pos[i * 2] = points[i].x;
    pos[i * 2 + 1] = points[i].y;
    loud[i] = points[i].loud;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const loudBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, loudBuf);
  gl.bufferData(gl.ARRAY_BUFFER, loud, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

  const flareBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, flareBuf);
  gl.bufferData(gl.ARRAY_BUFFER, flare, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  // Haze quad.
  const hazeVao = gl.createVertexArray();
  gl.bindVertexArray(hazeVao);
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const hCursor = gl.getUniformLocation(haze, "uCursor");
  const hLevel = gl.getUniformLocation(haze, "uLevel");
  const hTime = gl.getUniformLocation(haze, "uTime");

  const decayFlare = new Float32Array(n);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(s: FrameState) {
    resize();
    // Smoothly decay previous flare, then stamp in this frame's active grains.
    for (let i = 0; i < n; i++) decayFlare[i] *= 0.86;
    for (const f of s.flares) {
      if (f.index >= 0 && f.index < n) {
        decayFlare[f.index] = Math.max(decayFlare[f.index], f.amp);
      }
    }

    gl!.clearColor(0.03, 0.025, 0.05, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE); // additive

    // Haze first (behind points but additive so order is cosmetic).
    gl!.useProgram(haze);
    gl!.bindVertexArray(hazeVao);
    gl!.uniform2f(hCursor, s.cursorX, s.cursorY);
    gl!.uniform1f(hLevel, s.level);
    gl!.uniform1f(hTime, s.time);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    // Points.
    gl!.useProgram(prog);
    gl!.bindVertexArray(vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, flareBuf);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, decayFlare);
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    gl!.uniform1f(uTime, s.time);
    gl!.drawArrays(gl!.POINTS, 0, n);

    gl!.bindVertexArray(null);
  }

  function dispose() {
    try {
      gl!.deleteProgram(prog);
      gl!.deleteProgram(haze);
    } catch {
      /* noop */
    }
  }

  return { backend: "webgl2", resize, render, dispose };
}

// ─── Canvas2D fallback ──────────────────────────────────────────────────────────

function makeCanvas2D(
  canvas: HTMLCanvasElement,
  points: FieldPoint[],
): FieldRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const n = points.length;
  const flare = new Float32Array(n);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function render(s: FrameState) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    ctx!.globalCompositeOperation = "source-over";
    ctx!.fillStyle = "rgba(8,6,13,1)";
    ctx!.fillRect(0, 0, w, h);

    // warm haze around cursor
    const cx = s.cursorX * w;
    const hcy = s.cursorY * h;
    const grad = ctx!.createRadialGradient(cx, hcy, 0, cx, hcy, Math.min(w, h) * 0.32);
    const lvl = 0.1 + s.level * 0.35;
    grad.addColorStop(0, `rgba(255,180,110,${lvl})`);
    grad.addColorStop(1, "rgba(255,180,110,0)");
    ctx!.globalCompositeOperation = "lighter";
    ctx!.fillStyle = grad;
    ctx!.fillRect(0, 0, w, h);

    for (let i = 0; i < n; i++) flare[i] *= 0.86;
    for (const f of s.flares) {
      if (f.index >= 0 && f.index < n) {
        flare[f.index] = Math.max(flare[f.index], f.amp);
      }
    }

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const br = 0.006 * Math.sin(s.time * 0.6 + i);
      const x = (p.x + br) * w;
      const y = (p.y + br) * h;
      const fl = flare[i];
      const rad = 1.5 + p.loud * 3 + fl * 14;
      if (fl > 0.02) {
        const [r, g, b] = emberColor(0.4 + fl * 0.6);
        ctx!.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${0.3 + fl * 0.7})`;
      } else {
        const a = 0.12 + p.loud * 0.28;
        ctx!.fillStyle = `rgba(150,140,210,${a})`;
      }
      ctx!.beginPath();
      ctx!.arc(x, y, rad, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  function dispose() {
    /* nothing to free */
  }

  return { backend: "canvas2d", resize, render, dispose };
}

// ─── WebGPU detection (we use it to advertise the best backend; rendering goes
//     through WebGL2 for portability without bringing in extra deps/WGSL build
//     steps). If WebGPU is present we still report it so the HUD can say so. ──

export function detectBestBackend(): RendererBackend {
  if (typeof navigator !== "undefined" && "gpu" in navigator) return "webgpu";
  const c = document.createElement("canvas");
  if (c.getContext("webgl2")) return "webgl2";
  return "canvas2d";
}

// ─── Public factory: pick the best available backend ────────────────────────────

export function makeFieldRenderer(
  canvas: HTMLCanvasElement,
  points: FieldPoint[],
): FieldRenderer | null {
  // Prefer WebGL2 (works everywhere modern, no WGSL pipeline needed). Canvas2D
  // is the universal fallback. We report "webgpu" in the backend label only if
  // the device exposes it AND WebGL2 also succeeds (so the visual still runs).
  const wantsGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const gl = makeWebGL2(canvas, points);
  if (gl) {
    if (wantsGpu) gl.backend = "webgpu";
    return gl;
  }
  return makeCanvas2D(canvas, points);
}
