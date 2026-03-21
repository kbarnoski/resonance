import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Viscous flow distortion — double domain warp
  vec2 p = uv * 2.0;
  vec2 flow1 = vec2(
    fbm(p + vec2(t * 0.15, 0.0)),
    fbm(p + vec2(0.0, t * 0.12) + 4.3)
  );
  vec2 flow2 = vec2(
    fbm(p + flow1 * 1.2 + vec2(t * 0.08, 1.7)),
    fbm(p + flow1 * 1.2 + vec2(2.8, t * 0.09))
  );
  vec2 flow3 = vec2(
    fbm(p + flow2 * 0.8 + vec2(t * 0.05, 3.1)),
    fbm(p + flow2 * 0.8 + vec2(5.2, t * 0.06))
  );

  // Triple warp creates thick viscous look
  float viscosity = 0.4 + u_bass * 0.2;
  vec2 warped = p + flow3 * viscosity;

  // Main nectar pattern — layered FBM
  float n1 = fbm(warped * 1.5);
  float n2 = fbm(warped * 3.0 + vec2(t * 0.05, 0.0));
  float n3 = fbm(warped * 0.8 - vec2(0.0, t * 0.03));

  // Combine for depth
  float nectar = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  float depth = nectar * 0.5 + 0.5;

  // Golden honey base
  vec3 honeyDark = palette(
    depth * 0.4 + t * 0.02,
    vec3(0.4, 0.25, 0.05),
    vec3(0.3, 0.18, 0.04),
    vec3(0.8, 0.6, 0.2),
    vec3(0.0, 0.08, 0.0)
  );

  // Bright amber highlights
  vec3 honeyBright = palette(
    depth * 0.6 + flow1.x * 0.3 + t * 0.03,
    vec3(0.65, 0.45, 0.1),
    vec3(0.35, 0.25, 0.08),
    vec3(1.0, 0.7, 0.2),
    vec3(0.0, 0.05, 0.0)
  );

  // Deep caramel undertone
  vec3 caramel = palette(
    n3 * 0.5 + t * 0.01 + 0.3,
    vec3(0.3, 0.15, 0.05),
    vec3(0.2, 0.1, 0.03),
    vec3(0.6, 0.35, 0.15),
    vec3(0.0, 0.1, 0.05)
  );

  // Compose layers
  vec3 color = mix(caramel, honeyDark, smoothstep(-0.2, 0.3, nectar));
  color = mix(color, honeyBright, smoothstep(0.1, 0.5, depth));

  // Viscous highlights — bright streaks where flow converges
  float highlights = pow(depth, 4.0);
  vec3 brightGold = vec3(0.95, 0.8, 0.3);
  color += brightGold * highlights * (0.3 + u_mid * 0.4);

  // Slow-moving bubbles in honey
  float bubbles = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 bp = warped * (2.0 + fi) + vec2(fi * 3.1, fi * 1.7);
    float bubble = length(fract(bp) - 0.5);
    bubble = smoothstep(0.08, 0.06, bubble);
    bubbles += bubble * (0.3 - fi * 0.05);
  }
  color += brightGold * bubbles * 0.3;

  // Warm glow from bass
  color += vec3(0.3, 0.15, 0.02) * u_bass * 0.3;

  // Light refraction shimmer
  float shimmer = pow(snoise(warped * 8.0 + t * 1.5) * 0.5 + 0.5, 8.0);
  color += brightGold * shimmer * u_treble * 0.3;

  color *= 0.85 + u_amplitude * 0.25;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
