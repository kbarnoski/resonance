import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Deluge — heavy rainfall, sheets of water cascading down

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.2;

  // Rain angle — slightly tilted by wind
  float windAngle = 0.08 + snoise(vec2(t * 0.15, 0.0)) * 0.05 + u_bass * 0.03;
  mat2 rainRot = rot2(windAngle);

  // Multiple rain layers at different depths
  float rain = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float depth = 1.0 + fi * 0.6;
    float speed = 6.0 + fi * 2.0;
    float density = 15.0 + fi * 8.0;

    vec2 rainUV = uv * rainRot;
    rainUV = vec2(rainUV.x * density, rainUV.y * density * 0.15);
    rainUV.y += t * speed;
    rainUV.x += fi * 11.3;

    // Rain drops — elongated vertical streaks
    vec2 rid = floor(rainUV);
    vec2 rf = fract(rainUV) - 0.5;
    vec2 rnd = hash2(rid + fi * 7.0);

    // Stagger drops in time
    float dropPhase = fract(rnd.x * 7.0 + t * (1.0 + rnd.y));
    float dropLen = 0.3 + rnd.y * 0.15;
    float dropActive = smoothstep(0.0, 0.1, dropPhase) * smoothstep(dropLen + 0.1, dropLen, dropPhase);

    float dx = rf.x - (rnd.x - 0.5) * 0.3;
    float streak = exp(-dx * dx * 200.0) * dropActive;

    rain += streak * (0.5 / depth) * (0.7 + u_treble * 0.4);
  }

  // Water surface at the bottom — pooling with ripples
  float waterLine = -0.3 + snoise(vec2(uv.x * 3.0, t * 0.3)) * 0.03;
  float inWater = smoothstep(waterLine + 0.02, waterLine - 0.02, uv.y);

  // Ripple rings where drops hit the surface
  float ripples = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = floor(t * 2.0 + fi * 1.7);
    vec2 rPos = vec2(hash2(vec2(seed, fi * 3.0)).x * 1.6 - 0.8, waterLine);
    float age = fract(t * 2.0 + fi * 1.7);
    float ringR = age * 0.15;
    float ringD = abs(length(uv - rPos) - ringR);
    float ring = smoothstep(0.01, 0.0, ringD) * (1.0 - age);
    ripples += ring * 0.5;
  }

  // Sheets of rain — larger-scale curtains of water
  float sheets = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 sheetUV = uv * rot2(windAngle * 1.2);
    sheetUV = vec2(sheetUV.x * (2.0 + fi), sheetUV.y - t * (1.5 + fi * 0.5));
    float sheet = fbm(sheetUV + fi * 5.0) * 0.5 + 0.5;
    sheet = pow(sheet, 2.5);
    sheets += sheet * (0.25 - fi * 0.05);
  }

  // Colors — cool grays and blues
  vec3 skyColor = palette(
    sheets * 0.3 + uv.y * 0.15 + paletteShift,
    vec3(0.12, 0.14, 0.18),
    vec3(0.08, 0.08, 0.12),
    vec3(0.4, 0.45, 0.6),
    vec3(0.15, 0.18, 0.3)
  );

  vec3 rainColor = vec3(0.5, 0.55, 0.65);

  vec3 waterColor = palette(
    ripples * 0.3 + snoise(uv * 4.0 + t * 0.2) * 0.2 + paletteShift + 0.3,
    vec3(0.06, 0.08, 0.14),
    vec3(0.05, 0.07, 0.12),
    vec3(0.3, 0.4, 0.6),
    vec3(0.15, 0.2, 0.35)
  );

  // Compose
  vec3 color = skyColor;
  color += sheets * vec3(0.08, 0.09, 0.12) * u_mid;
  color += rainColor * rain;
  color = mix(color, waterColor, inWater);
  color += vec3(0.5, 0.55, 0.6) * ripples * inWater;

  // Bass: darkens the whole scene like a heavy downpour
  color *= 1.0 - u_bass * 0.15;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
