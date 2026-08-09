// ─────────────────────────────────────────────────────────────────────────────
// 3048 · CHRYSANTHEMUM — the bloom engine (WebGL2 fragment shader + feedback)
//
// One full-screen quad, one scene shader, ping-pong feedback. The scene shader
// COMPOSES the shared log-polar form-constant engine (_shared/visionary/logpolar.ts):
// it folds screen space into an N-fold kaleidoscope, maps into cortical space
// via screenToCortex, generates the plane-wave / hex Turing pattern there, and
// lets the inverse exp() warp turn it into tunnels, spirals, spokes and
// honeycombs (Bressloff–Cowan on Klüver's four form constants). Thin-film
// iridescence + chromatic aberration + feedback trails paint the visionary come-up.
//
// PHOTOSENSITIVE SAFETY: intensity is expressed through slow luminance drift,
// saturation, warp depth and trail persistence — never full-field strobing.
// All animation rates are low; the caller further slows time for reduced-motion.
//
// Degrades to a Canvas2D threshold pattern when WebGL2 is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/visionary/logpolar";
import { PALETTE_GLSL } from "../_shared/palette";

export interface BloomUniforms {
  time: number; // seconds (already scaled for reduced-motion by the caller)
  form: number; // 0..3 form-constant axis
  freq: number; // spatial frequency
  folds: number; // kaleidoscope N-fold symmetry
  warp: number; // log-polar domain-warp amplitude 0..1
  detail: number; // fractal octave mix 0..1
  sat: number; // saturation / colour gain 0..1
  persist: number; // feedback-trail persistence 0..~0.9
  chroma: number; // chromatic aberration amount 0..1
  bright: number; // overall brightness 0..1
  hue: number; // hue rotation
}

export interface BloomHandle {
  render: (u: BloomUniforms) => void;
  resize: () => void;
  dispose: () => void;
}

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main() { gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

const SCENE_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uForm;
uniform float uFreq;
uniform float uFolds;
uniform float uWarp;
uniform float uDetail;
uniform float uSat;
uniform float uPersist;
uniform float uChroma;
uniform float uBright;
uniform float uHue;
uniform sampler2D uPrev;

${LOGPOLAR_GLSL}
${PALETTE_GLSL}

const float PI = 3.14159265359;

// N-fold kaleidoscope fold (mirror wedge) — the classic radial symmetry of the
// come-up chrysanthemum. Fold count grows with loudness (uFolds).
vec2 kaleido(vec2 p, float n) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float seg = 6.28318530718 / max(1.0, n);
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  return r * vec2(cos(a), sin(a));
}

// The cortical-space form field: plane-wave (tunnel/spiral/spoke) crossfading to
// a hex honeycomb, with a loudness-driven domain warp and a fractal octave for
// the ornate unfolding. Returns luminance in [0,1].
float formField(vec2 p, float t) {
  vec2 c = screenToCortex(p);

  // Slow inward drift — travelling through the tunnel (kept well under any
  // flicker band; this is drift, not strobe).
  c.x -= t * 0.14;

  // Loudness-driven log-polar domain warp: the bloom "unfolds".
  c += uWarp * 0.4 * vec2(sin(c.y * 3.0 + t * 0.5), cos(c.x * 2.0 - t * 0.4));

  // Plane-wave form constant: phi 0..PI/2 as the axis sweeps 0..2
  // (tunnel -> spiral -> spoke), then crossfade to the honeycomb lattice.
  float phi = clamp(uForm, 0.0, 2.0) * (PI * 0.25);
  float pw  = formConstant(c, phi, uFreq, t * 0.3);
  float hc  = honeycomb(c, uFreq, t * 0.22);
  float toHex = smoothstep(2.0, 3.0, uForm);
  float base = mix(pw, hc, toHex);

  // Fractal octaves — ornate saturating detail as the tone sustains loud.
  float o2 = formConstant(c, phi, uFreq * 2.0, t * 0.5);
  float o3 = honeycomb(c, uFreq * 3.0, -t * 0.3);
  float ornate = base * 0.55 + 0.45 * (o2 * o3);
  base = mix(base, ornate, uDetail);

  // Sharpen the ridges a touch as detail rises (petals, not blur).
  base = mix(base, smoothstep(0.35, 0.75, base), uDetail * 0.7);
  return base;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  p = kaleido(p, uFolds);

  // Chromatic aberration: sample the field at slightly different radial scales
  // per channel for jeweled iridescent fringes (amount grows with loudness).
  float ca = uChroma * 0.022;
  float fr = formField(p * (1.0 + ca), uTime);
  float fg = formField(p, uTime);
  float fb = formField(p * (1.0 - ca), uTime);
  float m = (fr + fg + fb) / 3.0;

  // Thin-film iridescence: a spectral shimmer keyed to intensity + hue rotation,
  // anchored to the on-brand violet ramp so it reads as one product.
  float hue = uHue + m * 0.55 + 0.12 * sin(uTime * 0.2);
  vec3 irid = 0.5 + 0.5 * cos(6.28318530718 * (hue + vec3(0.0, 0.33, 0.66)));
  vec3 baseCol = dreamPalette(clamp(m * 0.85 + 0.15, 0.0, 1.0));
  vec3 col = mix(baseCol, baseCol * irid * 1.7, uSat * 0.75);

  // Fold the per-channel chromatic separation back in as colour fringes.
  col *= vec3(0.55) + vec3(0.9) * vec3(fr, fg, fb);

  // Radial vignette focuses the flower and keeps edges from flickering.
  float vig = smoothstep(1.5, 0.15, length(p));
  col *= 0.35 + 0.65 * vig;

  col *= uBright;

  // Feedback trails: sample the previous frame with a slow zoom + tiny rotation
  // so the bloom leaves soft comet trails. Persistence grows with loudness.
  vec2 cen = uv - 0.5;
  float rot = 0.004 * uWarp;
  mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
  vec2 puv = R * cen * (1.0 - 0.008 * (0.4 + uWarp)) + 0.5;
  vec3 prev = texture(uPrev, puv).rgb;

  vec3 acc = col + prev * uPersist;

  // Tonemap keeps everything bounded < 1 (no runaway to full-field white) and
  // makes the accumulation glow rather than clip.
  acc = acc / (acc + vec3(0.72));

  fragColor = vec4(acc, 1.0);
}
`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform sampler2D uTex;
void main() {
  fragColor = vec4(texture(uTex, gl_FragCoord.xy / uRes).rgb, 1.0);
}
`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("chrysanthemum shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("chrysanthemum link:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

/** Build the WebGL2 bloom engine. Returns null if WebGL2 is unavailable. */
export function makeBloom(canvas: HTMLCanvasElement): BloomHandle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const sceneProg = link(gl, VERT, SCENE_FRAG);
  const presentProg = link(gl, VERT, PRESENT_FRAG);
  if (!sceneProg || !presentProg) return null;

  const vao = gl.createVertexArray();

  // Prefer 16-bit float feedback for smooth trails; fall back to RGBA8.
  const floatOK = !!gl.getExtension("EXT_color_buffer_float");
  const internal = floatOK ? gl.RGBA16F : gl.RGBA8;
  const texType = floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  let w = 1;
  let h = 1;
  const tex: WebGLTexture[] = [];
  const fbo: WebGLFramebuffer[] = [];

  function makeTarget(): void {
    for (let i = 0; i < 2; i++) {
      const t = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        internal,
        w,
        h,
        0,
        gl!.RGBA,
        texType,
        null,
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      const f = gl!.createFramebuffer();
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        t,
        0,
      );
      // Clear to black so the first feedback read is defined.
      gl!.clearColor(0, 0, 0, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      tex[i] = t!;
      fbo[i] = f!;
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  function dropTargets(): void {
    for (const t of tex) gl!.deleteTexture(t);
    for (const f of fbo) gl!.deleteFramebuffer(f);
    tex.length = 0;
    fbo.length = 0;
  }

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const nh = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (nw === w && nh === h && tex.length === 2) return;
    w = nw;
    h = nh;
    canvas.width = w;
    canvas.height = h;
    dropTargets();
    makeTarget();
  };
  resize();

  // Uniform locations.
  gl.useProgram(sceneProg);
  const S = (n: string) => gl.getUniformLocation(sceneProg, n);
  const uRes = S("uRes");
  const uTime = S("uTime");
  const uForm = S("uForm");
  const uFreq = S("uFreq");
  const uFolds = S("uFolds");
  const uWarp = S("uWarp");
  const uDetail = S("uDetail");
  const uSat = S("uSat");
  const uPersist = S("uPersist");
  const uChroma = S("uChroma");
  const uBright = S("uBright");
  const uHue = S("uHue");
  const uPrev = S("uPrev");
  gl.uniform1i(uPrev, 0);

  const pRes = gl.getUniformLocation(presentProg, "uRes");
  const pTex = gl.getUniformLocation(presentProg, "uTex");

  let src = 0;
  let dst = 1;

  const render = (u: BloomUniforms): void => {
    // Scene pass → dst FBO, reading src texture as the previous frame.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[dst]);
    gl.viewport(0, 0, w, h);
    gl.useProgram(sceneProg);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[src]);
    gl.uniform1i(uPrev, 0);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, u.time);
    gl.uniform1f(uForm, u.form);
    gl.uniform1f(uFreq, u.freq);
    gl.uniform1f(uFolds, u.folds);
    gl.uniform1f(uWarp, u.warp);
    gl.uniform1f(uDetail, u.detail);
    gl.uniform1f(uSat, u.sat);
    gl.uniform1f(uPersist, u.persist);
    gl.uniform1f(uChroma, u.chroma);
    gl.uniform1f(uBright, u.bright);
    gl.uniform1f(uHue, u.hue);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Present dst → screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(presentProg);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[dst]);
    gl.uniform1i(pTex, 0);
    gl.uniform2f(pRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const tmp = src;
    src = dst;
    dst = tmp;
  };

  const dispose = (): void => {
    dropTargets();
    gl.deleteProgram(sceneProg);
    gl.deleteProgram(presentProg);
    gl.deleteVertexArray(vao);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  };

  return { render, resize, dispose };
}

// ── Canvas2D fallback — a faint drifting threshold pattern ───────────────────
export function makeBloomFallback(
  canvas: HTMLCanvasElement,
): BloomHandle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  resize();

  const render = (u: BloomUniforms): void => {
    const cw = canvas.width;
    const ch = canvas.height;
    const cx = cw / 2;
    const cy = ch / 2;
    // Fade the previous frame for cheap trails rather than a hard clear.
    ctx.fillStyle = `rgba(8,4,20,${0.28 - 0.14 * u.persist})`;
    ctx.fillRect(0, 0, cw, ch);
    const rings = 10 + Math.floor(u.detail * 14);
    const maxR = Math.hypot(cx, cy);
    for (let i = rings; i > 0; i--) {
      const f = i / rings;
      const r =
        maxR * f * (1 + 0.06 * Math.sin(u.time * 0.5 + i + u.warp * 3));
      const hueDeg = (u.hue + f * 0.3) * 360;
      const light = 18 + 42 * u.bright * (1 - f * 0.5);
      const alpha = 0.05 + 0.5 * u.sat * (1 - f);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hueDeg}, ${45 + 45 * u.sat}%, ${light}%, ${alpha})`;
      ctx.lineWidth = 2 + 6 * u.warp;
      ctx.stroke();
    }
  };

  const dispose = (): void => {
    /* nothing to release */
  };

  return { render, resize, dispose };
}
