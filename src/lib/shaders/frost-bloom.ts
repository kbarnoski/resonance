import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Frost Bloom — Ice crystals growing in fibonacci/branching patterns across a cold surface

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Crystal arm — a single branching arm of an ice crystal
float crystalArm(vec2 p, float angle, float time) {
  p = rot2(angle) * p;

  // Main axis
  float mainAxis = exp(-abs(p.y) * 25.0) * smoothstep(0.0, 0.01, p.x) * smoothstep(0.5 + sin(time) * 0.1, 0.0, p.x);

  // Sub-branches — angled off the main axis
  float branches = 0.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    float branchX = fi * 0.08;
    if (p.x > branchX - 0.01 && p.x < branchX + 0.15) {
      vec2 bp = p - vec2(branchX, 0.0);
      vec2 bp1 = rot2(0.5) * bp;
      vec2 bp2 = rot2(-0.5) * bp;
      branches += exp(-abs(bp1.y) * 40.0) * smoothstep(0.0, 0.005, bp1.x) * smoothstep(0.1, 0.0, bp1.x);
      branches += exp(-abs(bp2.y) * 40.0) * smoothstep(0.0, 0.005, bp2.x) * smoothstep(0.1, 0.0, bp2.x);
    }
  }

  return mainAxis + branches * 0.6;
}

// Full ice crystal — 6-fold symmetry
float iceCrystal(vec2 p, float time) {
  float crystal = 0.0;
  for (int i = 0; i < 6; i++) {
    float angle = float(i) * 1.0472; // PI/3
    crystal += crystalArm(p, angle, time);
  }
  return clamp(crystal, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // Growth animation — crystals expand over time
  float growthPhase = sin(t * 0.8) * 0.5 + 0.5;

  // Multiple crystal centers
  float frost = 0.0;

  // Primary crystal — center, largest
  vec2 c1 = vec2(sin(t * 0.2) * 0.05, cos(t * 0.15) * 0.04);
  float scale1 = 2.5 + growthPhase * 1.0;
  frost += iceCrystal((uv - c1) * scale1, t * 4.0) * 0.8;

  // Secondary crystals
  vec2 c2 = vec2(-0.3, 0.2);
  frost += iceCrystal((uv - c2) * 3.5, t * 4.0 + 1.0) * 0.5;

  vec2 c3 = vec2(0.25, -0.3);
  frost += iceCrystal((uv - c3) * 4.0, t * 4.0 + 2.5) * 0.4;

  vec2 c4 = vec2(0.35, 0.25);
  frost += iceCrystal((uv - c4) * 4.5, t * 4.0 + 4.0) * 0.35;

  frost = clamp(frost, 0.0, 1.0);
  frost *= (0.7 + u_bass * 0.4);

  // Background frost texture — fine crystalline noise
  float bgFrost = fbm3(uv * 6.0 + vec2(t * 0.2));
  bgFrost = smoothstep(0.0, 0.3, bgFrost) * 0.25;

  // Cold surface beneath
  float surface = fbm3(uv * 3.0 + vec2(t * 0.1));

  // Growing edge glow
  float edge = smoothstep(0.2, 0.4, frost) - smoothstep(0.4, 0.6, frost);
  edge *= (0.5 + u_mid * 0.6);

  // Sparkle on crystal facets
  float sparkle = snoise(uv * 25.0 + vec2(t * 3.0, t * 2.0));
  sparkle = pow(max(sparkle, 0.0), 8.0) * frost * u_treble * 0.5;

  // ── Color ──
  // Cold dark surface
  vec3 surfaceColor = palette(
    surface * 0.2 + t * 0.03,
    vec3(0.04, 0.05, 0.10),
    vec3(0.04, 0.06, 0.12),
    vec3(0.3, 0.4, 0.7),
    vec3(0.10, 0.14, 0.28)
  );

  // Crystal body — translucent ice blue
  vec3 crystalColor = palette(
    frost * 0.3 + bgFrost * 0.2 + t * 0.05,
    vec3(0.35, 0.45, 0.58),
    vec3(0.20, 0.25, 0.32),
    vec3(0.5, 0.7, 1.0),
    vec3(0.15, 0.25, 0.42)
  );

  // Growth edge — bright white-cyan
  vec3 edgeColor = palette(
    edge + t * 0.08 + u_amplitude * 0.2,
    vec3(0.55, 0.70, 0.80),
    vec3(0.25, 0.28, 0.35),
    vec3(0.6, 0.8, 1.0),
    vec3(0.10, 0.20, 0.38)
  );

  // Fibonacci spiral accent — golden angle placement
  float golden = snoise(rot2(2.399) * uv * 5.0 + vec2(t * 0.5));
  golden = smoothstep(0.2, 0.5, golden) * frost * 0.15;

  // Build
  vec3 color = surfaceColor;

  // Background frost
  color = mix(color, crystalColor * 0.5, bgFrost);

  // Crystal overlay
  color = mix(color, crystalColor, frost * 0.75);

  // Growth edge
  color = mix(color, edgeColor, edge * 0.5);

  // Golden accent
  color += crystalColor * golden;

  // Sparkle
  color += vec3(0.7, 0.85, 1.0) * sparkle;

  // Subtle inner glow
  float innerGlow = frost * (0.5 + 0.5 * sin(t * 2.0 + length(uv) * 5.0));
  color += crystalColor * innerGlow * 0.08;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
