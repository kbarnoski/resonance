import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Dharma wheel slowly rotating with eight luminous spokes radiating sacred light,
// concentric rings of energy, and a glowing hub at center.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Slow majestic rotation
  float rotation = t * 0.4;

  // Eight-fold spoke symmetry
  float spokeCount = 8.0;
  float sector = 6.28318 / spokeCount;
  float sa = mod(a + rotation + sector * 0.5, sector) - sector * 0.5;

  // Spoke body — tapers outward, sharp line with soft glow
  float spokeWidth = 0.015 + 0.005 * sin(r * 15.0 - t * 3.0);
  float spoke = smoothstep(spokeWidth * 2.0, 0.0, abs(sa) * r);
  float spokeRange = smoothstep(0.08, 0.12, r) * smoothstep(0.65, 0.55, r);
  spoke *= spokeRange;

  // Spoke finials — crescent tips at the end of each spoke
  float tipR = 0.58 + 0.03 * sin(t * 2.0) + u_bass * 0.03;
  float tipDist = abs(r - tipR);
  float tip = smoothstep(0.03, 0.0, tipDist) * smoothstep(0.08, 0.0, abs(sa));

  // Rim of the wheel — outer ring
  float rimR = 0.6 + 0.02 * sin(t * 1.5) + u_bass * 0.02;
  float rim = smoothstep(0.012, 0.0, abs(r - rimR));
  float rimInner = smoothstep(0.008, 0.0, abs(r - rimR + 0.06));

  // Hub — inner ring
  float hubR = 0.1 + 0.01 * sin(t * 2.5);
  float hub = smoothstep(0.01, 0.0, abs(r - hubR));

  // Concentric energy rings between hub and rim
  float rings = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ringR = 0.18 + fi * 0.1 + 0.01 * sin(t * (1.5 + fi * 0.3));
    float ring = smoothstep(0.006, 0.0, abs(r - ringR));
    rings += ring * (0.5 + 0.5 / (1.0 + fi));
  }

  // Radial light rays beyond the wheel
  float rayAngle = mod(a + rotation * 0.7, sector) - sector * 0.5;
  float ray = smoothstep(0.05, 0.0, abs(rayAngle)) * smoothstep(0.55, 0.75, r);
  ray *= exp(-(r - 0.6) * 3.0);

  // Soft glow field around spokes — FBM distorted
  float glowField = snoise(vec2(a * 4.0 + t * 0.3, r * 6.0 - t * 0.5));
  glowField = smoothstep(0.0, 0.6, glowField) * spokeRange * 0.3;

  // Palette — warm golden light
  vec3 wheelCol = palette(
    a * 0.15 + r * 0.3 + paletteShift,
    vec3(0.65, 0.55, 0.35),
    vec3(0.4, 0.35, 0.3),
    vec3(1.0, 0.85, 0.5),
    vec3(0.0, 0.1, 0.25)
  );

  vec3 rayCol = palette(
    a * 0.1 + paletteShift + 0.4,
    vec3(0.5, 0.45, 0.3),
    vec3(0.5, 0.4, 0.35),
    vec3(1.0, 0.9, 0.6),
    vec3(0.1, 0.15, 0.3)
  );

  vec3 coreCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.8, 0.7, 0.5),
    vec3(0.2, 0.2, 0.2),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.1)
  );

  // Compose
  color += wheelCol * spoke * 1.5 * (0.7 + 0.3 * u_mid);
  color += wheelCol * tip * 1.2;
  color += wheelCol * (rim + rimInner * 0.6) * 1.0;
  color += wheelCol * hub * 1.2;
  color += wheelCol * rings * 0.6;
  color += wheelCol * glowField * u_mid;
  color += rayCol * ray * (0.6 + 0.4 * u_treble);

  // Central hub glow
  float coreGlow = exp(-r * r * 30.0) * (0.8 + 0.6 * u_bass);
  color += coreCol * coreGlow;

  // Treble sparkle on rim
  float sparkle = sin(a * 40.0 + t * 8.0) * u_treble * 0.3;
  sparkle = max(sparkle, 0.0) * smoothstep(0.02, 0.0, abs(r - rimR));
  color += vec3(1.0, 0.95, 0.85) * sparkle;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
