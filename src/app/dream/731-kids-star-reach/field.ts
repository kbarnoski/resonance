// field.ts — raw WebGL2 (GLSL ES 3.00) additive point-glow star field
//            + Canvas2D fallback reproducing the same gather/spill physics.
//
// NOT three.js. NOT Canvas2D-primary. The primary path is hand-written WebGL2:
//   • A full-screen dark "deep space" quad (subtle vertical nebula gradient).
//   • ~2600 glowing star POINTS drawn with gl_PointSize + a radial-glow
//     fragment shader, additive blending, slow parallax drift, depth-faded.
//
// Physics (shared by both paths, run on CPU so behaviour is identical):
//   • Each star has a home position + velocity + depth.
//   • A "gather" pulse near a palm pulls nearby stars INTO the palm (scoop).
//   • A "spill" pulse pushes gathered stars OUTWARD in a rising arc.
//   • Stars always ease gently back toward home (so the sky reforms, calm).

import type { HandState } from "./hands";

export type RenderPath = "webgl2" | "canvas2d";

export interface FieldEventInput {
  kind: "gather" | "spill";
  x: number; // 0..1
  y: number; // 0..1
}

export interface StarField {
  /** Advance physics + render one frame. */
  frame(hands: [HandState, HandState], pulses: FieldEventInput[], dt: number, time: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

const STAR_COUNT = 2600;

// Shared CPU particle state. Positions in 0..1 space (y: 0 top, 1 bottom).
interface Particles {
  hx: Float32Array; // home x
  hy: Float32Array; // home y
  x: Float32Array;  // current x
  y: Float32Array;  // current y
  vx: Float32Array;
  vy: Float32Array;
  depth: Float32Array; // 0 (far/dim/small) .. 1 (near/bright/big)
  hue: Float32Array;   // 0..1 base hue offset
  twk: Float32Array;   // twinkle phase
}

function makeParticles(): Particles {
  const p: Particles = {
    hx: new Float32Array(STAR_COUNT),
    hy: new Float32Array(STAR_COUNT),
    x: new Float32Array(STAR_COUNT),
    y: new Float32Array(STAR_COUNT),
    vx: new Float32Array(STAR_COUNT),
    vy: new Float32Array(STAR_COUNT),
    depth: new Float32Array(STAR_COUNT),
    hue: new Float32Array(STAR_COUNT),
    twk: new Float32Array(STAR_COUNT),
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const hx = Math.random();
    // bias stars toward the upper sky (reach UP into them) but fill the field
    const hy = Math.pow(Math.random(), 1.25);
    p.hx[i] = hx; p.hy[i] = hy;
    p.x[i] = hx; p.y[i] = hy;
    p.vx[i] = 0; p.vy[i] = 0;
    p.depth[i] = Math.random();
    p.hue[i] = Math.random();
    p.twk[i] = Math.random() * Math.PI * 2;
  }
  return p;
}

// Apply gesture pulses + drift physics. Mutates particle current positions.
function stepPhysics(
  p: Particles,
  hands: [HandState, HandState],
  pulses: FieldEventInput[],
  dt: number,
  time: number,
) {
  const dtc = Math.min(dt, 0.05);

  // Standing soft attraction toward any open palm (stars "hover" near hands).
  for (let h = 0; h < 2; h++) {
    const hand = hands[h];
    if (!hand.active) continue;
    const px = hand.x;
    const py = hand.y;
    // gentle ambient draw; stronger when the hand is more closed (scooping)
    const pull = (1 - hand.openness) * 0.9 + 0.1;
    const R = 0.16 + hand.openness * 0.12;
    for (let i = 0; i < STAR_COUNT; i++) {
      const dx = px - p.x[i];
      const dy = py - p.y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const f = (1 - d / R) * pull * dtc * 1.6;
      p.vx[i] += (dx / d) * f * 0.06;
      p.vy[i] += (dy / d) * f * 0.06;
    }
  }

  // Discrete pulses: gather (strong inward) / spill (outward rising arc).
  for (const pulse of pulses) {
    const px = pulse.x;
    const py = pulse.y;
    if (pulse.kind === "gather") {
      const R = 0.22;
      for (let i = 0; i < STAR_COUNT; i++) {
        const dx = px - p.x[i];
        const dy = py - p.y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const f = (1 - d / R);
        p.vx[i] += (dx / d) * f * 0.55;
        p.vy[i] += (dy / d) * f * 0.55;
      }
    } else {
      // spill: push outward + a slight upward bias (rising)
      const R = 0.26;
      for (let i = 0; i < STAR_COUNT; i++) {
        const dx = p.x[i] - px;
        const dy = p.y[i] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const f = (1 - d / R);
        p.vx[i] += (dx / d) * f * 0.6;
        p.vy[i] += (dy / d) * f * 0.6 - f * 0.25; // rise
      }
    }
  }

  // Integrate + spring back home + slow parallax drift.
  const driftX = Math.sin(time * 0.05) * 0.0008;
  for (let i = 0; i < STAR_COUNT; i++) {
    // spring toward home (calm reforming sky)
    const sx = (p.hx[i] - p.x[i]) * 0.6 * dtc;
    const sy = (p.hy[i] - p.y[i]) * 0.6 * dtc;
    p.vx[i] += sx;
    p.vy[i] += sy;
    // damping
    p.vx[i] *= 0.92;
    p.vy[i] *= 0.92;
    // parallax: nearer stars drift more
    p.x[i] += p.vx[i] + driftX * (0.3 + p.depth[i]);
    p.y[i] += p.vy[i];
    // soft wrap/clamp into view
    if (p.x[i] < -0.05) p.x[i] = -0.05;
    if (p.x[i] > 1.05) p.x[i] = 1.05;
    if (p.y[i] < -0.05) p.y[i] = -0.05;
    if (p.y[i] > 1.05) p.y[i] = 1.05;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 path
// ─────────────────────────────────────────────────────────────────────────────

const BG_VERT = `#version 300 es
precision highp float;
const vec2 verts[4] = vec2[4](
  vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0), vec2(1.0,1.0)
);
out vec2 vUv;
void main() {
  vec2 p = verts[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
out vec4 frag;
void main() {
  // deep night sky: near-black with a faint cool nebula glow toward the top
  float y = vUv.y;
  vec3 top = vec3(0.03, 0.05, 0.12);
  vec3 bot = vec3(0.01, 0.01, 0.03);
  vec3 col = mix(top, bot, y);
  // very subtle drifting nebula bands
  float n = sin(vUv.x * 3.0 + uTime * 0.05) * sin(vUv.y * 2.0 - uTime * 0.03);
  col += vec3(0.02, 0.015, 0.04) * (0.5 + 0.5 * n) * (1.0 - y);
  frag = vec4(col, 1.0);
}`;

const STAR_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;   // 0..1 screen pos (y down)
layout(location=1) in float aDepth;
layout(location=2) in float aHue;
layout(location=3) in float aTw;   // twinkle value 0..1
uniform float uTime;
uniform vec2 uRes;
out float vDepth;
out float vHue;
out float vTw;
void main() {
  vec2 clip = vec2(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  float sizePx = mix(1.2, 6.5, aDepth);
  float dpr = uRes.y / 480.0;
  gl_PointSize = sizePx * clamp(dpr, 1.0, 3.0) * (0.7 + 0.6 * aTw);
  vDepth = aDepth;
  vHue = aHue;
  vTw = aTw;
}`;

const STAR_FRAG = `#version 300 es
precision highp float;
in float vDepth;
in float vHue;
in float vTw;
out vec4 frag;
vec3 hueShift(float h) {
  // gentle palette: cool whites → soft gold → pale cyan (awe/wonder)
  vec3 a = vec3(0.85, 0.9, 1.0);   // cool white
  vec3 b = vec3(1.0, 0.92, 0.7);   // warm gold
  vec3 c = vec3(0.7, 0.95, 1.0);   // pale cyan
  vec3 col = mix(a, b, smoothstep(0.0, 0.5, h));
  col = mix(col, c, smoothstep(0.5, 1.0, h));
  return col;
}
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  // radial glow: bright core + soft falloff
  float glow = smoothstep(0.5, 0.0, r);
  float core = smoothstep(0.18, 0.0, r);
  float a = glow * glow * (0.35 + 0.65 * vDepth);
  vec3 col = hueShift(vHue);
  col = mix(col, vec3(1.0), core * 0.8);
  float bright = (0.4 + 0.6 * vTw) * (0.4 + 0.6 * vDepth);
  frag = vec4(col * bright, a * (0.5 + 0.5 * vTw));
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
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function createWebGL2Field(canvas: HTMLCanvasElement): StarField | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const bgProg = link(gl, BG_VERT, BG_FRAG);
  const starProg = link(gl, STAR_VERT, STAR_FRAG);
  if (!bgProg || !starProg) {
    if (bgProg) gl.deleteProgram(bgProg);
    if (starProg) gl.deleteProgram(starProg);
    return null;
  }

  const p = makeParticles();

  // Interleaved star buffer: [x, y, depth, hue, tw] per star.
  const STRIDE = 5;
  const data = new Float32Array(STAR_COUNT * STRIDE);

  const bgVao = gl.createVertexArray();
  const starVao = gl.createVertexArray();
  const starBuf = gl.createBuffer();
  if (!bgVao || !starVao || !starBuf) {
    gl.deleteProgram(bgProg);
    gl.deleteProgram(starProg);
    return null;
  }

  gl.bindVertexArray(starVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const bytes = STRIDE * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, bytes, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, bytes, 2 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, bytes, 3 * 4);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bytes, 4 * 4);
  gl.bindVertexArray(null);

  const uBgTime = gl.getUniformLocation(bgProg, "uTime");
  const uStarTime = gl.getUniformLocation(starProg, "uTime");
  const uStarRes = gl.getUniformLocation(starProg, "uRes");

  let destroyed = false;

  function frame(
    hands: [HandState, HandState],
    pulses: FieldEventInput[],
    dt: number,
    time: number,
  ) {
    if (destroyed || !gl) return;

    stepPhysics(p, hands, pulses, dt, time);

    // upload current positions + twinkle
    for (let i = 0; i < STAR_COUNT; i++) {
      const o = i * STRIDE;
      const tw = 0.5 + 0.5 * Math.sin(time * 1.5 + p.twk[i]);
      data[o] = p.x[i];
      data[o + 1] = p.y[i];
      data[o + 2] = p.depth[i];
      data[o + 3] = p.hue[i];
      data[o + 4] = tw;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);

    // background (opaque)
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.uniform1f(uBgTime, time);
    gl.bindVertexArray(bgVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // stars (additive glow)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(starProg);
    gl.uniform1f(uStarTime, time);
    gl.uniform2f(uStarRes, canvas.width, canvas.height);
    gl.bindVertexArray(starVao);
    gl.drawArrays(gl.POINTS, 0, STAR_COUNT);
    gl.bindVertexArray(null);
  }

  function resize(w: number, h: number) {
    if (destroyed || !gl) return;
    gl.viewport(0, 0, w, h);
  }

  function destroy() {
    if (destroyed || !gl) return;
    destroyed = true;
    try { gl.deleteProgram(bgProg); } catch { /* ignore */ }
    try { gl.deleteProgram(starProg); } catch { /* ignore */ }
    try { gl.deleteBuffer(starBuf); } catch { /* ignore */ }
    try { gl.deleteVertexArray(starVao); } catch { /* ignore */ }
    try { gl.deleteVertexArray(bgVao); } catch { /* ignore */ }
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    } catch { /* ignore */ }
  }

  return { frame, resize, destroy };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas2D fallback — same physics, additive glow dots.
// ─────────────────────────────────────────────────────────────────────────────

function createCanvas2DField(canvas: HTMLCanvasElement): StarField | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const p = makeParticles();
  let destroyed = false;

  function frame(
    hands: [HandState, HandState],
    pulses: FieldEventInput[],
    dt: number,
    time: number,
  ) {
    if (destroyed || !ctx) return;
    stepPhysics(p, hands, pulses, dt, time);

    const W = canvas.width;
    const H = canvas.height;

    // deep sky background gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#08081f");
    g.addColorStop(1, "#020208");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // additive glow dots
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < STAR_COUNT; i++) {
      const tw = 0.5 + 0.5 * Math.sin(time * 1.5 + p.twk[i]);
      const x = p.x[i] * W;
      const y = p.y[i] * H;
      const depth = p.depth[i];
      const rad = (0.8 + depth * 3.2) * (0.7 + 0.6 * tw) * (H / 480);
      const a = (0.25 + 0.6 * depth) * (0.4 + 0.6 * tw);
      const hue = p.hue[i];
      // palette mirrors the GLSL hueShift
      let r: number, gg: number, b: number;
      if (hue < 0.5) {
        const t = hue / 0.5;
        r = 217 + t * (255 - 217); gg = 229 + t * (235 - 229); b = 255 + t * (179 - 255);
      } else {
        const t = (hue - 0.5) / 0.5;
        r = 255 + t * (179 - 255); gg = 235 + t * (242 - 235); b = 179 + t * (255 - 179);
      }
      const rg = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
      rg.addColorStop(0, `rgba(${r | 0},${gg | 0},${b | 0},${a})`);
      rg.addColorStop(0.4, `rgba(${r | 0},${gg | 0},${b | 0},${a * 0.4})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function resize(_w: number, _h: number) { void _w; void _h; }

  function destroy() { destroyed = true; }

  return { frame, resize, destroy };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — WebGL2 primary, Canvas2D fallback.
// ─────────────────────────────────────────────────────────────────────────────

export function createStarField(
  canvas: HTMLCanvasElement,
): { field: StarField; path: RenderPath } {
  const gl2 = createWebGL2Field(canvas);
  if (gl2) return { field: gl2, path: "webgl2" };
  const c2d = createCanvas2DField(canvas);
  if (c2d) return { field: c2d, path: "canvas2d" };
  // last-resort no-op so the app never crashes
  return {
    field: {
      frame() { /* no-op */ },
      resize() { /* no-op */ },
      destroy() { /* no-op */ },
    },
    path: "canvas2d",
  };
}
