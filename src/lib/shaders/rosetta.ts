import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Gentle rotation
  uv = rot2(t * 0.2) * uv;

  // Bass-driven breathing
  float breathe = 1.0 + u_bass * 0.15;

  // Flower-of-life rosette: 6 petals from overlapping circles
  float base = 0.35 * breathe;
  float flower = 1e5;

  // Central circle
  flower = min(flower, abs(sdCircle(uv, base)) - 0.005);

  // 6 surrounding circles forming the rosette
  for (int i = 0; i < 6; i++) {
    float angle = float(i) * 1.0471975 + t * 0.3;
    vec2 offset = vec2(cos(angle), sin(angle)) * base;
    flower = min(flower, abs(sdCircle(uv - offset, base)) - 0.005);
  }

  // Second ring of 12 circles for full flower-of-life
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5235988 + t * 0.15;
    vec2 offset = vec2(cos(angle), sin(angle)) * base * 1.732;
    float circSize = base * (0.9 + 0.1 * sin(t + float(i)));
    flower = min(flower, abs(sdCircle(uv - offset, circSize)) - 0.004);
  }

  // Third ring of 18 petal circles
  for (int i = 0; i < 18; i++) {
    float angle = float(i) * 0.349066 - t * 0.1;
    vec2 offset = vec2(cos(angle), sin(angle)) * base * 3.0;
    float circSize = base * (0.8 + 0.15 * sin(t * 1.3 + float(i) * 0.5));
    flower = min(flower, abs(sdCircle(uv - offset, circSize)) - 0.003);
  }

  // Edge glow
  float edge = 1.0 - smoothstep(0.0, 0.012, abs(flower));
  float fineEdge = 1.0 - smoothstep(0.0, 0.004, abs(flower));

  // Intersection highlights: petal overlap patterns
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Petal interference pattern
  float petals = sin(a * 6.0 + t * 2.0) * sin(r * 20.0 - t * 3.0);
  petals = smoothstep(0.3, 0.8, petals) * smoothstep(1.0, 0.2, r);

  // FBM organic texture
  float n = fbm(uv * 5.0 + t * 0.3);

  // Sacred gold / rose palette
  vec3 col1 = palette(
    r * 2.0 + n * 0.4 + paletteShift,
    vec3(0.6, 0.5, 0.4),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.1, 0.15)
  );

  // Deep magenta / violet
  vec3 col2 = palette(
    a / 6.28 + t * 0.2 + paletteShift + 0.3,
    vec3(0.5, 0.3, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.9, 0.5, 0.8),
    vec3(0.8, 0.2, 0.4)
  );

  // Bright white-gold for intersections
  vec3 col3 = palette(
    petals * 2.0 + t + paletteShift * 0.5,
    vec3(0.8, 0.75, 0.6),
    vec3(0.3, 0.3, 0.2),
    vec3(1.0, 0.9, 0.6),
    vec3(0.05, 0.1, 0.2)
  );

  vec3 color = vec3(0.0);

  // Base rosette glow
  color += col1 * edge * (0.9 + u_bass * 0.5);

  // Petal overlay
  color += col2 * petals * 0.5 * (0.7 + u_mid * 0.6);

  // Fine detail driven by treble
  color += col3 * fineEdge * u_treble * 1.2;

  // Emissive white on sharpest edges
  color += vec3(1.3, 1.2, 1.0) * fineEdge * 0.6 * (0.5 + u_bass * 0.8);

  // Soft inner glow
  float innerGlow = exp(-r * 3.5);
  color += col1 * innerGlow * 0.4 * (1.0 + u_amplitude * 0.4);

  // FBM depth
  color += col2 * smoothstep(0.0, 0.4, abs(n)) * smoothstep(1.0, 0.3, r) * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
