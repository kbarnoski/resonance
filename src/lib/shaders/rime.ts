import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Rime — Frost forming on a surface in real-time, crystalline growth patterns

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Branching crystal growth — radial patterns
float crystalGrowth(vec2 p, float time) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Six-fold symmetry (ice crystals)
  float sym = abs(sin(a * 3.0 + time * 0.2));

  // Growth front — expands outward over time
  float front = sin(time * 0.5) * 0.5 + 0.8;
  float growth = smoothstep(front + 0.1, front - 0.05, r * sym * 0.8);

  // Dendrite branches
  float branch = sin(a * 6.0 + r * 8.0 - time * 0.4) * 0.5 + 0.5;
  branch *= smoothstep(0.0, 0.4, r);

  return growth * (0.6 + branch * 0.4);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Multiple crystal growth centers
  float frost = 0.0;

  // Primary crystal — center
  vec2 c1 = vec2(sin(t * 0.3) * 0.1, cos(t * 0.25) * 0.08);
  frost += crystalGrowth(rot2(t * 0.1) * (uv - c1) * 1.8, t * 3.0);

  // Secondary crystals — offset
  vec2 c2 = vec2(-0.35, 0.2) + vec2(sin(t * 0.2) * 0.05);
  frost += crystalGrowth(rot2(-t * 0.15) * (uv - c2) * 2.2, t * 3.0 + 2.0) * 0.7;

  vec2 c3 = vec2(0.3, -0.25) + vec2(cos(t * 0.18) * 0.04);
  frost += crystalGrowth(rot2(t * 0.12) * (uv - c3) * 2.5, t * 3.0 + 4.0) * 0.5;

  frost = clamp(frost, 0.0, 1.0);
  frost *= (0.7 + u_bass * 0.4);

  // Surface texture — the cold glass/surface beneath
  float surface = fbm3(uv * 4.0 + vec2(t * 0.1));
  float surfaceDetail = snoise(uv * 12.0 + vec2(t * 0.3));

  // Frost edge glow — where crystal is actively growing
  float frostEdge = smoothstep(0.3, 0.5, frost) - smoothstep(0.5, 0.7, frost);
  frostEdge *= (0.6 + u_mid * 0.6);

  // Ice refraction shimmer on frost
  float shimmer = snoise(uv * 15.0 + vec2(t * 1.5, t * 0.8));
  shimmer = pow(max(shimmer, 0.0), 4.0) * frost * u_treble * 0.5;

  // Condensation droplets on unfrosted areas
  float drops = snoise(uv * 18.0 + vec2(3.0, 7.0));
  drops = pow(max(drops, 0.0), 6.0) * (1.0 - frost) * 0.4;

  // ── Color ──
  // Cold surface — dark blue-grey
  vec3 surfaceColor = palette(
    surface * 0.2 + t * 0.03,
    vec3(0.06, 0.08, 0.14),
    vec3(0.05, 0.07, 0.12),
    vec3(0.4, 0.5, 0.7),
    vec3(0.10, 0.15, 0.28)
  );

  // Frost body — translucent white-blue
  vec3 frostColor = palette(
    frost * 0.3 + surface * 0.1 + t * 0.04,
    vec3(0.40, 0.48, 0.58),
    vec3(0.20, 0.24, 0.30),
    vec3(0.5, 0.7, 1.0),
    vec3(0.18, 0.25, 0.42)
  );

  // Growing edge — bright cyan-white
  vec3 edgeColor = palette(
    frostEdge + t * 0.1 + u_amplitude * 0.2,
    vec3(0.50, 0.65, 0.75),
    vec3(0.25, 0.30, 0.35),
    vec3(0.6, 0.8, 1.0),
    vec3(0.12, 0.22, 0.40)
  );

  // Combine
  vec3 color = surfaceColor;

  // Surface texture detail
  color += surfaceColor * surfaceDetail * 0.08;

  // Frost overlay
  color = mix(color, frostColor, frost * 0.8);

  // Growing edge highlight
  color = mix(color, edgeColor, frostEdge * 0.6);

  // Ice shimmer
  color += vec3(0.5, 0.7, 1.0) * shimmer;

  // Condensation drops
  color += vec3(0.3, 0.4, 0.5) * drops;

  // Subtle crystalline sparkle
  float sparkle = snoise(uv * 30.0 + vec2(t * 5.0));
  sparkle = pow(max(sparkle, 0.0), 10.0) * frost * u_treble * 0.4;
  color += vec3(0.7, 0.85, 1.0) * sparkle;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
