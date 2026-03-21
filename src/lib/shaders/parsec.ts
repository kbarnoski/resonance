import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Parsec — vast distance visualization with parallax star layers.
// Multiple planes of stars at different depths create a sense of
// immense cosmic distance, with subtle nebula wisps between layers.

float starLayer(vec2 uv, float density, float seed, float twinkleSpeed) {
  vec2 id = floor(uv * density);
  vec2 f = fract(uv * density) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  float threshold = 0.92 + seed * 0.003;
  if (h < threshold) return 0.0;
  float size = 0.02 + 0.04 * fract(h * 29.7);
  float twinkle = 0.6 + 0.4 * sin(u_time * twinkleSpeed * (1.0 + h * 3.0) + h * 60.0);
  float brightness = smoothstep(size, 0.0, length(f));
  return brightness * twinkle * (0.5 + fract(h * 71.3) * 0.5);
}

float nebulaWisp(vec2 uv, float t) {
  float n = fbm(uv * 1.5 + t * 0.1);
  n = n * 0.5 + 0.5;
  return smoothstep(0.45, 0.7, n) * 0.4;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Camera drift simulating passage through space
  vec2 drift = vec2(t * 0.3, sin(t * 0.2) * 0.15);

  // 7 parallax layers — nearest moves fast, farthest barely moves
  float totalStars = 0.0;
  vec3 starColors = vec3(0.0);
  float paletteShift = u_amplitude * 0.25;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float depthFactor = 0.05 + fi * 0.15;
    vec2 layerUv = uv + drift * depthFactor;
    layerUv *= rot2(fi * 0.4 + t * 0.01 * depthFactor);

    float density = 15.0 + fi * 10.0;
    float speed = 2.0 - fi * 0.2;
    float layer = starLayer(layerUv, density, fi * 17.0, speed);

    // Each depth layer has slightly different color temperature
    vec3 col = palette(
      fi * 0.12 + t * 0.02 + paletteShift,
      vec3(0.7, 0.75, 0.85),
      vec3(0.15, 0.15, 0.2),
      vec3(0.8 + fi * 0.03, 0.6, 0.4),
      vec3(0.0, 0.05 + fi * 0.03, 0.15)
    );

    float layerBright = 1.0 - fi * 0.1;
    starColors += col * layer * layerBright;
    totalStars += layer * layerBright;
  }

  // Interstellar dust between layers
  vec2 dustUv = uv + drift * 0.3;
  float dust = nebulaWisp(dustUv, t);
  float dust2 = nebulaWisp(dustUv * rot2(1.5) + vec2(20.0), t * 0.7);

  vec3 dustCol = palette(
    dust + t * 0.04 + paletteShift + 0.3,
    vec3(0.15, 0.1, 0.25),
    vec3(0.1, 0.1, 0.2),
    vec3(0.4, 0.3, 0.7),
    vec3(0.2, 0.1, 0.4)
  );

  vec3 dustCol2 = palette(
    dust2 + t * 0.03 + paletteShift + 0.6,
    vec3(0.2, 0.15, 0.1),
    vec3(0.1, 0.08, 0.05),
    vec3(0.6, 0.3, 0.2),
    vec3(0.1, 0.05, 0.0)
  );

  vec3 color = vec3(0.0);
  color += starColors * (0.8 + u_treble * 0.4);
  color += dustCol * dust * (0.5 + u_mid * 0.5);
  color += dustCol2 * dust2 * (0.4 + u_mid * 0.4);

  // Distance glow — faint overall luminosity from unresolved stars
  float distGlow = fbm(uv * 0.5 + drift * 0.1) * 0.5 + 0.5;
  color += vec3(0.03, 0.02, 0.05) * distGlow * (0.5 + u_bass * 0.5);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
