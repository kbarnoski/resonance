import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Poisonous fog — thick dark clouds with sickly color highlights,
// roiling turbulence, no visibility, oppressive atmosphere.

float turbulentFog(vec2 p, float time) {
  vec2 q = vec2(
    fbm(p + vec2(1.7, 9.2) + time * 0.12),
    fbm(p + vec2(8.3, 2.8) + time * 0.09)
  );
  vec2 r = vec2(
    fbm(p + 3.0 * q + vec2(3.1, 5.7) + time * 0.06),
    fbm(p + 3.0 * q + vec2(6.4, 1.2) + time * 0.08)
  );
  return fbm(p + 3.5 * r);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Deep domain-warped fog layers — thick roiling turbulence
  float fog1 = turbulentFog(uv * 1.5, t * 0.8);
  float fog2 = turbulentFog(uv * 2.2 + vec2(5.0, 3.0), t * 0.6);
  float fog3 = turbulentFog(uv * 3.0 + vec2(10.0, 7.0), t * 1.1);

  // Normalize and combine fog layers
  float f1 = fog1 * 0.5 + 0.5;
  float f2 = fog2 * 0.5 + 0.5;
  float f3 = fog3 * 0.5 + 0.5;

  // Turbulence intensity — bass makes the fog churn violently
  float turbulence = f1 * f2;
  turbulence = pow(turbulence, 0.8 - u_bass * 0.2);

  // Density layers — varying thickness
  float density1 = smoothstep(0.2, 0.8, f1);
  float density2 = smoothstep(0.3, 0.7, f2);
  float density3 = smoothstep(0.25, 0.75, f3);
  float totalDensity = density1 * 0.5 + density2 * 0.3 + density3 * 0.2;

  // Sickly glow — toxic highlights in the fog
  // Poison green pockets
  float toxicMask = smoothstep(0.55, 0.75, f1) * (1.0 - smoothstep(0.75, 0.9, f1));
  float toxicGlow = toxicMask * 0.2 * (0.5 + u_treble * 0.5);

  // Bruise-purple undertones
  float bruiseMask = smoothstep(0.4, 0.65, f2) * (1.0 - smoothstep(0.65, 0.85, f2));
  float bruiseGlow = bruiseMask * 0.15 * (0.4 + u_mid * 0.6);

  // Sulfurous yellow wisps
  float sulfurMask = smoothstep(0.6, 0.8, f3) * (1.0 - smoothstep(0.8, 0.95, f3));
  float sulfurGlow = sulfurMask * 0.1;

  // Colors — deeply muted, sickly
  vec3 baseColor = palette(turbulence * 0.3 + paletteShift,
    vec3(0.015, 0.012, 0.02),
    vec3(0.025, 0.018, 0.03),
    vec3(0.5, 0.4, 0.6),
    vec3(0.15, 0.1, 0.25));

  vec3 denseColor = palette(totalDensity * 0.4 + paletteShift + 0.2,
    vec3(0.02, 0.015, 0.025),
    vec3(0.03, 0.02, 0.04),
    vec3(0.4, 0.35, 0.5),
    vec3(0.2, 0.15, 0.3));

  vec3 toxicColor = palette(f1 * 0.3 + paletteShift + 0.45,
    vec3(0.01, 0.03, 0.01),
    vec3(0.02, 0.06, 0.02),
    vec3(0.3, 0.8, 0.4),
    vec3(0.1, 0.2, 0.15));

  vec3 bruiseColor = palette(f2 * 0.3 + paletteShift + 0.7,
    vec3(0.03, 0.01, 0.04),
    vec3(0.05, 0.02, 0.07),
    vec3(0.6, 0.3, 0.8),
    vec3(0.15, 0.1, 0.3));

  vec3 sulfurColor = palette(f3 * 0.3 + paletteShift + 0.15,
    vec3(0.03, 0.025, 0.005),
    vec3(0.05, 0.04, 0.01),
    vec3(0.8, 0.6, 0.2),
    vec3(0.05, 0.1, 0.2));

  // Composite fog
  vec3 color = baseColor;
  color = mix(color, denseColor, totalDensity * 0.6);
  color += toxicColor * toxicGlow;
  color += bruiseColor * bruiseGlow;
  color += sulfurColor * sulfurGlow;

  // Depth layers — parallax fog sheets
  float sheet1 = fbm(uv * 1.0 + t * 0.15) * 0.5 + 0.5;
  float sheet2 = fbm(uv * 0.7 - t * 0.1 + vec2(20.0)) * 0.5 + 0.5;
  float layering = sheet1 * 0.6 + sheet2 * 0.4;
  layering = smoothstep(0.3, 0.7, layering);
  color *= 0.6 + layering * 0.4;

  // Churning eddies — small-scale turbulence detail
  float eddy = snoise(uv * 12.0 + t * 0.5 + fog1 * 3.0);
  float eddyDetail = smoothstep(0.3, 0.8, eddy * 0.5 + 0.5);
  color += denseColor * eddyDetail * 0.03 * (0.5 + u_mid * 0.5);

  // Oppressive ceiling pressure — top is darker, pushing down
  float ceiling = smoothstep(-0.2, 0.5, uv.y);
  color *= 1.0 - ceiling * 0.3;

  // Bass: fog surges — density pulses
  float surge = sin(uv.y * 4.0 - t * 3.0) * 0.5 + 0.5;
  surge = pow(surge, 3.0) * u_bass * 0.08;
  color += bruiseColor * surge;

  // Barely perceptible movement of the toxic glow
  float glowPulse = sin(t * 1.5 + fog1 * 6.28) * 0.5 + 0.5;
  color += toxicColor * glowPulse * 0.02 * u_amplitude;

  // Vignette — heavy, the fog is thickest at edges
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.2, 1.2, vd);
  vignette = pow(vignette, 1.5);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
