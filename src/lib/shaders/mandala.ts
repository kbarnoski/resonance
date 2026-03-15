import {
  U,
  SMOOTH_NOISE,
  VISIONARY_PALETTE,
  ROT2,
  SDF_PRIMITIVES,
} from "./shared";

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
  float paletteShift = u_amplitude * 0.4;

  // Bass-driven domain distortion
  float bassWarp = u_bass * 0.35;
  uv += bassWarp * vec2(
    snoise(uv * 2.0 + t),
    snoise(uv * 2.0 + t + 100.0)
  );

  // Convert to polar for kaleidoscopic folding
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // ── First folding pass: 6-fold symmetry ──
  float folds1 = 6.0;
  float sector1 = 6.28318 / folds1;
  a = mod(a, sector1);
  a = abs(a - sector1 * 0.5);

  vec2 p1 = vec2(cos(a), sin(a)) * r;

  // Rotate the folded space slowly
  p1 = rot2(t * 0.7 + u_amplitude * 0.3) * p1;

  // ── Second folding pass: nested 5-fold at different scale ──
  vec2 p2 = p1 * 3.0 + vec2(t * 0.3);
  float r2 = length(p2);
  float a2 = atan(p2.y, p2.x);
  float folds2 = 5.0;
  float sector2 = 6.28318 / folds2;
  a2 = mod(a2, sector2);
  a2 = abs(a2 - sector2 * 0.5);
  p2 = vec2(cos(a2), sin(a2)) * r2;
  p2 = rot2(-t * 1.1) * p2;

  // ── Third folding pass: micro 8-fold ──
  vec2 p3 = p2 * 2.5 + vec2(sin(t * 0.5) * 0.5);
  float r3 = length(p3);
  float a3 = atan(p3.y, p3.x);
  float folds3 = 8.0;
  float sector3 = 6.28318 / folds3;
  a3 = mod(a3, sector3);
  a3 = abs(a3 - sector3 * 0.5);
  p3 = vec2(cos(a3), sin(a3)) * r3;

  // ── FBM layers with different folding passes ──
  float n1 = fbm(p1 * 4.0 + t * 0.2);
  float n2 = fbm(p2 * 3.0 - t * 0.15);
  float n3 = fbm(p3 * 5.0 + t * 0.3);

  // ── SDF motifs ──
  // Rings from first fold
  float ring1 = abs(sdCircle(p1, 0.3 + 0.1 * sin(t * 2.0 + u_bass))) - 0.02;
  float ring2 = abs(sdCircle(p1, 0.55 + 0.08 * sin(t * 1.5 + u_mid))) - 0.015;
  float ring3 = abs(sdCircle(p1, 0.8 + 0.12 * cos(t * 1.2))) - 0.01;

  // Detail circles from second fold
  float detail1 = sdCircle(p2 - vec2(0.5, 0.0), 0.15 + 0.05 * u_bass);
  float detail2 = sdCircle(p2 + vec2(0.3, 0.2), 0.1 + 0.03 * u_treble);

  // Tiny dots from third fold
  float dots = sdCircle(p3 - vec2(0.2, 0.0), 0.06);

  // ── Spiral ribbons ──
  float spiral = sin(r * 25.0 - a * folds1 - t * 3.0 + n1 * 4.0);
  spiral = smoothstep(0.05, 0.0, abs(spiral) * r);

  float spiral2 = sin(r * 18.0 + a * folds1 * 2.0 + t * 2.0 + n2 * 3.0);
  spiral2 = smoothstep(0.04, 0.0, abs(spiral2) * r);

  // ── Color via Iq cosine palettes ──
  // Primary warm palette
  vec3 col1 = palette(
    r * 2.0 + n1 * 0.5 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.2)
  );

  // Secondary cool palette
  vec3 col2 = palette(
    r * 3.0 - n2 * 0.6 + paletteShift + 0.5,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.7, 1.0),
    vec3(0.3, 0.2, 0.1)
  );

  // Tertiary vibrant palette for fine detail
  vec3 col3 = palette(
    n3 * 2.0 + t * 0.3 + paletteShift + 0.25,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.3),
    vec3(1.0, 1.0, 0.5),
    vec3(0.8, 0.9, 0.3)
  );

  // Start from black
  vec3 color = vec3(0.0);

  // Large-scale fbm glow
  float glow1 = smoothstep(0.6, 0.0, r) * (0.3 + 0.2 * n1);
  color += col1 * glow1 * (0.6 + 0.4 * u_bass);

  // Rings — emissive
  float ringGlow = smoothstep(0.03, 0.0, ring1) * 1.8;
  ringGlow += smoothstep(0.025, 0.0, ring2) * 1.4;
  ringGlow += smoothstep(0.02, 0.0, ring3) * 1.0;
  color += col2 * ringGlow;

  // Detail SDFs
  float detailGlow = smoothstep(0.08, 0.0, abs(detail1)) * 1.2;
  detailGlow += smoothstep(0.06, 0.0, abs(detail2)) * 0.9;
  color += col3 * detailGlow;

  // Dot field
  float dotGlow = smoothstep(0.04, 0.0, abs(dots)) * 1.5;
  color += col1 * dotGlow * (0.5 + 0.5 * u_treble);

  // Spirals
  color += col2 * spiral * 0.8 * (0.7 + 0.5 * u_mid);
  color += col3 * spiral2 * 0.6;

  // Second fbm layer for depth
  float deepPattern = smoothstep(0.0, 0.4, abs(n2)) * smoothstep(1.0, 0.2, r);
  color += col3 * deepPattern * 0.4;

  // ── Emissive highlights — warm/cool white ──
  // Warm white on ring intersections
  float hotSpot = smoothstep(0.015, 0.0, ring1) * smoothstep(0.015, 0.0, ring2);
  color += vec3(1.4, 1.25, 1.1) * hotSpot * 3.0;

  // Cool white on spiral peaks
  float coolSpot = spiral * smoothstep(0.3, 0.1, r) * smoothstep(0.02, 0.0, abs(detail1));
  color += vec3(1.1, 1.2, 1.5) * coolSpot * 2.5;

  // Central emissive core — warm
  float core = smoothstep(0.15, 0.0, r) * (1.0 + u_amplitude * 0.5);
  color += vec3(1.3, 1.15, 1.0) * core * 1.5;

  // Vignette
  color *= smoothstep(1.4, 0.4, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
