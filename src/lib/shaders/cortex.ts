import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Slow orbital drift
  vec2 p = uv * rot2(t * 0.08);

  // Domain warp for organic folds — sulci and gyri
  vec2 warp1 = vec2(
    fbm(p * 2.5 + vec2(t * 0.1, 0.0)),
    fbm(p * 2.5 + vec2(0.0, t * 0.08) + 5.3)
  );
  vec2 warp2 = vec2(
    fbm(p * 2.5 + warp1 * 0.6 + vec2(t * 0.05, 1.7)),
    fbm(p * 2.5 + warp1 * 0.6 + vec2(3.2, t * 0.06))
  );
  vec2 warped = p + warp2 * (0.35 + u_bass * 0.15);

  // Primary fold structure — large gyri
  float folds = fbm(warped * 3.0 + t * 0.04);
  float ridges = abs(folds);
  float sulci = smoothstep(0.02, 0.18, ridges);

  // Secondary fine wrinkles
  float fine = fbm(warped * 8.0 + vec2(t * 0.06, -t * 0.03));
  float fineRidges = abs(fine);
  float microFolds = smoothstep(0.01, 0.12, fineRidges);

  // Depth perception — darker in sulci, lighter on gyri
  float depth = folds * 0.5 + 0.5;
  depth = pow(depth, 0.8 + u_mid * 0.4);

  // Pink-gray cortical tissue
  vec3 gyriColor = palette(
    depth * 0.6 + t * 0.02,
    vec3(0.62, 0.52, 0.52),
    vec3(0.18, 0.12, 0.12),
    vec3(0.8, 0.6, 0.6),
    vec3(0.0, 0.05, 0.1)
  );

  // Deep sulci — darker pinkish-gray
  vec3 sulciColor = palette(
    depth * 0.3 + warp1.x * 0.4 + t * 0.01,
    vec3(0.28, 0.22, 0.25),
    vec3(0.12, 0.08, 0.10),
    vec3(0.5, 0.4, 0.45),
    vec3(0.0, 0.1, 0.2)
  );

  // Blood vessel hints — faint red threads
  float vessels = smoothstep(0.06, 0.0, fineRidges) * smoothstep(0.15, 0.05, ridges);
  vec3 vesselColor = palette(
    fine * 0.5 + t * 0.03,
    vec3(0.5, 0.15, 0.15),
    vec3(0.3, 0.1, 0.1),
    vec3(1.0, 0.3, 0.3),
    vec3(0.0, 0.1, 0.0)
  );

  // Compose
  vec3 color = mix(sulciColor, gyriColor, sulci);
  color = mix(color, gyriColor * 1.15, microFolds * 0.4);
  color += vesselColor * vessels * (0.3 + u_treble * 0.5);

  // Neural activity glow — bass-reactive warm pulse
  float activity = pow(depth, 3.0) * u_bass;
  vec3 glowColor = vec3(0.7, 0.35, 0.3);
  color += glowColor * activity * 0.35;

  // Amplitude-driven overall brightness shift
  color *= 0.85 + u_amplitude * 0.3;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
