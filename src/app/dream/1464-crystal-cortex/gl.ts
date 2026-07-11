// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — the WebGL2 + Jump Flooding Algorithm (JFA) Voronoi engine.
//
//   The point of this prototype: a Voronoi diagram computed on the GPU with the
//   Jump Flooding Algorithm (Rong & Tan, "Jump Flooding in GPU with Applications
//   to Voronoi Diagram and Distance Transform", I3D 2006). Not faked — the cell
//   partition is a real JFA distance transform living in ping-pong framebuffers.
//
//   Pipeline, per frame:
//     1. SEED pass    — clear the JFA texture to (0,0,0,0) = "no seed", then draw
//                       each moving seed as a 1px POINT that writes its own
//                       (u,v) into the texel it lands on.
//     2. JFA passes   — log2(GRID) fullscreen passes, step k = GRID/2 … 1. Each
//                       texel looks at its 8 neighbours at offset ±k and adopts
//                       the nearest seed among them (toroidal distance, so the
//                       lattice tiles seamlessly). After the last pass every
//                       texel knows its nearest seed → Voronoi cell + distance.
//     3. DISPLAY pass — sample the JFA field through an INVERSE LOG-POLAR warp
//                       (the retina→V1 map; Klüver honeycomb form-constant), so
//                       the cells recede into an infinite tunnel. Cell colour =
//                       hash(seed) → iridescent hue; bright stained-glass leading
//                       is drawn where the nearest-seed field has an edge
//                       (fwidth of the seed coordinate).
//
//   Storage: RGBA16F when EXT_color_buffer_float is present (seed uv in RG),
//   otherwise a graceful fallback that PACKS each uv coordinate into two 8-bit
//   channels (16-bit precision) in an RGBA8 target — universally renderable.
//   NEAREST filtering throughout (JFA must never interpolate packed coords).
// ─────────────────────────────────────────────────────────────────────────────

export const GRID = 512;
export const MAX_SEEDS = 12;

/** Ring density of the log-polar tunnel warp (shared by GLSL + the JS picker). */
export const RING_K = 0.62;

export interface DisplayParams {
  aspect: number;
  time: number;
  driftU: number;
  driftV: number;
  saturation: number; // 0..1 — reduced-motion lowers this
  bright: number; // slow (<3 Hz) luminance drift multiplier
}

export interface Engine {
  readonly usesFloat: boolean;
  /** Upload seeds (field coords, each in [0,1]) and run the full JFA. */
  runJFA(seedsXY: Float32Array, count: number): void;
  /** Draw the warped stained-glass tunnel to the canvas. */
  draw(canvasW: number, canvasH: number, p: DisplayParams): void;
  dispose(): void;
}

const QUAD_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Prelude: seed read/write helpers. Two variants keep the pass shaders identical.
const PRELUDE_FLOAT = /* glsl */ `
vec2 readSeed(vec4 t) { return t.xy; }
vec4 writeSeed(vec2 s) { return vec4(s, 0.0, 1.0); }
`;

const PRELUDE_PACKED = /* glsl */ `
vec2 enc16(float v) {
  v = clamp(v, 0.0, 0.9999847);
  float x = v * 65535.0;
  float hi = floor(x / 256.0);
  float lo = x - hi * 256.0;
  return vec2(hi, lo) / 255.0;
}
float dec16(vec2 e) {
  return (floor(e.x * 255.0 + 0.5) * 256.0 + floor(e.y * 255.0 + 0.5)) / 65535.0;
}
vec2 readSeed(vec4 t) { return vec2(dec16(t.rg), dec16(t.ba)); }
vec4 writeSeed(vec2 s) { return vec4(enc16(s.x), enc16(s.y)); }
`;

// A seed is "invalid" (no seed here yet) iff it decodes to exactly (0,0).
// Real seeds are clamped away from 0, and the framebuffer clears to (0,0,0,0).
const SEED_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aSeed;              // uv in [0,1]
flat out vec2 vSeed;
void main() {
  vSeed = aSeed;
  gl_Position = vec4(aSeed * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

function seedFS(prelude: string): string {
  return `#version 300 es
precision highp float;
${prelude}
flat in vec2 vSeed;
out vec4 outC;
void main() { outC = writeSeed(vSeed); }
`;
}

function jfaFS(prelude: string): string {
  return `#version 300 es
precision highp float;
${prelude}
uniform sampler2D uTex;
uniform float uGrid;
uniform float uStep;   // k in texels
in vec2 vUv;
out vec4 outC;
void main() {
  vec2 texel = vec2(1.0 / uGrid);
  vec2 best = vec2(0.0);
  float bestD = 1e9;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 samp = fract(vUv + vec2(float(i), float(j)) * uStep * texel);
      vec2 s = readSeed(texture(uTex, samp));
      if (s.x != 0.0 || s.y != 0.0) {          // valid seed
        vec2 dd = abs(vUv - s);
        dd = min(dd, 1.0 - dd);                // toroidal (seamless tiling)
        float d = dot(dd, dd);
        if (d < bestD) { bestD = d; best = s; }
      }
    }
  }
  outC = writeSeed(best);                       // (0,0) if still none → stays invalid
}
`;
}

function displayFS(prelude: string): string {
  return `#version 300 es
precision highp float;
${prelude}
uniform sampler2D uTex;
uniform float uGrid;
uniform float uAspect;
uniform float uTime;
uniform float uDriftU;
uniform float uDriftV;
uniform float uRingK;
uniform float uSat;
uniform float uBright;
in vec2 vUv;
out vec4 frag;

const float INV_TAU = 0.15915494;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// screen uv (y up) -> log-polar field coord (the inverse warp: r = exp(u))
vec2 fieldFromScreen(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  float r = max(length(p), 1e-3);
  float a = atan(p.y, p.x);
  float fu = fract(log(r) * uRingK + uDriftU);
  float fv = fract(a * INV_TAU + 0.5 + uDriftV);
  return vec2(fu, fv);
}

void main() {
  vec2 field = fieldFromScreen(vUv);
  vec2 seed = readSeed(texture(uTex, field));

  // toroidal distance from this field point to its nearest seed
  vec2 dd = abs(field - seed);
  dd = min(dd, 1.0 - dd);
  float dist = length(dd);

  // stained-glass leading: the nearest-seed field is piecewise-constant per
  // cell, so its screen-space derivative spikes exactly on cell borders.
  vec2 g = fwidth(seed);
  float edge = clamp((g.x + g.y) * 26.0, 0.0, 1.0);
  edge = smoothstep(0.12, 0.85, edge);

  // jewelled hue from the seed identity; a slow drift keeps it iridescent
  float h = fract(sin(dot(seed, vec2(41.317, 289.71))) * 43758.5453);
  float hue = fract(h + dist * 0.7 + uTime * 0.012);
  float val = 0.30 + 0.62 * smoothstep(0.28, 0.0, dist); // brighten toward cell core
  vec3 cell = hsv2rgb(vec3(hue, uSat, val));

  // facet sparkle: a faint second hue band for the "more real than real" glint
  vec3 glint = hsv2rgb(vec3(fract(hue + 0.5), uSat * 0.8, 0.9));
  cell = mix(cell, glint, 0.10 * smoothstep(0.05, 0.0, dist));

  vec3 lead = vec3(1.0, 0.94, 0.80);
  vec3 col = mix(cell, lead, edge);

  // tunnel throat glow + soft vignette toward the rim
  vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
  float rr = length(c);
  col += vec3(0.16, 0.11, 0.22) * smoothstep(0.35, 0.0, rr);
  col *= mix(1.0, 0.55, smoothstep(0.55, 1.15, rr));

  col *= uBright;
  frag = vec4(col, 1.0);
}
`;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("crystal-cortex shader error:", gl.getShaderInfoLog(sh));
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
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("crystal-cortex link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

function makeTarget(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  type: number,
): Target | null {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, GRID, GRID, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (!ok) return null;
  return { tex, fbo };
}

export function createEngine(canvas: HTMLCanvasElement): Engine | null {
  const glMaybe = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  if (!glMaybe) return null;
  const gl: WebGL2RenderingContext = glMaybe;

  // Prefer a float target; fall back to 16-bit-packed RGBA8 if unavailable.
  const floatOK = !!gl.getExtension("EXT_color_buffer_float");
  const internalFormat = floatOK ? gl.RGBA16F : gl.RGBA8;
  const texType = floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  const prelude = floatOK ? PRELUDE_FLOAT : PRELUDE_PACKED;

  const seedProg = link(gl, SEED_VS, seedFS(prelude));
  const jfaProg = link(gl, QUAD_VS, jfaFS(prelude));
  const dispProg = link(gl, QUAD_VS, displayFS(prelude));
  if (!seedProg || !jfaProg || !dispProg) return null;

  const aMaybe = makeTarget(gl, internalFormat, texType);
  const bMaybe = makeTarget(gl, internalFormat, texType);
  if (!aMaybe || !bMaybe) return null;
  const a: Target = aMaybe;
  const b: Target = bMaybe;

  // fullscreen quad
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  // seed positions buffer (uv), re-uploaded every frame
  const seedBuf = gl.createBuffer();

  // VAOs keep attribute wiring tidy across the passes.
  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  const jfaPosLoc = gl.getAttribLocation(jfaProg, "aPos");
  gl.enableVertexAttribArray(jfaPosLoc);
  gl.vertexAttribPointer(jfaPosLoc, 2, gl.FLOAT, false, 0, 0);

  const seedVao = gl.createVertexArray();
  gl.bindVertexArray(seedVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  const seedLoc = gl.getAttribLocation(seedProg, "aSeed");
  gl.enableVertexAttribArray(seedLoc);
  gl.vertexAttribPointer(seedLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // uniform locations
  const uJfaTex = gl.getUniformLocation(jfaProg, "uTex");
  const uJfaGrid = gl.getUniformLocation(jfaProg, "uGrid");
  const uJfaStep = gl.getUniformLocation(jfaProg, "uStep");

  const uDTex = gl.getUniformLocation(dispProg, "uTex");
  const uDGrid = gl.getUniformLocation(dispProg, "uGrid");
  const uDAspect = gl.getUniformLocation(dispProg, "uAspect");
  const uDTime = gl.getUniformLocation(dispProg, "uTime");
  const uDDriftU = gl.getUniformLocation(dispProg, "uDriftU");
  const uDDriftV = gl.getUniformLocation(dispProg, "uDriftV");
  const uDRingK = gl.getUniformLocation(dispProg, "uRingK");
  const uDSat = gl.getUniformLocation(dispProg, "uSat");
  const uDBright = gl.getUniformLocation(dispProg, "uBright");

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  let read = a;
  let write = b;
  const passes = Math.ceil(Math.log2(GRID)); // 9 for 512

  function runJFA(seedsXY: Float32Array, count: number): void {
    // 1. SEED pass — clear "read" to invalid, splat the seed points.
    gl.viewport(0, 0, GRID, GRID);
    gl.bindFramebuffer(gl.FRAMEBUFFER, read.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(seedProg);
    gl.bindVertexArray(seedVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seedsXY.subarray(0, count * 2), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, count);

    // 2. JFA passes — ping-pong at halving step sizes.
    gl.useProgram(jfaProg);
    gl.bindVertexArray(quadVao);
    gl.uniform1f(uJfaGrid, GRID);
    gl.uniform1i(uJfaTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < passes; i++) {
      const step = Math.pow(2, passes - 1 - i); // GRID/2 … 1
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1f(uJfaStep, step);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = read;
      read = write;
      write = t;
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function draw(canvasW: number, canvasH: number, p: DisplayParams): void {
    gl.viewport(0, 0, canvasW, canvasH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(dispProg);
    gl.bindVertexArray(quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex); // "read" holds the final JFA result
    gl.uniform1i(uDTex, 0);
    gl.uniform1f(uDGrid, GRID);
    gl.uniform1f(uDAspect, p.aspect);
    gl.uniform1f(uDTime, p.time);
    gl.uniform1f(uDDriftU, p.driftU);
    gl.uniform1f(uDDriftV, p.driftV);
    gl.uniform1f(uDRingK, RING_K);
    gl.uniform1f(uDSat, p.saturation);
    gl.uniform1f(uDBright, p.bright);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function dispose(): void {
    try {
      gl.deleteProgram(seedProg);
      gl.deleteProgram(jfaProg);
      gl.deleteProgram(dispProg);
      gl.deleteTexture(a.tex);
      gl.deleteTexture(b.tex);
      gl.deleteFramebuffer(a.fbo);
      gl.deleteFramebuffer(b.fbo);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(seedBuf);
      gl.deleteVertexArray(quadVao);
      gl.deleteVertexArray(seedVao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // context already gone
    }
  }

  return { usesFloat: floatOK, runJFA, draw, dispose };
}

// ── The forward warp, mirrored in JS so pointer picking agrees with the shader.
//    screen uv (y up, both in [0,1]) → field coord in [0,1]². ──────────────────
export function screenToField(
  uvx: number,
  uvy: number,
  aspect: number,
  driftU: number,
  driftV: number,
): [number, number] {
  const px = (uvx - 0.5) * aspect * 2.0;
  const py = (uvy - 0.5) * 2.0;
  const r = Math.max(Math.hypot(px, py), 1e-3);
  const ang = Math.atan2(py, px);
  const fract = (v: number) => v - Math.floor(v);
  const fu = fract(Math.log(r) * RING_K + driftU);
  const fv = fract(ang * 0.15915494 + 0.5 + driftV);
  return [fu, fv];
}
