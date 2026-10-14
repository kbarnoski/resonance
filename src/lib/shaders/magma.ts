import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";
import { deriveFrag, FBM_SPLIT, fieldGrid } from "./prepass-pack";

// PERF (2026-10-13, Ghost's amber web — the 120 fps law: magma dropped the
// kiosk to ~50-60 fps mid-Ghost). The original (ORIG, below — unchanged, and
// the layer's fallback without float render targets) paid ~30 noise
// evaluations per pixel at 3.3 M pixels. Its SMOOTH fields are now computed
// once per 3x3 pixels in a float prepass (PRE) and interpolated — the same
// math at the same points: the flow field's octaves 1-4, the rock surface,
// the cell temperature and the lava rivers. Everything sharp (the flow's top
// octaves, both crack networks, sparks, bumps, shimmer) stays per pixel.
// A/B vs ORIG at kiosk resolution: scripts/perf/shader-ab.mjs.
//
// PRE (RGBA32F, prepass-pack.ts fieldGrid): one field block
// (flowLow, surfaceNoise, cellTemp, riverNoise) + one table row holding the
// six sparks (x, y, age) — they depend on time only.

export const ORIG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
// Calmed 2026-10-13 (Karel: "that amber shared web responds too much to
// sound and over jiggles") — the amber web breathes slowly: the heat warp,
// crack pulse and shimmer clocks run ~3x slower, the palette barely follows
// the music, and the sparks drift on one continuous life cycle (they used
// to re-seed 4x a second mid-flight — a jitter of teleporting dots). Its
// audio drive is also scaled ×0.35 (SHADER_DRIVE_GAIN, shader-drive.ts).
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.05;
  float paletteShift = u_amplitude * 0.08;

  // Heat distortion on the whole field
  float heatDistort = 0.003 + u_bass * 0.005;
  uv.x += sin(uv.y * 12.0 + u_time * 0.45) * heatDistort;
  uv.y += cos(uv.x * 10.0 + u_time * 0.36) * heatDistort;

  // Convection flow field — slow undulating movement
  vec2 flowUV = uv;
  float flowAngle = fbm(uv * 1.5 + t * 0.3) * 6.28;
  flowUV += vec2(cos(flowAngle), sin(flowAngle)) * 0.08;

  // Primary Voronoi crack pattern
  vec2 vorUV = flowUV * 4.0 + vec2(t * 0.2, t * 0.15);
  vec3 vor = voronoi(vorUV);
  float f1 = vor.x;
  float f2 = vor.y;

  // Edge detection — cracks between cells
  float edgeDist = f2 - f1;
  float crackWidth = 0.06 + u_bass * 0.03;
  float crack = smoothstep(crackWidth, 0.0, edgeDist);

  // Secondary finer crack network
  vec2 vorUV2 = flowUV * 8.0 + vec2(-t * 0.15, t * 0.1);
  vec3 vor2 = voronoi(vorUV2);
  float crack2 = smoothstep(0.035 + u_mid * 0.015, 0.0, vor2.y - vor2.x);

  // Cooled surface color — dark volcanic rock
  float surfaceNoise = fbm(flowUV * 6.0 + t * 0.1) * 0.5 + 0.5;
  vec3 rockDark = palette(surfaceNoise * 0.2 + 0.05 + paletteShift,
    vec3(0.06, 0.04, 0.03), vec3(0.05, 0.04, 0.03),
    vec3(1.0, 0.8, 0.5), vec3(0.0, 0.05, 0.1));
  vec3 rockLight = palette(surfaceNoise * 0.15 + 0.12 + paletteShift,
    vec3(0.12, 0.08, 0.06), vec3(0.06, 0.05, 0.04),
    vec3(1.0, 0.7, 0.4), vec3(0.0, 0.08, 0.15));
  vec3 rockColor = mix(rockDark, rockLight, surfaceNoise);

  // Cell interior variation — each cell slightly different temperature
  float cellTemp = fbm(vorUV * 0.5 + f1 * 3.0 + t * 0.2);
  cellTemp = cellTemp * 0.5 + 0.5;
  vec3 warmRock = palette(cellTemp * 0.3 + 0.08 + paletteShift,
    vec3(0.15, 0.06, 0.03), vec3(0.1, 0.06, 0.03),
    vec3(1.0, 0.7, 0.3), vec3(0.0, 0.08, 0.15));
  vec3 color = mix(rockColor, warmRock, cellTemp * 0.3);

  // Molten crack color — bright orange/yellow in the cracks
  float crackHeat = crack + crack2 * 0.5;
  float crackPulse = sin(u_time * 0.6 + f1 * 10.0) * 0.1 + 0.9;
  crackHeat *= crackPulse;

  // Layered crack color — white hot core, orange edges
  vec3 crackCore = palette(0.1 + paletteShift,
    vec3(1.0, 0.9, 0.6), vec3(0.1, 0.1, 0.1),
    vec3(1.0, 0.5, 0.2), vec3(0.0, 0.05, 0.1));
  vec3 crackEdge = palette(0.18 + paletteShift,
    vec3(0.8, 0.3, 0.05), vec3(0.3, 0.2, 0.05),
    vec3(1.0, 0.6, 0.2), vec3(0.0, 0.08, 0.15));

  float coreIntensity = smoothstep(0.3, 0.9, crackHeat);
  vec3 crackColor = mix(crackEdge, crackCore, coreIntensity);
  color = mix(color, crackColor, clamp(crackHeat, 0.0, 1.0));

  // Emissive glow bleeding from cracks — bloom simulation
  float crackGlow = smoothstep(crackWidth + 0.15, 0.0, edgeDist) * 0.3;
  float crackGlow2 = smoothstep(0.08, 0.0, vor2.y - vor2.x) * 0.15;
  vec3 glowColor = palette(0.15 + paletteShift,
    vec3(0.6, 0.2, 0.03), vec3(0.3, 0.15, 0.05),
    vec3(1.0, 0.6, 0.2), vec3(0.0, 0.06, 0.12));
  color += (crackGlow + crackGlow2) * glowColor * (0.85 + u_bass * 0.2);

  // Convection cells — darker at edges, warmer at center
  float cellCenter = smoothstep(0.4, 0.0, f1);
  vec3 convectionWarm = palette(0.12 + paletteShift,
    vec3(0.2, 0.08, 0.03), vec3(0.12, 0.06, 0.03),
    vec3(1.0, 0.6, 0.3), vec3(0.0, 0.08, 0.15));
  color = mix(color, convectionWarm, cellCenter * 0.15 * (1.0 - crackHeat));

  // Slow lava rivers — broader flow channels driven by mid
  float riverNoise = fbm(vec2(uv.x * 2.0 + t * 0.3, uv.y * 2.0 + t * 0.2));
  float river = smoothstep(0.3, 0.5, riverNoise) * smoothstep(0.7, 0.5, riverNoise);
  river *= u_mid * 0.2 + 0.25;
  vec3 riverColor = palette(riverNoise * 0.3 + 0.13 + paletteShift,
    vec3(0.9, 0.4, 0.05), vec3(0.2, 0.15, 0.05),
    vec3(1.0, 0.5, 0.2), vec3(0.0, 0.05, 0.1));
  color = mix(color, riverColor, river * 0.6);

  // Surface texture — small bumps and roughness
  float bump = snoise(flowUV * 30.0 + t * 0.5);
  float bumpLight = smoothstep(-0.2, 0.3, bump) * 0.06;
  color += bumpLight * rockLight * (1.0 - crackHeat);

  // Treble-reactive sparks — small bright embers popping
  float sparkle = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    // one continuous life per spark: re-seeded only when its age wraps
    float sparkLife = u_time * 0.3 + fi * 0.167;
    vec2 sparkPos = vec2(
      snoise(vec2(fi * 13.7, floor(sparkLife))),
      snoise(vec2(fi * 29.3, floor(sparkLife) + 50.0))
    ) * 0.6;
    float sparkAge = fract(sparkLife);
    sparkPos.y += sparkAge * 0.3; // rise
    float sparkDist = length(uv - sparkPos);
    float spark = smoothstep(0.015, 0.0, sparkDist) * sin(sparkAge * 3.14159); // fades in and out — never pops
    sparkle += spark;
  }
  vec3 sparkColor = palette(0.08 + paletteShift,
    vec3(1.0, 0.8, 0.3), vec3(0.2, 0.15, 0.05),
    vec3(1.0, 0.5, 0.2), vec3(0.0, 0.05, 0.1));
  color += sparkle * sparkColor * (0.3 + u_treble * 0.5);

  // Heat shimmer overlay — subtle distortion feedback
  float shimmer = snoise(uv * 15.0 + vec2(0.0, -u_time * 0.6));
  shimmer = smoothstep(0.6, 0.8, shimmer) * 0.05;
  color += shimmer * glowColor * (0.2 + u_bass * 0.3);

  // Cooling edges darken the periphery
  float cooling = smoothstep(0.3, 0.7, length(uv));
  color = mix(color, color * 0.6, cooling * 0.3);

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 2.0;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;

const GRID = fieldGrid(1, 1);
export const PRE_SCALE = 1 / 3;

export const PRE =
  U +
  SMOOTH_NOISE +
  VORONOI +
  FBM_SPLIT +
  GRID.pre +
  `
void main() {
  float t = u_time * 0.05;
  float block, row;
  vec2 fc = preTexel(block, row);
  if (block < 0.0) {
    // the sparks row: one texel per spark
    float fi = fc.x;
    // one continuous life per spark: re-seeded only when its age wraps
    float sparkLife = u_time * 0.3 + fi * 0.167;
    vec2 sparkPos = vec2(
      snoise(vec2(fi * 13.7, floor(sparkLife))),
      snoise(vec2(fi * 29.3, floor(sparkLife) + 50.0))
    ) * 0.6;
    float sparkAge = fract(sparkLife);
    sparkPos.y += sparkAge * 0.3; // rise
    gl_FragColor = vec4(sparkPos, sparkAge, 1.0);
    return;
  }
  vec2 uv = (fc - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Heat distortion on the whole field
  float heatDistort = 0.003 + u_bass * 0.005;
  uv.x += sin(uv.y * 12.0 + u_time * 0.45) * heatDistort;
  uv.y += cos(uv.x * 10.0 + u_time * 0.36) * heatDistort;

  vec2 flowIn = uv * 1.5 + t * 0.3;
  float flowLow = fbmLow(flowIn);
  float flowAngle = (flowLow + fbmHigh(flowIn)) * 6.28;
  vec2 flowUV = uv + vec2(cos(flowAngle), sin(flowAngle)) * 0.08;
  vec2 vorUV = flowUV * 4.0 + vec2(t * 0.2, t * 0.15);
  float f1 = voronoi(vorUV).x;

  float surfaceNoise = fbm(flowUV * 6.0 + t * 0.1) * 0.5 + 0.5;
  float cellTemp = fbm(vorUV * 0.5 + f1 * 3.0 + t * 0.2);
  cellTemp = cellTemp * 0.5 + 0.5;
  float riverNoise = fbm(vec2(uv.x * 2.0 + t * 0.3, uv.y * 2.0 + t * 0.2));
  gl_FragColor = vec4(flowLow, surfaceNoise, cellTemp, riverNoise);
}
`;

/** The two-pass main shader: ORIG with its smooth fields read from PRE. */
export const FRAG = deriveFrag(ORIG, [
  ["void main() {", FBM_SPLIT + GRID.main + `
void main() {
  vec4 field = preField(0.0);`],
  ["float flowAngle = fbm(uv * 1.5 + t * 0.3) * 6.28;", "float flowAngle = (field.x + fbmHigh(uv * 1.5 + t * 0.3)) * 6.28;"],
  ["float surfaceNoise = fbm(flowUV * 6.0 + t * 0.1) * 0.5 + 0.5;", "float surfaceNoise = field.y;"],
  [`float cellTemp = fbm(vorUV * 0.5 + f1 * 3.0 + t * 0.2);
  cellTemp = cellTemp * 0.5 + 0.5;`, "float cellTemp = field.z;"],
  ["float riverNoise = fbm(vec2(uv.x * 2.0 + t * 0.3, uv.y * 2.0 + t * 0.2));", "float riverNoise = field.w;"],
  [`    float sparkLife = u_time * 0.3 + fi * 0.167;
    vec2 sparkPos = vec2(
      snoise(vec2(fi * 13.7, floor(sparkLife))),
      snoise(vec2(fi * 29.3, floor(sparkLife) + 50.0))
    ) * 0.6;
    float sparkAge = fract(sparkLife);
    sparkPos.y += sparkAge * 0.3; // rise`, `    vec3 sp = preTable(fi, 0.0).rgb; // PRE's sparks row: (x, y, age)
    vec2 sparkPos = sp.xy;
    float sparkAge = sp.z;`],
], "magma");
