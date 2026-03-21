import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Primary aureole ring — luminous golden halo
  float haloRadius = 0.4 + u_bass * 0.05;
  float haloWidth = 0.08 + u_mid * 0.03;
  float haloDist = abs(r - haloRadius) - haloWidth;
  float haloGlow = exp(-max(haloDist, 0.0) * 15.0);

  // Soft inner halo
  float innerHalo = exp(-max(abs(r - haloRadius * 0.6) - 0.04, 0.0) * 20.0);

  // Radiant beams emanating outward — divine light rays
  float numRays = 24.0;
  float rayAngle = mod(a + t * 0.3, 6.28318 / numRays) - 3.14159 / numRays;
  float rayWidth = 0.015 + 0.01 * sin(a * 5.0 + t);
  float rays = exp(-abs(rayAngle) / rayWidth) * smoothstep(haloRadius * 0.5, haloRadius * 1.5, r);
  rays *= smoothstep(1.5, haloRadius + 0.1, r);

  // Secondary fine rays
  float fineRays = pow(abs(sin(a * 48.0 + t * 0.5)), 30.0);
  fineRays *= smoothstep(haloRadius - 0.1, haloRadius + 0.3, r);
  fineRays *= smoothstep(1.2, haloRadius + 0.1, r);

  // Luminous atmospheric glow — exponential falloff from center
  float centerGlow = exp(-r * 2.5);
  float midGlow = exp(-r * r * 4.0);

  // Scintillation — sparkling particles in the halo
  vec2 sparkUV = rot2(t * 0.5) * uv;
  float sparkle = snoise(sparkUV * 30.0 + t * 2.0);
  sparkle = smoothstep(0.7, 0.9, sparkle);
  sparkle *= smoothstep(0.1, haloRadius, r) * smoothstep(haloRadius + 0.2, haloRadius, r);

  // Warm atmospheric noise
  float n1 = fbm(uv * 3.0 + t * 0.15);
  float n2 = fbm(uv * 6.0 - t * 0.1);

  // Concentric glow rings — like heat shimmer
  float shimmer = sin(r * 50.0 - t * 1.5 + n1 * 3.0);
  shimmer = smoothstep(0.6, 1.0, shimmer) * 0.3;
  shimmer *= smoothstep(0.1, haloRadius * 0.8, r) * smoothstep(haloRadius * 1.3, haloRadius, r);

  // Divine golden palette
  vec3 col1 = palette(
    r * 1.5 + paletteShift,
    vec3(0.7, 0.6, 0.3),
    vec3(0.4, 0.35, 0.2),
    vec3(1.0, 0.85, 0.4),
    vec3(0.0, 0.05, 0.1)
  );

  // Warm white-gold for the bright core
  vec3 col2 = palette(
    centerGlow * 2.0 + paletteShift + 0.2,
    vec3(0.9, 0.85, 0.7),
    vec3(0.2, 0.2, 0.15),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.02, 0.05)
  );

  // Amber / rose for atmospheric effects
  vec3 col3 = palette(
    a / 6.28 + t * 0.1 + paletteShift + 0.4,
    vec3(0.6, 0.45, 0.35),
    vec3(0.4, 0.3, 0.25),
    vec3(1.0, 0.7, 0.5),
    vec3(0.0, 0.1, 0.15)
  );

  vec3 color = vec3(0.0);

  // Central luminous glow — the brightest region
  color += col2 * centerGlow * 1.5 * (1.0 + u_amplitude * 0.3);
  color += col2 * midGlow * 0.8;

  // Primary halo ring
  color += col1 * haloGlow * 1.8 * (0.8 + u_bass * 0.5);

  // Inner halo
  color += col3 * innerHalo * 0.6 * (0.7 + u_mid * 0.4);

  // Divine light rays
  color += col1 * rays * 0.8 * (0.6 + u_treble * 0.5);
  color += col2 * fineRays * 0.3 * u_treble;

  // Shimmer rings
  color += col3 * shimmer * (0.5 + u_mid * 0.5);

  // Scintillation
  color += vec3(1.4, 1.3, 1.0) * sparkle * 1.2 * u_treble;

  // Atmospheric FBM haze
  float haze = abs(n1) * smoothstep(1.0, 0.2, r);
  color += col3 * haze * 0.2;

  // Emissive white-hot center
  float hotCore = exp(-r * 8.0);
  color += vec3(1.5, 1.4, 1.2) * hotCore * 0.8;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
