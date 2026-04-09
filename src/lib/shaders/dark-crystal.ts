import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark Crystal — geometric crystal structure in darkness.
// Glowing edges of hexagons and triangles using SDF + exp(-d*k) glow.
// Purple/cyan edge lines, slow rotation, audio-reactive brightness.

// SDF for regular hexagon
float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

// SDF for equilateral triangle
float sdTriangle(vec2 p, float r) {
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// SDF for a line segment
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // ── Background — deep black with faint purple tint ──
  vec3 col = vec3(0.01, 0.008, 0.02);

  // Subtle background noise
  float bgNoise = snoise(uv * 3.0 + vec2(t * 0.2)) * 0.5 + 0.5;
  col += vec3(0.005, 0.003, 0.01) * bgNoise;

  // ── Crystal structure — centered, slowly rotating ──
  float rot = t * 0.3;
  mat2 m = rot2(rot);
  vec2 p = m * uv;

  float glow = 0.0;
  float colorVar = 0.0;

  // Central hexagon
  float hex1 = sdHexagon(p, 0.3);
  float hexGlow = exp(-abs(hex1) * 25.0) * 0.3;
  glow += hexGlow;
  colorVar += hexGlow * 0.5;

  // Inner hexagon — rotated
  vec2 p2 = rot2(rot * 0.5 + 0.5) * uv;
  float hex2 = sdHexagon(p2, 0.15);
  float hex2Glow = exp(-abs(hex2) * 30.0) * 0.25;
  glow += hex2Glow;
  colorVar += hex2Glow * 0.8;

  // Outer hexagon — counter-rotating
  vec2 p3 = rot2(-rot * 0.2) * uv;
  float hex3 = sdHexagon(p3, 0.5);
  float hex3Glow = exp(-abs(hex3) * 18.0) * 0.2;
  glow += hex3Glow;
  colorVar += hex3Glow * 0.2;

  // Triangles — 3 positioned around center, rotating
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float angle = fi * 2.0943951 + rot * 0.7; // 120 degrees apart
    vec2 triCenter = vec2(cos(angle), sin(angle)) * 0.22;
    vec2 tp = rot2(rot * 0.4 + fi) * (uv - triCenter);
    float tri = sdTriangle(tp, 0.08);
    float triGlow = exp(-abs(tri) * 35.0) * 0.2;
    glow += triGlow;
    colorVar += triGlow * (0.3 + fi * 0.3);
  }

  // Connecting lines — crystal lattice edges
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a1 = fi * 1.0471976 + rot * 0.3; // 60 degrees
    float a2 = a1 + 1.0471976;

    // Lines from center to outer hexagon vertices
    vec2 from = vec2(0.0);
    vec2 to = vec2(cos(a1), sin(a1)) * 0.5;
    float lineDist = sdSegment(uv, from, to);
    float lineGlow = exp(-lineDist * 20.0) * 0.1;
    glow += lineGlow;

    // Lines between outer hexagon vertices
    vec2 v1 = vec2(cos(a1), sin(a1)) * 0.5;
    vec2 v2 = vec2(cos(a2), sin(a2)) * 0.5;
    float edgeDist = sdSegment(uv, v1, v2);
    float edgeGlow = exp(-edgeDist * 22.0) * 0.08;
    glow += edgeGlow;
    colorVar += edgeGlow * 1.5;
  }

  // Audio reactivity — bass pulses the glow, treble sharpens edges
  glow *= 0.8 + u_bass * 0.35;
  float sharpness = 1.0 + u_treble * 0.5;
  glow = pow(glow, 1.0 / sharpness);

  // ── Color — purple to cyan gradient based on structure position ──
  vec3 crystalPurple = palette(
    colorVar * 2.0 + t * 0.2 + u_amplitude * 0.15,
    vec3(0.15, 0.06, 0.25),
    vec3(0.15, 0.10, 0.20),
    vec3(0.6, 0.4, 0.8),
    vec3(0.1, 0.2, 0.5)
  );

  vec3 crystalCyan = palette(
    colorVar * 2.0 + t * 0.2 + 0.4 + u_amplitude * 0.1,
    vec3(0.06, 0.15, 0.22),
    vec3(0.10, 0.18, 0.20),
    vec3(0.3, 0.7, 0.8),
    vec3(0.2, 0.3, 0.5)
  );

  // Blend between purple and cyan based on position angle
  float angleBlend = atan(uv.y, uv.x) / 6.28318 + 0.5;
  angleBlend = fract(angleBlend + t * 0.1);
  vec3 crystalColor = mix(crystalPurple, crystalCyan, angleBlend);

  // Apply glow to color
  col += crystalColor * glow;

  // ── Core point light — bright center dot ──
  float centerDist = length(uv);
  float centerGlow = exp(-centerDist * 12.0) * 0.06;
  float centerPulse = 0.7 + 0.3 * sin(t * 3.0);
  col += vec3(0.20, 0.12, 0.30) * centerGlow * centerPulse * (0.8 + u_mid * 0.3);

  // ── Faint refraction sparkles — tiny highlights on vertices ──
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float angle = fi * 1.0471976 + rot * 0.3;
    vec2 vertex = vec2(cos(angle), sin(angle)) * 0.3;
    float vd = length(uv - vertex);
    float sparkle = exp(-vd * 40.0) * 0.08;
    float flicker = 0.5 + 0.5 * sin(t * 6.0 + fi * 2.5);
    col += mix(crystalPurple, crystalCyan, fi / 5.0) * sparkle * flicker;
  }

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  col *= vignette;

  col = clamp(col, 0.0, 0.4);

  gl_FragColor = vec4(col, 1.0);
}
`;
