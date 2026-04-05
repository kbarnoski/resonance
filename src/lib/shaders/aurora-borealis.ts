import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Aurora Borealis — Northern lights: vertical curtains of green/violet dancing across a dark sky

// 4-octave fbm for curtain detail
float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Aurora curtain — vertical band that sways
float curtain(vec2 uv, float offset, float speed, float freq) {
  // Horizontal position sways with time
  float sway = sin(uv.y * freq + u_time * speed + offset) * 0.15;
  sway += fbm4(vec2(uv.y * 0.5 + offset, u_time * 0.1)) * 0.1;

  // Curtain position relative to this x
  float dist = abs(uv.x - sway);

  // Curtain brightness — sharp peak with soft falloff
  float bright = exp(-dist * dist * 20.0);

  // Vertical intensity variation — brighter in middle, fades at top and bottom
  float vertFade = smoothstep(-0.5, -0.1, uv.y) * smoothstep(0.6, 0.2, uv.y);

  // Fold detail — ripples within the curtain
  float folds = sin(uv.y * 12.0 + u_time * 0.8 + offset * 3.0) * 0.5 + 0.5;
  folds = mix(0.6, 1.0, folds);

  return bright * vertFade * folds;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // Dark sky base
  float skyGrad = smoothstep(0.5, -0.5, uv.y);

  // Multiple aurora curtains at different positions and speeds
  float a1 = curtain(uv, 0.0, 0.15, 1.5);
  float a2 = curtain(uv, 2.1, 0.12, 1.8);
  float a3 = curtain(uv, 4.3, 0.18, 1.2);
  float a4 = curtain(uv, 6.0, 0.10, 2.0);

  // Audio reactivity
  a1 *= (0.7 + u_bass * 0.5);
  a2 *= (0.6 + u_mid * 0.5);
  a3 *= (0.5 + u_treble * 0.5);
  a4 *= (0.5 + u_amplitude * 0.4);

  // Combined aurora intensity
  float aurora = a1 + a2 * 0.7 + a3 * 0.5 + a4 * 0.4;
  aurora = clamp(aurora, 0.0, 1.5);

  // Color varies across the curtains and with altitude
  // Lower aurora = green, upper = violet/red
  float altitudeColor = smoothstep(-0.2, 0.4, uv.y);

  // Subtle stars in the dark sky
  float stars = snoise(uv * 40.0 + vec2(123.4));
  stars = pow(max(stars, 0.0), 12.0) * (1.0 - aurora * 0.8) * 0.5;

  // Coronal rays — subtle vertical bright streaks
  float rays = snoise(vec2(uv.x * 8.0, uv.y * 0.5 + t * 0.5));
  rays = pow(max(rays, 0.0), 3.0) * aurora * 0.3;

  // ── Color ──
  // Night sky — very dark blue/black
  vec3 nightSky = palette(
    skyGrad * 0.2 + t * 0.02,
    vec3(0.01, 0.01, 0.04),
    vec3(0.01, 0.02, 0.05),
    vec3(0.2, 0.3, 0.6),
    vec3(0.08, 0.10, 0.25)
  );

  // Green aurora — the classic lower band
  vec3 greenAurora = palette(
    a1 * 0.3 + a2 * 0.2 + t * 0.06,
    vec3(0.05, 0.30, 0.12),
    vec3(0.08, 0.35, 0.15),
    vec3(0.5, 0.9, 0.5),
    vec3(0.10, 0.30, 0.15)
  );

  // Violet/magenta aurora — upper altitudes
  vec3 violetAurora = palette(
    a3 * 0.3 + a4 * 0.2 + t * 0.08,
    vec3(0.18, 0.05, 0.25),
    vec3(0.22, 0.08, 0.30),
    vec3(0.7, 0.4, 0.9),
    vec3(0.30, 0.10, 0.40)
  );

  // Teal transition band
  vec3 tealBand = palette(
    (a1 + a2) * 0.2 + altitudeColor * 0.3 + t * 0.07,
    vec3(0.03, 0.20, 0.22),
    vec3(0.05, 0.25, 0.28),
    vec3(0.4, 0.8, 0.7),
    vec3(0.08, 0.25, 0.35)
  );

  // Build the aurora color from altitude
  vec3 auroraColor = mix(greenAurora, tealBand, altitudeColor * 0.6);
  auroraColor = mix(auroraColor, violetAurora, altitudeColor * altitudeColor * 0.7);

  // Build final
  vec3 color = nightSky;

  // Aurora overlay — additive for glow
  color += auroraColor * aurora * 0.7;

  // Coronal rays
  color += auroraColor * rays;

  // Stars
  color += vec3(0.8, 0.85, 1.0) * stars;

  // Subtle sky glow near the aurora
  float glow = aurora * 0.15;
  color += greenAurora * glow * (1.0 - altitudeColor);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
