// glfield.ts — the visible renderer for 2590-tremor (WebGL2 only).
//
// A living "voice-field": a ping-pong feedback trail that follows the motion
// centroid and stretches / colors with pitch and roughness (the canonical
// violet→magenta art ramp). The body's path becomes a glowing continuous mark,
// the sonic gesture made visible. This is the VISIBLE output — never a Canvas2D
// drawing surface. If WebGL2 is unavailable, makeVoiceField returns null and the
// page falls back to an SVG renderer.

export interface FieldViz {
  cx: number; // 0..1
  cy: number; // 0..1 (0 = top)
  pitch01: number; // normalized pitch for color
  rough: number; // 0..1
  energy: number; // 0..1
  time: number; // seconds
}

export interface VoiceField {
  draw(v: FieldViz): void;
  resize(): void;
  dispose(): void;
}

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Feedback pass: fade + drift the previous frame, then add a splat at centroid.
const FEEDBACK = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPrev;
uniform vec2 uCentroid;   // 0..1, y flipped to match texture space
uniform float uPitch;     // 0..1
uniform float uRough;     // 0..1
uniform float uEnergy;    // 0..1
uniform float uTime;
uniform vec2 uRes;

vec3 dreamPalette(float t) {
  vec3 deep    = vec3(0.043, 0.027, 0.075);
  vec3 indigo  = vec3(0.388, 0.400, 0.945);
  vec3 violet  = vec3(0.545, 0.361, 0.965);
  vec3 magenta = vec3(0.690, 0.263, 0.878);
  vec3 light   = vec3(0.769, 0.710, 0.992);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float aspect = uRes.x / uRes.y;
  // Rising, outward drift so trails feel like breath leaving the body.
  vec2 drift = vec2(0.0, -0.0016 - uEnergy * 0.004);
  drift.x += (uCentroid.x - vUv.x) * 0.004 * uEnergy;
  vec3 prev = texture(uPrev, vUv + drift).rgb;
  float decay = 0.955 - uEnergy * 0.02;
  prev *= decay;

  // Splat at the centroid, stretched by roughness, jittered when rough.
  vec2 d = vUv - uCentroid;
  d.x *= aspect;
  float jitter = (hash(vUv * uRes.xy + uTime) - 0.5) * uRough * 0.05;
  float rr = length(d) + jitter;
  float radius = 0.04 + uEnergy * 0.05;
  float splat = smoothstep(radius, 0.0, rr) * (0.25 + uEnergy * 1.1);

  vec3 col = dreamPalette(uPitch);
  // Roughness pushes hue toward the hot magenta end and adds sparks.
  col = mix(col, dreamPalette(min(1.0, uPitch + 0.4)), uRough * 0.6);

  vec3 outCol = prev + col * splat;
  // Soft ceiling to avoid runaway accumulation in 8-bit.
  outCol = min(outCol, vec3(1.4));
  fragColor = vec4(outCol, 1.0);
}`;

// Present pass: tone-map the accumulation buffer to the screen with a vignette.
const PRESENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uRes;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c = c / (c + vec3(0.55)); // reinhard-ish
  c = pow(c, vec3(0.85));
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.95, 0.35, length(q));
  c *= mix(0.6, 1.0, vig);
  fragColor = vec4(c, 1.0);
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

export function makeVoiceField(canvas: HTMLCanvasElement): VoiceField | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  let feedbackProg: WebGLProgram;
  let presentProg: WebGLProgram;
  try {
    feedbackProg = link(gl, VERT, FEEDBACK);
    presentProg = link(gl, VERT, PRESENT);
  } catch {
    return null;
  }

  const vao = gl.createVertexArray();

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  let W = 1;
  let H = 1;

  const makeTarget = (w: number, h: number) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  };

  let a = makeTarget(1, 1);
  let b = makeTarget(1, 1);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === W && h === H) return;
    W = w;
    H = h;
    canvas.width = W;
    canvas.height = H;
    gl.deleteTexture(a.tex);
    gl.deleteFramebuffer(a.fbo);
    gl.deleteTexture(b.tex);
    gl.deleteFramebuffer(b.fbo);
    a = makeTarget(W, H);
    b = makeTarget(W, H);
    // Clear both to black.
    for (const target of [a, b]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0.016, 0.011, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };
  resize();

  const uF = {
    prev: gl.getUniformLocation(feedbackProg, "uPrev"),
    centroid: gl.getUniformLocation(feedbackProg, "uCentroid"),
    pitch: gl.getUniformLocation(feedbackProg, "uPitch"),
    rough: gl.getUniformLocation(feedbackProg, "uRough"),
    energy: gl.getUniformLocation(feedbackProg, "uEnergy"),
    time: gl.getUniformLocation(feedbackProg, "uTime"),
    res: gl.getUniformLocation(feedbackProg, "uRes"),
  };
  const uP = {
    tex: gl.getUniformLocation(presentProg, "uTex"),
    res: gl.getUniformLocation(presentProg, "uRes"),
  };

  const draw = (v: FieldViz) => {
    gl.bindVertexArray(vao);

    // Feedback: read a, write b.
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(feedbackProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(uF.prev, 0);
    // Texture space has origin bottom-left; motion cy is top-down → flip y.
    gl.uniform2f(uF.centroid, v.cx, 1 - v.cy);
    gl.uniform1f(uF.pitch, v.pitch01);
    gl.uniform1f(uF.rough, v.rough);
    gl.uniform1f(uF.energy, v.energy);
    gl.uniform1f(uF.time, v.time);
    gl.uniform2f(uF.res, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Present b to screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform1i(uP.tex, 0);
    gl.uniform2f(uP.res, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Swap.
    const tmp = a;
    a = b;
    b = tmp;
  };

  const dispose = () => {
    try {
      gl.deleteProgram(feedbackProg);
      gl.deleteProgram(presentProg);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(a.tex);
      gl.deleteFramebuffer(a.fbo);
      gl.deleteTexture(b.tex);
      gl.deleteFramebuffer(b.fbo);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      /* noop */
    }
  };

  return { draw, resize, dispose };
}
