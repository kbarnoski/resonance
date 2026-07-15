// ─────────────────────────────────────────────────────────────────────────────
// 1700-bloom-field / render.ts — raw WebGL2 chrysanthemum bloom engine.
//
//   state: DMT-threshold chrysanthemum · pole: INTENSE
//
//   Technique chain (all on the GPU, no three.js):
//     1. Gray-Scott reaction-diffusion in a ping-ponged half-float FBO pair
//        (Du=0.16, Dv=0.08; feed/kill driven toward the coral/mitosis regime
//        by webcam motion energy). This is the "breathing fractal".
//     2. Inverse log-polar (form-constant) warp of the RD field → the pattern
//        reads as a radial bloom. Uses the shared LOGPOLAR_GLSL engine.
//     3. N-fold kaleidoscope UV fold (fold count 6→12 with motion) → the
//        chrysanthemum "opening".
//     4. Neon-iridescent jeweled palette + radial chromatic aberration.
//
//   Motion energy is a downsampled luminance frame-difference (CPU, 64×48) —
//   no MediaPipe, no skeleton/face model. When there is no camera the field is
//   driven by a deterministic frame-counter breathing swell so a headless
//   review box is never blank. NO Math.random / Date.now / performance.now.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

const RD_SIZE = 256; // reaction-diffusion simulation resolution (square)
const CAM_W = 64; // motion-difference downsample width
const CAM_H = 48; // motion-difference downsample height
const RD_STEPS = 14; // Gray-Scott iterations per animation frame

export interface FieldState {
  motion: number; // 0..1 smoothed motion energy
  bloom: number; // 0..1 bloom intensity (drives audio amplitude)
  cameraOn: boolean;
}

// ── shader sources ───────────────────────────────────────────────────────────

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Seed: deterministic centred blob + four fixed spots. No randomness.
const SEED_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
void main() {
  vec2 q = vUv - 0.5;
  float d = length(q);
  float v = smoothstep(0.17, 0.10, d);
  v += smoothstep(0.055, 0.0, length(vUv - vec2(0.30, 0.30)));
  v += smoothstep(0.055, 0.0, length(vUv - vec2(0.70, 0.34)));
  v += smoothstep(0.055, 0.0, length(vUv - vec2(0.34, 0.70)));
  v += smoothstep(0.055, 0.0, length(vUv - vec2(0.68, 0.68)));
  v = clamp(v, 0.0, 1.0);
  frag = vec4(1.0, v, 0.0, 1.0); // u=1 substrate, v=seed
}`;

// Gray-Scott update (9-point Laplacian). dt = 1.
const RD_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uF;      // feed
uniform float uK;      // kill
uniform float uMotion; // 0..1
uniform float uPhase;  // deterministic frame phase

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 lap(vec2 uv) {
  vec2 c = texture(uPrev, uv).xy;
  vec2 s = vec2(0.0);
  s += texture(uPrev, uv + uTexel * vec2( 1.0, 0.0)).xy * 0.2;
  s += texture(uPrev, uv + uTexel * vec2(-1.0, 0.0)).xy * 0.2;
  s += texture(uPrev, uv + uTexel * vec2( 0.0, 1.0)).xy * 0.2;
  s += texture(uPrev, uv + uTexel * vec2( 0.0,-1.0)).xy * 0.2;
  s += texture(uPrev, uv + uTexel * vec2( 1.0, 1.0)).xy * 0.05;
  s += texture(uPrev, uv + uTexel * vec2( 1.0,-1.0)).xy * 0.05;
  s += texture(uPrev, uv + uTexel * vec2(-1.0, 1.0)).xy * 0.05;
  s += texture(uPrev, uv + uTexel * vec2(-1.0,-1.0)).xy * 0.05;
  return s - c;
}

void main() {
  vec2 uvv = texture(uPrev, vUv).xy;
  float u = uvv.x;
  float v = uvv.y;
  vec2 L = lap(vUv);
  const float Du = 0.16;
  const float Dv = 0.08;
  float reaction = u * v * v;
  float du = Du * L.x - reaction + uF * (1.0 - u);
  float dv = Dv * L.y + reaction - (uF + uK) * v;
  // motion injects noise → the bloom reorganizes faster when you move.
  float n = hash(vUv * 512.0 + uPhase * 7.13) - 0.5;
  v += n * uMotion * 0.02;
  u = clamp(u + du, 0.0, 1.0);
  v = clamp(v + dv, 0.0, 1.0);
  frag = vec4(u, v, 0.0, 1.0);
}`;

// Display: inverse log-polar warp + N-fold kaleidoscope + jeweled palette.
const DISPLAY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uField;
uniform float uAspect;
uniform float uFold;
uniform float uPhase;
uniform float uMotion;
uniform float uHue;
uniform float uFlick;

${LOGPOLAR_GLSL}

// neon-iridescent jeweled ramp: violet → magenta → cyan → gold
vec3 pal(float t) {
  vec3 a = vec3(0.50, 0.45, 0.55);
  vec3 b = vec3(0.50, 0.50, 0.50);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.80, 0.60, 0.30);
  return a + b * cos(TAU_LP * (c * t + d));
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uAspect;
  float rho = length(p) + 1e-4;
  float ang = atan(p.y, p.x);

  // N-fold kaleidoscope: mirror the angle within each wedge.
  float seg = TAU_LP / uFold;
  float a = mod(ang, seg);
  a = abs(a - 0.5 * seg);
  float wedge = a / (0.5 * seg); // 0..1 across the wedge

  // inverse log-polar warp (shared form-constant engine).
  vec2 pf = rho * vec2(cos(a), sin(a));
  vec2 cortex = screenToCortex(pf); // (log rho, a)
  float rad = -cortex.x * 0.85 + uPhase * 0.15;

  // radial chromatic aberration.
  float ab = 0.006 + 0.03 * uMotion;
  float vR = texture(uField, vec2(wedge, fract(rad + ab))).y;
  float vG = texture(uField, vec2(wedge, fract(rad))).y;
  float vB = texture(uField, vec2(wedge, fract(rad - ab))).y;

  // thin-film-ish iridescence: hue drifts with radius and field value.
  float irid = 0.12 * sin(rho * 6.0 - vG * 5.0 + uPhase * 0.8);
  float hue = uHue + irid;

  vec3 col;
  col.r = pal(vR * 1.25 + hue + 0.03).r;
  col.g = pal(vG * 1.25 + hue).g;
  col.b = pal(vB * 1.25 + hue - 0.03).b;

  // jewelled contrast: dim the low-density substrate.
  float lum = smoothstep(0.06, 0.40, vG);
  col *= (0.20 + 1.05 * lum);

  // ultra-saturate.
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(g), col, 1.35);

  // slow luminance breathing (safe: never a strobe) + optional safe flicker.
  col *= (0.82 + 0.18 * sin(uPhase * 0.4));
  col *= uFlick;

  // central seed glow.
  col += vec3(0.42, 0.20, 0.60) * smoothstep(0.12, 0.0, rho) * 0.5;

  col = pow(clamp(col, 0.0, 1.6), vec3(0.9));
  frag = vec4(col, 1.0);
}`;

// ── GL helpers ───────────────────────────────────────────────────────────────

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link: " + log);
  }
  return prog;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

function makeTarget(
  gl: WebGL2RenderingContext,
  internal: number,
  format: number,
  type: number,
): Target {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) throw new Error("target alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, RD_SIZE, RD_SIZE, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

// ── the renderer ─────────────────────────────────────────────────────────────

export interface FieldRenderer {
  frame(): FieldState;
  resize(): void;
  startCamera(): Promise<boolean>;
  setFlick(v: number): void;
  dispose(): void;
}

export function makeField(canvas: HTMLCanvasElement): FieldRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  // Prefer half-float RD field; fall back to 8-bit if unrenderable.
  gl.getExtension("EXT_color_buffer_float");
  let internal = gl.RGBA16F;
  let type = gl.HALF_FLOAT;
  let ping = makeTarget(gl, internal, gl.RGBA, type);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(ping.tex);
    gl.deleteFramebuffer(ping.fbo);
    internal = gl.RGBA8;
    type = gl.UNSIGNED_BYTE;
    ping = makeTarget(gl, internal, gl.RGBA, type);
  }
  let pong = makeTarget(gl, internal, gl.RGBA, type);

  // Full-screen quad.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const seedProg = link(gl, VERT, SEED_FS);
  const rdProg = link(gl, VERT, RD_FS);
  const dispProg = link(gl, VERT, DISPLAY_FS);

  const uni = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const rdU = {
    prev: uni(rdProg, "uPrev"),
    texel: uni(rdProg, "uTexel"),
    f: uni(rdProg, "uF"),
    k: uni(rdProg, "uK"),
    motion: uni(rdProg, "uMotion"),
    phase: uni(rdProg, "uPhase"),
  };
  const dU = {
    field: uni(dispProg, "uField"),
    aspect: uni(dispProg, "uAspect"),
    fold: uni(dispProg, "uFold"),
    phase: uni(dispProg, "uPhase"),
    motion: uni(dispProg, "uMotion"),
    hue: uni(dispProg, "uHue"),
    flick: uni(dispProg, "uFlick"),
  };

  const bindQuad = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  };

  // Seed the initial field.
  const seed = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fbo);
    gl.viewport(0, 0, RD_SIZE, RD_SIZE);
    gl.useProgram(seedProg);
    bindQuad();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  seed();

  // ── camera / motion (CPU frame-difference, no ML) ──────────────────────────
  let video: HTMLVideoElement | null = null;
  let stream: MediaStream | null = null;
  let cameraOn = false;
  const cam = document.createElement("canvas");
  cam.width = CAM_W;
  cam.height = CAM_H;
  const camCtx = cam.getContext("2d", { willReadFrequently: true });
  let prevLum: Float32Array | null = null;

  let motion = 0.12; // smoothed motion energy
  let bloom = 0.4;
  let phase = 0;
  let frameCount = 0;
  let flickValue = 1; // safe-flicker luminance multiplier (1.0 = steady)

  const readMotion = (): number => {
    // Ghost self-demo: deterministic breathing swell from a frame counter.
    if (!cameraOn || !video || !camCtx || video.readyState < 2) {
      const g = 0.5 + 0.5 * Math.sin(frameCount * 0.011);
      const g2 = 0.5 + 0.5 * Math.sin(frameCount * 0.037 + 1.3);
      return 0.15 + 0.45 * g * (0.6 + 0.4 * g2);
    }
    camCtx.drawImage(video, 0, 0, CAM_W, CAM_H);
    const px = camCtx.getImageData(0, 0, CAM_W, CAM_H).data;
    const n = CAM_W * CAM_H;
    const lum = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      lum[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
      if (prevLum) acc += Math.abs(lum[i] - prevLum[i]);
    }
    prevLum = lum;
    // mean abs luminance diff (0..255) → 0..1, gained up (motion is small).
    return Math.min(1, (acc / n / 255) * 12);
  };

  const startCamera = async (): Promise<boolean> => {
    try {
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia) return false;
      stream = await md.getUserMedia({ video: true, audio: false });
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      cameraOn = true;
      return true;
    } catch {
      cameraOn = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      video = null;
      return false;
    }
  };

  const frame = (): FieldState => {
    frameCount++;
    const rawMotion = readMotion();
    // asymmetric smoothing: quick to rise, slow to settle.
    const rate = rawMotion > motion ? 0.25 : 0.05;
    motion += (rawMotion - motion) * rate;
    // fold animation speeds up with motion.
    phase += 0.02 + motion * 0.08;
    // bloom intensity for audio: motion + a gentle breathing floor.
    const target = 0.35 + 0.6 * motion + 0.05 * (0.5 + 0.5 * Math.sin(phase * 0.5));
    bloom += (Math.min(1, target) - bloom) * 0.08;

    // feed/kill animated near the coral/mitosis regime.
    const f = 0.037 + 0.004 * Math.sin(phase * 0.3) + motion * 0.006;
    const k = 0.06 + 0.002 * Math.sin(phase * 0.21) - motion * 0.003;

    // ── Gray-Scott ping-pong ──
    gl.useProgram(rdProg);
    gl.viewport(0, 0, RD_SIZE, RD_SIZE);
    gl.uniform2f(rdU.texel, 1 / RD_SIZE, 1 / RD_SIZE);
    gl.uniform1f(rdU.f, f);
    gl.uniform1f(rdU.k, k);
    gl.uniform1f(rdU.motion, motion);
    gl.uniform1i(rdU.prev, 0);
    bindQuad();
    for (let i = 0; i < RD_STEPS; i++) {
      gl.uniform1f(rdU.phase, phase + i * 0.31);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pong.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const tmp = ping;
      ping = pong;
      pong = tmp;
    }

    // ── display ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(dispProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ping.tex);
    gl.uniform1i(dU.field, 0);
    gl.uniform1f(dU.aspect, canvas.width / Math.max(1, canvas.height));
    gl.uniform1f(dU.fold, 6 + motion * 6);
    gl.uniform1f(dU.phase, phase);
    gl.uniform1f(dU.motion, motion);
    gl.uniform1f(dU.hue, phase * 0.02);
    gl.uniform1f(dU.flick, flickValue);
    bindQuad();
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return { motion, bloom, cameraOn };
  };

  const setFlick = (v: number) => {
    flickValue = v;
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const dispose = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) {
      video.srcObject = null;
      video = null;
    }
    gl.deleteProgram(seedProg);
    gl.deleteProgram(rdProg);
    gl.deleteProgram(dispProg);
    gl.deleteTexture(ping.tex);
    gl.deleteTexture(pong.tex);
    gl.deleteFramebuffer(ping.fbo);
    gl.deleteFramebuffer(pong.fbo);
    gl.deleteBuffer(quad);
  };

  return { frame, resize, startCamera, setFlick, dispose };
}
