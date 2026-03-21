import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Convert to polar for concentric ring structure
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Organic distortion of rings
  float warpR = snoise(vec2(angle * 2.0, r * 3.0 + t * 0.1)) * 0.08;
  float warpA = snoise(vec2(r * 5.0, angle * 1.5 + t * 0.08)) * 0.15;
  float dr = r + warpR + sin(angle * 3.0 + t * 0.2) * 0.02;
  float da = angle + warpA;

  // Concentric ring layers — hair follicle cross section
  // Medulla (innermost)
  float medulla = smoothstep(0.08, 0.06, dr);

  // Cortex layer
  float cortexInner = smoothstep(0.06, 0.08, dr);
  float cortexOuter = smoothstep(0.25, 0.23, dr);
  float cortex = cortexInner * cortexOuter;

  // Cuticle layer — thin outer shell
  float cuticleInner = smoothstep(0.23, 0.26, dr);
  float cuticleOuter = smoothstep(0.32, 0.29, dr);
  float cuticle = cuticleInner * cuticleOuter;

  // Inner root sheath
  float irsInner = smoothstep(0.29, 0.33, dr);
  float irsOuter = smoothstep(0.45, 0.42, dr);
  float irs = irsInner * irsOuter;

  // Outer root sheath
  float orsInner = smoothstep(0.42, 0.46, dr);
  float orsOuter = smoothstep(0.62, 0.58, dr);
  float ors = orsInner * orsOuter;

  // Dermal papilla surrounding tissue
  float dermal = smoothstep(0.58, 0.63, dr);

  // Fiber texture in cortex — radial streaks
  float fibers = sin(da * 30.0 + snoise(vec2(dr * 20.0, da * 5.0)) * 3.0) * 0.5 + 0.5;
  fibers = pow(fibers, 2.0);

  // Melanin granules in cortex
  float melanin = pow(snoise(vec2(da * 8.0, dr * 25.0 + t * 0.1)) * 0.5 + 0.5, 3.0);

  // Colors
  vec3 medullaColor = palette(
    t * 0.02 + melanin * 0.3,
    vec3(0.25, 0.18, 0.12),
    vec3(0.15, 0.1, 0.07),
    vec3(0.5, 0.35, 0.2),
    vec3(0.0, 0.08, 0.05)
  );

  vec3 cortexColor = palette(
    fibers * 0.3 + da * 0.05 + t * 0.02,
    vec3(0.4, 0.28, 0.15),
    vec3(0.25, 0.18, 0.1),
    vec3(0.7, 0.5, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 cuticleColor = palette(
    da * 0.1 + t * 0.03,
    vec3(0.5, 0.4, 0.28),
    vec3(0.2, 0.15, 0.1),
    vec3(0.8, 0.6, 0.4),
    vec3(0.0, 0.08, 0.05)
  );

  vec3 irsColor = palette(
    dr * 0.5 + t * 0.02 + 0.2,
    vec3(0.55, 0.42, 0.38),
    vec3(0.15, 0.1, 0.1),
    vec3(0.7, 0.55, 0.5),
    vec3(0.0, 0.1, 0.12)
  );

  vec3 orsColor = palette(
    dr * 0.4 + angle * 0.05 + t * 0.01,
    vec3(0.6, 0.48, 0.42),
    vec3(0.12, 0.1, 0.08),
    vec3(0.75, 0.6, 0.55),
    vec3(0.0, 0.08, 0.1)
  );

  vec3 dermalColor = palette(
    fbm(uv * 4.0 + t * 0.03) * 0.3 + 0.5,
    vec3(0.5, 0.38, 0.35),
    vec3(0.1, 0.08, 0.08),
    vec3(0.65, 0.5, 0.45),
    vec3(0.0, 0.1, 0.15)
  );

  // Compose rings
  vec3 color = dermalColor;
  color = mix(color, orsColor, ors);
  color = mix(color, irsColor, irs);
  color = mix(color, cuticleColor, cuticle);
  color = mix(color, cortexColor, cortex);
  color += cortexColor * fibers * cortex * 0.2;
  color += vec3(0.15, 0.08, 0.03) * melanin * cortex * 0.3;
  color = mix(color, medullaColor, medulla);

  // Growth pulse — bass pushes outward
  float growPulse = sin(dr * 30.0 - t * 3.0) * 0.5 + 0.5;
  growPulse = pow(growPulse, 5.0);
  color += cortexColor * growPulse * u_bass * 0.25;

  // Ring boundary glow — mid reactive
  float boundaries = pow(sin(dr * 50.0) * 0.5 + 0.5, 8.0);
  color += vec3(0.4, 0.25, 0.15) * boundaries * u_mid * 0.2;

  // Keratin shimmer — treble
  float shimmer = pow(snoise(vec2(da * 15.0, dr * 30.0) + t * 1.5) * 0.5 + 0.5, 8.0);
  color += vec3(0.6, 0.45, 0.3) * shimmer * u_treble * 0.3;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
