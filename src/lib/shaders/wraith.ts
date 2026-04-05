import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Wraith — ghost-like translucent forms drifting through deep darkness.
// Barely visible, emerging and dissolving. Presence felt more than seen.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Ghost forms — vertical, drifting, translucent ──
  // Each wraith is a vertically elongated noise form
  float wraith1 = fbm3(vec2(uv.x * 2.0 + t * 0.15, uv.y * 0.8 + t * 0.05));
  float wraith2 = fbm3(vec2(uv.x * 1.5 - t * 0.1 + 3.0, uv.y * 0.6 - t * 0.08));
  float wraith3 = fbm3(vec2(uv.x * 2.5 + t * 0.12 + 7.0, uv.y * 0.7 + t * 0.03));

  // Threshold to create distinct forms
  float form1 = smoothstep(0.1, 0.35, wraith1) * smoothstep(0.6, 0.35, wraith1);
  float form2 = smoothstep(0.05, 0.3, wraith2) * smoothstep(0.55, 0.3, wraith2);
  float form3 = smoothstep(0.15, 0.4, wraith3) * smoothstep(0.65, 0.4, wraith3);

  // Fade toward bottom — wraiths trail off
  float vertFade1 = smoothstep(-0.6, 0.2, uv.y);
  float vertFade2 = smoothstep(-0.5, 0.3, uv.y);
  float vertFade3 = smoothstep(-0.7, 0.1, uv.y);

  form1 *= vertFade1;
  form2 *= vertFade2;
  form3 *= vertFade3;

  // ── Ethereal edges — wraiths have glowing translucent borders ──
  float edge1 = smoothstep(0.08, 0.15, wraith1) - smoothstep(0.15, 0.25, wraith1);
  float edge2 = smoothstep(0.03, 0.1, wraith2) - smoothstep(0.1, 0.2, wraith2);
  float edge3 = smoothstep(0.12, 0.2, wraith3) - smoothstep(0.2, 0.3, wraith3);
  float edges = (edge1 + edge2 + edge3) * 0.3;

  // ── Ambient mist — the medium the wraiths drift through ──
  float mist = fbm3(uv * 1.0 * rot2(t * 0.02) + vec2(t * 0.05, 0.0));
  mist = smoothstep(-0.3, 0.3, mist) * 0.06;

  // ── Colors ──
  // Background void — deep, cold
  vec3 bgColor = palette(
    mist * 2.0 + t * 0.05,
    vec3(0.005, 0.005, 0.01),
    vec3(0.01, 0.008, 0.015),
    vec3(0.3, 0.2, 0.4),
    vec3(0.15, 0.1, 0.25)
  );

  // Wraith bodies — barely visible, cold blue-white
  vec3 wraithCol1 = palette(
    form1 * 2.0 + u_amplitude * 0.15,
    vec3(0.04, 0.04, 0.06),
    vec3(0.03, 0.03, 0.05),
    vec3(0.4, 0.4, 0.6),
    vec3(0.1, 0.1, 0.2)
  );

  vec3 wraithCol2 = palette(
    form2 * 2.0 + 0.3,
    vec3(0.03, 0.03, 0.05),
    vec3(0.04, 0.03, 0.06),
    vec3(0.3, 0.35, 0.55),
    vec3(0.15, 0.1, 0.25)
  );

  vec3 wraithCol3 = palette(
    form3 * 2.0 + 0.6,
    vec3(0.035, 0.03, 0.055),
    vec3(0.035, 0.03, 0.055),
    vec3(0.35, 0.3, 0.5),
    vec3(0.12, 0.1, 0.22)
  );

  // Edge glow — slightly brighter, spectral
  vec3 edgeColor = palette(
    edges * 3.0 + t * 0.2,
    vec3(0.06, 0.06, 0.1),
    vec3(0.05, 0.05, 0.08),
    vec3(0.5, 0.5, 0.8),
    vec3(0.1, 0.1, 0.2)
  );

  // ── Compositing ──
  vec3 color = bgColor;
  color += vec3(mist) * 0.5;

  // Layer wraiths — very subtle opacity
  color += wraithCol1 * form1 * 0.15 * (0.6 + u_bass * 0.4);
  color += wraithCol2 * form2 * 0.12 * (0.5 + u_mid * 0.5);
  color += wraithCol3 * form3 * 0.1 * (0.5 + u_treble * 0.5);

  // Edge glow
  color += edgeColor * edges * 0.15;

  // Occasional bright flicker — a wraith briefly becomes more visible
  float flicker = smoothstep(0.9, 1.0, sin(t * 3.0 + form1 * 10.0));
  color += wraithCol1 * flicker * 0.1;

  // Vignette
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
