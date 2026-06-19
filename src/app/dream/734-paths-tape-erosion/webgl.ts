// webgl.ts — Tape Erosion · raw WebGL2 ping-pong feedback spectrogram renderer
// NO three.js, NO WebGPU. Hand-written GLSL fragment shaders.
// Canvas2D fallback is handled externally in page.tsx.

import type { GLErosionParams } from "./movements";

// ─── GLSL sources ──────────────────────────────────────────────────────────────

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Feedback pass: reads the previous frame, applies decay/smear/advect/noise,
// then deposits the new FFT column on the right edge.
const FEEDBACK_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_prev;      // previous frame field
uniform sampler2D u_fft;       // 1-pixel-wide FFT column (height = FFT bins)
uniform float u_decay;
uniform float u_smear;
uniform float u_bleed;
uniform float u_noiseLevel;
uniform float u_advect;
uniform float u_time;
uniform float u_brightness;

// Hash for cheap noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Advect: shift field horizontally (tape movement simulation)
  vec2 fetchUV = v_uv + vec2(-u_advect, 0.0);

  // Smear: sample a spread of neighbours and average (horizontal tape smear)
  vec4 smeared = vec4(0.0);
  float totalW = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -2; j <= 2; j++) {
      float fi = float(i);
      float fj = float(j);
      float w = exp(-(fi*fi)/(2.0*9.0) - (fj*fj)/(2.0*4.0));
      vec2 off = vec2(fi * u_smear, fj * u_bleed);
      smeared += texture(u_prev, fetchUV + off) * w;
      totalW += w;
    }
  }
  smeared /= totalW;

  // Decay (magnetic memory loss)
  vec4 field = smeared * u_decay;

  // Tiny noise inject (tape hiss / magnetic grain)
  float n = hash(v_uv + vec2(u_time * 0.01, u_time * 0.007));
  field += vec4(n * u_noiseLevel);

  // Deposit FFT on the right edge (newest data column)
  float edgeZone = smoothstep(1.0 - 2.0/512.0, 1.0, v_uv.x);
  if (edgeZone > 0.0) {
    // v_uv.y maps to FFT: y=0 is top = highest frequency
    // FFT texture is (1 x H): sample with uv = (0.5, v_uv.y)
    float fftVal = texture(u_fft, vec2(0.5, v_uv.y)).r;
    fftVal = pow(fftVal, 0.7); // gentle gamma for visibility
    field = mix(field, vec4(fftVal), edgeZone);
  }

  // Clamp to prevent blow-up
  field = clamp(field, 0.0, 1.2);

  fragColor = field;
}
`;

// Display pass: reads the feedback field, applies colourmap + brightness.
const DISPLAY_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_field;
uniform float u_brightness;
uniform float u_time;

// Ryoji Ikeda / spectral-feedback colormap:
// silence = deep black-indigo → dim teal → warm white at peak
vec3 spectralColor(float v, float freqT) {
  // freqT = 0 (bass/bottom) → 1 (treble/top)
  float a = clamp(v, 0.0, 1.0);
  a = a * a; // gamma compress

  // Color bands
  vec3 col = vec3(0.0);
  // Low-level glow: deep violet / indigo
  col += vec3(0.18, 0.02, 0.35) * smoothstep(0.0, 0.08, a);
  // Mid: cyan-teal
  col += vec3(0.0, 0.55, 0.65) * smoothstep(0.06, 0.3, a);
  // Bright: warm white with frequency hue bias
  vec3 warmWhite = mix(vec3(1.0, 0.88, 0.65), vec3(0.70, 0.90, 1.0), freqT);
  col += warmWhite * smoothstep(0.22, 0.80, a);
  // Overload peak: pure white
  col += vec3(1.0) * smoothstep(0.72, 1.0, a);

  return clamp(col, 0.0, 1.0);
}

void main() {
  float v = texture(u_field, v_uv).r;
  // freqT: 0 = bottom of screen (bass), 1 = top (treble)
  // In our field y=0 is top (high freq), y=1 is bottom (bass)
  float freqT = 1.0 - v_uv.y;

  // Subtle horizontal scan-line flicker (tape head noise)
  float scanline = 1.0 - 0.04 * sin(v_uv.y * 180.0 + u_time * 0.6);

  vec3 col = spectralColor(v * u_brightness * scanline, freqT);

  // Vignette
  vec2 d = v_uv - 0.5;
  float vig = 1.0 - dot(d, d) * 0.6;
  col *= vig;

  fragColor = vec4(col, 1.0);
}
`;

// ─── GL helpers ───────────────────────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function compileProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  // Pin a_pos to location 0 before linking so both programs share the same VAO
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function makeFBO(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): { fbo: WebGLFramebuffer; tex: WebGLTexture } | null {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface SpectrogramRenderer {
  /** Call each animation frame; fftData is Uint8Array from AnalyserNode */
  drawFrame(fftData: Uint8Array, erosion: GLErosionParams, timeSeconds: number): void;
  /** Resize internal FBOs to match canvas dimensions */
  resize(w: number, h: number): void;
  /** Destroy all GL resources */
  dispose(): void;
}

export function makeSpectrogramRenderer(
  gl: WebGL2RenderingContext,
  canvasW: number,
  canvasH: number,
): SpectrogramRenderer | null {
  // Check float texture support
  const extFloat = gl.getExtension("EXT_color_buffer_float");
  if (!extFloat) {
    console.warn("EXT_color_buffer_float not supported");
    return null;
  }

  const feedbackProgMaybe = compileProgram(gl, VERT_SRC, FEEDBACK_FRAG_SRC);
  const displayProgMaybe = compileProgram(gl, VERT_SRC, DISPLAY_FRAG_SRC);
  if (!feedbackProgMaybe || !displayProgMaybe) return null;
  // Non-null bindings the captured closures below can rely on (the guard above
  // preserves graceful fallback if either program failed to compile/link).
  const feedbackProg: WebGLProgram = feedbackProgMaybe;
  const displayProg: WebGLProgram = displayProgMaybe;

  // Full-screen quad VAO
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  const posLocFb = gl.getAttribLocation(feedbackProg, "a_pos");
  gl.enableVertexAttribArray(posLocFb);
  gl.vertexAttribPointer(posLocFb, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // FFT column texture: 1 × FFT_BINS (float)
  const FFT_BINS = 1024; // analyser.frequencyBinCount with fftSize=2048
  const fftTex = gl.createTexture();
  if (!fftTex) return null;
  gl.bindTexture(gl.TEXTURE_2D, fftTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, FFT_BINS, 0, gl.RED, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let W = canvasW;
  let H = canvasH;

  let pingA = makeFBO(gl, W, H);
  let pingB = makeFBO(gl, W, H);
  if (!pingA || !pingB) return null;

  let flip = false; // false → read A write B; true → read B write A

  const fftFloat = new Float32Array(FFT_BINS);

  function resize(w: number, h: number) {
    if (w === W && h === H) return;
    W = w;
    H = h;
    // Delete old FBOs
    if (pingA) { gl.deleteFramebuffer(pingA.fbo); gl.deleteTexture(pingA.tex); }
    if (pingB) { gl.deleteFramebuffer(pingB.fbo); gl.deleteTexture(pingB.tex); }
    pingA = makeFBO(gl, W, H);
    pingB = makeFBO(gl, W, H);
    flip = false;
  }

  function drawFrame(
    fftData: Uint8Array,
    erosion: GLErosionParams,
    timeSeconds: number,
  ) {
    if (!pingA || !pingB) return;

    const src = flip ? pingB : pingA;
    const dst = flip ? pingA : pingB;
    flip = !flip;

    // ── Upload FFT column ─────────────────────────────────────────────────────
    // fftData: Uint8Array length = frequencyBinCount = FFT_BINS
    // Map 0–255 → 0.0–1.0 and flip vertically (high freq = top of texture)
    const len = Math.min(fftData.length, FFT_BINS);
    for (let i = 0; i < len; i++) {
      fftFloat[FFT_BINS - 1 - i] = fftData[i] / 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, fftTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, FFT_BINS, gl.RED, gl.FLOAT, fftFloat);

    // ── Feedback pass → dst FBO ───────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(feedbackProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(feedbackProg, "u_prev"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fftTex);
    gl.uniform1i(gl.getUniformLocation(feedbackProg, "u_fft"), 1);

    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_decay"), erosion.decay);
    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_smear"), erosion.smear);
    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_bleed"), erosion.bleed);
    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_noiseLevel"), erosion.noiseLevel);
    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_advect"), erosion.advect);
    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_time"), timeSeconds);
    gl.uniform1f(gl.getUniformLocation(feedbackProg, "u_brightness"), erosion.brightness);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Display pass → canvas ─────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(displayProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(gl.getUniformLocation(displayProg, "u_field"), 0);
    gl.uniform1f(gl.getUniformLocation(displayProg, "u_brightness"), erosion.brightness);
    gl.uniform1f(gl.getUniformLocation(displayProg, "u_time"), timeSeconds);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  function dispose() {
    if (pingA) { gl.deleteFramebuffer(pingA.fbo); gl.deleteTexture(pingA.tex); }
    if (pingB) { gl.deleteFramebuffer(pingB.fbo); gl.deleteTexture(pingB.tex); }
    gl.deleteTexture(fftTex);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(feedbackProg);
    gl.deleteProgram(displayProg);
  }

  return { drawFrame, resize, dispose };
}

// ─── Canvas2D fallback renderer ───────────────────────────────────────────────
// Used when WebGL2 / float textures are unavailable.

export interface Canvas2DRenderer {
  drawFrame(fftData: Uint8Array, erosion: GLErosionParams): void;
  dispose(): void;
}

export function makeCanvas2DRenderer(
  canvas: HTMLCanvasElement,
): Canvas2DRenderer | null {
  const ctxMaybe = canvas.getContext("2d");
  if (!ctxMaybe) return null;
  // Non-null binding the drawFrame closure below can capture.
  const ctx: CanvasRenderingContext2D = ctxMaybe;

  // Two ping-pong offscreen canvases to avoid drawing-to-self issues
  let bufA: HTMLCanvasElement | null = document.createElement("canvas");
  let bufB: HTMLCanvasElement | null = document.createElement("canvas");
  bufA.width = canvas.width;
  bufA.height = canvas.height;
  bufB.width = canvas.width;
  bufB.height = canvas.height;

  const ctxAMaybe = bufA.getContext("2d");
  const ctxBMaybe = bufB.getContext("2d");
  if (!ctxAMaybe || !ctxBMaybe) return null;
  // Non-null bindings the drawFrame closure below can capture.
  const ctxA: CanvasRenderingContext2D = ctxAMaybe;
  const ctxB: CanvasRenderingContext2D = ctxBMaybe;

  ctxA.fillStyle = "#000";
  ctxA.fillRect(0, 0, bufA.width, bufA.height);
  ctxB.fillStyle = "#000";
  ctxB.fillRect(0, 0, bufB.width, bufB.height);

  let pingFlip = false; // false: read bufA write bufB; true: read bufB write bufA

  function drawFrame(fftData: Uint8Array, erosion: GLErosionParams) {
    if (!bufA || !bufB) return;
    // Capture locals so TypeScript can narrow them as non-null
    const localA = bufA;
    const localB = bufB;

    const W = canvas.width;
    const H = canvas.height;

    const srcBuf: HTMLCanvasElement = pingFlip ? localB : localA;
    const dstBuf: HTMLCanvasElement = pingFlip ? localA : localB;
    const dctx: CanvasRenderingContext2D = pingFlip ? ctxA : ctxB;
    pingFlip = !pingFlip;

    if (srcBuf.width !== W || srcBuf.height !== H) {
      bufA.width = W; bufA.height = H;
      bufB.width = W; bufB.height = H;
      ctxA.fillStyle = "#000"; ctxA.fillRect(0, 0, W, H);
      ctxB.fillStyle = "#000"; ctxB.fillRect(0, 0, W, H);
    }

    // Decay: dark overlay on destination
    dctx.globalAlpha = 1;
    dctx.fillStyle = "#000";
    dctx.fillRect(0, 0, W, H);

    // Shift source left by 1px (scroll the spectrogram)
    const decayAlpha = Math.min(1, Math.max(0, erosion.decay));
    dctx.globalAlpha = decayAlpha;
    dctx.drawImage(srcBuf, -1, 0);
    dctx.globalAlpha = 1;

    // Draw new FFT column on the right edge
    const bins = fftData.length;
    const colW = 2;
    const xRight = W - colW;
    for (let i = 0; i < bins; i++) {
      const v = fftData[bins - 1 - i] / 255;
      const a = Math.pow(v, 0.7) * erosion.brightness;
      const freqT = i / bins;
      const r = Math.round(255 * Math.min(1, a * (0.6 + 0.4 * (1 - freqT))));
      const g = Math.round(255 * Math.min(1, a * 0.85));
      const b = Math.round(255 * Math.min(1, a * (0.6 + 0.4 * freqT)));
      const yTop = Math.round((1 - (i + 1) / bins) * H);
      const yBot = Math.round((1 - i / bins) * H);
      dctx.fillStyle = `rgb(${r},${g},${b})`;
      dctx.fillRect(xRight, yTop, colW, Math.max(1, yBot - yTop));
    }

    // Blit to main canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(dstBuf, 0, 0);
  }

  function dispose() {
    bufA = null;
    bufB = null;
  }

  return { drawFrame, dispose };
}
