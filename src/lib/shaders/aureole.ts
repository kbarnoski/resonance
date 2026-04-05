import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Radiant golden halo expanding and contracting with breathing rhythm:
// a luminous corona of warm light with subtle internal structure.
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

  // Breathing rhythm — slow sine expansion
  float breath = 1.0 + 0.12 * sin(t * 2.5) + u_bass * 0.08;

  // Primary aureole ring — main halo
  float haloR = 0.35 * breath;
  float haloWidth = 0.08 + 0.03 * sin(t * 1.5);
  float haloDist = abs(r - haloR);
  float halo = exp(-haloDist * haloDist / (haloWidth * haloWidth * 0.5));

  // Angular modulation — subtle waviness
  float waviness = snoise(vec2(a * 3.0, t * 0.5)) * 0.02;
  float haloModulated = exp(-(abs(r - haloR - waviness)) * (abs(r - haloR - waviness)) / (haloWidth * haloWidth * 0.5));

  // Inner glow ring
  float innerR = haloR * 0.65;
  float innerGlow = exp(-abs(r - innerR) * 20.0) * 0.5;

  // Outer corona — soft radial falloff with noise texture
  float corona = exp(-(r - haloR) * 3.0) * step(haloR, r);
  float coronaNoise = snoise(vec2(a * 6.0, r * 8.0 - t * 0.8));
  corona *= (0.7 + 0.3 * coronaNoise);

  // Radial streaks in the corona
  float streakCount = 24.0;
  float streakAngle = mod(a * streakCount + t * 1.5, 6.28318);
  float streak = pow(max(sin(streakAngle), 0.0), 8.0);
  streak *= corona * 0.6;

  // Internal structure — concentric ripples inside the halo
  float ripple = sin(r * 60.0 - t * 4.0) * 0.5 + 0.5;
  ripple = pow(ripple, 3.0) * smoothstep(haloR + haloWidth, haloR - haloWidth, r) * 0.3;

  // Palette — pure golden warmth
  vec3 haloCol = palette(
    a * 0.05 + r * 0.3 + paletteShift,
    vec3(0.75, 0.6, 0.35),
    vec3(0.35, 0.3, 0.2),
    vec3(1.0, 0.9, 0.6),
    vec3(0.0, 0.08, 0.15)
  );

  vec3 coronaCol = palette(
    a * 0.1 + paletteShift + 0.15,
    vec3(0.6, 0.5, 0.3),
    vec3(0.4, 0.35, 0.25),
    vec3(1.0, 0.85, 0.55),
    vec3(0.05, 0.1, 0.2)
  );

  vec3 coreCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.9, 0.8, 0.6),
    vec3(0.15, 0.15, 0.1),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.08)
  );

  // Compose layers
  color += haloCol * haloModulated * (1.2 + 0.5 * u_mid);
  color += haloCol * innerGlow;
  color += coronaCol * corona * 0.5 * (0.6 + 0.4 * u_mid);
  color += coronaCol * streak * (0.5 + 0.5 * u_treble);
  color += haloCol * ripple;

  // Central void — slightly luminous, not pitch black
  float centerGlow = exp(-r * r * 15.0) * 0.3 * (0.7 + 0.3 * u_bass);
  color += coreCol * centerGlow;

  // Treble-driven fine shimmer on the halo edge
  float shimmer = sin(a * 50.0 + r * 80.0 + t * 6.0);
  shimmer = pow(max(shimmer, 0.0), 6.0) * u_treble * 0.25;
  shimmer *= smoothstep(haloWidth * 1.5, 0.0, haloDist);
  color += vec3(1.0, 0.97, 0.9) * shimmer;

  // Vignette
  color *= smoothstep(1.5, 0.4, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
