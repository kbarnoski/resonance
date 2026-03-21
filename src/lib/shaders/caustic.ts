import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Caustic Light Patterns ----
// Simulates light refraction caustics seen at the bottom of a pool.
// Uses layered wave interference to create bright convergence lines.

float causticLayer(vec2 p, float freq, float t) {
  // Two overlapping wave fields creating interference caustics
  float w1 = sin(p.x * freq + t) * sin(p.y * freq * 0.8 + t * 0.7);
  float w2 = sin((p.x + p.y) * freq * 0.7 + t * 1.1);
  float w3 = sin((p.x - p.y) * freq * 0.6 - t * 0.9);
  // Caustic = bright where waves focus
  float c = w1 + w2 * 0.7 + w3 * 0.5;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;

  vec3 color = vec3(0.0);

  // Water surface distortion
  vec2 p = uv * 3.0;
  p += 0.15 * vec2(
    snoise(uv * 2.0 + t * 0.3),
    snoise(uv * 2.0 + t * 0.3 + 100.0)
  );

  // Layer 1: primary caustic — bass reactive
  float freq1 = 4.0 + u_bass * 1.5;
  float c1 = causticLayer(p, freq1, t * 1.2);
  float bright1 = pow(max(c1, 0.0), 3.0);

  // Layer 2: secondary caustic — mid reactive, different angle
  vec2 p2 = rot2(0.4) * p * 1.3;
  float freq2 = 5.0 + u_mid * 1.5;
  float c2 = causticLayer(p2, freq2, t * 0.9 + 2.0);
  float bright2 = pow(max(c2, 0.0), 3.0);

  // Layer 3: fine detail — treble reactive
  vec2 p3 = rot2(-0.3) * p * 1.8;
  float freq3 = 7.0 + u_treble * 2.0;
  float c3 = causticLayer(p3, freq3, t * 1.5 + 5.0);
  float bright3 = pow(max(c3, 0.0), 4.0);

  // Color the caustic layers
  vec3 col1 = palette(
    bright1 + t * 0.15 + u_amplitude * 0.2,
    vec3(0.05, 0.1, 0.15),
    vec3(0.15, 0.2, 0.3),
    vec3(0.6, 0.8, 1.0),
    vec3(0.0, 0.1, 0.25)
  );

  vec3 col2 = palette(
    bright2 + t * 0.12 + 0.3,
    vec3(0.05, 0.08, 0.15),
    vec3(0.1, 0.18, 0.28),
    vec3(0.5, 0.7, 1.0),
    vec3(0.05, 0.12, 0.3)
  );

  vec3 col3 = palette(
    bright3 + t * 0.2 + 0.6,
    vec3(0.08, 0.12, 0.18),
    vec3(0.12, 0.15, 0.25),
    vec3(0.4, 0.6, 0.9),
    vec3(0.1, 0.15, 0.35)
  );

  color += col1 * bright1 * 0.4;
  color += col2 * bright2 * 0.3;
  color += col3 * bright3 * 0.2;

  // Ambient deep water color
  float depth = 0.5 + fbm(uv * 1.5 + t * 0.05) * 0.3;
  vec3 waterCol = palette(
    depth + t * 0.05,
    vec3(0.02, 0.04, 0.08),
    vec3(0.03, 0.05, 0.1),
    vec3(0.2, 0.4, 0.7),
    vec3(0.15, 0.1, 0.3)
  );
  color += waterCol * 0.15;

  // Specular highlights: brightest caustic convergence points
  float specular = bright1 * bright2;
  color += vec3(0.5, 0.6, 0.8) * specular * 0.5 * (0.5 + u_treble * 0.5);

  // Subtle ripple rings
  float ripple = sin(length(uv) * 20.0 - t * 3.0) * 0.5 + 0.5;
  ripple *= exp(-length(uv) * 3.0);
  color += vec3(0.15, 0.2, 0.3) * ripple * 0.08 * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
