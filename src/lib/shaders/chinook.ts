import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Chinook — warm wind descending mountains, flowing thermal patterns

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // Mountain silhouette — jagged peaks across the bottom
  float mountainLine = -0.2 + snoise(vec2(uv.x * 2.0, 0.0)) * 0.25
                      + snoise(vec2(uv.x * 5.0, 1.0)) * 0.1;
  float mountain = smoothstep(mountainLine + 0.02, mountainLine - 0.02, uv.y);

  // Warm descending wind layers — multiple streams flowing downslope
  float wind = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float speed = 0.3 + fi * 0.15 + u_bass * 0.2;
    float yOff = fi * 0.12 + 0.1;
    vec2 windUV = uv + vec2(t * speed, -t * 0.05 * fi);
    windUV *= rot2(0.15 - fi * 0.06);
    float layer = fbm(windUV * (2.0 + fi * 0.5) + fi * 7.3);
    // Mask to the sky region, flowing downward near mountains
    float heightMask = smoothstep(mountainLine - 0.1, mountainLine + 0.4 + fi * 0.1, uv.y);
    wind += layer * heightMask * (0.5 - fi * 0.06);
  }

  // Domain warping for heat shimmer in the wind
  float warpX = fbm(uv * 3.0 + vec2(t * 0.4, 0.0)) * u_mid * 0.15;
  float warpY = fbm(uv * 3.0 + vec2(0.0, t * 0.3) + 5.0) * u_mid * 0.1;
  vec2 warped = uv + vec2(warpX, warpY);
  float thermalWarp = fbm(warped * 4.0 - vec2(0.0, t * 0.6));

  // Sky gradient — warm tones at bottom, cooler above
  float skyGrad = smoothstep(-0.5, 0.8, uv.y);

  // Color: warm chinook palette (dusty gold, amber, warm sienna)
  vec3 skyColor = palette(
    skyGrad * 0.6 + wind * 0.3 + paletteShift,
    vec3(0.35, 0.25, 0.15),
    vec3(0.3, 0.2, 0.1),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.1, 0.2)
  );

  // Wind stream color — lighter, more golden
  vec3 windColor = palette(
    wind * 0.5 + thermalWarp * 0.3 + paletteShift + 0.3,
    vec3(0.45, 0.35, 0.2),
    vec3(0.25, 0.15, 0.08),
    vec3(0.9, 0.7, 0.4),
    vec3(0.05, 0.1, 0.15)
  );

  // Mountain color — dark silhouette
  vec3 mtColor = palette(
    snoise(uv * 3.0) * 0.2 + paletteShift,
    vec3(0.08, 0.06, 0.05),
    vec3(0.05, 0.04, 0.03),
    vec3(0.5, 0.4, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = skyColor;
  color = mix(color, windColor, clamp(wind * 0.6 + thermalWarp * 0.2, 0.0, 1.0));

  // Treble: fine dust particles carried by the wind
  float dust = snoise(uv * 30.0 + vec2(t * 2.0, -t * 0.5));
  dust = pow(max(dust, 0.0), 4.0) * u_treble * 0.3;
  color += vec3(0.5, 0.4, 0.25) * dust;

  // Apply mountain silhouette
  color = mix(color, mtColor, mountain);

  // Bass pulses warm glow near mountain base
  float baseGlow = smoothstep(mountainLine + 0.15, mountainLine - 0.05, uv.y);
  color += vec3(0.3, 0.15, 0.05) * baseGlow * u_bass * 0.4;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
