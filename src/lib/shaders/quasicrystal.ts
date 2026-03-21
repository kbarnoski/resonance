import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Golden ratio and Penrose angles
  float phi = 1.61803398875;
  float pi = 3.14159265359;

  // Slow rotation of entire pattern
  vec2 uvR = rot2(t * 0.06) * uv;

  // Scale with zoom breathing on bass
  float scale = 8.0 + u_bass * 2.0;
  vec2 p = uvR * scale;

  // 5 overlapping wave gratings at golden-ratio-derived angles
  // Creates quasi-crystalline 5-fold symmetry that never repeats
  float wave = 0.0;
  float waveProduct = 1.0;
  float angleStep = pi / 5.0; // 36 degrees for Penrose symmetry

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float angle = fi * angleStep + t * 0.05 * (1.0 + fi * 0.1);

    // Direction vector for this grating
    vec2 dir = vec2(cos(angle), sin(angle));

    // Phase offset with audio reactivity
    float phase = dot(p, dir) + t * (0.5 + fi * 0.15);
    phase += u_mid * sin(fi * phi) * 0.5;

    // Each grating is a cosine wave
    float grating = cos(phase);

    // Accumulate: both additive and multiplicative for different effects
    wave += grating;
    waveProduct *= (0.5 + 0.5 * grating);
  }

  // Normalize the additive wave
  wave = wave / 7.0;

  // Sharp interference lines where waves align
  float sharpLines = pow(abs(wave), 0.3 + u_treble * 0.5);

  // The product creates beautiful monoclinic patterns
  float crystalPattern = pow(waveProduct, 0.5);

  // Primary color from interference
  vec3 col1 = palette(
    wave * 2.0 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.1, 0.2)
  );

  // Secondary color from the product pattern
  vec3 col2 = palette(
    crystalPattern * 3.0 + t * 0.2 + paletteShift + 0.3,
    vec3(0.5, 0.5, 0.6),
    vec3(0.5, 0.4, 0.5),
    vec3(0.8, 1.0, 0.5),
    vec3(0.1, 0.15, 0.4)
  );

  // Blend both patterns
  color += col1 * sharpLines * 0.6;
  color += col2 * crystalPattern * 0.5;

  // Hot spots: where all gratings constructively interfere
  float hotspot = smoothstep(0.7, 1.0, wave) * 2.0;
  vec3 hotCol = palette(
    wave * 4.0 + paletteShift + 0.6,
    vec3(0.8, 0.8, 0.8),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.6, 0.3),
    vec3(0.0, 0.05, 0.1)
  );
  color += hotCol * hotspot * (0.4 + u_bass * 0.6);

  // Destructive interference troughs: dark with subtle color
  float trough = smoothstep(-0.5, -0.9, wave);
  vec3 troughCol = palette(
    wave * 2.0 + t * 0.15 + paletteShift + 0.8,
    vec3(0.1, 0.1, 0.15),
    vec3(0.1, 0.1, 0.2),
    vec3(0.4, 0.6, 1.0),
    vec3(0.2, 0.1, 0.4)
  );
  color += troughCol * trough * 0.3;

  // Five-fold rosette overlay: radial symmetry highlight
  float angle = atan(uvR.y, uvR.x);
  float r = length(uvR);
  float rosette = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float rAngle = angle - fk * pi * 2.0 / 5.0 + t * 0.1;
    rosette += cos(rAngle * 5.0) * cos(r * 12.0 - t * 2.0 + u_bass * 3.0);
  }
  rosette = rosette / 5.0;
  float rosetteGlow = smoothstep(0.3, 0.9, rosette) * 0.2;

  vec3 rosetteCol = palette(
    r * 2.0 + t * 0.25 + paletteShift + 0.5,
    vec3(0.6, 0.6, 0.7),
    vec3(0.4, 0.4, 0.5),
    vec3(0.7, 0.9, 1.0),
    vec3(0.05, 0.1, 0.3)
  );
  color += rosetteCol * rosetteGlow;

  // Treble sparkle: high frequency modulation on the pattern
  float sparkle = cos(wave * 30.0 + t * 5.0) * 0.5 + 0.5;
  sparkle *= smoothstep(0.3, 0.8, abs(wave));
  color += vec3(1.0, 0.95, 0.85) * sparkle * u_treble * 0.25;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
