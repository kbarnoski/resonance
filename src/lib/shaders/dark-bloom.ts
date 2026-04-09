import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark Bloom — a single flower opening in darkness.
// Deep red/burgundy petals with lighter edges, slow rotation.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // Slow rotation of entire flower
  float rot = t * 0.3;
  vec2 ruv = rot2(rot) * uv;

  // Polar coordinates
  float r = length(ruv);
  float a = atan(ruv.y, ruv.x);

  // ── Bloom animation — flower opens over time ──
  float bloomPhase = sin(t * 0.5) * 0.5 + 0.5; // 0..1 pulsing open/close
  float bloomRadius = 0.15 + bloomPhase * 0.25 + u_bass * 0.05;

  // ── Petal layers — overlapping curved shapes ──
  float petals = 0.0;
  float petalEdge = 0.0;

  // Layer 1: 5 outer petals
  float p1Angle = a * 5.0;
  float p1Shape = sin(p1Angle + r * 8.0 - t * 1.2) * 0.5 + 0.5;
  float p1Radius = bloomRadius + p1Shape * 0.18;
  float p1 = smoothstep(p1Radius, p1Radius - 0.06, r);
  float p1Edge = smoothstep(p1Radius, p1Radius - 0.015, r) - smoothstep(p1Radius - 0.015, p1Radius - 0.04, r);
  petals += p1;
  petalEdge += p1Edge;

  // Layer 2: 7 middle petals, slightly smaller, offset angle
  float p2Angle = a * 7.0 + 1.2;
  float p2Shape = sin(p2Angle + r * 6.0 - t * 0.9) * 0.5 + 0.5;
  float p2Radius = bloomRadius * 0.75 + p2Shape * 0.14;
  float p2 = smoothstep(p2Radius, p2Radius - 0.05, r);
  float p2Edge = smoothstep(p2Radius, p2Radius - 0.012, r) - smoothstep(p2Radius - 0.012, p2Radius - 0.035, r);
  petals += p2 * 0.8;
  petalEdge += p2Edge * 0.9;

  // Layer 3: 4 inner petals, tight
  float p3Angle = a * 4.0 + 2.5;
  float p3Shape = sin(p3Angle + r * 10.0 - t * 1.5) * 0.5 + 0.5;
  float p3Radius = bloomRadius * 0.45 + p3Shape * 0.1;
  float p3 = smoothstep(p3Radius, p3Radius - 0.04, r);
  float p3Edge = smoothstep(p3Radius, p3Radius - 0.01, r) - smoothstep(p3Radius - 0.01, p3Radius - 0.03, r);
  petals += p3 * 0.6;
  petalEdge += p3Edge * 0.8;

  // Clamp combined petals
  petals = clamp(petals, 0.0, 1.0);
  petalEdge = clamp(petalEdge, 0.0, 1.0);

  // ── Petal surface texture — subtle veining ──
  float vein = abs(sin(a * 12.0 + r * 20.0 + fbm3(ruv * 5.0) * 3.0));
  vein = smoothstep(0.0, 0.3, vein);
  float veinDetail = vein * 0.15;

  // ── Center — flower pistil, golden-dark glow ──
  float center = smoothstep(0.08, 0.02, r);
  float centerRing = smoothstep(0.1, 0.07, r) * smoothstep(0.04, 0.07, r);

  // ── Colors ──
  // Deep burgundy/red petal body
  vec3 petalColor = palette(
    petals * 0.5 + a * 0.05 + u_amplitude * 0.1,
    vec3(0.12, 0.02, 0.03),
    vec3(0.10, 0.03, 0.04),
    vec3(0.8, 0.3, 0.4),
    vec3(0.0, 0.1, 0.15)
  );

  // Lighter petal edges — rose/pink highlights
  vec3 edgeColor = palette(
    petalEdge * 2.0 + t * 0.1,
    vec3(0.25, 0.08, 0.10),
    vec3(0.15, 0.06, 0.08),
    vec3(0.9, 0.4, 0.5),
    vec3(0.05, 0.1, 0.2)
  );

  // Golden center
  vec3 centerColor = vec3(0.20, 0.12, 0.03);

  // ── Background — very dark with subtle warm tone ──
  vec3 bgColor = vec3(0.012, 0.008, 0.015);
  // Faint radial glow behind flower
  float bgGlow = exp(-r * 3.0) * 0.03;
  bgColor += vec3(0.06, 0.01, 0.02) * bgGlow;

  // ── Compositing ──
  vec3 color = bgColor;

  // Petals
  vec3 petalFull = petalColor * (0.7 + veinDetail);
  color = mix(color, petalFull, petals * 0.9);

  // Lighter edges on top
  color += edgeColor * petalEdge * 0.35;

  // Center ring — darker rim around pistil
  color = mix(color, vec3(0.06, 0.02, 0.02), centerRing * 0.5);

  // Pistil center
  color = mix(color, centerColor, center);
  color += vec3(0.08, 0.05, 0.01) * center * (0.8 + u_mid * 0.4);

  // Subtle pollen dust — treble driven
  float dust = pow(fract(snoise(ruv * 15.0 + t) * 5.0), 10.0);
  color += vec3(0.15, 0.10, 0.03) * dust * petals * u_treble * 0.4;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
