// gl.ts — WebGL2 ping-pong dye field for 5160-datapigment.
//
// Two half-float RGBA textures are ping-ponged every frame (Jos Stam, "Stable
// Fluids", 1999). A VELOCITY field advects itself semi-Lagrangian and is stirred
// by a curl-noise force whose amplitude and rotation are modulated by the music
// (overall RMS + bass), so heavy chords make the whole ocean heave. A DYE
// (pigment) field is advected along that velocity and dissipates very slowly, so
// the image ACCUMULATES a long, breathing memory. The music DEPOSITS coloured
// pigment into the dye (and a small push into the velocity) as soft point
// sprites; onsets bloom radial rings. A final pass adds a soft bloom, a
// Reinhard-ish tonemap and a vignette so the result reads as a luminous pigment
// cloud rather than TV static — Refik Anadol's "data as pigment" (Dataland, LA
// 2026).
//
// A Canvas2D fade-feedback fallback covers browsers without WebGL2 / float
// render targets, driven by the identical stroke stream.

import { PALETTE_GLSL } from "../_shared/palette";

// ── Public contract ──────────────────────────────────────────────────────────

/** One pigment deposit. Positions are 0..1 (x right, y up). */
export interface Stroke {
  x: number;
  y: number;
  /** Palette parameter 0..1 (violet→magenta ocean ramp) — from the band. */
  hue: number;
  /** Soft radius in sim pixels — from band energy. */
  size: number;
  /** Deposit intensity — from band energy. */
  brightness: number;
  /** Velocity push in uv/sec (signed). */
  vx: number;
  vy: number;
}

export interface FrameInput {
  strokes: Stroke[];
  /** Seconds since last frame (clamped by caller). */
  dt: number;
  /** Seconds since start — drives curl-noise drift. */
  time: number;
  /** Overall loudness 0..1 — modulates swirl amplitude. */
  energy: number;
  /** Bass energy 0..1 — modulates the slow oceanic rotation. */
  bass: number;
  /** Reduced-motion: gentler curl, slower settle, no strong swirl. */
  reduced: boolean;
}

export interface Renderer {
  kind: "webgl2" | "canvas2d";
  resize(cssW: number, cssH: number, dpr: number): void;
  frame(input: FrameInput): void;
  dispose(): void;
}

/** Try WebGL2 first, fall back to Canvas2D. Never throws. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = safeGetGL(canvas);
  if (gl) {
    try {
      return createGLRenderer(canvas, gl);
    } catch {
      // fall through to canvas2d
    }
  }
  return createCanvas2DRenderer(canvas);
}

function safeGetGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) return null;
    if (!gl.getExtension("EXT_color_buffer_float")) return null;
    return gl;
  } catch {
    return null;
  }
}

// ── GLSL ─────────────────────────────────────────────────────────────────────

const FULL_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Cheap value noise + a curl potential for the swirling, divergence-free force.
const NOISE_GLSL = `
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float potential(vec2 uv, float t){
  float s = 2.4;
  float n = vnoise(uv * s + vec2(t * 0.035, -t * 0.026));
  n += 0.5 * vnoise(uv * s * 2.03 + vec2(-t * 0.021, t * 0.03));
  return n;
}`;

const ADVECT_VEL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVel;
uniform float uDt;
uniform float uTime;
uniform float uCurl;
uniform float uDecay;
uniform float uSwell;   // bass-driven slow rotation
out vec4 frag;
${NOISE_GLSL}
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 src = vUv - uDt * v;              // semi-Lagrangian backtrace
  vec2 v2 = texture(uVel, src).xy;
  // Curl-noise force (Anadol-style swirl).
  float e = 0.004;
  float p1 = potential(vUv + vec2(0.0, e), uTime);
  float p2 = potential(vUv - vec2(0.0, e), uTime);
  float p3 = potential(vUv + vec2(e, 0.0), uTime);
  float p4 = potential(vUv - vec2(e, 0.0), uTime);
  vec2 curl = vec2(p1 - p2, -(p3 - p4)) / (2.0 * e);
  v2 += curl * uCurl * uDt;
  // Slow oceanic rotation about centre, scaled by bass — the whole sea heaves.
  vec2 rel = vUv - 0.5;
  vec2 rot = vec2(-rel.y, rel.x);
  v2 += rot * uSwell * uDt;
  v2 *= uDecay;
  v2 = clamp(v2, vec2(-1.4), vec2(1.4));
  frag = vec4(v2, 0.0, 1.0);
}`;

const ADVECT_DYE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uDye;
uniform float uDt;
uniform float uFade;
out vec4 frag;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 src = vUv - uDt * v;
  vec3 d = texture(uDye, src).rgb;
  d *= uFade;         // very slow dissipation — stops clip-to-white
  frag = vec4(d, 1.0);
}`;

const DEPOSIT_VS = `#version 300 es
in vec2 aPos;
in float aSize;
in float aHue;
in float aBright;
in vec2 aVel;
out float vHue;
out float vBright;
out vec2 vVel;
void main(){
  gl_Position = vec4(aPos, 0.0, 1.0);
  gl_PointSize = aSize;
  vHue = aHue;
  vBright = aBright;
  vVel = aVel;
}`;

const DEPOSIT_FS = `#version 300 es
precision highp float;
in float vHue;
in float vBright;
in vec2 vVel;
uniform int uMode; // 0 = dye/pigment, 1 = velocity
out vec4 frag;
${PALETTE_GLSL}
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float r = length(pc) * 2.0;
  float fall = exp(-r * r * 3.0);
  if (uMode == 0) {
    vec3 col = dreamPalette(vHue) * vBright * fall;
    frag = vec4(col, fall);
  } else {
    frag = vec4(vVel * fall, 0.0, fall);
  }
}`;

const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDye;
uniform vec2 uTexel;
out vec4 frag;
void main(){
  vec3 c = texture(uDye, vUv).rgb;
  // Cheap 4-tap bloom for a soft luminous halo.
  vec3 b = vec3(0.0);
  float o = 2.5;
  b += texture(uDye, vUv + uTexel * vec2( o,  o)).rgb;
  b += texture(uDye, vUv + uTexel * vec2(-o,  o)).rgb;
  b += texture(uDye, vUv + uTexel * vec2( o, -o)).rgb;
  b += texture(uDye, vUv + uTexel * vec2(-o, -o)).rgb;
  c += b * 0.20;
  // Reinhard-ish tonemap so bright cores glow without hard clipping.
  c = c / (c + vec3(0.70)) * 1.9;
  // Faint violet floor so the void reads as deep sea, not dead black.
  c += vec3(0.016, 0.012, 0.034) * (1.0 - smoothstep(0.0, 0.4, length(c)));
  // Gentle vignette — the pigment cloud recedes into the deep.
  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(d));
  c *= mix(0.72, 1.0, vig);
  frag = vec4(c, 1.0);
}`;

// ── GL renderer ────────────────────────────────────────────────────────────

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "shader compile error";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "link error";
    throw new Error(log);
  }
  return p;
}

interface FBO {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
}

function makeFBO(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

function createGLRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Renderer {
  let simW = 320;
  let simH = 240;

  let velA = makeFBO(gl, simW, simH);
  let velB = makeFBO(gl, simW, simH);
  let dyeA = makeFBO(gl, simW, simH);
  let dyeB = makeFBO(gl, simW, simH);

  const quad = gl.createBuffer();
  if (!quad) throw new Error("createBuffer failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  const depositBuf = gl.createBuffer();
  if (!depositBuf) throw new Error("createBuffer failed");

  const progAdvVel = link(gl, FULL_VS, ADVECT_VEL_FS);
  const progAdvDye = link(gl, FULL_VS, ADVECT_DYE_FS);
  const progDeposit = link(gl, DEPOSIT_VS, DEPOSIT_FS);
  const progPresent = link(gl, FULL_VS, PRESENT_FS);

  const aPosFull = gl.getAttribLocation(progAdvVel, "aPos");
  const aPosFullDye = gl.getAttribLocation(progAdvDye, "aPos");
  const aPosPresent = gl.getAttribLocation(progPresent, "aPos");

  // Cache uniform locations (guarding nulls once, not per-frame).
  const uVel = gl.getUniformLocation(progAdvVel, "uVel");
  const uVelDt = gl.getUniformLocation(progAdvVel, "uDt");
  const uVelTime = gl.getUniformLocation(progAdvVel, "uTime");
  const uVelCurl = gl.getUniformLocation(progAdvVel, "uCurl");
  const uVelDecay = gl.getUniformLocation(progAdvVel, "uDecay");
  const uVelSwell = gl.getUniformLocation(progAdvVel, "uSwell");

  const uDyeVel = gl.getUniformLocation(progAdvDye, "uVel");
  const uDyeDye = gl.getUniformLocation(progAdvDye, "uDye");
  const uDyeDt = gl.getUniformLocation(progAdvDye, "uDt");
  const uDyeFade = gl.getUniformLocation(progAdvDye, "uFade");

  const uPresDye = gl.getUniformLocation(progPresent, "uDye");
  const uPresTexel = gl.getUniformLocation(progPresent, "uTexel");

  const dep = {
    aPos: gl.getAttribLocation(progDeposit, "aPos"),
    aSize: gl.getAttribLocation(progDeposit, "aSize"),
    aHue: gl.getAttribLocation(progDeposit, "aHue"),
    aBright: gl.getAttribLocation(progDeposit, "aBright"),
    aVel: gl.getAttribLocation(progDeposit, "aVel"),
    uMode: gl.getUniformLocation(progDeposit, "uMode"),
  };

  function drawQuad(loc: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function resize(cssW: number, cssH: number, dpr: number): void {
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const aspect = cssW / Math.max(1, cssH);
    const longSide = 340;
    if (aspect >= 1) {
      simW = longSide;
      simH = Math.max(120, Math.round(longSide / aspect));
    } else {
      simH = longSide;
      simW = Math.max(120, Math.round(longSide * aspect));
    }
    for (const f of [velA, velB, dyeA, dyeB]) {
      gl.deleteTexture(f.tex);
      gl.deleteFramebuffer(f.fb);
    }
    velA = makeFBO(gl, simW, simH);
    velB = makeFBO(gl, simW, simH);
    dyeA = makeFBO(gl, simW, simH);
    dyeB = makeFBO(gl, simW, simH);
  }

  // Reusable interleaved buffer: [x,y,size,hue,bright,vx,vy] * N.
  const STRIDE = 7;
  let vertScratch = new Float32Array(STRIDE * 256);

  function uploadStrokes(strokes: Stroke[]): number {
    const n = strokes.length;
    if (n === 0) return 0;
    if (vertScratch.length < n * STRIDE) {
      vertScratch = new Float32Array(n * STRIDE);
    }
    for (let i = 0; i < n; i++) {
      const s = strokes[i];
      const o = i * STRIDE;
      vertScratch[o] = s.x * 2 - 1;
      vertScratch[o + 1] = s.y * 2 - 1;
      vertScratch[o + 2] = s.size;
      vertScratch[o + 3] = s.hue;
      vertScratch[o + 4] = s.brightness;
      vertScratch[o + 5] = s.vx;
      vertScratch[o + 6] = s.vy;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, depositBuf);
    gl.bufferData(gl.ARRAY_BUFFER, vertScratch.subarray(0, n * STRIDE), gl.DYNAMIC_DRAW);
    const fb = 4;
    const st = STRIDE * fb;
    gl.enableVertexAttribArray(dep.aPos);
    gl.vertexAttribPointer(dep.aPos, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(dep.aSize);
    gl.vertexAttribPointer(dep.aSize, 1, gl.FLOAT, false, st, 2 * fb);
    gl.enableVertexAttribArray(dep.aHue);
    gl.vertexAttribPointer(dep.aHue, 1, gl.FLOAT, false, st, 3 * fb);
    gl.enableVertexAttribArray(dep.aBright);
    gl.vertexAttribPointer(dep.aBright, 1, gl.FLOAT, false, st, 4 * fb);
    gl.enableVertexAttribArray(dep.aVel);
    gl.vertexAttribPointer(dep.aVel, 2, gl.FLOAT, false, st, 5 * fb);
    return n;
  }

  function frame(input: FrameInput): void {
    const dt = Math.min(0.05, Math.max(0.001, input.dt));
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, simW, simH);

    // 1) Advect velocity into velB, stirred by curl + music-modulated swell.
    const curl = (input.reduced ? 0.09 : 0.18) + input.energy * (input.reduced ? 0.05 : 0.22);
    const swell = (input.reduced ? 0.02 : 0.05) + input.bass * (input.reduced ? 0.03 : 0.14);
    gl.useProgram(progAdvVel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velB.fb);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velA.tex);
    gl.uniform1i(uVel, 0);
    gl.uniform1f(uVelDt, dt);
    gl.uniform1f(uVelTime, input.time);
    gl.uniform1f(uVelCurl, curl);
    gl.uniform1f(uVelDecay, input.reduced ? 0.976 : 0.988);
    gl.uniform1f(uVelSwell, swell);
    drawQuad(aPosFull);
    let t = velA; velA = velB; velB = t;

    // 2) Advect dye into dyeB using the fresh velocity.
    gl.useProgram(progAdvDye);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dyeB.fb);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velA.tex);
    gl.uniform1i(uDyeVel, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dyeA.tex);
    gl.uniform1i(uDyeDye, 1);
    gl.uniform1f(uDyeDt, dt);
    gl.uniform1f(uDyeFade, 0.994);
    drawQuad(aPosFullDye);
    t = dyeA; dyeA = dyeB; dyeB = t;

    // 3) Deposit pigment strokes: colour into dye, push into velocity.
    if (input.strokes.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // additive accumulation
      gl.useProgram(progDeposit);
      const count = uploadStrokes(input.strokes);

      gl.bindFramebuffer(gl.FRAMEBUFFER, dyeA.fb);
      gl.uniform1i(dep.uMode, 0);
      gl.drawArrays(gl.POINTS, 0, count);

      gl.bindFramebuffer(gl.FRAMEBUFFER, velA.fb);
      gl.uniform1i(dep.uMode, 1);
      gl.drawArrays(gl.POINTS, 0, count);

      gl.disable(gl.BLEND);
    }

    // 4) Present dye to screen with bloom + tonemap + vignette.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progPresent);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dyeA.tex);
    gl.uniform1i(uPresDye, 0);
    gl.uniform2f(uPresTexel, 1 / simW, 1 / simH);
    drawQuad(aPosPresent);
  }

  function dispose(): void {
    try {
      for (const f of [velA, velB, dyeA, dyeB]) {
        gl.deleteTexture(f.tex);
        gl.deleteFramebuffer(f.fb);
      }
      gl.deleteBuffer(quad);
      gl.deleteBuffer(depositBuf);
      gl.deleteProgram(progAdvVel);
      gl.deleteProgram(progAdvDye);
      gl.deleteProgram(progDeposit);
      gl.deleteProgram(progPresent);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      /* ok */
    }
  }

  return { kind: "webgl2", resize, frame, dispose };
}

// ── Canvas2D fallback ─────────────────────────────────────────────────────────
// A lower-res fade-feedback field: the previous frame is re-drawn slightly
// scaled (a crude advection) at reduced alpha, then pigment strokes are added
// with additive radial gradients. Same stroke stream, no GPU required.

function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) {
    return {
      kind: "canvas2d",
      resize: () => {},
      frame: () => {},
      dispose: () => {},
    };
  }
  const ctx = maybeCtx;
  let buf = document.createElement("canvas");
  let bctx = buf.getContext("2d")!;
  let W = 2;
  let H = 2;

  function resize(cssW: number, cssH: number, dpr: number): void {
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const scale = 0.4;
    W = Math.max(2, Math.floor(canvas.width * scale));
    H = Math.max(2, Math.floor(canvas.height * scale));
    const nb = document.createElement("canvas");
    nb.width = W;
    nb.height = H;
    const nctx = nb.getContext("2d")!;
    nctx.fillStyle = "#05030b";
    nctx.fillRect(0, 0, W, H);
    buf = nb;
    bctx = nctx;
  }

  function frame(input: FrameInput): void {
    // Fade-feedback with a gentle rotational drift to fake advection.
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 0.92;
    const drift = 1.005 + input.bass * 0.004;
    const dw = W * drift;
    const dh = H * drift;
    bctx.save();
    bctx.translate(W / 2, H / 2);
    bctx.rotate((input.reduced ? 0.0003 : 0.0009) + input.bass * 0.002);
    bctx.drawImage(buf, -dw / 2, -dh / 2, dw, dh);
    bctx.restore();
    bctx.globalAlpha = 1;

    bctx.globalCompositeOperation = "lighter";
    for (const s of input.strokes) {
      if (s.brightness <= 0) continue;
      const px = s.x * W;
      const py = (1 - s.y) * H;
      const r = Math.max(2, (s.size / 340) * W * 1.6);
      const col = paletteRGB(s.hue);
      const a = Math.min(1, s.brightness);
      const g = bctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
      g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.arc(px, py, r, 0, Math.PI * 2);
      bctx.fill();
    }
    bctx.globalCompositeOperation = "source-over";

    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
  }

  function dispose(): void {
    buf.width = 0;
    buf.height = 0;
  }

  return { kind: "canvas2d", resize, frame, dispose };
}

// JS mirror of the shared violet ramp for the Canvas2D deposits.
function paletteRGB(t: number): [number, number, number] {
  const deep = [11, 7, 19];
  const indigo = [99, 102, 241];
  const violet = [139, 92, 246];
  const magenta = [176, 67, 224];
  const light = [196, 181, 253];
  const c = Math.max(0, Math.min(1, t));
  const lerp = (a: number[], b: number[], u: number): [number, number, number] => [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
  if (c < 0.33) return lerp(deep, indigo, c / 0.33);
  if (c < 0.66) return lerp(indigo, violet, (c - 0.33) / 0.33);
  return lerp(magenta, light, (c - 0.66) / 0.34);
}
