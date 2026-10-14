import { U } from "./shared";
import { pointLightTableF } from "./prepass-pack";

// Firefly Field — a deep 3D meadow of drifting lights that blink on
// the highs and breathe with the bass. Color wanders slowly.
//
// PERF (2026-10-13, the 120 fps law): rendered from a per-frame light table
// (prepass-pack.ts pointLightTableF — 32-bit, one fetch per light) — the identical per-light math, computed
// once per frame instead of once per light per pixel.

const HEADER = `
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}
// Evolving palette (Karel 2026-09-30: "they should also adjust in
// color... chemo just stays the same color"): a slow cycle through a
// cosmic gamut, nudged by the harmony (u_mid).
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }
`;

const LIGHT = `
    float breathe = 1.0 + u_bass * 0.12;
    vec3 h = hash3(fi * 5.21);
    vec3 p = vec3(
      (h.x - 0.5) * 3.0 + sin(u_time * 0.21 * (0.5 + h.y) + fi) * 0.35,
      (h.y - 0.5) * 1.8 + sin(u_time * 0.17 * (0.5 + h.z) + fi * 1.3) * 0.28,
      0.8 + h.z * 2.6
    );
    lp = p.xy / (p.z / breathe);
    float blink = smoothstep(0.25, 0.95, 0.5 + 0.5 * sin(u_time * (1.2 + h.x * 2.4) * (0.7 + u_treble * 1.6) + fi * 2.2));
    lt = pal(palT(h.y * 0.3));
    lw = 0.00042 * blink / p.z * 0.3;
    le = 0.00012;
`;

const T = pointLightTableF({ n: 72, header: HEADER, light: LIGHT, eConst: "0.00012", tiled: { px: 64, k: 32, r1: 0.06, r2: 0.12, far: 8 } });
export const FRAG = T.FRAG;
export const PRE = T.PRE;
export const PRE_SIZE = T.SIZE;
export const PRE_THEN = T.THEN;

/** The original single-pass shader — the fallback without float render
 *  targets, and the reference the table is A/B'd against. */
export const ORIG =
  U +
  `
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}
// Evolving palette (Karel 2026-09-30: "they should also adjust in
// color... chemo just stays the same color"): a slow cycle through a
// cosmic gamut, nudged by the harmony (u_mid).
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }

// Firefly Field — a deep 3D meadow of drifting lights that blink on
// the highs and breathe with the bass. Color wanders slowly.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float breathe = 1.0 + u_bass * 0.12;
  for (int i = 0; i < 72; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 5.21);
    vec3 p = vec3(
      (h.x - 0.5) * 3.0 + sin(u_time * 0.21 * (0.5 + h.y) + fi) * 0.35,
      (h.y - 0.5) * 1.8 + sin(u_time * 0.17 * (0.5 + h.z) + fi * 1.3) * 0.28,
      0.8 + h.z * 2.6
    );
    vec2 ss = p.xy / (p.z / breathe);
    float d = length(uv - ss);
    float blink = smoothstep(0.25, 0.95, 0.5 + 0.5 * sin(u_time * (1.2 + h.x * 2.4) * (0.7 + u_treble * 1.6) + fi * 2.2));
    vec3 tint = pal(palT(h.y * 0.3));
    col += tint * 0.00042 / (d * d + 0.00012) * blink / p.z * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
