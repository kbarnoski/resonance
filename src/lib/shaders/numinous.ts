import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";
import { withAngleSeamBlend } from "./angle-seam";

// Angle seam-blended (atan branch cut — see ./angle-seam).
export const FRAG = withAngleSeamBlend(U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Numinous — Overwhelming sacred presence, pulsing radial depth

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  float bass = 0.5 + 0.5 * sin(u_bass * 3.14159);
  float mid = 0.5 + 0.5 * sin(u_mid * 3.14159);

  // Concentric rings pulsing outward
  float rings = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float ringR = fi * 0.1 + 0.05;
    float pulse = sin(t * 2.0 - fi * 0.5) * 0.02;
    ringR += pulse + bass * 0.01;
    float thickness = 0.008 + 0.004 * sin(t + fi * 0.8);
    float ring = smoothstep(thickness, 0.0, abs(r - ringR));
    float intensity = 1.0 - fi * 0.06;
    rings += ring * intensity;
  }

  // Noise-modulated radial depth
  float n = fbm3(vec2(angle * 2.0, r * 5.0 - t));
  float radialGlow = exp(-r * 3.5) * (1.0 + n * 0.4);

  // Building intensity toward center
  float presence = exp(-r * 5.0) * (1.5 + bass * 0.5);
  float outerHaze = exp(-r * 1.5) * 0.3;

  // Deep gold palette
  vec3 ringColor = palette(
    r * 3.0 + t * 0.3,
    vec3(0.6, 0.45, 0.15),
    vec3(0.5, 0.4, 0.2),
    vec3(1.0, 0.8, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 coreColor = palette(
    n + t * 0.2,
    vec3(0.8, 0.6, 0.2),
    vec3(0.4, 0.3, 0.1),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);
  color += ringColor * rings * (0.8 + mid * 0.4);
  color += coreColor * radialGlow;
  color += vec3(1.0, 0.85, 0.5) * presence;
  color += vec3(0.3, 0.2, 0.08) * outerHaze;

  // Subtle angular variation
  float angVar = sin(angle * 6.0 + t) * 0.1 + 0.1;
  color += vec3(0.4, 0.3, 0.1) * angVar * exp(-r * 2.5);

  // Vignette
  color *= smoothstep(1.5, 0.4, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`);
