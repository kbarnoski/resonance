import { U, SMOOTH_NOISE, ROT2 } from "./shared";
import { SUN_COMMON } from "./sun-shared";

// SUN · Corona Breath — a small white photosphere with coronal filaments
// streaming out of it: three filament layers (coarse → hair-fine) that
// curl gently against each other, their brightness flowing OUTWARD along
// each streamer, and the whole corona inhaling/exhaling its reach on a
// slow solar breath. Mid lengthens the reach; bass warms the core only.
export const FRAG =
  U +
  SMOOTH_NOISE +
  ROT2 +
  SUN_COMMON +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float r = length(uv);
  vec2 dir = uv / max(r, 1e-4);

  float breath = 0.5 + 0.5 * sin(t * 1.7);
  float swell = 0.82 + 0.18 * breath + 0.08 * u_mid;
  float lift = smoothstep(0.05, 0.11, r);

  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // gentle counter-curl per layer (more curl further out)
    float twist = (fi - 1.0) * 0.28 * r + sin(t * 0.7 + fi * 2.1) * 0.1 * r + t * 0.04 * (1.0 + fi * 0.5);
    vec2 d = rot2(twist) * dir;
    float k = 7.0 + fi * 10.0;
    // second noise axis = radius - time: features travel out along the streamer
    float n = rayNoise(d, k, vec2(fi * 13.7 + t * 0.3, r * (1.2 + fi * 0.5) - t * 0.8));
    float fil = rayMask(n, 0.06 + fi * 0.05, 0.5);
    float reach = (0.16 + 0.09 * fi) * swell;
    float env = exp(-max(r - 0.07, 0.0) / reach) * lift;
    vec3 warm = mix(vec3(1.0, 0.7, 0.36), vec3(1.0, 0.5, 0.42), fi * 0.5);
    vec3 c = mix(warm, vec3(0.6, 0.44, 1.0), smoothstep(0.06, 0.5, r) * (0.5 + fi * 0.25));
    col += c * fil * env * (1.5 - fi * 0.3);
  }

  // hair-fine rays riding over the streamers
  float hair = rayMask(rayNoise(rot2(t * 0.03) * dir, 46.0, vec2(t * 0.45, 3.1)), 0.16, 0.55);
  col += vec3(1.0, 0.9, 0.76) * hair * exp(-max(r - 0.07, 0.0) / (0.1 * swell)) * lift * 0.8;

  // photosphere + soft inner glow
  float core = exp(-r * r / 0.0028);
  float glow = exp(-r * 11.0) * 0.22;
  col += vec3(1.0, 0.93, 0.8) * (core * (0.95 + 0.12 * u_bass) + glow * (0.85 + 0.15 * breath));

  col *= 1.0 - smoothstep(0.3, 1.0, r);
  gl_FragColor = vec4(sunTone(col), 1.0);
}
`;
