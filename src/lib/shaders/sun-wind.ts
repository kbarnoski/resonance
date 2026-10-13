import { U, SMOOTH_NOISE, ROT2 } from "./shared";
import { SUN_COMMON } from "./sun-shared";

// SUN · Solar Wind — the sun's breath leaving it: faint luminous threads
// curving out along a Parker spiral (the shape the turning sun gives its
// wind), and motes of light riding them outward at different phases, so
// light seems to stream from the heart into the dark without ever forming
// rings. Gold at the source, cooling to pale blue as it travels.
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
  vec2 dir = uv / max(r, 1e-4);

  // Parker spiral: direction bends with radius, slow overall turn
  vec2 ds = rot2(-r * 1.8 + t * 0.06) * dir;
  float n = rayNoise(ds, 26.0, vec2(t * 0.15, 2.0)) * 0.7 + rayNoise(ds, 11.0, vec2(-6.0, t * 0.1)) * 0.5;
  float thread = rayMask(n, 0.12, 0.5);
  // staggered phases per thread so motes never line up into rings
  float phase = rayNoise(ds, 7.0, vec2(4.0, t * 0.1)) * 16.0 + rayNoise(ds, 19.0, vec2(-3.0, 1.0)) * 6.0;
  float mote = pow(0.5 + 0.5 * sin(r * 24.0 - u_time * 0.9 + phase), 12.0);

  float env = smoothstep(0.05, 0.14, r) * exp(-max(r - 0.14, 0.0) / (0.3 + 0.04 * u_mid));
  vec3 c = mix(vec3(1.0, 0.8, 0.5), vec3(0.58, 0.76, 1.0), smoothstep(0.1, 0.65, r));
  vec3 col = c * thread * env * (0.5 + 3.2 * mote);

  // soft source
  col += vec3(1.0, 0.9, 0.74) * (exp(-r * r / 0.0024) * (0.8 + 0.1 * u_bass) + exp(-r * 12.0) * 0.14);

  col *= 1.0 - smoothstep(0.35, 1.0, r);
  gl_FragColor = vec4(sunTone(col), 1.0);
}
`;
