import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Funeral music visualized — slow, heavy, bass-driven darkness with mournful color.
// Vertical drapes of shadow. Heavy sustained tones rendered as pressure waves.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Heavy vertical drapes — slow undulating curtains of shadow ──
  float drapeFreq = 4.0;
  float drapePhase = sin(uv.y * 2.0 + t * 0.3) * 0.3;
  float drapes = sin(uv.x * drapeFreq + drapePhase + t * 0.2) * 0.5 + 0.5;
  drapes = smoothstep(0.3, 0.7, drapes);

  // Drape depth — fbm modulates the folds
  float foldNoise = fbm4(vec2(uv.x * 3.0 + t * 0.1, uv.y * 1.5));
  drapes *= (0.6 + foldNoise * 0.4);

  // ── Pressure waves — horizontal bands of bass energy ──
  float wave = sin(uv.y * 8.0 - t * 1.5) * 0.5 + 0.5;
  wave *= smoothstep(0.3, 0.7, wave);
  float bassWave = wave * (0.3 + u_bass * 0.7);

  // ── Mournful light — dim, descending slowly ──
  float lightY = sin(t * 0.2) * 0.3 + 0.2;
  float mournLight = exp(-pow(uv.y - lightY, 2.0) * 3.0);
  mournLight *= exp(-uv.x * uv.x * 2.0);
  mournLight *= 0.15;

  // ── Dust motes — barely visible, floating in the dim light ──
  float dust = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 dustPos = vec2(
      fract(sin(fi * 73.1) * 43758.5) * 1.4 - 0.7,
      fract(sin(fi * 191.7) * 43758.5) * 1.4 - 0.7
    );
    dustPos.y -= mod(t * 0.05 + fi * 0.1, 1.4) - 0.7;
    dustPos.x += sin(t * 0.3 + fi * 2.0) * 0.05;
    float d = length(uv - dustPos);
    dust += 0.0005 / (d * d + 0.001) * mournLight;
  }

  // ── Colors ──
  // Drape fabric — deep mournful purple to black
  vec3 drapeColor = palette(
    drapes * 1.5 + foldNoise * 0.5 + u_amplitude * 0.15,
    vec3(0.03, 0.02, 0.05),
    vec3(0.06, 0.03, 0.1),
    vec3(0.4, 0.3, 0.6),
    vec3(0.1, 0.08, 0.2)
  );

  // Pressure wave color — deep blood red
  vec3 waveColor = palette(
    bassWave * 2.0 + t * 0.1,
    vec3(0.08, 0.02, 0.02),
    vec3(0.12, 0.03, 0.03),
    vec3(0.6, 0.2, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Mournful light — cold silver
  vec3 lightColor = palette(
    mournLight * 3.0 + t * 0.15,
    vec3(0.1, 0.1, 0.12),
    vec3(0.08, 0.08, 0.1),
    vec3(0.5, 0.5, 0.7),
    vec3(0.1, 0.1, 0.2)
  );

  // ── Compositing ──
  vec3 color = drapeColor * (0.3 + drapes * 0.4);
  color += waveColor * bassWave * 0.3;
  color += lightColor * mournLight * (0.6 + u_mid * 0.4);

  // Dust motes
  color += vec3(0.5, 0.45, 0.55) * dust * 0.1 * u_treble;

  // Overall bass-driven darkening — heavier bass = darker
  color *= (0.7 + (1.0 - u_bass) * 0.3);

  // Vignette — heavy
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
