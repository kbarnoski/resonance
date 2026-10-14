import { U } from "./shared";

/**
 * Derive a two-pass FRAG from a shader's ORIGINAL single-pass source by exact
 * text substitutions — the original stays the single source of truth (and the
 * no-float fallback), and the rewrite is reviewable as a diff. Throws at load
 * if a substitution no longer matches (the original changed underneath).
 */
export function deriveFrag(src: string, subs: readonly (readonly [string, string])[], name: string): string {
  let out = src;
  for (const [from, to] of subs) {
    if (!out.includes(from)) throw new Error(`[shaders] ${name}: prepass derivation lost its anchor: ${from.slice(0, 60)}`);
    out = out.replace(from, to);
  }
  return out;
}

/**
 * FIELD GRID helpers for a scaled FLOAT prepass (SHADER_PREPASS scale +
 * blocks + extraRows). The prepass texture holds `blocks` stacked copies of a
 * round(W·scale) × round(H·scale) grid (4 values per texel each) and
 * `extraRows` table rows above them. The grid is CORNER-ALIGNED: its first and
 * last texel centres sit on the first and last pixel centres, so every pixel
 * interpolates between computed samples (never extrapolates at the edges).
 * Both passes get `u_preres` (the whole texture's size).
 *
 * PRE side:  preTexel(block, row) → the main-canvas pixel this texel stands
 *            for; `block` = which field block (or −1 on a table row, then
 *            `row` = the table row and the pixel's x = the table index).
 * Main side: preField(block) — this pixel's interpolated 4 values;
 *            preTable(i, row) — table entry i of a table row (exact texel).
 */
export function fieldGrid(blocks: number, extraRows: number): { pre: string; main: string } {
  const B = blocks.toFixed(1), E = extraRows.toFixed(1);
  const common = `
uniform vec2 u_preres;
vec2 preGrid() { return vec2(u_preres.x, (u_preres.y - ${E}) / ${B}); }
`;
  return {
    pre: common + `
vec2 preTexel(out float block, out float row) {
  vec2 G = preGrid();
  float y = gl_FragCoord.y - 0.5;
  block = floor(y / G.y);
  row = -1.0;
  if (block >= ${B}) { row = y - ${B} * G.y; block = -1.0; return vec2(floor(gl_FragCoord.x), 0.0); }
  vec2 cell = vec2(gl_FragCoord.x - 0.5, y - block * G.y);
  return cell * (u_resolution - 1.0) / (G - 1.0) + 0.5;
}
`,
    main: common + `
uniform sampler2D u_pre;
vec4 preField(float block) {
  vec2 G = preGrid();
  vec2 tc = (gl_FragCoord.xy - 0.5) * (G - 1.0) / (u_resolution - 1.0) + 0.5;
  return texture2D(u_pre, vec2(tc.x / u_preres.x, (tc.y + block * G.y) / u_preres.y));
}
vec4 preTable(float i, float row) {
  vec2 G = preGrid();
  return texture2D(u_pre, vec2((i + 0.5) / u_preres.x, (${B} * G.y + row + 0.5) / u_preres.y));
}
`,
  };
}

/** fbm (shared.ts SMOOTH_NOISE) split by octave: fbmLow = octaves 1-4 (smooth
 *  enough to interpolate from a low-res prepass), fbmHigh = octaves 5-6 at
 *  full resolution. fbmLow(p) + fbmHigh(p) = the same six terms as fbm(p). */
export const FBM_SPLIT = `
float fbmLow(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}
float fbmHigh(vec2 p) {
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) p = rot * p * 2.0;
  float v = 0.03125 * snoise(p);
  p = rot * p * 2.0;
  return v + 0.015625 * snoise(p);
}
`;

/** The same split after octave 3 (for fbm whose 4th octave is already finer
 *  than a 3x3-pixel grid resolves): fbmLow3 + fbmHigh3 = fbm. */
export const FBM_SPLIT3 = `
float fbmLow3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}
float fbmHigh3(vec2 p) {
  float v = 0.0, a = 0.0625;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) p = rot * p * 2.0;
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}
`;

/** 24-bit packing (rgb) for values that need sub-pixel precision at a hard
 *  edge (plasma's bolt cores): 16.7 M steps over [lo, hi]. */
export const PACK24 = `
vec3 pack24(float v, float lo, float hi) {
  float q = floor(clamp((v - lo) / (hi - lo), 0.0, 1.0) * 16777215.0 + 0.5);
  float r = floor(q / 65536.0);
  q -= r * 65536.0;
  float g = floor(q / 256.0);
  return vec3(r, g, q - g * 256.0) / 255.0;
}
float unpack24(vec3 c, float lo, float hi) {
  return lo + dot(floor(c * 255.0 + 0.5), vec3(65536.0, 256.0, 1.0)) * ((hi - lo) / 16777215.0);
}
`;

/** The particle-light shaders' shared helpers (hash, hash3, the evolving
 *  palette — Karel 2026-09-30: "they should also adjust in color"). */
export const LIGHT_HEADER = `
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }
`;

/**
 * POINT-LIGHT SHADERS as a light TABLE (2026-10-13, the 120 fps law). Shaders
 * like murmuration / firefly-field / meteor-rain sum N small glows; every
 * light's position, colour and weight are the same for every pixel, but were
 * computed (≈10 sin/cos each) per light PER PIXEL — 3.3 M pixels × N. PRE
 * runs the identical light math once per frame on the GPU into a float table
 * (read NEAREST, 32-bit: every value exact): row 0 = (x, y, gain, core
 * softening), row 1 = colour. FRAG sums `tint * w / (d² + e)` from it. A/B
 * against each original: scripts/perf/shader-ab.mjs (≤ 1 step of 255).
 *
 * `light` is GLSL that, given `float fi` (the light's index), sets
 * `vec2 lp` (position, in the FRAG's uv space), `vec3 lt` (colour),
 * `float lw` (the glow's whole numerator gain; 0 = off) and `float le` (its
 * core softening; `eConst` when every light shares one). `header` holds its
 * helpers. Without float targets the layer runs the shader's ORIG
 * (SHADER_PREPASS fallback).
 */
export const LIGHT_PRE = (header: string, light: string, e: string) => U + header + `
void main() {
  float fi = floor(gl_FragCoord.x);
  vec2 lp = vec2(0.0);
  vec3 lt = vec3(0.0);
  float lw = 0.0;
  float le = ${e};
  {
${light}
  }
  gl_FragColor = gl_FragCoord.y < 1.0 ? vec4(lp, lw, le) : vec4(lt, 1.0);
}
`;
export interface TiledLights {
  /** tile edge, in canvas pixels */
  px: number;
  /** lights a tile lists before it falls back to all of them (exact either way) */
  k: number;
  /** a light is NEAR within r1 of a pixel, fully FAR beyond r2 (uv units) */
  r1: number;
  r2: number;
  /** far-field grid scale (1/n of the canvas) */
  far: number;
  /** one light's glow in terms of `a` (x, y, gain, softening) and `d2`
   *  (squared distance) — default `a.z / (d2 + a.w)` */
  glow?: string;
  /** the shader's uv: "full" (default) = (fc·2 − res) / min(res), "half" = (fc − res/2) / min(res) */
  uv?: "full" | "half";
}

/**
 * TILED point lights (2026-10-14, the 120 fps law, pass 3): the light table
 * as pointLightTableF, then two more prepass stages so a pixel no longer
 * loops over every light —
 *   stage 1 (tiles): for each px x px screen tile, the lights within r2 of
 *     it (count + up to k copied lights); a tile with more falls back to all;
 *   stage 2 (far field): on a coarse corner-aligned grid, every light's glow
 *     weighted by a quintic ramp f(d) = 0 inside r1 … 1 beyond r2 — a smooth
 *     field (no light cores in it), bilinearly interpolated;
 *   main: far field + each listed light's glow x (1 − f(d)).
 * Near + far is every light's glow exactly; only the far field's bilinear
 * interpolation differs (A/B'd per shader, ≤ 1-2 of 255).
 */
export function tiledStages(n: number, t: TiledLights) {
  const N = `${n}.0`, T = t.px.toFixed(1), K = t.k, ROWS = (1 + 2 * t.k).toFixed(1);
  const R1 = t.r1.toFixed(4), R2 = t.r2.toFixed(4);
  const GLOW = t.glow ?? "a.z / (d2 + a.w)";
  const UVF = t.uv === "half" ? "(p - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y)" : "(p * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y)";
  const FARW = `
vec2 plUv(vec2 p) { return ${UVF}; }
float plGlow(vec4 a, float d2) { return ${GLOW}; }
float farW(float d) {
  float x = clamp((d - ${R1}) / (${R2} - ${R1}), 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}
vec4 plLight(float i) { return texture2D(u_pre, vec2((i + 0.5) / ${N}, 0.25)); }
vec3 plTint(float i) { return texture2D(u_pre, vec2((i + 0.5) / ${N}, 0.75)).rgb; }
`;
  const BIN = U + `
uniform sampler2D u_pre;
` + FARW + `
void main() {
  float tx = floor(gl_FragCoord.x), r = floor(gl_FragCoord.y);
  float ty = floor((r + 0.5) / ${ROWS});
  float j = r - ty * ${ROWS};
  vec2 p0 = vec2(tx, ty) * ${T};
  vec2 p1 = min(p0 + ${T}, u_resolution);
  vec2 lo = plUv(p0);
  vec2 hi = plUv(p1);
  float want = j < 0.5 ? -1.0 : floor((j - 1.0) / 2.0);
  float part = j - 1.0 - want * 2.0;
  float c = 0.0;
  for (int i = 0; i < ${n}; i++) {
    float fi = float(i);
    vec4 a = plLight(fi);
    if (a.z <= 0.0) continue;
    if (length(a.xy - clamp(a.xy, lo, hi)) >= ${R2}) continue; // no pixel of the tile is near
    if (c == want) { gl_FragColor = part < 0.5 ? a : vec4(plTint(fi), 1.0); return; }
    c += 1.0;
  }
  gl_FragColor = vec4(c, 0.0, 0.0, 1.0); // the count (row 0), or an unused slot
}
`;
  const FAR = U + `
uniform sampler2D u_pre;
uniform vec2 u_preres2;
` + FARW + `
void main() {
  // corner-aligned: the grid's first / last texel centres sit on the canvas's
  vec2 fc = (gl_FragCoord.xy - 0.5) * (u_resolution - 1.0) / (u_preres2 - 1.0) + 0.5;
  vec2 uv = plUv(fc);
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${n}; i++) {
    float fi = float(i);
    vec4 a = plLight(fi);
    if (a.z <= 0.0) continue;
    vec2 dd = uv - a.xy;
    float d2 = dot(dd, dd);
    col += plTint(fi) * plGlow(a, d2) * farW(sqrt(d2));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
  // the main pass: the far field + the tile's near lights
  const SUM = `
uniform sampler2D u_pre;
uniform sampler2D u_pre1;
uniform sampler2D u_pre2;
uniform vec2 u_preres1;
uniform vec2 u_preres2;
` + FARW + `
vec3 plSum(vec2 uv) {
  vec2 g = (gl_FragCoord.xy - 0.5) * (u_preres2 - 1.0) / (u_resolution - 1.0) + 0.5;
  vec3 col = texture2D(u_pre2, g / u_preres2).rgb;
  vec2 tile = floor(gl_FragCoord.xy / ${T});
  float base = tile.y * ${ROWS};
  float cnt = texture2D(u_pre1, (vec2(tile.x, base) + 0.5) / u_preres1).x;
  if (cnt > ${K}.0) {
    for (int i = 0; i < ${n}; i++) {
      float fi = float(i);
      vec4 a = plLight(fi);
      if (a.z <= 0.0) continue;
      vec2 dd = uv - a.xy;
      float d2 = dot(dd, dd);
      col += plTint(fi) * plGlow(a, d2) * (1.0 - farW(sqrt(d2)));
    }
  } else {
    for (int s = 0; s < ${K}; s++) {
      float fs = float(s);
      if (fs >= cnt) break;
      vec4 a = texture2D(u_pre1, (vec2(tile.x, base + 1.0 + 2.0 * fs) + 0.5) / u_preres1);
      vec3 tint = texture2D(u_pre1, (vec2(tile.x, base + 2.0 + 2.0 * fs) + 0.5) / u_preres1).rgb;
      vec2 dd = uv - a.xy;
      float d2 = dot(dd, dd);
      col += tint * plGlow(a, d2) * (1.0 - farW(sqrt(d2)));
    }
  }
  return col;
}
`;
  const THEN = [
    { frag: BIN, scale: 0, tiles: { px: t.px, rows: 1 + 2 * t.k }, nearest: true, float: true },
    { frag: FAR, scale: 1 / t.far, float: true },
  ];
  return { SUM, THEN };
}

export function pointLightTableF(o: { n: number; header: string; light: string; eConst?: string; tiled?: TiledLights }) {
  const PRE = LIGHT_PRE(o.header, o.light, o.eConst ?? "0.0");
  const tiled = o.tiled ? tiledStages(o.n, o.tiled) : null;
  const FRAG = tiled ? U + tiled.SUM + `
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = plSum(uv);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
` : U + `
uniform sampler2D u_pre;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${o.n}; i++) {
    float u = (float(i) + 0.5) / ${o.n}.0;
    vec4 a = texture2D(u_pre, vec2(u, 0.25));
    if (a.z <= 0.0) continue;
    vec3 tint = texture2D(u_pre, vec2(u, 0.75)).rgb;
    vec2 dd = uv - a.xy;
    col += tint * a.z / (dot(dd, dd) + a.w);
  }
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
  return { PRE, FRAG, SIZE: [o.n, 2] as const, THEN: tiled?.THEN };
}

/**
 * WHOLE-SHADER prepass (SHADER_PREPASS `whole`): some shaders hold no detail
 * finer than a few pixels at the kiosk's shader resolution (soft glows,
 * nebulae, mist) — rendered as they are at `scale` into a float target and
 * bilinearly upsampled, they are the same picture (each A/B'd against the
 * full-resolution render: ≤ 2 of 255) at a fraction of the cost. The prepass
 * IS the shader (its own u_resolution = the small target); this is the main
 * pass.
 */
export const UPSAMPLE_FRAG = `
precision highp float;
uniform vec2 u_resolution;
uniform sampler2D u_pre;
void main() {
  gl_FragColor = texture2D(u_pre, gl_FragCoord.xy / u_resolution);
}
`;
