import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// The deepest ocean zone — crushing pressure, bioluminescent sparks in total dark.
// Absolute darkness punctuated by rare, alien light.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Pressure field — subtle warping from immense depth ──
  float pressure = fbm3(uv * 0.8 + vec2(t * 0.05, t * 0.03));
  vec2 pressureWarp = uv + vec2(pressure * 0.05, pressure * 0.03);

  // ── Bioluminescent organisms — scattered point lights ──
  float bioLight = 0.0;
  vec3 bioColor = vec3(0.0);

  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    vec2 pos = vec2(
      fract(sin(fi * 127.1) * 43758.5) * 1.8 - 0.9,
      fract(sin(fi * 311.7) * 43758.5) * 1.8 - 0.9
    );

    // Slow deep-water drift
    pos += vec2(
      sin(t * 0.3 + fi * 2.1) * 0.15,
      cos(t * 0.25 + fi * 1.7) * 0.1
    );

    float d = length(pressureWarp - pos);

    // Pulsing bioluminescence — each organism has its own rhythm
    float pulse = sin(t * (0.5 + fract(fi * 0.37) * 2.0) + fi * 3.0);
    pulse = smoothstep(-0.3, 1.0, pulse);

    // Treble triggers flash responses
    float flash = step(0.92, fract(sin(fi * 43.7 + t * 0.5) * 100.0)) * u_treble * 3.0;
    pulse += flash;

    float glow = 0.003 / (d * d + 0.003) * pulse;

    // Each organism a different color — deep-sea palette
    vec3 orgColor = palette(
      fi * 0.15 + pulse * 0.5,
      vec3(0.1, 0.15, 0.3),
      vec3(0.2, 0.15, 0.3),
      vec3(0.4, 0.6, 0.9),
      vec3(0.1, 0.2, 0.4)
    );

    bioLight += glow;
    bioColor += orgColor * glow;
  }

  // ── Ambient deep-water glow — very faint, from below ──
  float deepGlow = smoothstep(0.3, -0.8, uv.y) * 0.02;
  float deepShift = fbm3(uv * 1.5 + t * 0.1);

  // ── Marine snow — tiny particles falling slowly ──
  float snow = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 snowPos = vec2(
      fract(sin(fi * 73.1 + 50.0) * 43758.5) * 1.6 - 0.8,
      mod(fract(sin(fi * 191.7 + 50.0) * 43758.5) - t * 0.02 * (1.0 + fi * 0.05), 1.6) - 0.8
    );
    snowPos.x += sin(t * 0.2 + fi * 1.5) * 0.03;
    float d = length(pressureWarp - snowPos);
    snow += 0.0001 / (d * d + 0.0002);
  }

  // ── Colors ──
  // Absolute dark base — near-black with the faintest blue
  vec3 bgColor = palette(
    pressure * 0.5 + t * 0.03,
    vec3(0.003, 0.003, 0.008),
    vec3(0.005, 0.005, 0.012),
    vec3(0.2, 0.2, 0.4),
    vec3(0.1, 0.1, 0.25)
  );

  // Deep ambient
  vec3 deepColor = palette(
    deepShift * 2.0 + t * 0.1,
    vec3(0.01, 0.015, 0.03),
    vec3(0.02, 0.02, 0.05),
    vec3(0.3, 0.4, 0.7),
    vec3(0.1, 0.15, 0.3)
  );

  // ── Compositing ──
  vec3 color = bgColor;
  color += deepColor * deepGlow * (0.5 + u_bass * 0.5);
  color += bioColor * 0.015;
  color += vec3(0.4, 0.5, 0.7) * snow * 0.02;

  // Pressure distortion — slight color shift
  color += vec3(0.01, 0.005, 0.02) * abs(pressure) * 0.1 * u_mid;

  // Vignette — extremely heavy, crushing darkness at edges
  float vignette = 1.0 - smoothstep(0.2, 1.0, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
