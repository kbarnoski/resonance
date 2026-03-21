import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI, SMIN } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  SMIN +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Breathing rhythm — slow inhale/exhale
  float breathRate = 0.4 + u_bass * 0.3;
  float breathPhase = sin(t * breathRate) * 0.5 + 0.5;
  float inhale = pow(breathPhase, 0.7);
  float exhale = 1.0 - inhale;

  // Scale pulses with breath
  float scale = 5.0 + inhale * 1.5;
  vec2 p = uv * scale;

  // Organic warp
  vec2 warp = vec2(
    snoise(uv * 2.0 + t * 0.05),
    snoise(uv * 2.0 + t * 0.04 + 4.2)
  );
  p += warp * 0.5;

  // Primary alveolar sacs — rounded voronoi
  vec3 v1 = voronoi(p);
  float sacs = v1.x;
  float walls = v1.y - v1.x;
  float sacEdge = smoothstep(0.15, 0.0, walls);

  // Secondary alveoli — smaller bubble clusters
  vec3 v2 = voronoi(p * 2.2 + vec2(t * 0.03, 0.0));
  float smallSacs = v2.x;
  float smallWalls = v2.y - v2.x;
  float smallEdge = smoothstep(0.12, 0.0, smallWalls);

  // Tertiary — finest structure
  vec3 v3 = voronoi(p * 4.5 + vec2(0.0, t * 0.02));
  float tinyWalls = v3.y - v3.x;
  float tinyEdge = smoothstep(0.10, 0.0, tinyWalls);

  // Inflation — sacs expand with breath
  float inflation = smoothstep(0.5, 0.1, sacs) * inhale;

  // Colors
  // Alveolar wall — pink tissue
  vec3 wallColor = palette(
    walls * 0.5 + t * 0.02,
    vec3(0.55, 0.35, 0.38),
    vec3(0.2, 0.12, 0.14),
    vec3(0.8, 0.5, 0.55),
    vec3(0.0, 0.1, 0.15)
  );

  // Air space — pale translucent blue-pink
  vec3 airColor = palette(
    sacs * 0.3 + breathPhase * 0.2,
    vec3(0.7, 0.6, 0.65),
    vec3(0.15, 0.12, 0.15),
    vec3(0.8, 0.7, 0.8),
    vec3(0.0, 0.05, 0.15)
  );

  // Capillary red in walls
  vec3 capColor = palette(
    smallSacs * 0.4 + t * 0.03,
    vec3(0.5, 0.1, 0.1),
    vec3(0.3, 0.08, 0.06),
    vec3(0.9, 0.2, 0.15),
    vec3(0.0, 0.08, 0.05)
  );

  // Compose
  vec3 color = airColor * (1.0 - sacEdge * 0.5);

  // Alveolar walls
  color = mix(color, wallColor, sacEdge * 0.8);
  color = mix(color, wallColor * 0.8, smallEdge * 0.4);
  color += wallColor * tinyEdge * 0.15;

  // Capillaries running through walls
  float capMask = sacEdge * smallEdge;
  color = mix(color, capColor, capMask * 0.5);

  // Breath expansion glow
  color += airColor * inflation * 0.2;

  // Oxygen exchange glow — mid reactive
  float exchange = pow(1.0 - sacs, 4.0) * sacEdge;
  color += vec3(0.6, 0.2, 0.2) * exchange * u_mid * 0.4;

  // Air movement sparkle — treble
  float airSparkle = pow(snoise(p * 6.0 + t * 2.5) * 0.5 + 0.5, 10.0);
  color += vec3(0.7, 0.65, 0.7) * airSparkle * u_treble * 0.3 * inhale;

  // Breathing brightness modulation
  color *= 0.8 + breathPhase * 0.15 + u_amplitude * 0.15;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
