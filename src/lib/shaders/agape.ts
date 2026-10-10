import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";
import { withAngleSeamBlend } from "./angle-seam";

// Angle seam-blended (atan branch cut — see ./angle-seam).
export const FRAG = withAngleSeamBlend(U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Agape — Unconditional radiance: warm expanding golden waves

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  float bass = 0.5 + 0.5 * sin(u_bass * 3.14159);
  float amp = 0.5 + 0.5 * sin(u_amplitude * 3.14159);

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Expanding concentric golden waves
  float waves = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float waveR = mod(fi * 0.15 + t * 0.5, 1.5);
    float n = fbm3(vec2(angle * 1.5 + fi, r * 2.0)) * 0.03;
    float wave = smoothstep(0.015, 0.0, abs(r - waveR + n));

    // Fade as waves expand outward
    float fade = smoothstep(1.3, 0.3, waveR);
    wave *= fade * (0.8 + bass * 0.2);

    // Each wave has warmth and brightness
    waves += wave * (1.0 - fi * 0.08);
  }

  // Broad warm radial glow — the generous core
  float coreGlow = exp(-r * 3.0) * (1.2 + amp * 0.3);
  float broadGlow = exp(-r * 1.2) * 0.3;

  // Noise-modulated warmth
  float n = fbm3(uv * 3.0 + t * 0.2);
  float warmth = (n * 0.5 + 0.5) * exp(-r * 2.0) * 0.3;

  // Golden palette
  vec3 waveColor = palette(
    r * 2.0 + t * 0.15,
    vec3(0.7, 0.5, 0.2),
    vec3(0.5, 0.4, 0.2),
    vec3(1.0, 0.8, 0.35),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 coreColor = palette(
    n + t * 0.1,
    vec3(0.8, 0.6, 0.25),
    vec3(0.4, 0.3, 0.1),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);
  color += waveColor * waves * 1.2;
  color += coreColor * coreGlow;
  color += vec3(0.8, 0.6, 0.2) * broadGlow;
  color += vec3(0.9, 0.7, 0.3) * warmth;

  // Bright center point
  color += vec3(1.0, 0.95, 0.8) * exp(-r * 10.0) * 0.8;

  // Vignette
  color *= smoothstep(1.5, 0.4, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`);
