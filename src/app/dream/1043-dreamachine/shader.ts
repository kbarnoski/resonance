// ════════════════════════════════════════════════════════════════════════════
// shader.ts — the GANZFELD FIELD renderer (WebGL2 GLSL ES 3.00).
//
// This screen does NOT draw the hallucination. It provides the two ingredients
// the visual cortex needs to manufacture Klüver form constants on its own:
//   (1) a UNIFORM, unstructured, soft field (Ganzfeld) — full-viewport warm
//       color with imperceptibly slow value-noise color-drift + a soft vignette,
//   (2) a gentle whole-field LUMINANCE pulse (the safe-photic stimulus), passed
//       in as uLevel from flicker.ts (already ≤3 Hz, soft-sine, low contrast).
//
// Plus: animated blue-noise "visual snow" grain at very low alpha, and an
// OPTIONAL, deliberately faint form-constant HINT (breathing concentric rings /
// radial spokes / hex) at uHint opacity — a scaffold, never the picture. The
// brain does the rest. No hard edges, no high contrast.
// ════════════════════════════════════════════════════════════════════════════

export const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uLevel;   // 0..1 luminance multiplier from the safe-flicker engine
uniform float uField;   // 0..1 arc baseline brightness lift
uniform float uHint;    // 0..1 form-constant scaffold opacity (faint)
uniform float uGrain;   // visual-snow alpha
uniform float uHue;     // slow warm hue drift 0..1

const float TAU = 6.28318530718;

// smooth value noise for imperceptibly slow color drift (no hard structure)
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// a warm, low-saturation field color that drifts slowly through ember/violet
vec3 fieldColor(float t) {
  vec3 a = vec3(0.42, 0.30, 0.34);
  vec3 b = vec3(0.22, 0.16, 0.20);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.12, 0.30);
  return a + b * cos(TAU * (c * t + d));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(uv);
  float theta = atan(uv.y, uv.x);

  // ---- uniform field with imperceptibly slow color drift ----
  float n = vnoise(uv * 1.3 + uTime * 0.012);
  float driftHue = uHue + n * 0.06;
  vec3 base = fieldColor(driftHue);

  // ---- soft radial vignette / falloff (frames the field, no hard edge) ----
  float vig = smoothstep(1.25, 0.1, r);
  base *= mix(0.55, 1.0, vig);

  // ---- VERY faint form-constant hint scaffold (breathing), if uHint > 0 ----
  // concentric rings (tunnel) + radial spokes (funnel) crossfaded slowly so the
  // scaffold itself morphs through the constants. Kept low-contrast & low-alpha.
  if (uHint > 0.001) {
    float breath = 0.5 + 0.5 * sin(uTime * 0.25);
    float rings = 0.5 + 0.5 * sin(r * 16.0 - uTime * 0.4);
    float spokes = 0.5 + 0.5 * sin(theta * 12.0 + uTime * 0.2);
    float hex = 0.5 + 0.5 * sin(uv.x * 18.0) * sin(uv.y * 18.0 + uTime * 0.15);
    float scaffold = mix(rings, spokes, breath);
    scaffold = mix(scaffold, hex, 0.35);
    // soften and fade toward the rim so the center stays the focus
    scaffold = (scaffold - 0.5) * vig;
    base += scaffold * 0.04 * uHint;
  }

  // ---- the safe-photic luminance pulse: soft whole-field multiply ----
  // uLevel eases between (1 - depth) and 1 as a sine; never a hard strobe.
  vec3 col = base * (uField + 0.4) * uLevel;

  // ---- blue-noise visual-snow grain at very low alpha ----
  float g = hash(frag + fract(uTime) * 91.7);
  col += (g - 0.5) * uGrain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
