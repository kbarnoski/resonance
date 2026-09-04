// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — raw WebGL2 optical-flow → feedback-advection renderer for 16832-gushbody.
//
// The technique is ported from Adam Ferriss' *Gush* (Experiments with Google),
// which wraps Andrew Benson's GLSL Horn–Schunck optical-flow shader in a WebGL
// feedback loop so a webcam smears into accumulating motion trails. Here the raw
// camera image is NOT the light source — Karel's piano is. His audio injects
// glowing "ink" into a ping-pong feedback field, and the flow estimated from the
// camera advects (pushes / smears) that field so his music becomes a fluid you
// stir with your hands.
//
// Pipeline, per frame (two fullscreen passes over a big triangle):
//   1. FEEDBACK pass  → renders into one of two ping-pong RGBA8 FBOs.
//        · estimates 2-component flow from current+previous camera luminance
//          (gradient/temporal, Horn–Schunck-style: flow ≈ -It · normalize(∇I)),
//          or a slowly rotating procedural flow when no camera is present;
//        · advects the previous feedback frame by sampling it at uv − flow·scale;
//        · decays it (trail memory);
//        · injects new warm ink from the audio spectrum, tinted by the chord.
//   2. DISPLAY pass   → tone-maps the feedback field to the screen as ember fluid
//        on a deep ground, with a soft vignette. No grain/noise overlay (banned).
//
// All GL resources are owned here and released by destroy().
// ─────────────────────────────────────────────────────────────────────────────

const SIM_MAX = 1280; // cap the internal sim resolution for perf

const VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
// fullscreen triangle — no vertex buffer needed
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FEEDBACK_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrev;     // previous feedback field
uniform sampler2D uCamCurr;  // current camera luminance (RGBA)
uniform sampler2D uCamPrev;  // previous camera frame
uniform sampler2D uSpec;     // 256x1 audio spectrum (R)
uniform vec2  uTexel;        // 1/simSize
uniform vec3  uTint;         // warm ink colour from the sounding chord
uniform float uInk;          // 0..1 loudness → injection brightness
uniform float uFlowScale;    // how hard motion pushes the field
uniform float uProc;         // procedural flow strength (fallback / base stir)
uniform float uHasCam;       // 1.0 when a live camera flow field is available
uniform float uTime;
uniform float uDecay;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Horn–Schunck-style single-tap estimate: brightness gradient + temporal diff.
vec2 camFlow(vec2 uv) {
  vec2 px = uTexel;
  float cxp = lum(texture(uCamCurr, uv + vec2(px.x, 0.0)).rgb);
  float cxn = lum(texture(uCamCurr, uv - vec2(px.x, 0.0)).rgb);
  float cyp = lum(texture(uCamCurr, uv + vec2(0.0, px.y)).rgb);
  float cyn = lum(texture(uCamCurr, uv - vec2(0.0, px.y)).rgb);
  vec2 grad = vec2(cxp - cxn, cyp - cyn);
  float it = lum(texture(uCamCurr, uv).rgb) - lum(texture(uCamPrev, uv).rgb);
  float g2 = dot(grad, grad) + 1e-4;
  vec2 f = -it * grad / sqrt(g2);
  return clamp(f, vec2(-0.05), vec2(0.05));
}

// Slowly rotating divergence-light field so the piece still stirs with no camera.
vec2 procFlow(vec2 uv) {
  float t = uTime * 0.35;
  vec2 c = uv - 0.5;
  vec2 swirl = vec2(-c.y, c.x);
  vec2 wob = vec2(sin(uv.y * 8.0 + t), cos(uv.x * 8.0 - t * 0.8));
  return (swirl * 1.6 + wob * 0.25) * 0.02;
}

void main() {
  vec2 uv = vUv;

  // Camera texture is mirrored (selfie) — flip x when sampling it.
  vec2 camUv = vec2(1.0 - uv.x, uv.y);
  vec2 flow = uProc * procFlow(uv);
  if (uHasCam > 0.5) {
    flow += camFlow(camUv) * uFlowScale;
  }

  // Advect: pull the previous field from where this pixel's fluid came from.
  vec2 src = clamp(uv - flow, vec2(0.0), vec2(1.0));
  vec3 prev = texture(uPrev, src).rgb * uDecay;

  // Inject Karel's music as a luminous spectral ribbon that drifts vertically.
  float band = texture(uSpec, vec2(uv.x, 0.5)).r;
  float centerY = 0.5 + 0.16 * sin(uTime * 0.4 + uv.x * 7.0);
  float ribbon = exp(-pow((uv.y - centerY) / 0.10, 2.0));
  // a second, slower ribbon for depth
  float centerY2 = 0.5 + 0.26 * sin(uTime * 0.23 - uv.x * 4.0 + 1.7);
  float ribbon2 = 0.5 * exp(-pow((uv.y - centerY2) / 0.16, 2.0));
  float inj = band * (ribbon + ribbon2) * uInk;

  vec3 col = prev + uTint * inj * 1.4;
  // gentle ceiling so trails glow without clipping to white mush
  col = min(col, vec3(1.6));
  outColor = vec4(col, 1.0);
}`;

const DISPLAY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uField;
uniform float uTime;

void main() {
  vec2 uv = vUv;
  vec3 c = texture(uField, uv).rgb;

  // deep ember ground + tone curve that keeps the fluid warm and luminous
  vec3 ground = vec3(0.035, 0.018, 0.012);
  vec3 col = ground + c;
  // soft filmic-ish knee (no grain overlay — banned lab-wide)
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.85));
  // nudge the whole thing toward amber so mixed hues read as embers
  col *= vec3(1.10, 0.92, 0.72);

  // vignette to sink the edges into the deep ground
  vec2 d = uv - 0.5;
  float vig = smoothstep(0.95, 0.35, dot(d, d) * 2.2);
  col *= mix(0.55, 1.0, vig);

  outColor = vec4(col, 1.0);
}`;

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

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

interface Fbo {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
}

function makeFieldTex(gl: WebGL2RenderingContext, w: number, h: number): Fbo {
  const tex = gl.createTexture();
  if (!tex) throw new Error("texture alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("framebuffer alloc failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

function makeCamTex(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("texture alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export interface RenderParams {
  ink: number;
  tint: [number, number, number];
  procStrength: number;
  flowScale: number;
  hasCam: boolean;
  time: number;
}

export interface Renderer {
  render(p: RenderParams): void;
  uploadCamera(src: HTMLCanvasElement): void;
  updateSpectrum(data: Uint8Array<ArrayBuffer>): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

/** Build the WebGL2 renderer, or throw if WebGL2 / FBOs are unavailable. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("no-webgl2");

  const progFeedback = link(gl, VERT, FEEDBACK_FRAG);
  const progDisplay = link(gl, VERT, DISPLAY_FRAG);

  const vao = gl.createVertexArray();

  // ping-pong feedback field
  let simW = 2;
  let simH = 2;
  let a = makeFieldTex(gl, simW, simH);
  let b = makeFieldTex(gl, simW, simH);

  // camera curr/prev
  let camCurr = makeCamTex(gl);
  let camPrev = makeCamTex(gl);
  let camSeeded = false;

  // 256x1 spectrum texture (R8)
  const spec = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, spec);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(256));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // uniform locations
  const fbLoc = {
    prev: gl.getUniformLocation(progFeedback, "uPrev"),
    camCurr: gl.getUniformLocation(progFeedback, "uCamCurr"),
    camPrev: gl.getUniformLocation(progFeedback, "uCamPrev"),
    spec: gl.getUniformLocation(progFeedback, "uSpec"),
    texel: gl.getUniformLocation(progFeedback, "uTexel"),
    tint: gl.getUniformLocation(progFeedback, "uTint"),
    ink: gl.getUniformLocation(progFeedback, "uInk"),
    flowScale: gl.getUniformLocation(progFeedback, "uFlowScale"),
    proc: gl.getUniformLocation(progFeedback, "uProc"),
    hasCam: gl.getUniformLocation(progFeedback, "uHasCam"),
    time: gl.getUniformLocation(progFeedback, "uTime"),
    decay: gl.getUniformLocation(progFeedback, "uDecay"),
  };
  const dsLoc = {
    field: gl.getUniformLocation(progDisplay, "uField"),
    time: gl.getUniformLocation(progDisplay, "uTime"),
  };

  function allocField(w: number, h: number): void {
    const clampW = Math.max(2, Math.min(SIM_MAX, Math.round(w)));
    const clampH = Math.max(2, Math.min(SIM_MAX, Math.round(h)));
    if (clampW === simW && clampH === simH) return;
    simW = clampW;
    simH = clampH;
    gl!.deleteTexture(a.tex);
    gl!.deleteFramebuffer(a.fb);
    gl!.deleteTexture(b.tex);
    gl!.deleteFramebuffer(b.fb);
    a = makeFieldTex(gl!, simW, simH);
    b = makeFieldTex(gl!, simW, simH);
  }

  function resize(w: number, h: number): void {
    allocField(w, h);
  }

  function uploadCamera(src: HTMLCanvasElement): void {
    // roll current → previous, then upload the fresh frame into current
    const tmp = camPrev;
    camPrev = camCurr;
    camCurr = tmp;
    gl!.bindTexture(gl!.TEXTURE_2D, camCurr);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, gl!.RGBA, gl!.UNSIGNED_BYTE, src);
    if (!camSeeded) {
      // seed prev with the same first frame so flow starts at zero, not garbage
      gl!.bindTexture(gl!.TEXTURE_2D, camPrev);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, gl!.RGBA, gl!.UNSIGNED_BYTE, src);
      camSeeded = true;
    }
  }

  function updateSpectrum(data: Uint8Array<ArrayBuffer>): void {
    gl!.bindTexture(gl!.TEXTURE_2D, spec);
    gl!.pixelStorei(gl!.UNPACK_ALIGNMENT, 1);
    const n = Math.min(256, data.length);
    const row = new Uint8Array(256);
    row.set(data.subarray(0, n));
    gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, 256, 1, gl!.RED, gl!.UNSIGNED_BYTE, row);
  }

  function render(p: RenderParams): void {
    gl!.bindVertexArray(vao);

    // ── feedback / advection pass → write into b, read from a ────────────────
    gl!.useProgram(progFeedback);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, b.fb);
    gl!.viewport(0, 0, simW, simH);

    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, a.tex);
    gl!.uniform1i(fbLoc.prev, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, camCurr);
    gl!.uniform1i(fbLoc.camCurr, 1);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, camPrev);
    gl!.uniform1i(fbLoc.camPrev, 2);
    gl!.activeTexture(gl!.TEXTURE3);
    gl!.bindTexture(gl!.TEXTURE_2D, spec);
    gl!.uniform1i(fbLoc.spec, 3);

    gl!.uniform2f(fbLoc.texel, 1 / simW, 1 / simH);
    gl!.uniform3f(fbLoc.tint, p.tint[0], p.tint[1], p.tint[2]);
    gl!.uniform1f(fbLoc.ink, p.ink);
    gl!.uniform1f(fbLoc.flowScale, p.flowScale);
    gl!.uniform1f(fbLoc.proc, p.procStrength);
    gl!.uniform1f(fbLoc.hasCam, p.hasCam ? 1 : 0);
    gl!.uniform1f(fbLoc.time, p.time);
    gl!.uniform1f(fbLoc.decay, 0.965);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // swap ping-pong
    const t = a;
    a = b;
    b = t;

    // ── display pass → default framebuffer ───────────────────────────────────
    gl!.useProgram(progDisplay);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, a.tex);
    gl!.uniform1i(dsLoc.field, 0);
    gl!.uniform1f(dsLoc.time, p.time);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    gl!.bindVertexArray(null);
  }

  function destroy(): void {
    try {
      gl!.deleteProgram(progFeedback);
      gl!.deleteProgram(progDisplay);
      gl!.deleteVertexArray(vao);
      gl!.deleteTexture(a.tex);
      gl!.deleteFramebuffer(a.fb);
      gl!.deleteTexture(b.tex);
      gl!.deleteFramebuffer(b.fb);
      gl!.deleteTexture(camCurr);
      gl!.deleteTexture(camPrev);
      gl!.deleteTexture(spec);
      const lose = gl!.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      /* context already gone */
    }
  }

  return { render, uploadCamera, updateSpectrum, resize, destroy };
}
