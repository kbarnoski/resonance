import { U, SMOOTH_NOISE, ROT2 } from "./shared";
import { SUN_COMMON } from "./sun-shared";

// SUN · Precessing Halo — a halo of fine rays standing on a circle that
// is tilted in space, its tilt axis slowly precessing like a gyroscope,
// so the halo leans and turns. Two counter-turning ray combs (gold and
// ice-blue, tinted per ray) make long rays outward and short ones inward;
// where rays meet the circle they bead into points of light — the circle
// itself is never drawn as a solid ring. A faint star sits at the heart.
export const FRAG =
  U +
  SMOOTH_NOISE +
  ROT2 +
  SUN_COMMON +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  float r = length(uv);

  // tilted plane: squash one axis, the axis itself precessing
  float w = t * 0.55;
  vec2 q = rot2(w) * uv;
  q.y /= 0.6 + 0.16 * sin(t * 0.8);
  q = rot2(-w) * q;
  float rq = length(q);
  vec2 dq = q / max(rq, 1e-4);

  float R = 0.23 + 0.012 * sin(t * 1.5);
  float n1 = rayNoise(rot2(t * 0.22) * dq, 32.0, vec2(1.3, t * 0.25));
  float n2 = rayNoise(rot2(-t * 0.16) * dq, 56.0, vec2(7.7, -t * 0.2));
  float ray1 = rayMask(n1, 0.05, 0.5);
  float ray2 = rayMask(n2, 0.12, 0.55);

  float outer = exp(-max(rq - R, 0.0) / (0.13 + 0.04 * u_mid));
  float inner = exp(-max(R - rq, 0.0) / 0.035);
  float prof = mix(inner, outer, step(R, rq));

  float tint = 0.5 + 0.5 * rayNoise(dq, 4.0, vec2(t * 0.1, 9.0));
  vec3 c1 = mix(vec3(1.0, 0.74, 0.4), vec3(0.55, 0.75, 1.0), tint);
  vec3 c2 = mix(vec3(0.7, 0.6, 1.0), vec3(1.0, 0.82, 0.6), tint);
  vec3 col = (c1 * ray1 * 1.25 + c2 * ray2 * 0.8) * prof * (0.95 + 0.08 * u_bass);

  // beads where the rays cross the halo circle
  col += vec3(1.0, 0.95, 0.86) * ray1 * exp(-abs(rq - R) * 55.0) * 1.6;

  // faint heart
  col += vec3(1.0, 0.9, 0.76) * (exp(-r * r / 0.0018) * 0.55 + exp(-r * 13.0) * 0.08);

  col *= 1.0 - smoothstep(0.35, 1.0, r);
  gl_FragColor = vec4(sunTone(col), 1.0);
}
`;
