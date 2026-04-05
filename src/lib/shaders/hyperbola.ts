import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Multiple rotated hyperbolic curve families creating interference
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float angle = fi * 0.628 + t * (0.12 + fi * 0.03);
    vec2 ruv = rot2(angle) * uv;

    // Hyperbola: x*y = k for several k values
    float k = 0.05 + fi * 0.04 + u_bass * 0.02;

    // Distance to hyperbola branch xy = k
    float h = ruv.x * ruv.y;
    float d1 = abs(h - k);
    float d2 = abs(h + k); // conjugate branch

    // Thin glowing curves
    float lineWidth = 0.008 + u_treble * 0.004;
    float glow1 = exp(-d1 / (lineWidth * 3.0)) * 0.6;
    float core1 = smoothstep(lineWidth, 0.0, d1);
    float glow2 = exp(-d2 / (lineWidth * 3.0)) * 0.4;
    float core2 = smoothstep(lineWidth, 0.0, d2);

    // Asymptote glow (axes of each rotated frame)
    float axisX = smoothstep(0.015, 0.0, abs(ruv.y)) * 0.08;
    float axisY = smoothstep(0.015, 0.0, abs(ruv.x)) * 0.08;

    vec3 col = palette(
      fi * 0.2 + t * 0.3 + paletteShift + length(ruv) * 0.5,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.8, 1.0, 0.6),
      vec3(0.0 + fi * 0.08, 0.1, 0.4)
    );

    color += col * (glow1 + core1 * 1.5 + glow2 + core2 * 1.2);
    color += col * (axisX + axisY) * 0.3;
  }

  // Interference: where curves cross, boost brightness
  vec2 ruv1 = rot2(t * 0.12) * uv;
  vec2 ruv2 = rot2(t * 0.12 + 0.628) * uv;
  float cross1 = abs(ruv1.x * ruv1.y - 0.05);
  float cross2 = abs(ruv2.x * ruv2.y - 0.09);
  float interference = exp(-cross1 * 40.0) * exp(-cross2 * 40.0);
  vec3 intCol = palette(
    t * 0.5 + paletteShift + 0.5,
    vec3(0.7, 0.7, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.8, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += intCol * interference * 3.0;

  // Subtle noise texture
  float n = snoise(uv * 3.0 + t) * 0.03;
  color += vec3(n * 0.5, n * 0.3, n);

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
