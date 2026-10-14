import { U } from "./shared";

// 16-bit packing for prepass TABLES (shaders/index.ts SHADER_PREPASS): a value
// in [lo, hi] is stored in two 8-bit channels (65 536 steps — a light's
// position over an 8-unit range lands within 1/10 of a kiosk pixel). The 8-bit
// target stores k/255 exactly, so the round trip is exact to the step.
export const PACK16 = `
vec2 pack16(float v, float lo, float hi) {
  float q = floor(clamp((v - lo) / (hi - lo), 0.0, 1.0) * 65535.0 + 0.5);
  float h = floor(q / 256.0);
  return vec2(h, q - h * 256.0) / 255.0;
}
// (no re-rounding: c·255 is the stored byte to ~1e-7 — ≤ 0.004 of a step)
float unpack16(vec2 c, float lo, float hi) {
  return lo + dot(c, vec2(65280.0, 255.0)) * ((hi - lo) / 65535.0);
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
 * runs the identical light math once per frame on the GPU into an N×3 table
 * (row 0 position 16-bit, row 1 colour + 0.05 8-bit, row 2 gain + core
 * 16-bit); FRAG sums `tint * w / (d² + e)` from it. A/B against each
 * original: scripts/perf/shader-ab.mjs (≤ 2 steps of 255 on a few pixels).
 *
 * `light` is GLSL that, given `float fi` (the light's index), sets
 * `vec2 lp` (position, in the FRAG's uv space), `vec3 lt` (colour, −0.05…0.95),
 * `float lw` (the glow's whole numerator gain, 0…wMax; 0 = off) and
 * `float le` (its core softening, 0…eMax). `header` holds its helpers.
 */
export function pointLightTable(o: { n: number; header: string; light: string; posRange: number; wMax: number; eMax: number; eConst?: string }) {
  const R = o.posRange.toFixed(1), Wm = o.wMax.toExponential(3), E = o.eMax.toExponential(3);
  // one core softening for every light (eConst): a 2-row table — the gain
  // rides the colour texel's alpha (sqrt-encoded 8-bit: finest where it is
  // faint), two fetches per light instead of three
  const two = o.eConst !== undefined;
  const PRE = U + PACK16 + o.header + `
void main() {
  float fi = floor(gl_FragCoord.x);
  vec2 lp = vec2(0.0);
  vec3 lt = vec3(0.0);
  float lw = 0.0;
  float le = ${E};
  {
${o.light}
  }
  if (gl_FragCoord.y < 1.0) gl_FragColor = vec4(pack16(lp.x, -${R}, ${R}), pack16(lp.y, -${R}, ${R}));
  else if (gl_FragCoord.y < 2.0) gl_FragColor = vec4(lt + 0.05, ${two ? `sqrt(clamp(lw / ${Wm}, 0.0, 1.0))` : "1.0"});
  else gl_FragColor = vec4(pack16(lw, 0.0, ${Wm}), pack16(le, 0.0, ${E}));
}
`;
  const rows = two ? 2 : 3;
  const loop = two ? `
    vec4 b = texture2D(u_pre, vec2(u, 0.75));
    if (b.a <= 0.0) continue;
    vec4 a = texture2D(u_pre, vec2(u, 0.25));
    float d = length(uv - vec2(unpack16(a.xy, -${R}, ${R}), unpack16(a.zw, -${R}, ${R})));
    col += (b.rgb - 0.05) * (b.a * b.a * ${Wm}) / (d * d + ${o.eConst});` : `
    vec4 b = texture2D(u_pre, vec2(u, 2.5 / 3.0));
    float w = unpack16(b.xy, 0.0, ${Wm});
    if (w <= 0.0) continue;
    vec4 a = texture2D(u_pre, vec2(u, 0.5 / 3.0));
    vec3 tint = texture2D(u_pre, vec2(u, 1.5 / 3.0)).rgb - 0.05;
    float d = length(uv - vec2(unpack16(a.xy, -${R}, ${R}), unpack16(a.zw, -${R}, ${R})));
    col += tint * w / (d * d + unpack16(b.zw, 0.0, ${E}));`;
  const FRAG = U + PACK16 + `
uniform sampler2D u_pre;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${o.n}; i++) {
    float u = (float(i) + 0.5) / ${o.n}.0;${loop}
  }
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
  return { PRE, FRAG, SIZE: [o.n, rows] as const };
}
