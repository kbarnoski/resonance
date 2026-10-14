import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Pilgrimage — Journey toward distant light: converging lines

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;

  float bass = 0.5 + 0.5 * sin(u_bass * 3.14159);
  float mid = 0.5 + 0.5 * sin(u_mid * 3.14159);

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Vanishing point — slightly above center
  vec2 vanish = vec2(0.0, 0.05);
  vec2 toVanish = uv - vanish;
  float distToVanish = length(toVanish);
  float vanishAngle = atan(toVanish.y, toVanish.x);

  vec3 color = vec3(0.0);

  // Converging lines — luminous paths leading to the distant light
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float lineAngle = fi * 0.3927 + 0.1; // 16 lines around

    // Distance from this radial line
    float angleDiff = abs(sin(vanishAngle - lineAngle));

    // Line gets thinner as it converges
    float thickness = 0.008 + distToVanish * 0.015;
    float line = smoothstep(thickness, thickness * 0.2, angleDiff);

    // Brightness increases toward vanishing point
    float brightness = exp(-distToVanish * 2.0) + 0.2;

    // Noise modulation along line — only where the line is lit (PERF
    // 2026-10-14: off the line it multiplies 0; 48 noise taps -> ~3)
    if (line > 0.0) {
      float n = fbm3(vec2(vanishAngle * 3.0 + fi, distToVanish * 4.0 - t));
      line *= (0.6 + n * 0.4);
    }

    // Moving particles along lines (sense of walking)
    float particle = sin(distToVanish * 30.0 - t * 3.0 + fi * 2.0) * 0.5 + 0.5;
    particle *= exp(-distToVanish * 3.0);

    vec3 lineColor = palette(
      fi * 0.08 + t * 0.05,
      vec3(0.6, 0.45, 0.15),
      vec3(0.4, 0.3, 0.15),
      vec3(1.0, 0.8, 0.4),
      vec3(0.0, 0.1, 0.15)
    );

    color += lineColor * (line * 0.15 + particle * 0.1) * brightness * (0.8 + mid * 0.2);
  }

  // Distant light at vanishing point — the destination
  float destGlow = exp(-distToVanish * 6.0) * 1.5;
  float destCore = exp(-distToVanish * 15.0) * 1.0;
  color += vec3(1.0, 0.9, 0.6) * destGlow * (1.0 + bass * 0.2);
  color += vec3(1.0, 0.95, 0.85) * destCore;

  // Ground plane suggestion — subtle horizontal gradient
  float ground = exp(-(uv.y + 0.3) * (uv.y + 0.3) * 10.0) * 0.1;
  float groundN = fbm3(vec2(uv.x * 4.0, t * 0.2));
  color += vec3(0.4, 0.3, 0.1) * ground * (0.5 + groundN * 0.3);

  // Vignette
  color *= smoothstep(1.5, 0.4, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
