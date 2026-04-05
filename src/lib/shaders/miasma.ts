import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Toxic fog — dense, slow-moving poison clouds with sickly green-violet light.
// Heavy, clinging atmosphere. Light sources barely penetrate.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Dense fog layers — multiple scales, slow drift ──
  vec2 fogUV1 = uv * 1.5 + vec2(t * 0.3, t * 0.1);
  vec2 fogUV2 = uv * 2.5 * rot2(0.3) + vec2(-t * 0.2, t * 0.15);
  vec2 fogUV3 = uv * 0.8 * rot2(-0.2) + vec2(t * 0.1, -t * 0.08);

  float fog1 = fbm4(fogUV1) * 0.5 + 0.5;
  float fog2 = fbm4(fogUV2) * 0.5 + 0.5;
  float fog3 = fbm4(fogUV3) * 0.5 + 0.5;

  // Combine fog layers with different weights
  float density = fog1 * 0.5 + fog2 * 0.3 + fog3 * 0.2;
  density = smoothstep(0.2, 0.8, density);

  // ── Internal light sources — sickly glows within the fog ──
  // Slow-moving light positions
  vec2 light1 = vec2(sin(t * 0.7) * 0.4, cos(t * 0.5) * 0.3);
  vec2 light2 = vec2(cos(t * 0.4) * 0.5, sin(t * 0.6) * 0.4 - 0.1);
  vec2 light3 = vec2(sin(t * 0.3 + 2.0) * 0.3, cos(t * 0.8 + 1.0) * 0.2);

  float glow1 = 0.06 / (length(uv - light1) + 0.06);
  float glow2 = 0.04 / (length(uv - light2) + 0.05);
  float glow3 = 0.03 / (length(uv - light3) + 0.04);

  // Fog attenuates the light
  glow1 *= (1.0 - density * 0.6);
  glow2 *= (1.0 - density * 0.7);
  glow3 *= (1.0 - density * 0.5);

  // ── Colors — sickly greens, bruise violets, toxic yellows ──
  // Fog base — deep murky dark
  vec3 fogColor = palette(
    density * 1.5 + t * 0.1 + u_amplitude * 0.15,
    vec3(0.02, 0.03, 0.02),
    vec3(0.04, 0.06, 0.04),
    vec3(0.3, 0.5, 0.4),
    vec3(0.15, 0.2, 0.1)
  );

  // Light 1 — sickly green
  vec3 lightCol1 = palette(
    glow1 * 2.0 + t * 0.2,
    vec3(0.1, 0.2, 0.05),
    vec3(0.15, 0.25, 0.08),
    vec3(0.4, 0.8, 0.3),
    vec3(0.1, 0.15, 0.05)
  );

  // Light 2 — bruise violet
  vec3 lightCol2 = palette(
    glow2 * 2.0 + t * 0.15 + 0.3,
    vec3(0.1, 0.03, 0.12),
    vec3(0.15, 0.05, 0.2),
    vec3(0.5, 0.3, 0.8),
    vec3(0.1, 0.05, 0.2)
  );

  // Light 3 — toxic yellow-green
  vec3 lightCol3 = palette(
    glow3 * 2.0 + t * 0.1 + 0.6,
    vec3(0.15, 0.12, 0.02),
    vec3(0.2, 0.18, 0.05),
    vec3(0.6, 0.5, 0.2),
    vec3(0.05, 0.1, 0.0)
  );

  // ── Compositing ──
  vec3 color = fogColor * (0.3 + density * 0.7);

  // Add internal lights
  color += lightCol1 * glow1 * 0.5 * (0.6 + u_bass * 0.4);
  color += lightCol2 * glow2 * 0.4 * (0.5 + u_mid * 0.5);
  color += lightCol3 * glow3 * 0.3 * (0.5 + u_treble * 0.5);

  // Fog wisps — brighter tendrils
  float wisps = smoothstep(0.55, 0.7, fog1) * smoothstep(0.4, 0.6, fog2);
  color += vec3(0.06, 0.08, 0.04) * wisps * 0.5;

  // Settling particles — tiny bright points in dense areas
  float particleNoise = snoise(uv * 20.0 + t * 2.0);
  float particleMask = smoothstep(0.85, 1.0, particleNoise) * density;
  color += vec3(0.3, 0.4, 0.15) * particleMask * 0.15 * u_treble;

  // Vignette — heavy, oppressive
  float vignette = 1.0 - smoothstep(0.3, 1.1, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
