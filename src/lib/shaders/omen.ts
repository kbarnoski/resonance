import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Omen — foreboding symbols, slowly rotating dark portents

float symbolRing(vec2 p, float radius, float thickness) {
  return abs(length(p) - radius) - thickness;
}

float symbolLine(vec2 p, vec2 a, vec2 b, float thickness) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - thickness;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // Multiple rotating symbol layers
  float symbols = 1e6;

  // Outer ring — slowly rotating
  vec2 outerP = rot2(t * 0.15) * uv;
  float outerRing = symbolRing(outerP, 0.55 + u_bass * 0.05, 0.008);
  symbols = min(symbols, outerRing);

  // Inner ring — counter-rotating
  vec2 innerP = rot2(-t * 0.2) * uv;
  float innerRing = symbolRing(innerP, 0.3 + u_mid * 0.03, 0.006);
  symbols = min(symbols, innerRing);

  // Radial lines from center — like clock hands or compass points
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7854 + t * 0.1;
    vec2 dir = vec2(cos(angle), sin(angle));
    float line = symbolLine(uv, dir * 0.15, dir * 0.45, 0.003);
    symbols = min(symbols, line);
  }

  // Arcane triangle — rotating opposite
  vec2 triP = rot2(t * 0.12 + 1.0) * uv;
  for (int i = 0; i < 3; i++) {
    float a1 = float(i) * 2.094;
    float a2 = float(i + 1) * 2.094;
    vec2 p1 = vec2(cos(a1), sin(a1)) * 0.4;
    vec2 p2 = vec2(cos(a2), sin(a2)) * 0.4;
    float edge = symbolLine(triP, p1, p2, 0.004);
    symbols = min(symbols, edge);
  }

  // Small dots at intersections
  for (int i = 0; i < 6; i++) {
    float angle = float(i) * 1.047 + t * 0.08;
    vec2 dotPos = vec2(cos(angle), sin(angle)) * 0.42;
    float dot_ = length(uv - dotPos) - 0.012;
    symbols = min(symbols, dot_);
  }

  // Symbol glow
  float symbolGlow = exp(-max(symbols, 0.0) * 25.0) * 0.12;
  float symbolMid = exp(-max(symbols, 0.0) * 8.0) * 0.06;
  float symbolOuter = exp(-max(symbols, 0.0) * 2.5) * 0.03;

  // Background: deep darkness with subtle noise fog
  float fog = fbm(uv * 2.0 + t * 0.05) * 0.5 + 0.5;
  fog = pow(fog, 2.0) * 0.03;

  vec3 bgColor = palette(0.8,
    vec3(0.004, 0.004, 0.006),
    vec3(0.008, 0.006, 0.012),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.4, 0.65));

  // Symbol colors: ominous deep red-amber
  vec3 glyphColor = palette(0.08 + u_amplitude * 0.15,
    vec3(0.03, 0.01, 0.005),
    vec3(0.06, 0.02, 0.01),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.25));

  vec3 auraColor = palette(0.15 + u_mid * 0.1,
    vec3(0.015, 0.008, 0.005),
    vec3(0.03, 0.015, 0.008),
    vec3(1.0, 1.0, 1.0),
    vec3(0.05, 0.15, 0.3));

  // Compose
  vec3 color = bgColor + bgColor * fog;
  color += glyphColor * symbolGlow * (1.0 + u_bass * 1.0);
  color += auraColor * symbolMid * (1.0 + u_mid * 0.6);
  color += auraColor * symbolOuter;

  // Pulsing dread — symbols throb with bass
  float throb = sin(t * 2.0) * 0.5 + 0.5;
  color += glyphColor * symbolGlow * throb * u_bass * 0.05;

  // Treble: fine interference around symbols
  float interference = snoise(uv * 25.0 + t * 2.0);
  float intMask = exp(-max(symbols, 0.0) * 4.0);
  color += glyphColor * smoothstep(0.6, 0.9, interference) * intMask * u_treble * 0.03;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
