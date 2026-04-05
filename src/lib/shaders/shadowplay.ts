import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Shadow puppets — dark abstract forms moving against a faintly lit background.
// A screen with dim backlight. Shapes cross and overlap. Theatre of shadows.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // ── Backlit screen — dim warm light behind the shadow surface ──
  float screenLight = 1.0 - length(uv) * 0.6;
  screenLight = max(screenLight, 0.0);
  screenLight *= screenLight;
  float lightPulse = 0.7 + u_bass * 0.15 + sin(t * 0.3) * 0.05;
  screenLight *= lightPulse * 0.12;

  // Light color shifts slightly
  vec3 backLight = palette(
    t * 0.1 + u_amplitude * 0.15,
    vec3(0.12, 0.1, 0.08),
    vec3(0.06, 0.05, 0.04),
    vec3(0.5, 0.4, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // ── Shadow forms — abstract shapes crossing the screen ──
  // Form 1 — large, slow, crosses left to right
  vec2 form1Pos = vec2(sin(t * 0.3) * 0.6, cos(t * 0.2) * 0.3);
  float form1 = fbm3((uv - form1Pos) * 2.0 * rot2(t * 0.1));
  float shadow1 = smoothstep(0.1, -0.2, form1);

  // Form 2 — medium, vertical drift
  vec2 form2Pos = vec2(cos(t * 0.25 + 2.0) * 0.4, sin(t * 0.35) * 0.5);
  float form2 = fbm3((uv - form2Pos) * 2.5 * rot2(-t * 0.08 + 1.0));
  float shadow2 = smoothstep(0.15, -0.15, form2);

  // Form 3 — small, quicker
  vec2 form3Pos = vec2(sin(t * 0.5 + 4.0) * 0.5, cos(t * 0.4 + 1.0) * 0.4);
  float form3 = fbm3((uv - form3Pos) * 3.0 * rot2(t * 0.15));
  float shadow3 = smoothstep(0.2, -0.1, form3);

  // Combined shadow — overlapping darkens further
  float totalShadow = max(shadow1, max(shadow2, shadow3));
  float overlap = shadow1 * shadow2 + shadow2 * shadow3 + shadow1 * shadow3;
  overlap = min(overlap, 1.0);

  // ── Shadow edges — where shadow meets light, colored diffraction ──
  float edge1 = smoothstep(0.0, 0.1, form1) - smoothstep(0.1, 0.2, form1);
  float edge2 = smoothstep(0.05, 0.15, form2) - smoothstep(0.15, 0.25, form2);
  float edge3 = smoothstep(0.1, 0.2, form3) - smoothstep(0.2, 0.3, form3);
  float edges = (edge1 + edge2 + edge3) * 0.4;

  // Edge color — warm tones bleeding around shadow edges
  vec3 edgeColor = palette(
    edges * 2.0 + t * 0.2,
    vec3(0.1, 0.06, 0.04),
    vec3(0.08, 0.05, 0.03),
    vec3(0.6, 0.4, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // ── Screen texture — subtle fabric weave of the projection surface ──
  float weave = sin(uv.x * 80.0) * sin(uv.y * 80.0) * 0.005 + 1.0;

  // ── Compositing ──
  vec3 color = backLight * screenLight * weave;

  // Shadows block the backlight
  color *= (1.0 - totalShadow * 0.85);

  // Deeper dark where shadows overlap
  color *= (1.0 - overlap * 0.1);

  // Edge diffraction
  color += edgeColor * edges * 0.15 * (0.6 + u_mid * 0.4);

  // Shadow forms have a very faint color — not pure black
  vec3 shadowTint = palette(
    totalShadow * 0.5 + t * 0.05,
    vec3(0.01, 0.01, 0.015),
    vec3(0.01, 0.008, 0.012),
    vec3(0.3, 0.2, 0.4),
    vec3(0.1, 0.08, 0.2)
  );
  color += shadowTint * totalShadow * 0.02;

  // Treble — light flickers
  float flicker = 1.0 + sin(t * 15.0 + uv.x * 3.0) * u_treble * 0.03;
  color *= flicker;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
