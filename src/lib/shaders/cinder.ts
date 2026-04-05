import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dying embers — scattered hot points slowly cooling against absolute black.
// The last warmth leaving. Intimate, close, fading.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // ── Ember field — scattered hot points ──
  float embers = 0.0;
  float emberHeat = 0.0;
  vec3 emberColorAccum = vec3(0.0);

  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec2 pos = vec2(
      fract(sin(fi * 127.1) * 43758.5) * 1.6 - 0.8,
      fract(sin(fi * 311.7) * 43758.5) * 1.6 - 0.8
    );

    // Slow drift
    pos += vec2(sin(t * 0.5 + fi), cos(t * 0.4 + fi * 1.3)) * 0.05;

    float d = length(uv - pos);

    // Each ember has its own cooling cycle
    float cycle = sin(t * 0.3 + fi * 2.1) * 0.5 + 0.5;
    float heat = cycle * cycle; // non-linear cooling curve

    // Bass can briefly reignite embers
    heat += u_bass * 0.3 * smoothstep(0.2, 0.0, d);

    // Glow radius depends on heat
    float size = 0.01 + heat * 0.02;
    float glow = size / (d * d + size * 0.3);

    // Color shifts with heat: red (cool) -> orange -> yellow-white (hot)
    vec3 eColor = palette(
      heat * 1.5 + fi * 0.1,
      vec3(0.3, 0.08, 0.02),
      vec3(0.4, 0.2, 0.05),
      vec3(0.8, 0.5, 0.2),
      vec3(0.0, 0.05, 0.05)
    );

    // White-hot core
    eColor = mix(eColor, vec3(1.2, 1.0, 0.7), smoothstep(0.5, 1.0, heat) * 0.5);

    emberColorAccum += eColor * glow * heat;
    embers += glow * heat;
  }

  // ── Ash texture — the cold remains ──
  float ash = fbm3(uv * 6.0 + t * 0.1);
  float ashPattern = smoothstep(-0.3, 0.3, ash) * 0.03;

  // ── Smoke wisps rising from hot points ──
  float smoke = fbm3(vec2(uv.x * 3.0, uv.y * 2.0 - t * 0.8));
  float smokeMask = smoothstep(0.2, 0.6, smoke) * smoothstep(-0.3, 0.2, uv.y);
  smokeMask *= min(embers * 0.3, 0.15);

  // ── Colors ──
  // Background — absolute near-black with cold undertone
  vec3 bgColor = palette(
    ash * 0.5 + t * 0.05,
    vec3(0.008, 0.005, 0.005),
    vec3(0.01, 0.008, 0.008),
    vec3(0.3, 0.2, 0.2),
    vec3(0.1, 0.05, 0.05)
  );

  // Smoke color — warm grey
  vec3 smokeColor = vec3(0.04, 0.03, 0.025);

  // ── Compositing ──
  vec3 color = bgColor + vec3(ashPattern * 0.5);
  color += emberColorAccum * 0.008;
  color += smokeColor * smokeMask;

  // Subtle ambient warmth from all embers combined
  float totalHeat = min(embers * 0.005, 0.03);
  color += vec3(0.15, 0.05, 0.02) * totalHeat * (0.5 + u_mid * 0.5);

  // Vignette — very heavy, isolating
  float vignette = 1.0 - smoothstep(0.25, 1.0, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
