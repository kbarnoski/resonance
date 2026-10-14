import { U } from "./shared";
import { pointLightTableF, LIGHT_HEADER } from "./prepass-pack";

// Fracture Light — a jagged seam of light splits the dark and heals;
// bass restrikes a new fracture. Contained to one diagonal seam.
//
// PERF (2026-10-13, the 120 fps law): rendered from a per-frame light table
// (prepass-pack.ts pointLightTableF — 32-bit, one fetch per light): the
// identical per-light math, computed once per frame instead of once per
// light per pixel — and tiled (pass 3): a pixel sums only the lights near its
// screen tile, the rest come from a smooth far-field grid. ORIG (below) is the reference and the no-float fallback.
const LIGHT = `

    // light fi = seam k x 46 + i (k = 1: the previous seam, smouldering)
    float sclk = u_time * 0.17;
    float strike = floor(sclk);
    float age = fract(sclk);
    float glow = 0.3 + 0.7 * (1.0 - age) * (1.0 - age);
    float wNew = smoothstep(0.0, 0.06, age);
    float k = floor((fi + 0.5) / 46.0);
    float i = fi - k * 46.0;
    float sk = strike - k;
    float g = k < 0.5 ? glow * wNew : 0.3 * (1.0 - wNew);
    if (g >= 0.0005) {
      float s = i / 46.0;
      vec3 h = hash3(sk * 31.7 + floor(s * 9.0));
      vec2 p = mix(vec2(-0.9, -0.45), vec2(0.75, 0.55), s);
      p += vec2((h.x - 0.5) * 0.22, (h.y - 0.5) * 0.3) * sin(s * 3.14159);
      lp = p;
      float tw = 0.6 + 0.4 * sin(u_time * (6.0 + h.z * 9.0) * (0.6 + u_treble) + i);
      lt = pal(palT(s * 0.15));
      lw = 0.0006 * g * tw * 0.4;
    }
`;

const T = pointLightTableF({ n: 92, header: LIGHT_HEADER, light: LIGHT, eConst: "0.00011", tiled: { px: 64, k: 32, r1: 0.06, r2: 0.12, far: 8 } });
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
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }

// Fracture Light — a jagged seam of light splits the dark and heals;
// bass restrikes a new fracture. Contained to one diagonal seam.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  // Strike clock (time-wrap audit 2026-10-10). The seam used to re-shape
  // in ONE frame at each strike (new hash while still smouldering at 0.3)
  // and flash to full; now the previous seam's smoulder cross-fades into
  // the new one over the first 6% of the cycle. The rate no longer
  // multiplies u_time by u_bass (the phase raced/jumped as bass moved on
  // long-running layers); the kinetic clock already rides the band.
  float sclk = u_time * 0.17;
  float strike = floor(sclk);
  float age = fract(sclk);
  float glow = 0.3 + 0.7 * (1.0 - age) * (1.0 - age); // never fully dark — the seam smolders between strikes
  float wNew = smoothstep(0.0, 0.06, age);
  for (int k = 0; k < 2; k++) {
    float sk = strike - float(k);           // k = 1: the previous seam, smouldering
    float g = k == 0 ? glow * wNew : 0.3 * (1.0 - wNew);
    if (g < 0.0005) continue;
    for (int i = 0; i < 46; i++) {
      float fi = float(i);
      float s = fi / 46.0;
      vec3 h = hash3(sk * 31.7 + floor(s * 9.0));
      vec2 p = mix(vec2(-0.9, -0.45), vec2(0.75, 0.55), s);
      p += vec2((h.x - 0.5) * 0.22, (h.y - 0.5) * 0.3) * sin(s * 3.14159);
      float d = length(uv - p);
      float tw = 0.6 + 0.4 * sin(u_time * (6.0 + h.z * 9.0) * (0.6 + u_treble) + fi);
      col += pal(palT(s * 0.15)) * 0.0006 / (d * d + 0.00011) * g * tw * 0.4;
    }
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
