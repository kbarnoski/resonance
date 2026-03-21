import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Selene — lunar deity, silver crescent with flowing ribbons.
// A luminous crescent moon with ethereal silk ribbons trailing
// through space, embodying the goddess of the moon.

float crescent(vec2 uv, float outerR, float innerR, vec2 offset) {
  float outer = length(uv) - outerR;
  float inner = length(uv - offset) - innerR;
  return smoothstep(0.01, -0.01, outer) * smoothstep(-0.01, 0.01, inner);
}

float ribbon(vec2 uv, float yOffset, float freq, float amp, float t, float width) {
  float wave = sin(uv.x * freq + t * 2.0 + yOffset * 3.0) * amp;
  wave += sin(uv.x * freq * 0.5 + t * 1.3 + yOffset) * amp * 0.5;
  float d = abs(uv.y - yOffset - wave);
  float fadeX = smoothstep(0.8, 0.0, abs(uv.x));
  return smoothstep(width, 0.0, d) * fadeX;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Crescent moon — shifted inner circle creates the crescent shape
  vec2 moonOffset = vec2(0.12 + sin(t * 0.3) * 0.02, 0.04);
  float moon = crescent(uv, 0.25, 0.23, moonOffset);

  // Crescent glow — soft light around the crescent
  float moonR = length(uv);
  float moonGlow = exp(-moonR * 4.0) * 0.5;
  float crescentEdge = smoothstep(0.27, 0.24, moonR) * 0.3;

  // Flowing ribbons trailing from the crescent
  float ribbons = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 ribUv = uv * rot2(fi * 0.3 + t * 0.02);
    float yOff = -0.1 + fi * 0.06;
    float freq = 4.0 + fi * 1.5 + u_mid * 2.0;
    float amp = 0.06 + fi * 0.015;
    float w = 0.012 - fi * 0.001;
    ribbons += ribbon(ribUv, yOff, freq, amp, t + fi * 0.7, w) * (1.0 - fi * 0.15);
  }

  // Stardust particles around the crescent
  float dust = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = fi * 5.73;
    float orbitR = 0.3 + fi * 0.05;
    float orbitSpeed = 0.2 + fi * 0.05;
    vec2 pos = vec2(
      cos(t * orbitSpeed + seed) * orbitR,
      sin(t * orbitSpeed * 0.7 + seed) * orbitR * 0.6
    );
    float d = length(uv - pos);
    float twinkle = 0.5 + 0.5 * sin(t * 3.0 + seed * 10.0);
    dust += exp(-d * 80.0) * twinkle;
  }

  // Nebulous veil — soft atmospheric mist
  float veil = fbm(uv * 2.5 + vec2(t * 0.1, t * 0.08)) * 0.5 + 0.5;
  veil *= smoothstep(0.8, 0.2, moonR);

  float paletteShift = u_amplitude * 0.25;

  // Crescent color — luminous silver-white
  vec3 moonCol = palette(
    moon * 0.2 + t * 0.03 + paletteShift,
    vec3(0.85, 0.85, 0.92),
    vec3(0.1, 0.1, 0.12),
    vec3(0.3, 0.3, 0.5),
    vec3(0.0, 0.0, 0.1)
  );

  // Ribbon color — shifting silver-blue to lavender
  vec3 ribbonCol = palette(
    ribbons + t * 0.06 + paletteShift + 0.3,
    vec3(0.5, 0.5, 0.7),
    vec3(0.3, 0.25, 0.4),
    vec3(0.6, 0.5, 0.8),
    vec3(0.15, 0.1, 0.35)
  );

  // Veil color — deep blue-purple mist
  vec3 veilCol = palette(
    veil + t * 0.04 + paletteShift + 0.55,
    vec3(0.15, 0.15, 0.3),
    vec3(0.1, 0.1, 0.2),
    vec3(0.3, 0.2, 0.6),
    vec3(0.2, 0.1, 0.4)
  );

  // Glow color — cool silver
  vec3 glowCol = palette(
    t * 0.05 + paletteShift + 0.7,
    vec3(0.6, 0.6, 0.75),
    vec3(0.15, 0.15, 0.2),
    vec3(0.4, 0.4, 0.6),
    vec3(0.05, 0.05, 0.15)
  );

  vec3 color = vec3(0.0);

  // Atmospheric veil
  color += veilCol * veil * 0.2 * (0.5 + u_mid * 0.5);

  // Crescent glow
  color += glowCol * moonGlow * (0.6 + u_bass * 0.5);
  color += glowCol * crescentEdge;

  // The crescent itself — bright silver
  color += moonCol * moon * 1.2;

  // Flowing ribbons
  color += ribbonCol * ribbons * (0.7 + u_treble * 0.5);

  // Stardust
  color += vec3(0.8, 0.8, 1.0) * dust * 0.5 * (0.6 + u_treble * 0.6);

  // Background stars
  vec2 starUv = uv * 45.0;
  vec2 starId = floor(starUv);
  vec2 starF = fract(starUv) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float star = (starH > 0.96) ? smoothstep(0.035, 0.0, length(starF)) * 0.4 : 0.0;
  color += vec3(0.8, 0.85, 1.0) * star;

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
