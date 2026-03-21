import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Maelstrom — massive whirlpool vortex pulling everything inward

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // Polar coords
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Spiral twist — angle increases as we go inward (whirlpool)
  float twist = 4.0 + u_bass * 2.0;
  float spiralAngle = a + twist / (r + 0.1) - t * 0.8;

  // Concentric water rings distorted by spiral
  float rings = sin(spiralAngle * 3.0 + r * 15.0) * 0.5 + 0.5;
  rings *= smoothstep(0.0, 0.15, r); // fade at center void

  // Turbulent water surface
  vec2 spiralUV = vec2(spiralAngle, r * 5.0);
  float waterTurb = fbm(spiralUV + vec2(t * 0.3, -t * 0.5)) * 0.5 + 0.5;

  // Foam/debris trails spiraling inward
  float foam = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float foamAngle = spiralAngle + fi * 1.257; // evenly spaced arms
    float foamR = fract(foamAngle / 6.283 + r * 2.0 - t * 0.2 + fi * 0.2);
    float armWidth = 0.08 + u_treble * 0.03;
    float arm = smoothstep(armWidth, 0.0, abs(foamR - 0.5));
    arm *= smoothstep(0.05, 0.2, r) * smoothstep(0.8, 0.3, r);
    foam += arm * (0.6 - fi * 0.08);
  }

  // Center void — dark abyss at the eye
  float voidMask = smoothstep(0.12, 0.04, r);
  float voidDepth = smoothstep(0.08, 0.0, r);

  // Outer calm water
  float outerCalm = smoothstep(0.5, 0.8, r);

  // Colors — deep ocean blues and teals
  vec3 waterColor = palette(
    waterTurb * 0.4 + rings * 0.2 + paletteShift,
    vec3(0.03, 0.1, 0.18),
    vec3(0.05, 0.12, 0.18),
    vec3(0.4, 0.7, 0.8),
    vec3(0.1, 0.2, 0.35)
  );

  vec3 foamColor = palette(
    foam * 0.3 + paletteShift + 0.4,
    vec3(0.5, 0.55, 0.6),
    vec3(0.3, 0.3, 0.25),
    vec3(0.6, 0.7, 0.8),
    vec3(0.15, 0.2, 0.3)
  );

  vec3 deepColor = palette(
    r * 0.3 + paletteShift + 0.1,
    vec3(0.01, 0.02, 0.06),
    vec3(0.01, 0.03, 0.06),
    vec3(0.2, 0.3, 0.5),
    vec3(0.15, 0.2, 0.4)
  );

  // Outer calm — darker, less turbulent
  vec3 outerColor = palette(
    snoise(uv * 2.0 + t * 0.05) * 0.2 + paletteShift + 0.6,
    vec3(0.04, 0.08, 0.14),
    vec3(0.03, 0.06, 0.1),
    vec3(0.3, 0.5, 0.6),
    vec3(0.15, 0.2, 0.3)
  );

  // Compose
  vec3 color = waterColor;
  color = mix(color, waterColor * rings, 0.4);
  color = mix(color, foamColor, clamp(foam * 0.6, 0.0, 1.0));
  color = mix(color, deepColor, voidMask);
  color = mix(color, vec3(0.005, 0.01, 0.02), voidDepth); // absolute dark center
  color = mix(color, outerColor, outerCalm);

  // Mid: underwater light caustics
  float caustic = snoise(vec2(spiralAngle * 2.0, r * 8.0 - t * 1.5));
  caustic = pow(max(caustic, 0.0), 3.0) * u_mid * 0.3 * (1.0 - voidMask);
  color += vec3(0.05, 0.15, 0.2) * caustic;

  // Bass: deepens the pull, darkens center
  color = mix(color, deepColor * 0.5, u_bass * 0.2 * (1.0 - r));

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
