import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.25;

  // Wind direction and strength — bass drives intensity
  float windStrength = 0.5 + u_bass * 0.5;
  float windAngle = 0.15 + sin(u_time * 0.2) * 0.1;
  vec2 windDir = vec2(cos(windAngle), sin(windAngle));

  // Base desert color — warm tawny tones
  float desertGrad = smoothstep(-0.5, 0.4, uv.y);
  vec3 sandBase = palette(0.08 + paletteShift,
    vec3(0.55, 0.4, 0.25), vec3(0.2, 0.15, 0.08),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.1, 0.2));
  vec3 skyBase = palette(0.15 + paletteShift,
    vec3(0.5, 0.4, 0.3), vec3(0.2, 0.15, 0.1),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.08, 0.2));
  vec3 color = mix(sandBase, skyBase, desertGrad);

  // Horizontal sand sheets — multiple layers at different speeds
  float sandAccum = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float layerSpeed = 1.5 + fi * 0.8 + windStrength * 2.0;
    float layerScale = 3.0 + fi * 2.0;
    float layerHeight = fi * 0.08;

    // Rotate UV slightly per layer for depth
    vec2 sandUV = uv;
    sandUV = rot2(fi * 0.05 - 0.1) * sandUV;
    sandUV.x += u_time * layerSpeed + fi * 13.7;
    sandUV.y += sin(sandUV.x * 0.5 + fi * 3.0) * 0.1;

    float sandNoise = fbm(sandUV * layerScale);

    // Create horizontal streaks
    float streak = sandNoise;
    streak = smoothstep(0.0, 0.4, streak) * smoothstep(0.8, 0.4, streak);

    // Each layer has a vertical band where it's active
    float bandCenter = -0.2 + fi * 0.12 + sin(u_time * 0.5 + fi) * 0.05;
    float bandWidth = 0.15 + u_mid * 0.05;
    float band = smoothstep(bandWidth, 0.0, abs(uv.y - bandCenter));

    float layerOpacity = (0.2 - fi * 0.025) * windStrength;
    sandAccum += streak * band * layerOpacity;
  }

  vec3 sandColor = palette(sandAccum * 0.3 + 0.1 + paletteShift,
    vec3(0.6, 0.45, 0.25), vec3(0.2, 0.15, 0.08),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.08, 0.18));
  color = mix(color, sandColor, clamp(sandAccum, 0.0, 0.8));

  // Dense visibility-blocking gusts
  float gustNoise = fbm(vec2(uv.x * 2.0 + u_time * 3.0 * windStrength, uv.y * 1.5 + t));
  float gustNoise2 = fbm(vec2(uv.x * 3.0 + u_time * 2.5 * windStrength + 50.0, uv.y * 2.0 - t * 0.5));
  float gust = gustNoise * 0.5 + gustNoise2 * 0.5;
  gust = smoothstep(0.1, 0.6, gust);
  gust *= windStrength;

  vec3 gustColor = palette(0.12 + paletteShift,
    vec3(0.5, 0.38, 0.22), vec3(0.18, 0.12, 0.06),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.1, 0.2));
  color = mix(color, gustColor, gust * 0.5);

  // Brief clearings revealing distant features
  float clearingMask = 1.0 - gust;
  float clearing = smoothstep(0.4, 0.8, clearingMask);

  // Distant dunes visible through clearings
  if (clearing > 0.01) {
    float duneX = uv.x * 3.0;
    float dune1 = sin(duneX * 2.0 + 1.0) * 0.1 + sin(duneX * 5.0 + 3.0) * 0.04;
    float dune2 = sin(duneX * 1.5 + 4.0) * 0.12 + sin(duneX * 3.5) * 0.06;

    float duneShape1 = smoothstep(dune1 - 0.15, dune1, uv.y) * smoothstep(dune1 + 0.01, dune1, uv.y);
    float duneShape2 = smoothstep(dune2 - 0.2, dune2 - 0.08, uv.y) * smoothstep(dune2 - 0.06, dune2 - 0.08, uv.y);

    vec3 distantDune = palette(0.06 + paletteShift,
      vec3(0.45, 0.35, 0.22), vec3(0.15, 0.1, 0.06),
      vec3(1.0, 0.8, 0.5), vec3(0.0, 0.1, 0.2));
    vec3 farDune = palette(0.09 + paletteShift,
      vec3(0.5, 0.4, 0.28), vec3(0.15, 0.1, 0.06),
      vec3(1.0, 0.8, 0.5), vec3(0.0, 0.08, 0.18));

    color = mix(color, distantDune, duneShape1 * clearing * 0.4);
    color = mix(color, farDune, duneShape2 * clearing * 0.3);
  }

  // Sunlight filtering through — diffused disc
  float sunY = 0.25 + sin(u_time * 0.15) * 0.05;
  float sunDist = length(uv - vec2(0.2, sunY));
  float diffusedSun = smoothstep(0.5, 0.0, sunDist) * (1.0 - gust * 0.7);
  vec3 sunColor = palette(0.05 + paletteShift,
    vec3(0.8, 0.6, 0.3), vec3(0.2, 0.15, 0.1),
    vec3(1.0, 0.7, 0.3), vec3(0.0, 0.05, 0.15));
  color += diffusedSun * sunColor * 0.2;

  // Individual sand particles — small bright dots streaming horizontally
  float particles = 0.0;
  for (int p = 0; p < 4; p++) {
    float fp = float(p);
    vec2 particleUV = uv;
    particleUV.x += u_time * (4.0 + fp * 2.0) * windStrength;
    particleUV.y += sin(particleUV.x * 2.0 + fp * 7.0) * 0.05;
    particleUV *= 20.0 + fp * 10.0;

    float particle = snoise(particleUV + fp * 100.0);
    particle = smoothstep(0.82, 0.92, particle);
    particles += particle * (0.12 - fp * 0.02);
  }
  vec3 particleColor = palette(0.07 + paletteShift,
    vec3(0.7, 0.55, 0.3), vec3(0.2, 0.15, 0.08),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.08, 0.18));
  color += particles * particleColor * windStrength;

  // Ground-level turbulence — swirling eddies at the bottom
  float eddy = snoise(vec2(uv.x * 5.0 - u_time * 2.0, uv.y * 3.0 + t));
  float eddyShape = smoothstep(0.3, 0.6, eddy) * smoothstep(-0.5, -0.3, uv.y) * smoothstep(-0.2, -0.3, uv.y);
  color = mix(color, gustColor * 1.1, eddyShape * 0.3 * windStrength);

  // Treble sparkle — sunlight catching individual grains
  float grainSparkle = snoise(uv * 60.0 + u_time * 8.0);
  grainSparkle = smoothstep(0.88, 0.98, grainSparkle) * u_treble * 0.3;
  color += grainSparkle * sunColor * 0.5;

  // Mid drives swirl intensity — spiral dust devils
  float devilAngle = atan(uv.y + 0.1, uv.x - 0.15);
  float devilDist = length(uv - vec2(0.15, -0.1));
  float spiral = sin(devilAngle * 3.0 - devilDist * 15.0 + u_time * 3.0);
  spiral = smoothstep(0.3, 0.8, spiral) * smoothstep(0.3, 0.05, devilDist);
  spiral *= u_mid * 0.3;
  color = mix(color, gustColor * 1.2, spiral * windStrength * 0.3);

  // Atmospheric depth — everything slightly washed out
  float atmosphericFog = 0.15 + gust * 0.2;
  vec3 fogColor = palette(0.1 + paletteShift,
    vec3(0.55, 0.42, 0.28), vec3(0.15, 0.1, 0.06),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.08, 0.18));
  color = mix(color, fogColor, atmosphericFog);

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.8;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
