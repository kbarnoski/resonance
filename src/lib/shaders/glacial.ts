import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Glacial — Deep ice field with glowing blue crevasses and crystalline refractive surface

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Crystal facet pattern — voronoi-like ridges
float crystalRidge(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.5 * sin(u_time * 0.08 + 6.28 * fract(
        sin(vec2(dot(i + g, vec2(127.1, 311.7)), dot(i + g, vec2(269.5, 183.3))))
        * 43758.5453));
      float d = length(f - g - o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // Slow glacial drift
  vec2 drift = vec2(t * 0.3, t * 0.15);

  // Ice surface — layered noise for frozen terrain
  vec2 iceUV = uv * 2.5 + drift;
  float terrain = fbm3(iceUV);
  float terrain2 = fbm3(iceUV * 1.8 + vec2(50.0));

  // Crevasse detection — deep valleys in the terrain
  float crevasse = smoothstep(0.05, -0.15, terrain * 0.6 + terrain2 * 0.4);
  crevasse *= (0.7 + u_bass * 0.5);

  // Crystal structure on the surface
  vec2 crystalUV = uv * 4.0 + drift * 0.5;
  crystalUV = rot2(t * 0.1) * crystalUV;
  float crystal = crystalRidge(crystalUV);
  float crystalEdge = smoothstep(0.02, 0.12, crystal);

  // Second crystal layer — finer detail
  float crystal2 = crystalRidge(crystalUV * 2.2 + vec2(30.0));
  float crystalFine = smoothstep(0.03, 0.1, crystal2);

  // Subsurface light — deep blue glow from within the ice
  float subsurface = fbm3(uv * 1.2 + vec2(t * 0.5, t * 0.2));
  subsurface = 0.5 + 0.5 * subsurface;
  subsurface *= (0.6 + u_mid * 0.5);

  // Refraction shimmer on surface
  float shimmer = snoise(uv * 12.0 + vec2(t * 2.0));
  shimmer = pow(max(shimmer, 0.0), 3.0) * u_treble * 0.4;

  // ── Color ──
  // Deep ice body — blue-white
  vec3 iceDeep = palette(
    subsurface * 0.3 + t * 0.05,
    vec3(0.08, 0.15, 0.28),
    vec3(0.12, 0.18, 0.30),
    vec3(0.4, 0.6, 1.0),
    vec3(0.10, 0.20, 0.40)
  );

  // Surface ice — pale crystalline
  vec3 iceSurface = palette(
    terrain * 0.2 + crystal * 0.3 + t * 0.03,
    vec3(0.45, 0.55, 0.65),
    vec3(0.20, 0.22, 0.30),
    vec3(0.5, 0.7, 1.0),
    vec3(0.15, 0.25, 0.45)
  );

  // Crevasse glow — intense deep blue
  vec3 crevasseColor = palette(
    crevasse * 0.5 + t * 0.1 + u_amplitude * 0.2,
    vec3(0.05, 0.12, 0.40),
    vec3(0.10, 0.20, 0.50),
    vec3(0.3, 0.5, 1.0),
    vec3(0.10, 0.15, 0.45)
  );

  // Combine layers
  vec3 color = iceSurface;

  // Crystal edge highlights
  color = mix(color, iceDeep, (1.0 - crystalEdge) * 0.4);
  color = mix(color, iceSurface * 1.2, (1.0 - crystalFine) * 0.2);

  // Subsurface glow
  color = mix(color, iceDeep, subsurface * 0.3);

  // Crevasse glow overlay
  color = mix(color, crevasseColor, crevasse * 0.8);

  // Refraction shimmer on surface
  color += vec3(0.5, 0.7, 1.0) * shimmer;

  // Subtle sparkle on crystal edges
  float sparkle = pow(max(1.0 - crystal, 0.0), 12.0) * u_treble;
  color += vec3(0.6, 0.8, 1.0) * sparkle * 0.3;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
