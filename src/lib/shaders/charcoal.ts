import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Smoldering charcoal — dark surface with hidden heat patterns underneath.
// Mostly black, with slow reveals of deep orange where the heat lives.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Charcoal surface texture — rough, granular ──
  float grain1 = fbm4(uv * 8.0 + vec2(t * 0.05, 0.0));
  float grain2 = snoise(uv * 20.0 + t * 0.1) * 0.3;
  float surface = grain1 * 0.5 + grain2 * 0.3 + 0.5;
  surface = clamp(surface, 0.0, 1.0);

  // ── Hidden heat map — slow-moving temperature zones beneath the surface ──
  float heatMap = fbm4(uv * 1.5 * rot2(t * 0.05) + vec2(t * 0.15, t * 0.08));
  float heat = smoothstep(-0.1, 0.5, heatMap);

  // Heat breathing — slow pulsation
  float breathe = sin(t * 0.8) * 0.5 + 0.5;
  heat *= (0.4 + breathe * 0.3 + u_bass * 0.3);

  // ── Ash layer — covering the heat, occasionally blown away ──
  float ashNoise = fbm4(uv * 3.0 + vec2(-t * 0.1, t * 0.05));
  float ash = smoothstep(-0.2, 0.3, ashNoise);

  // Wind effect — mid frequency blows ash, revealing heat
  float wind = sin(uv.x * 5.0 + t * 2.0 + uv.y * 3.0) * u_mid * 0.3;
  ash = clamp(ash - wind, 0.0, 1.0);

  // Heat only visible where ash is thin
  float visibleHeat = heat * (1.0 - ash * 0.8);

  // ── Cracks in the ash surface ──
  float crackPattern = abs(fbm4(uv * 4.0 + t * 0.08));
  float cracks = smoothstep(0.03, 0.0, crackPattern) * 0.5;
  cracks *= heat; // cracks glow with underlying heat

  // ── Colors ──
  // Charcoal surface — very dark grey with texture
  vec3 charcoalColor = palette(
    surface * 0.5 + u_amplitude * 0.1,
    vec3(0.02, 0.018, 0.016),
    vec3(0.02, 0.018, 0.015),
    vec3(0.2, 0.18, 0.15),
    vec3(0.05, 0.04, 0.03)
  );

  // Hidden heat — deep red-orange
  vec3 heatColor = palette(
    visibleHeat * 2.0 + t * 0.15,
    vec3(0.2, 0.05, 0.01),
    vec3(0.3, 0.1, 0.02),
    vec3(0.8, 0.4, 0.15),
    vec3(0.0, 0.05, 0.03)
  );

  // Ash — lighter grey
  vec3 ashColor = palette(
    ash * 1.5 + t * 0.05,
    vec3(0.04, 0.038, 0.035),
    vec3(0.02, 0.018, 0.016),
    vec3(0.15, 0.14, 0.12),
    vec3(0.05, 0.04, 0.03)
  );

  // Crack glow
  vec3 crackColor = palette(
    cracks * 3.0 + t * 0.2,
    vec3(0.35, 0.12, 0.03),
    vec3(0.3, 0.15, 0.04),
    vec3(0.8, 0.5, 0.2),
    vec3(0.0, 0.03, 0.05)
  );

  // ── Compositing ──
  vec3 color = charcoalColor * (0.5 + surface * 0.5);
  color = mix(color, ashColor, ash * 0.5);
  color += heatColor * visibleHeat * 0.25;
  color += crackColor * cracks * 0.4;

  // Hot glow bleed — heat lightens surrounding area very subtly
  float heatBleed = smoothstep(0.0, 0.5, heat) * 0.02;
  color += vec3(0.12, 0.04, 0.01) * heatBleed;

  // Treble — tiny sparks popping off the surface
  float spark = pow(fract(snoise(uv * 25.0 + t * 8.0) * 4.0), 20.0);
  spark *= visibleHeat;
  color += vec3(1.0, 0.7, 0.3) * spark * 0.2 * u_treble;

  // Vignette
  float vignette = 1.0 - smoothstep(0.3, 1.15, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
