import { U, SMOOTH_NOISE, ROT2 } from "./shared";
import { SUN_COMMON } from "./sun-shared";

// SUN · Veiled Sun — a sun just above centre seen through slow drifting
// veils of mist. Each pixel marches ten steps back toward the sun and
// keeps the light the veils let through, so real shafts (crepuscular
// rays) open and close as the veils drift; the veils' edges catch a faint
// silver-lilac lining near the sun. Fine seraph-like rays thread the
// shafts. Dark wherever the veil holds the light back.
export const FRAG =
  U +
  SMOOTH_NOISE +
  ROT2 +
  SUN_COMMON +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  vec2 src = vec2(0.07 * sin(t * 0.6), 0.14 + 0.03 * sin(t * 0.43));
  vec2 p = uv - src;
  float d = length(p);
  vec2 dir = p / max(d, 1e-4);
  vec2 drift = vec2(t * 0.55, t * 0.17);

  // march toward the sun: how much light survives the veils
  float illum = 0.0, w = 1.0, wsum = 0.0;
  vec2 q = uv;
  vec2 stepv = (src - uv) / 10.0;
  for (int i = 0; i < 10; i++) {
    q += stepv;
    float veil = smoothstep(-0.05, 0.18, sunFbm3(q * 1.5 + drift));
    illum += (1.0 - veil) * w;
    wsum += w;
    w *= 0.9;
  }
  illum /= wsum;
  float veilHere = smoothstep(-0.05, 0.18, sunFbm3(uv * 1.5 + drift));

  float fine = 0.12 + 0.88 * rayMask(rayNoise(rot2(t * 0.04) * dir, 30.0, vec2(t * 0.4, 1.7)), -0.1, 0.5);
  float shafts = pow(illum, 4.0) * exp(-d * 2.6) * (1.0 - 0.7 * veilHere) * fine;
  vec3 col = mix(vec3(1.0, 0.82, 0.55), vec3(1.0, 0.62, 0.5), smoothstep(0.1, 0.6, d)) * shafts * (1.0 + 0.1 * u_mid);

  // silver lining on veil edges close to the sun
  float edge = veilHere * (1.0 - veilHere) * 4.0;
  col += vec3(0.82, 0.7, 0.98) * edge * exp(-d * 4.0) * 0.35;

  // the sun itself, softened when a veil crosses it
  float disc = exp(-d * d / 0.0022) * (1.0 - 0.45 * veilHere);
  col += vec3(1.0, 0.93, 0.8) * (disc * (0.9 + 0.1 * u_bass) + exp(-d * 11.0) * 0.18);

  col *= 1.0 - smoothstep(0.35, 1.05, length(uv));
  gl_FragColor = vec4(sunTone(col), 1.0);
}
`;
