import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
// Infinite ember field — glowing coals from above.
// Voronoi-based, warm meditative glow with bass-driven flare-ups.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.25;

  // ── Perspective projection — looking down at infinite field ──
  // Tilt the view plane to create depth
  float tilt = 0.6;
  float depth = tilt / max(0.5 - uv.y * 0.8, 0.01);
  vec2 fieldUV = vec2(uv.x * depth * 0.5, depth + t * 3.0);

  // Depth fog factor
  float depthFog = exp(-depth * 0.08);

  // ── Voronoi coal cells ──
  float scale = 2.5;
  vec3 vor = voronoi(fieldUV * scale);
  float cellDist = vor.x;  // F1 — distance to nearest cell center
  float edgeDist = vor.y - vor.x;  // F2 - F1 — cell edge proximity

  // ── Coal temperature map ── driven by fbm noise
  float heatNoise = fbm(fieldUV * 0.8 + vec2(t * 0.2, 0.0));
  float baseHeat = smoothstep(-0.3, 0.5, heatNoise);

  // Bass creates hot flare-ups in random cells
  float flareNoise = snoise(fieldUV * 1.5 + vec2(t * 0.5, t * 0.3));
  float flare = smoothstep(0.3, 0.8, flareNoise) * u_bass * 2.0;

  float heat = baseHeat * 0.6 + flare;
  heat = clamp(heat, 0.0, 1.5);

  // ── Ember cracks along cell edges ──
  float crack = smoothstep(0.15, 0.02, edgeDist);
  float crackHeat = crack * (0.4 + heat * 0.8);

  // ── Color palettes ──
  // Dark coal surface
  vec3 coalColor = palette(
    cellDist * 2.0 + heatNoise * 0.5 + paletteShift,
    vec3(0.05, 0.03, 0.02),
    vec3(0.08, 0.04, 0.02),
    vec3(0.5, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Glowing ember — deep red to orange to white-hot
  vec3 emberLow = palette(
    heat * 1.5 + paletteShift + 0.1,
    vec3(0.3, 0.1, 0.05),
    vec3(0.4, 0.15, 0.05),
    vec3(0.8, 0.4, 0.2),
    vec3(0.0, 0.05, 0.05)
  );

  vec3 emberHigh = palette(
    heat * 2.0 + paletteShift + 0.3,
    vec3(0.6, 0.3, 0.1),
    vec3(0.4, 0.3, 0.1),
    vec3(1.0, 0.6, 0.3),
    vec3(0.0, 0.03, 0.05)
  );

  // Blend based on heat intensity
  vec3 emberColor = mix(emberLow, emberHigh, smoothstep(0.3, 1.0, heat));

  // White-hot cores
  float whiteHot = smoothstep(0.8, 1.3, heat);
  emberColor = mix(emberColor, vec3(1.4, 1.2, 0.9), whiteHot);

  // ── Compositing ──
  // Cell interior: coal + heat glow
  float cellInterior = smoothstep(0.0, 0.2, cellDist);
  vec3 cellColor = mix(emberColor * (0.3 + heat * 0.7), coalColor, cellInterior * (1.0 - heat * 0.5));

  // Add crack glow
  vec3 crackColor = mix(vec3(0.8, 0.2, 0.05), vec3(1.3, 0.8, 0.3), crackHeat);
  cellColor += crackColor * crackHeat * 0.8;

  // Apply depth fog — distant embers are dimmer
  vec3 fogColor = vec3(0.02, 0.01, 0.005);
  cellColor = mix(cellColor, fogColor, 1.0 - depthFog);

  // ── Smoke/heat haze above ── (upper portion of screen)
  float smokeRegion = smoothstep(0.0, 0.5, uv.y);
  float smoke = fbm(vec2(uv.x * 2.0 + t * 0.5, uv.y * 3.0 - t * 0.8)) * 0.5 + 0.5;
  smoke *= smokeRegion;

  vec3 smokeColor = palette(
    smoke + t * 0.1 + paletteShift + 0.5,
    vec3(0.08, 0.04, 0.02),
    vec3(0.06, 0.03, 0.02),
    vec3(0.5, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  cellColor = mix(cellColor, smokeColor, smoke * 0.5 * smokeRegion);

  // ── Floating sparks — treble drives ──
  float sparks = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float sx = fract(sin(fi * 127.1) * 43758.5) * 2.0 - 1.0;
    float sy = fract(sin(fi * 311.7) * 43758.5);
    sy = mod(sy + t * (0.3 + fract(fi * 0.37) * 0.4), 1.5) - 0.3;
    sx += sin(t * 2.0 + fi * 3.0) * 0.1;
    float sd = length(uv - vec2(sx, sy));
    float sparkBright = 0.001 / (sd * sd + 0.001);
    sparkBright *= u_treble * 0.5;
    sparks += sparkBright;
  }
  vec3 sparkColor = vec3(1.3, 0.8, 0.3);
  cellColor += sparkColor * sparks * 0.003;

  // ── Global glow — warm ambient from below ──
  float bottomGlow = smoothstep(0.5, -0.5, uv.y) * 0.1;
  cellColor += vec3(0.4, 0.15, 0.05) * bottomGlow * (0.5 + u_amplitude * 0.5);

  // Mid-frequency drives subtle pulsing
  cellColor *= (0.9 + u_mid * 0.15);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  cellColor *= vignette;

  gl_FragColor = vec4(cellColor, 1.0);
}
`;
