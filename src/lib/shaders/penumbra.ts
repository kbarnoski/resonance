import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Partial shadow zone — the gradient between light and absolute dark.
// Soft-edged shadows cast by unseen objects, layered and overlapping.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // ── Light source — dim, positioned off-screen, shifts slowly ──
  vec2 lightDir = normalize(vec2(sin(t * 0.3), cos(t * 0.2) + 0.5));
  float lightDot = dot(uv, lightDir);
  float baseLuminance = smoothstep(-0.6, 0.8, lightDot) * 0.15;

  // ── Shadow casters — abstract forms moving across the light ──
  // Multiple shadow layers at different depths
  float shadow1 = fbm3(uv * 2.0 * rot2(t * 0.1) + vec2(t * 0.4, 0.0));
  float shadow2 = fbm3(uv * 3.0 * rot2(-t * 0.08) + vec2(-t * 0.3, t * 0.2));
  float shadow3 = fbm3(uv * 1.5 + vec2(t * 0.2, -t * 0.15));

  // Convert noise to shadow shapes — thresholded blobs
  float s1 = smoothstep(0.0, 0.3, shadow1) * 0.6;
  float s2 = smoothstep(-0.1, 0.2, shadow2) * 0.4;
  float s3 = smoothstep(0.1, 0.35, shadow3) * 0.5;

  // Penumbra — soft edges of each shadow
  float penumbra1 = smoothstep(0.0, 0.3, shadow1) - smoothstep(0.1, 0.4, shadow1);
  float penumbra2 = smoothstep(-0.1, 0.2, shadow2) - smoothstep(0.0, 0.3, shadow2);
  float penumbra3 = smoothstep(0.1, 0.35, shadow3) - smoothstep(0.2, 0.45, shadow3);

  // Combined shadow — multiply for overlapping darkening
  float totalShadow = 1.0 - (s1 + s2 + s3) * 0.5;
  totalShadow = clamp(totalShadow, 0.0, 1.0);
  float totalPenumbra = (penumbra1 + penumbra2 + penumbra3) * 0.4;

  // ── Colors ──
  // The dim light — cool blue-white
  vec3 lightColor = palette(
    baseLuminance * 3.0 + u_amplitude * 0.2,
    vec3(0.08, 0.08, 0.12),
    vec3(0.1, 0.1, 0.15),
    vec3(0.5, 0.5, 0.8),
    vec3(0.1, 0.1, 0.2)
  );

  // Penumbra edge — where shadow meets light, subtle warm shift
  vec3 penumbraColor = palette(
    totalPenumbra * 2.0 + t * 0.2,
    vec3(0.06, 0.04, 0.06),
    vec3(0.1, 0.06, 0.1),
    vec3(0.6, 0.4, 0.7),
    vec3(0.1, 0.08, 0.2)
  );

  // Deep shadow — near black with cold undertone
  vec3 shadowColor = palette(
    shadow1 * 0.5 + t * 0.1,
    vec3(0.01, 0.01, 0.02),
    vec3(0.02, 0.015, 0.03),
    vec3(0.3, 0.2, 0.5),
    vec3(0.15, 0.1, 0.25)
  );

  // ── Compositing ──
  vec3 color = shadowColor;
  color = mix(color, lightColor, baseLuminance * totalShadow);
  color += penumbraColor * totalPenumbra * (0.5 + u_mid * 0.5);

  // Subtle light diffraction at shadow edges
  float diffraction = totalPenumbra * sin(totalPenumbra * 30.0 + t * 2.0) * 0.03;
  color += vec3(0.3, 0.2, 0.5) * diffraction * u_treble;

  // Dim scattered light in shadowed areas — bass-driven
  float scatterLight = (1.0 - totalShadow) * 0.03 * (0.5 + u_bass * 0.5);
  color += lightColor * scatterLight;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
