import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Shield mandala: multiple defensive ring layers

  // Outer defense ring — thick with angular notches
  float outerR = 0.6 + u_bass * 0.04;
  float outerRing = abs(sdCircle(uv, outerR)) - 0.02;
  // Notch pattern on outer ring
  float notches = sin(a * 16.0 + t * 0.5) * 0.5 + 0.5;
  notches = step(0.6, notches);
  float outerWithNotch = outerRing + notches * 0.01;
  float outerGlow = smoothstep(0.02, 0.0, abs(outerWithNotch));

  // Kaleidoscopic fold for inner patterns — 8-fold symmetry
  float foldA = mod(a, 0.7854);
  foldA = abs(foldA - 0.3927);
  vec2 foldP = vec2(cos(foldA), sin(foldA)) * r;

  // Second ring with geometric pattern
  float midR = 0.42 + u_mid * 0.03;
  float midRing = abs(sdCircle(uv, midR)) - 0.012;
  float midGlow = smoothstep(0.015, 0.0, abs(midRing));

  // Shield segments between rings — interlocking plates
  float segAngle = mod(a + t * 0.2, 0.7854) - 0.3927;
  vec2 segUV = vec2(cos(segAngle), sin(segAngle)) * r;
  float segPlate = sdBox(segUV - vec2(0.51, 0.0), vec2(0.08, 0.03));
  float segGlow = smoothstep(0.01, 0.0, abs(segPlate));
  segGlow *= smoothstep(outerR + 0.02, outerR - 0.02, r) * smoothstep(midR - 0.02, midR + 0.02, r);

  // Inner defense — rotating geometric ward
  vec2 wardUV = rot2(t * 0.6) * uv;
  float ward = sdBox(wardUV, vec2(0.25 + u_bass * 0.02));
  float wardRot = sdBox(rot2(0.7854 + t * 0.4) * uv, vec2(0.22));
  float wardPattern = max(-ward, wardRot); // Intersection
  float wardEdge = smoothstep(0.01, 0.0, abs(wardPattern));

  // Inner circle
  float innerR = 0.18;
  float innerRing = abs(sdCircle(uv, innerR)) - 0.006;
  float innerGlow = smoothstep(0.01, 0.0, abs(innerRing));

  // Central emblem — small star
  float emblem = 0.0;
  for (int i = 0; i < 6; i++) {
    float ea = float(i) * 1.0472 + t * 0.8;
    vec2 ep1 = vec2(cos(ea), sin(ea)) * 0.1;
    vec2 ep2 = vec2(cos(ea + 0.5236), sin(ea + 0.5236)) * 0.04;
    emblem += smoothstep(0.005, 0.0, sdLine(uv, ep1, ep2) - 0.002);
  }

  // Deflection ripples — expanding rings triggered by bass
  float ripple1 = abs(r - mod(t * 0.5, 0.8)) - 0.005;
  float ripple1Glow = smoothstep(0.01, 0.0, abs(ripple1)) * 0.5;
  float ripple2 = abs(r - mod(t * 0.5 + 0.4, 0.8)) - 0.005;
  float ripple2Glow = smoothstep(0.01, 0.0, abs(ripple2)) * 0.3;

  // Protective aura — FBM hex pattern
  float hexNoise = fbm(rot2(t * 0.1) * uv * 8.0);
  float auraMask = smoothstep(outerR + 0.15, outerR, r) * smoothstep(outerR - 0.05, outerR, r);

  // Angular tick marks between folds
  float ticks = 0.0;
  for (int i = 0; i < 8; i++) {
    float tickA = float(i) * 0.7854 + t * 0.1;
    vec2 tickStart = vec2(cos(tickA), sin(tickA)) * midR;
    vec2 tickEnd = vec2(cos(tickA), sin(tickA)) * outerR;
    ticks += smoothstep(0.005, 0.0, sdLine(uv, tickStart, tickEnd) - 0.002);
  }

  // Steel / platinum palette
  vec3 col1 = palette(
    r * 2.0 + paletteShift,
    vec3(0.55, 0.55, 0.6),
    vec3(0.35, 0.35, 0.4),
    vec3(0.7, 0.7, 0.85),
    vec3(0.2, 0.25, 0.35)
  );

  // Bronze / copper accent
  vec3 col2 = palette(
    a / 6.28 + paletteShift + 0.3,
    vec3(0.55, 0.45, 0.3),
    vec3(0.4, 0.3, 0.2),
    vec3(0.9, 0.7, 0.4),
    vec3(0.0, 0.1, 0.15)
  );

  // Electric protective blue
  vec3 col3 = palette(
    hexNoise + t + paletteShift + 0.6,
    vec3(0.4, 0.5, 0.7),
    vec3(0.4, 0.5, 0.5),
    vec3(0.4, 0.7, 1.0),
    vec3(0.2, 0.3, 0.5)
  );

  vec3 color = vec3(0.0);

  // Outer ring
  color += col1 * outerGlow * 1.5 * (0.8 + u_bass * 0.5);

  // Shield segments
  color += col2 * segGlow * 1.0 * (0.6 + u_mid * 0.4);

  // Tick marks
  color += col1 * ticks * 0.8;

  // Mid ring
  color += col1 * midGlow * 1.2;

  // Geometric ward
  color += col3 * wardEdge * 1.0 * (0.7 + u_treble * 0.5);

  // Inner ring
  color += col2 * innerGlow * 1.0;

  // Central emblem
  color += col2 * emblem * 1.5 * (0.5 + u_amplitude * 0.5);

  // Deflection ripples
  color += col3 * (ripple1Glow + ripple2Glow) * u_bass;

  // Protective aura
  color += col3 * auraMask * abs(hexNoise) * 0.4;

  // Emissive highlights
  float hotSpots = outerGlow * midGlow;
  color += vec3(1.3, 1.3, 1.5) * hotSpots * 3.0;

  // Core glow
  float core = exp(-r * 5.0);
  color += col3 * core * 0.3 * (1.0 + u_amplitude * 0.3);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
