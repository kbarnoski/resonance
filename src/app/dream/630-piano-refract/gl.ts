// gl.ts — WebGL2 "prism" renderer for 630-piano-refract, with a real Canvas2D
// fallback. Renders the refraction as a fan of light: an incoming white piano
// beam splits into 5 colored bands — Hammers (cool steel) + the 4 register
// string voices (violet → rose → amber → emerald, low→high). Each band shows
// its spectral profile (NMF basis W[:,k] / the hammer spectrum) and a live
// level; soloed voices glow, muted voices dim.
//
// Hand-written GLSL ES 3.00, no three.js, no CDN. If WebGL2 is unavailable the
// caller asks for the Canvas2D scene instead (same 5 bands via fillRect).

export const VOICE_COUNT = 5; // 0 = hammers, 1..4 = Low / Low-mid / High-mid / High

export interface PrismScene {
  backend: "webgl2" | "canvas2d";
  /**
   * Upload each voice's spectral profile (length = profileLen, 0..1). Index 0 is
   * the hammer spectrum; 1..4 are the NMF basis profiles low→high.
   */
  setProfiles(profiles: Float32Array[], profileLen: number): void;
  /**
   * Per-frame draw.
   * @param levels  per-voice live level 0..1 (length VOICE_COUNT)
   * @param gains   per-voice effective gain 0..1 (after solo/mute), length VOICE_COUNT
   * @param soloed  index of soloed voice, or -1
   * @param time    seconds (for idle shimmer)
   */
  render(levels: Float32Array, gains: Float32Array, soloed: number, time: number): void;
  resize(): void;
  dispose(): void;
}

// Per-voice base colors (RGB 0..1): steel, violet, rose, amber, emerald.
export const VOICE_COLORS: [number, number, number][] = [
  [0.62, 0.72, 0.82], // hammers — cool steel
  [0.66, 0.45, 0.95], // Low — violet
  [0.98, 0.42, 0.66], // Low-mid — rose
  [0.98, 0.74, 0.36], // High-mid — amber
  [0.42, 0.92, 0.66], // High — emerald
];

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fragment: the prism. Left edge = incoming white beam. The beam refracts into
// VOICE_COUNT angular bands that fan across the screen. Each band's brightness
// is driven by its live level + gain; its vertical texture is the voice's
// spectral profile. Soloed band glows; muted bands fade.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

#define N 5

uniform sampler2D u_profiles; // N rows, each a spectral profile (R = magnitude)
uniform vec3 u_colors[N];
uniform float u_levels[N];
uniform float u_gains[N];
uniform int u_soloed;
uniform float u_time;

void main() {
  vec2 uv = v_uv;
  vec3 col = vec3(0.0);

  // The incoming beam enters at the left-center and fans rightward. We map the
  // vertical position into N bands that splay out with x (a prism fan).
  float x = uv.x;
  float y = uv.y;

  // Beam source glow on the left edge.
  float beam = smoothstep(0.10, 0.0, x) * smoothstep(0.34, 0.0, abs(y - 0.5));
  col += vec3(0.9, 0.95, 1.0) * beam * 0.5;

  // Fan: band centers spread from the pivot (x small) outward.
  // At x=0 all bands converge near center; at x=1 they're evenly stacked.
  float spread = smoothstep(0.04, 1.0, x);
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // Target stacked position for this band at full spread (0..1, evenly split).
    float target = (fi + 0.5) / float(N);
    float center = mix(0.5, target, spread);
    float halfW = mix(0.01, 0.5 / float(N), spread);

    float d = abs(y - center);
    // Soft band membership.
    float band = smoothstep(halfW, halfW * 0.4, d);

    // The spectral profile reads along x within the band (time-independent comb).
    // Sample the i-th row of the profile texture using x as the frequency axis.
    float prof = texture(u_profiles, vec2(x, (fi + 0.5) / float(N))).r;

    float lvl = u_levels[i];
    float g = u_gains[i];
    // Base visibility so a silent glance still shows the full prism.
    float vis = 0.16 + 0.84 * clamp(g, 0.0, 1.0);
    float energy = (0.22 + 0.78 * lvl) * vis;

    // Profile shapes a bright filament inside the band.
    float fil = band * (0.35 + 0.65 * prof) * energy;

    vec3 c = u_colors[i];
    // Soloed band glows; explicitly muted (gain ~0) dims further.
    float glow = (u_soloed == i) ? 1.6 : 1.0;
    if (u_soloed >= 0 && u_soloed != i) glow *= 0.45;

    col += c * fil * 1.5 * glow;

    // A thin bright spine along each band center for legibility.
    float spine = smoothstep(0.006, 0.0, d) * spread;
    col += c * spine * energy * 0.8 * glow;
  }

  // Refraction shimmer so a still 06:30 glance reads as alive.
  float shimmer = 0.5 + 0.5 * sin(u_time * 1.3 + x * 9.0);
  col += vec3(0.015, 0.02, 0.03) * shimmer;

  // Vignette.
  float vig = smoothstep(1.35, 0.25, length(uv - 0.5));
  col *= 0.55 + 0.45 * vig;

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

/**
 * Try to build the WebGL2 prism. Throws if WebGL2 is unavailable — the caller
 * then falls back to `createCanvas2dScene`.
 */
export function createGlScene(canvas: HTMLCanvasElement): PrismScene {
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

  // One texture: VOICE_COUNT rows, each a spectral profile (R8). Built in
  // setProfiles. Use NEAREST on the row axis so bands don't bleed into each other.
  const profTex = gl.createTexture();
  if (!profTex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, profTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uProfiles = gl.getUniformLocation(prog, "u_profiles");
  const uColors = gl.getUniformLocation(prog, "u_colors");
  const uLevels = gl.getUniformLocation(prog, "u_levels");
  const uGains = gl.getUniformLocation(prog, "u_gains");
  const uSoloed = gl.getUniformLocation(prog, "u_soloed");
  const uTime = gl.getUniformLocation(prog, "u_time");

  // Upload static colors once.
  const colorFlat = new Float32Array(VOICE_COUNT * 3);
  for (let i = 0; i < VOICE_COUNT; i++) {
    colorFlat[i * 3] = VOICE_COLORS[i][0];
    colorFlat[i * 3 + 1] = VOICE_COLORS[i][1];
    colorFlat[i * 3 + 2] = VOICE_COLORS[i][2];
  }

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

  function setProfiles(profiles: Float32Array[], profileLen: number): void {
    // Pack VOICE_COUNT rows of length profileLen into a R8 texture.
    const w = profileLen;
    const h = VOICE_COUNT;
    const data = new Uint8Array(w * h);
    for (let i = 0; i < h && i < profiles.length; i++) {
      const p = profiles[i];
      let max = 0;
      for (let x = 0; x < p.length; x++) if (p[x] > max) max = p[x];
      const inv = max > 1e-9 ? 1 / max : 1;
      for (let x = 0; x < w; x++) {
        const v = (p[x] ?? 0) * inv;
        data[i * w + x] = Math.min(255, Math.round(v * 255));
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, profTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  function render(levels: Float32Array, gains: Float32Array, soloed: number, time: number): void {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, profTex);
    gl.uniform1i(uProfiles, 0);
    gl.uniform3fv(uColors, colorFlat);
    gl.uniform1fv(uLevels, levels);
    gl.uniform1fv(uGains, gains);
    gl.uniform1i(uSoloed, soloed);
    gl.uniform1f(uTime, time);

    gl.clearColor(0.015, 0.02, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteProgram(prog);
    gl.deleteTexture(profTex);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
  }

  resize();
  return { backend: "webgl2", setProfiles, render, resize, dispose };
}

/**
 * Real Canvas2D fallback: same 5 bands, drawn with fillRect / gradients. Used
 * when WebGL2 is absent. Visually simpler but conveys the identical structure.
 */
export function createCanvas2dScene(canvas: HTMLCanvasElement): PrismScene {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D unavailable");
  const c2d: CanvasRenderingContext2D = ctx;
  let profiles: Float32Array[] = [];
  let profLen = 1;

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function setProfiles(p: Float32Array[], profileLen: number): void {
    profiles = p;
    profLen = profileLen;
  }

  function render(levels: Float32Array, gains: Float32Array, soloed: number, time: number): void {
    const w = canvas.width;
    const h = canvas.height;
    c2d.fillStyle = "#04060a";
    c2d.fillRect(0, 0, w, h);

    const bandH = h / VOICE_COUNT;
    for (let i = 0; i < VOICE_COUNT; i++) {
      const [r, g, b] = VOICE_COLORS[i];
      const y0 = i * bandH;
      const lvl = levels[i] ?? 0;
      const gain = gains[i] ?? 0;
      const vis = 0.16 + 0.84 * Math.max(0, Math.min(1, gain));
      let energy = (0.22 + 0.78 * lvl) * vis;
      if (soloed >= 0 && soloed !== i) energy *= 0.45;
      if (soloed === i) energy *= 1.5;
      energy = Math.min(1, energy);

      // Base band fill.
      c2d.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${0.10 + 0.35 * energy})`;
      c2d.fillRect(0, y0, w, bandH);

      // Spectral profile as a comb of vertical bars across the band.
      const prof = profiles[i];
      if (prof && prof.length) {
        const bars = 96;
        let max = 0;
        for (let k = 0; k < prof.length; k++) if (prof[k] > max) max = prof[k];
        const inv = max > 1e-9 ? 1 / max : 1;
        c2d.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${0.35 + 0.6 * energy})`;
        for (let bx = 0; bx < bars; bx++) {
          const t = bx / bars;
          const idx = Math.floor(t * (profLen - 1));
          const v = (prof[idx] ?? 0) * inv;
          const barH = bandH * 0.7 * v;
          const px = t * w;
          c2d.fillRect(px, y0 + bandH - barH - 2, Math.max(1, w / bars - 1), barH);
        }
      }

      // Solo glow / shimmer line.
      const shimmer = 0.5 + 0.5 * Math.sin(time * 1.3 + i);
      c2d.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${(soloed === i ? 0.7 : 0.3) * (0.5 + 0.5 * energy) * (0.6 + 0.4 * shimmer)})`;
      c2d.fillRect(0, y0 + bandH * 0.5 - 1, w, 2);
    }
  }

  function dispose(): void {
    /* nothing to release for 2d */
  }

  resize();
  return { backend: "canvas2d", setProfiles, render, resize, dispose };
}

/** Create the best available prism scene (WebGL2 preferred, Canvas2D fallback). */
export function createPrismScene(canvas: HTMLCanvasElement): PrismScene {
  try {
    return createGlScene(canvas);
  } catch {
    return createCanvas2dScene(canvas);
  }
}
