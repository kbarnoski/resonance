import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Aftermath of fire — floating embers in darkness, cooling from orange
// to grey, ash particles drifting, the quiet after destruction.

float emberParticle(vec2 uv, vec2 pos, float size, float heat) {
  float d = length(uv - pos);
  float core = size * 0.003 / (d * d + size * 0.001);
  float glow = size * 0.015 / (d + size * 0.1);
  return core * heat + glow * heat * 0.15;
}

float ashParticle(vec2 uv, vec2 pos, float size) {
  vec2 delta = uv - pos;
  float d = max(abs(delta.x), abs(delta.y));
  return smoothstep(size, size * 0.3, d) * 0.3;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Charred ground — the aftermath
  float groundNoise = fbm(uv * 3.0 + t * 0.01);
  float groundField = groundNoise * 0.5 + 0.5;

  float crackle = snoise(uv * 8.0 + t * 0.02);
  float crackleField = smoothstep(0.3, 0.7, crackle * 0.5 + 0.5);

  // Ground color — charcoal and ash
  vec3 groundColor = palette(groundField * 0.2 + paletteShift,
    vec3(0.015, 0.012, 0.01),
    vec3(0.02, 0.015, 0.012),
    vec3(0.4, 0.35, 0.3),
    vec3(0.05, 0.08, 0.1));

  // Faint residual heat in the ground — cracks still glowing
  float heatMap = fbm(uv * 5.0 + t * 0.03 + vec2(3.0));
  heatMap = smoothstep(0.3, 0.8, heatMap * 0.5 + 0.5);
  float residualHeat = heatMap * 0.08 * (0.3 + u_bass * 0.7);

  vec3 heatColor = palette(heatMap * 0.4 + paletteShift + 0.65,
    vec3(0.08, 0.02, 0.0),
    vec3(0.12, 0.04, 0.01),
    vec3(1.0, 0.5, 0.2),
    vec3(0.0, 0.1, 0.2));

  vec3 color = groundColor + heatColor * residualHeat;
  color += groundColor * crackleField * 0.05;

  // Floating embers — rising from the ashes
  float embers = 0.0;
  vec3 emberColorTotal = vec3(0.0);
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec2 seed = vec2(fi * 13.37, fi * 7.91);
    vec2 pos = hash2(seed);

    // Rise slowly, drift horizontally
    float riseSpeed = 0.03 + fract(sin(fi * 3.13) * 43758.5) * 0.06;
    float driftSpeed = fract(sin(fi * 5.71) * 21345.7) * 0.02;
    float phase = fi * 1.618;

    pos.y += mod(t * riseSpeed + fi * 0.17, 2.2) - 1.1;
    pos.x += sin(t * driftSpeed * 3.0 + phase) * 0.15;
    pos.x += sin(pos.y * 3.0 + t * 0.5) * 0.03;

    // Heat — starts bright, cools as it rises
    float altitude = pos.y + 0.5;
    float heat = max(0.0, 1.0 - altitude * 0.6);
    heat *= 0.5 + fract(sin(fi * 11.3) * 7845.3) * 0.5;

    // Audio reactivity — bass reignites cooling embers
    heat += u_bass * 0.2 * exp(-altitude * 2.0);

    float size = 0.3 + fract(sin(fi * 9.1) * 3456.7) * 0.7;
    float ember = emberParticle(uv, pos, size, heat);
    embers += ember;

    // Color shifts from orange to grey as heat drops
    vec3 eColor = palette(heat * 0.5 + paletteShift + 0.6 + fi * 0.02,
      vec3(0.06, 0.02, 0.0),
      vec3(0.15, 0.06, 0.01),
      vec3(1.0, 0.6, 0.2),
      vec3(0.0, 0.1, 0.2));
    vec3 coolColor = vec3(0.03, 0.025, 0.02);
    eColor = mix(coolColor, eColor, heat);

    emberColorTotal += eColor * ember;
  }

  color += emberColorTotal * 0.03;

  // Ash particles — grey flakes drifting
  float ashField = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i) + 30.0;
    vec2 seed = vec2(fi * 11.3, fi * 5.7);
    vec2 pos = hash2(seed);

    float fallSpeed = 0.01 + fract(sin(fi * 2.71) * 12345.7) * 0.02;
    float driftAmt = fract(sin(fi * 4.13) * 45678.9) * 0.03;

    pos.y -= mod(t * fallSpeed + fi * 0.13, 2.2) - 1.1;
    pos.x += sin(t * driftAmt * 2.0 + fi) * 0.2;
    pos.x += cos(pos.y * 2.0 + t * 0.3) * 0.05;

    float size = 0.003 + fract(sin(fi * 8.3) * 5678.9) * 0.005;
    float ash = ashParticle(uv, pos, size);
    ashField += ash;
  }

  vec3 ashColor = palette(ashField + paletteShift + 0.1,
    vec3(0.035, 0.03, 0.025),
    vec3(0.03, 0.025, 0.02),
    vec3(0.3, 0.28, 0.25),
    vec3(0.05, 0.08, 0.1));
  color += ashColor * ashField * 0.15 * (0.6 + u_mid * 0.4);

  // Smoke wisps — thin dark streams rising
  float smoke1 = fbm(vec2(uv.x * 3.0, uv.y * 1.5 - t * 0.15));
  float smoke2 = fbm(vec2(uv.x * 4.0 + 5.0, uv.y * 2.0 - t * 0.12));
  float smokeMask = smoothstep(0.2, 0.6, smoke1 * 0.5 + 0.5) *
                    smoothstep(-0.3, 0.5, uv.y);
  float smokeMask2 = smoothstep(0.3, 0.65, smoke2 * 0.5 + 0.5) *
                     smoothstep(-0.4, 0.3, uv.y);

  vec3 smokeColor = palette(smoke1 * 0.2 + paletteShift + 0.3,
    vec3(0.02, 0.018, 0.015),
    vec3(0.025, 0.02, 0.018),
    vec3(0.3, 0.28, 0.25),
    vec3(0.08, 0.1, 0.12));

  color += smokeColor * smokeMask * 0.06;
  color += smokeColor * smokeMask2 * 0.04;

  // Treble: occasional spark — a brief bright point
  float sparkNoise = snoise(uv * 25.0 + t * 8.0 + u_treble * 5.0);
  float spark = smoothstep(0.92, 1.0, sparkNoise) * u_treble;
  color += heatColor * spark * 0.15 * exp(-length(uv) * 2.0);

  // Vignette — the darkness beyond the remnants
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.3, 1.3, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
