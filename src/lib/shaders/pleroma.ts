import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Fullness of divine light: dense luminous field with internal structure,
// overlapping radiance creating a fabric of pure presence.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Dense domain-warped light field — the "fullness"
  vec2 warp1 = vec2(
    snoise(uv * 2.0 + vec2(t * 0.2, 0.0)),
    snoise(uv * 2.0 + vec2(0.0, t * 0.15 + 5.0))
  ) * 0.4;

  vec2 warp2 = vec2(
    snoise((uv + warp1) * 2.5 + vec2(t * 0.1 + 2.0, 3.0)),
    snoise((uv + warp1) * 2.5 + vec2(1.0, t * 0.12 + 4.0))
  ) * 0.3;

  vec2 warped = uv + warp1 + warp2;

  // Primary light density field — 3-octave fbm
  float density = 0.0;
  float amp = 0.5;
  vec2 p = warped * 3.0;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    density += amp * snoise(p);
    p = m * p * 2.0;
    amp *= 0.5;
  }
  density = density * 0.5 + 0.5; // normalize to 0-1

  // Internal structure — veins of brighter light within the density
  float veins = snoise(warped * 8.0 + t * 0.3);
  veins = smoothstep(0.3, 0.5, abs(veins)) * 0.4;

  // Cellular internal structure — bright nodal points
  float nodes = snoise(warped * 5.0 + vec2(t * 0.15, -t * 0.2));
  nodes = pow(max(nodes, 0.0), 3.0) * 0.6;

  // Pulsing brightness waves
  float pulse = sin(length(warped) * 10.0 - t * 3.0 + u_bass * 3.0);
  pulse = smoothstep(0.2, 0.8, pulse * 0.5 + 0.5) * 0.2;

  // Multi-layered palette — dense warm light
  vec3 baseCol = palette(
    density * 0.8 + paletteShift,
    vec3(0.6, 0.5, 0.35),
    vec3(0.4, 0.35, 0.3),
    vec3(1.0, 0.9, 0.6),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 veinCol = palette(
    veins * 2.0 + paletteShift + 0.3,
    vec3(0.7, 0.6, 0.45),
    vec3(0.3, 0.3, 0.25),
    vec3(1.0, 0.85, 0.55),
    vec3(0.05, 0.1, 0.25)
  );

  vec3 nodeCol = palette(
    nodes * 3.0 + paletteShift + 0.6,
    vec3(0.8, 0.75, 0.6),
    vec3(0.2, 0.2, 0.15),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.1)
  );

  // Compose — everything is luminous, just varying in intensity
  float baseBright = density * (0.5 + 0.3 * u_mid);
  color += baseCol * baseBright;
  color += veinCol * veins * (0.6 + 0.3 * u_treble);
  color += nodeCol * nodes * (0.5 + 0.5 * u_bass);
  color += baseCol * pulse;

  // Subtle violet undertone in the denser regions
  vec3 deepCol = palette(
    density * 0.5 + paletteShift + 0.8,
    vec3(0.4, 0.3, 0.5),
    vec3(0.3, 0.2, 0.4),
    vec3(0.6, 0.8, 1.1),
    vec3(0.3, 0.1, 0.4)
  );
  color += deepCol * (1.0 - density) * 0.15;

  // Center is slightly brighter — the heart of fullness
  float centerBias = exp(-r * r * 3.0) * 0.2;
  color += nodeCol * centerBias;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
