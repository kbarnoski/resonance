import { U } from "./shared";
import { pointLightTableF } from "./prepass-pack";

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

// Ribbon of Light — a band of particles snaking through space like a
// slow murmuration ribbon. Mid drives the wave; bass the travel.
const LIGHT = `
    float t = u_time * 0.37; // constant rate (was u_time * (A + u_bass * B): on a long-running layer the phase leapt as bass moved — kiosk slew audit 2026-10-10; the kinetic clock already rides the band)
    float waveAmp = 0.25 + u_mid * 0.45;
    float s = fi / 60.0;
    float along = s * 3.4 - 1.7 + sin(t * 0.5) * 0.4;
    vec3 h = hash3(fi * 2.77);
    vec3 p = vec3(
      along,
      sin(along * 1.8 + t * 1.1) * waveAmp + (h.y - 0.5) * 0.1,
      1.8 + sin(along * 0.9 + t * 0.6) * 0.7 + (h.z - 0.5) * 0.2
    );
    float tw = 0.6 + 0.4 * sin(u_time * (3.5 + h.x * 7.0) * (0.6 + u_treble) + fi);
    lp = p.xy / p.z;
    lt = pal(palT(s * 0.35));
    lw = p.z < 0.4 ? 0.0 : 0.00055 * tw / p.z * 0.3;
    le = 0.00016;
`;

const T = pointLightTableF({ n: 60, header: HEADER, light: LIGHT, eConst: "0.00016" });
export const FRAG = T.FRAG;
export const PRE = T.PRE;
export const PRE_SIZE = T.SIZE;

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

// Ribbon of Light — a band of particles snaking through space like a
// slow murmuration ribbon. Mid drives the wave; bass the travel.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float t = u_time * 0.37; // constant rate (was u_time * (A + u_bass * B): on a long-running layer the phase leapt as bass moved — kiosk slew audit 2026-10-10; the kinetic clock already rides the band)
  float waveAmp = 0.25 + u_mid * 0.45;
  for (int i = 0; i < 60; i++) {
    float fi = float(i);
    float s = fi / 60.0;
    float along = s * 3.4 - 1.7 + sin(t * 0.5) * 0.4;
    vec3 h = hash3(fi * 2.77);
    vec3 p = vec3(
      along,
      sin(along * 1.8 + t * 1.1) * waveAmp + (h.y - 0.5) * 0.1,
      1.8 + sin(along * 0.9 + t * 0.6) * 0.7 + (h.z - 0.5) * 0.2
    );
    if (p.z < 0.4) continue;
    vec2 ss = p.xy / p.z;
    float d = length(uv - ss);
    float tw = 0.6 + 0.4 * sin(u_time * (3.5 + h.x * 7.0) * (0.6 + u_treble) + fi);
    vec3 tint = pal(palT(s * 0.35));
    col += tint * 0.00055 / (d * d + 0.00016) * tw / p.z * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
