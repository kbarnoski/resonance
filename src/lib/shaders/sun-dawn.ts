import { U, SMOOTH_NOISE, ROT2 } from "./shared";
import { SUN_COMMON } from "./sun-shared";

// SUN · Dawn Fan — the sun has not risen yet: it sits just below the
// bottom edge, and only its fan of rays climbs into the dark — coarse
// shafts and hair-fine rays interleaved, rose at the horizon, gold
// through the middle, a cool pale aqua at the tips. The sun rises and
// settles by a few percent over minutes; the fan's reach breathes.
// The upper frame stays black.
export const FRAG =
  U +
  SMOOTH_NOISE +
  ROT2 +
  SUN_COMMON +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  vec2 src = vec2(0.05 * sin(t * 0.37), -0.78 + 0.035 * sin(t * 0.5));
  vec2 p = uv - src;
  float d = length(p);
  vec2 dir = p / max(d, 1e-4);

  float n1 = rayNoise(rot2(t * 0.02) * dir, 22.0, vec2(t * 0.3, 0.0));
  float n2 = rayNoise(rot2(-t * 0.015) * dir, 60.0, vec2(5.2, t * 0.4));
  float rays = rayMask(n1, 0.0, 0.5) * 0.65 + rayMask(n2, 0.12, 0.55) * 0.45;

  float reach = 0.34 + 0.05 * sin(t * 1.3) + 0.04 * u_mid;
  float env = exp(-max(d - 0.28, 0.0) / reach);
  // the fan opens upward from the hidden sun
  float fan = smoothstep(0.3, 0.75, dir.y);

  vec3 nearC = vec3(1.0, 0.5, 0.45);
  vec3 midC = vec3(1.0, 0.8, 0.52);
  vec3 farC = vec3(0.6, 0.82, 1.0);
  float k = smoothstep(0.28, 0.75, d);
  vec3 c = mix(mix(nearC, midC, smoothstep(0.0, 0.45, k)), farC, smoothstep(0.45, 1.0, k));

  vec3 col = c * rays * env * fan * 1.9;

  // the dawn dome: soft glow just above the horizon, centred on the sun
  float dome = exp(-max(d - 0.28, 0.0) * 9.0) * fan;
  col += mix(vec3(1.0, 0.55, 0.45), vec3(1.0, 0.82, 0.6), 0.4) * dome * (0.32 + 0.06 * u_bass);

  // keep the sky above black
  col *= 1.0 - smoothstep(-0.05, 0.45, uv.y);
  // and the far flanks soft, so no low ray streaks across a corner
  col *= 1.0 - smoothstep(0.35, 0.9, abs(uv.x));
  gl_FragColor = vec4(sunTone(col), 1.0);
}
`;
