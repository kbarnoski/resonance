import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.25;

  // Heat distortion — waves rising from the bottom
  float heatIntensity = 0.5 + u_bass * 0.5;
  float distortionPhase = uv.y * 8.0 - u_time * 1.5;
  float heatWaveX = sin(distortionPhase + sin(uv.x * 3.0 + u_time * 0.7) * 2.0) * 0.02 * heatIntensity;
  float heatWaveY = cos(distortionPhase * 0.7 + uv.x * 5.0) * 0.015 * heatIntensity;

  // Stronger distortion near the bottom (hot surface)
  float distortionMask = smoothstep(0.5, -0.5, uv.y);
  heatWaveX *= distortionMask;
  heatWaveY *= distortionMask;

  vec2 distortedUV = uv + vec2(heatWaveX, heatWaveY);

  // Secondary slower distortion layer
  float slowWarp = snoise(distortedUV * 3.0 + vec2(t * 0.5, t * 0.3)) * 0.025 * heatIntensity;
  distortedUV.x += slowWarp * distortionMask;

  // Desert horizon gradient — warm tones
  float horizon = smoothstep(-0.1, 0.0, distortedUV.y);
  vec3 groundColor = palette(0.08 + paletteShift, vec3(0.6, 0.4, 0.2), vec3(0.3, 0.2, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.0, 0.1, 0.2));
  vec3 skyColor = palette(0.55 + paletteShift, vec3(0.5, 0.5, 0.6), vec3(0.3, 0.25, 0.15),
    vec3(1.0, 0.8, 0.6), vec3(0.0, 0.15, 0.35));
  vec3 color = mix(groundColor, skyColor, horizon);

  // Sun disc — shimmering mirage sun near horizon
  float sunPosY = 0.05 + sin(u_time * 0.3) * 0.01;
  float sunDist = length(distortedUV - vec2(0.0, sunPosY));
  float sun = smoothstep(0.15, 0.08, sunDist);
  float sunGlow = smoothstep(0.6, 0.0, sunDist) * 0.3;
  vec3 sunColor = palette(0.1 + paletteShift, vec3(0.9, 0.7, 0.3), vec3(0.3, 0.2, 0.1),
    vec3(1.0, 0.8, 0.4), vec3(0.0, 0.05, 0.15));
  color += sun * sunColor * 1.2;
  color += sunGlow * sunColor * 0.5;

  // Mirage reflection — inverted and stretched below horizon
  float mirageZone = smoothstep(0.0, -0.3, uv.y);
  if (uv.y < 0.0) {
    vec2 mirageUV = vec2(distortedUV.x, -distortedUV.y * 0.6 + 0.05);
    // Extra wobble for mirage
    mirageUV.x += sin(mirageUV.y * 15.0 - u_time * 2.0) * 0.03 * heatIntensity;
    mirageUV.y += cos(mirageUV.x * 10.0 + u_time * 1.5) * 0.02 * heatIntensity;

    float mirageSunDist = length(mirageUV - vec2(0.0, sunPosY));
    float mirageSun = smoothstep(0.2, 0.05, mirageSunDist);
    vec3 mirageColor = palette(0.15 + paletteShift, vec3(0.7, 0.5, 0.25), vec3(0.3, 0.2, 0.1),
      vec3(1.0, 0.8, 0.5), vec3(0.0, 0.1, 0.25));

    // Mirage fades with distance from horizon
    float mirageFade = mirageZone * 0.5;
    color = mix(color, mirageColor, mirageSun * mirageFade);

    // Shimmering bands in the mirage
    float shimmer = sin(uv.y * 60.0 - u_time * 4.0 + sin(uv.x * 8.0) * 3.0);
    shimmer = smoothstep(0.3, 0.7, shimmer) * mirageZone * 0.15;
    color += shimmer * mirageColor;
  }

  // Atmospheric haze layers — horizontal bands that undulate
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float bandY = -0.1 + fi * 0.08;
    float bandWidth = 0.04 + u_mid * 0.02;
    float distFromBand = abs(distortedUV.y - bandY);
    float band = smoothstep(bandWidth, 0.0, distFromBand);

    // Each band has its own noise-driven opacity
    float bandNoise = snoise(vec2(distortedUV.x * 3.0 + fi * 5.0 + t * (0.5 + fi * 0.2), fi * 10.0));
    band *= smoothstep(-0.2, 0.3, bandNoise);

    vec3 hazeCol = palette(fi * 0.15 + 0.3 + paletteShift,
      vec3(0.5, 0.45, 0.35), vec3(0.2, 0.15, 0.1),
      vec3(1.0, 0.9, 0.7), vec3(0.0, 0.1, 0.25));
    color = mix(color, hazeCol, band * 0.25);
  }

  // Convection currents — vertical flowing noise
  float convection = fbm(vec2(distortedUV.x * 4.0, distortedUV.y * 2.0 - u_time * 0.8) + t);
  convection = smoothstep(0.1, 0.5, convection) * distortionMask * 0.12;
  vec3 convColor = palette(convection + 0.4 + paletteShift,
    vec3(0.6, 0.45, 0.25), vec3(0.2, 0.15, 0.08),
    vec3(1.0, 0.8, 0.5), vec3(0.05, 0.1, 0.2));
  color += convection * convColor;

  // Dust particles drifting — mid-reactive
  float dustDensity = 20.0 + u_mid * 10.0;
  float dust = 0.0;
  for (int d = 0; d < 3; d++) {
    float fd = float(d);
    vec2 dustUV = distortedUV * (dustDensity + fd * 5.0);
    dustUV += vec2(u_time * (0.3 + fd * 0.15), -u_time * 0.1 + fd * 3.0);
    float particle = snoise(dustUV);
    particle = smoothstep(0.75, 0.85, particle);
    dust += particle * (0.08 - fd * 0.02);
  }
  vec3 dustColor = palette(0.12 + paletteShift, vec3(0.7, 0.6, 0.4), vec3(0.2, 0.15, 0.1),
    vec3(1.0, 0.9, 0.7), vec3(0.0, 0.05, 0.15));
  color += dust * dustColor;

  // Treble shimmer — high-frequency sparkle in the air
  float airShimmer = snoise(distortedUV * 50.0 + u_time * 3.0);
  airShimmer = smoothstep(0.8, 0.95, airShimmer) * u_treble * 0.25;
  airShimmer *= smoothstep(-0.5, 0.2, uv.y); // only in sky region
  color += airShimmer * sunColor * 0.6;

  // Overall warm color grade
  color = mix(color, color * vec3(1.05, 0.95, 0.85), 0.3);

  // Subtle chromatic aberration from heat
  float caStrength = 0.003 * heatIntensity * distortionMask;
  vec2 caOffset = vec2(caStrength, 0.0);
  float rShift = fbm((distortedUV + caOffset) * 3.0 + t);
  float bShift = fbm((distortedUV - caOffset) * 3.0 + t);
  color.r += (rShift - 0.5) * 0.04 * distortionMask;
  color.b += (bShift - 0.5) * 0.04 * distortionMask;

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.6;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
