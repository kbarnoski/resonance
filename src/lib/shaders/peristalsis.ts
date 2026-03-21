import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Tube orientation — horizontal undulating tube
  vec2 p = uv * rot2(0.1 + sin(t * 0.1) * 0.05);

  // Peristaltic wave — traveling contraction along x-axis
  float waveSpeed = 2.0 + u_bass * 1.5;
  float waveFreq = 4.0;

  // Multiple overlapping contraction waves
  float contraction = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float phase = t * waveSpeed + fi * 2.1;
    float wave = sin(p.x * waveFreq - phase) * 0.5 + 0.5;
    wave = pow(wave, 3.0);
    contraction += wave * (0.5 - fi * 0.12);
  }
  contraction = clamp(contraction, 0.0, 1.0);

  // Tube wall shape — y-distance from center, modulated by contraction
  float tubeRadius = 0.25 - contraction * 0.1;
  float wallThickness = 0.08 + contraction * 0.03;

  // Organic wall surface variation
  float wallNoise = snoise(vec2(p.x * 8.0, p.y * 3.0 + t * 0.1)) * 0.02;
  float wallNoise2 = fbm(p * 6.0 + vec2(t * 0.05, 0.0)) * 0.015;
  float yDist = abs(p.y) - tubeRadius + wallNoise + wallNoise2;

  // Inner lumen (cavity)
  float lumen = smoothstep(0.01, -0.01, yDist);

  // Muscle wall
  float wallInner = smoothstep(-0.01, 0.01, yDist);
  float wallOuter = smoothstep(wallThickness + 0.01, wallThickness - 0.01, yDist);
  float wall = wallInner * wallOuter;

  // Outer serosa
  float serosa = smoothstep(wallThickness - 0.01, wallThickness + 0.01, yDist) *
                 smoothstep(wallThickness + 0.06, wallThickness + 0.03, yDist);

  // Muscle fiber texture — circular and longitudinal layers
  float circularFibers = sin(p.x * 40.0 + contraction * 10.0) * 0.5 + 0.5;
  circularFibers = pow(circularFibers, 3.0);

  float longFibers = sin(p.y * 50.0 + snoise(p * 3.0) * 5.0) * 0.5 + 0.5;
  longFibers = pow(longFibers, 3.0);

  // Bolus — material being pushed through
  float bolusX = fract(t * 0.3) * 3.0 - 1.5;
  float bolusDist = length(vec2(p.x - bolusX, p.y * 2.0));
  float bolus = smoothstep(0.15, 0.08, bolusDist) * lumen;

  // Colors
  // Mucosa lining — pale pink, glistening
  vec3 mucosaColor = palette(
    p.x * 0.2 + t * 0.02,
    vec3(0.6, 0.42, 0.42),
    vec3(0.15, 0.1, 0.1),
    vec3(0.8, 0.55, 0.55),
    vec3(0.0, 0.1, 0.15)
  );

  // Muscle layer — deep red-pink
  vec3 muscleColor = palette(
    contraction * 0.3 + p.x * 0.1 + t * 0.02,
    vec3(0.45, 0.15, 0.15),
    vec3(0.25, 0.08, 0.08),
    vec3(0.8, 0.25, 0.2),
    vec3(0.0, 0.08, 0.1)
  );

  // Serosa — pale connective tissue
  vec3 serosaColor = palette(
    p.x * 0.15 + t * 0.01 + 0.3,
    vec3(0.55, 0.45, 0.4),
    vec3(0.1, 0.08, 0.07),
    vec3(0.7, 0.6, 0.55),
    vec3(0.0, 0.08, 0.12)
  );

  // Bolus — amber/brown
  vec3 bolusColor = palette(
    bolusDist * 2.0 + t * 0.05,
    vec3(0.4, 0.3, 0.12),
    vec3(0.2, 0.15, 0.06),
    vec3(0.7, 0.5, 0.2),
    vec3(0.0, 0.08, 0.05)
  );

  // Lumen background — dark cavity
  vec3 lumenColor = vec3(0.05, 0.02, 0.02);

  // Compose
  vec3 color = vec3(0.03, 0.02, 0.02);

  // Lumen
  color = mix(color, lumenColor, lumen);

  // Mucosa lining — inner surface
  float mucosaMask = lumen * smoothstep(-0.03, 0.0, yDist + 0.01);
  color = mix(color, mucosaColor, mucosaMask * 0.7);

  // Muscle wall
  color = mix(color, muscleColor, wall);
  color += muscleColor * circularFibers * wall * 0.1;
  color += muscleColor * longFibers * wall * 0.08;

  // Contraction brightening
  color += muscleColor * contraction * wall * 0.2;

  // Serosa
  color = mix(color, serosaColor, serosa);

  // Bolus
  color = mix(color, bolusColor, bolus * 0.8);

  // Contraction wave glow — bass reactive
  float waveGlow = pow(contraction, 2.0) * wall;
  color += vec3(0.4, 0.1, 0.08) * waveGlow * u_bass * 0.4;

  // Peristaltic rhythm highlight — mid reactive
  float rhythm = sin(p.x * 10.0 - t * waveSpeed * 2.0) * 0.5 + 0.5;
  rhythm = pow(rhythm, 6.0);
  color += muscleColor * rhythm * wall * u_mid * 0.25;

  // Mucosal shimmer — treble
  float shimmer = pow(snoise(p * 25.0 + t * 1.5) * 0.5 + 0.5, 10.0);
  color += mucosaColor * shimmer * u_treble * 0.3 * lumen;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
