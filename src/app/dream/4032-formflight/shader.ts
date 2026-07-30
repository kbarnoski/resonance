// ════════════════════════════════════════════════════════════════════════════
// 4032 — Formflight · fragment shader (WebGL2, GLSL ES 3.00)
//
// A single full-screen triangle drives a log-polar / form-constant warp. We do
// NOT re-derive the warp: we splice in the shared LOGPOLAR_GLSL engine and CALL
// its screenToCortex / formConstant / honeycomb / cortexToScreen. The audio's
// spectral CENTROID slides a point along the form-constant axis
// (tunnel → spoke → spiral → honeycomb) and we cross-blend the two neighbours,
// never hard-cut. Spectral FLUX injects an fBm domain-warp so the lattice melts
// (symmetry-loosening = "entropy rises at peak"). Loudness (RMS) drives
// saturation / neural gain. Jeweled iridescence + chromatic aberration live in
// the ART LAYER here — raw full-spectrum hue is allowed inside the canvas.
// ════════════════════════════════════════════════════════════════════════════

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

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
uniform float uForm;    // centroid -> position on the form axis [0..3]
uniform float uFlux;    // flux -> melt / symmetry-loosening [0..1]
uniform float uLevel;   // RMS -> saturation / neural gain [0..1]
uniform float uFreq;    // ring/spoke density
uniform float uPhase;   // integrated motion phase (flux modulates its speed)
uniform float uFlicker; // SafeFlicker luminance multiplier (CPU-clamped)

const float TAU = 6.28318530718;

// ---- shared form-constant / log-polar engine (do NOT rewrite the warp) ----
${LOGPOLAR_GLSL}

// value noise + small fBm, for the flux-driven melt (domain warp in cortex space)
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i + vec2(0.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    p = p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return s;
}

// jeweled iridescent cosine palette: a + b*cos(2pi*(c*t + d))
vec3 palette(float t) {
  vec3 a = vec3(0.55, 0.42, 0.62);
  vec3 b = vec3(0.48, 0.52, 0.48);
  vec3 c = vec3(1.0, 1.08, 1.22);
  vec3 d = vec3(0.00, 0.18, 0.42);
  return a + b * cos(TAU * (c * t + d));
}

// Evaluate the form-constant scalar field at cortical point c.
// axis in [0,3]: 0=tunnel, 1=spoke, 2=spiral, 3=honeycomb — cross-blend
// between the two adjacent constants (smooth, never a hard cut).
float formField(vec2 c, float freq, float phase, float axis) {
  float tunnel = formConstant(c, 0.0,        freq, phase); // phi 0    -> rings
  float spoke  = formConstant(c, 1.5707963,  freq, phase); // phi PI/2 -> spokes
  float spiral = formConstant(c, 0.7853981,  freq, phase); // phi PI/4 -> spiral
  float honey  = honeycomb(c, freq * 0.62, phase);          // hex lattice

  float v;
  if (axis < 1.0)      v = mix(tunnel, spoke,  smoothstep(0.0, 1.0, axis));
  else if (axis < 2.0) v = mix(spoke,  spiral, smoothstep(0.0, 1.0, axis - 1.0));
  else                 v = mix(spiral, honey,  smoothstep(0.0, 1.0, axis - 2.0));
  return v;
}

// Sample the field for one colour channel at a slightly offset radius
// (chromatic aberration). Returns the raw field in [0,1].
float sampleChannel(vec2 uv, float radialOffset, float freq, float phase, float axis) {
  vec2 p = uv * (1.0 + radialOffset);
  float r = length(p);
  if (r < 1e-4) return 0.5;

  // shared warp: screen -> cortex (log r, theta)
  vec2 c = screenToCortex(p);

  // flux-driven melt: fBm domain-warp in cortical space loosens the symmetry
  float melt = uFlux;
  vec2 w = vec2(
    fbm(c * 1.4 + vec2(0.0, uTime * 0.11)),
    fbm(c * 1.4 + vec2(9.2, -uTime * 0.09))
  ) - 0.5;
  c += w * melt * 1.7;

  return formField(c, freq, phase, axis);
}

void main() {
  // centered, aspect-normalized UV
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r0 = length(uv);

  // gentle inward radial pull (the "being drawn in" / tunnel vection feel),
  // amplitude rises a touch with loudness
  uv *= 1.0 + (0.05 + uLevel * 0.10) * sin(r0 * 7.0 - uTime * 1.3);

  float freq  = uFreq;
  float phase = uPhase;
  float axis  = clamp(uForm, 0.0, 3.0);

  // chromatic aberration: sample the field at 3 offset radii
  float ca = 0.006 + uLevel * 0.014 + uFlux * 0.012;
  float fr = sampleChannel(uv, -ca, freq, phase, axis);
  float fg = sampleChannel(uv,  0.0, freq, phase, axis);
  float fb = sampleChannel(uv,  ca, freq, phase, axis);

  // map fields -> iridescent palette (slow hue cycle + thin-film shift)
  float hue = uTime * 0.03 + uFlux * 0.22 + r0 * 0.15;
  vec3 col;
  col.r = palette(fr + hue + 0.00).r;
  col.g = palette(fg + hue + 0.03).g;
  col.b = palette(fb + hue + 0.07).b;

  // jeweled contrast + saturation push (neural gain from loudness)
  col = pow(max(col, 0.0), vec3(1.0 + 0.7 * uLevel));
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.85 + uLevel * 1.0);

  // radial vignette into deep violet-black at the rim (frames the tunnel)
  float vig = smoothstep(1.25, 0.10, r0);
  col *= mix(0.22, 1.0, vig);
  col += vec3(0.05, 0.0, 0.09) * (1.0 - vig);

  // fine visual-snow grain
  float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 57.3, vec2(12.99, 78.23))) * 43758.5453);
  col += (g - 0.5) * (0.03 + uFlux * 0.05);

  // SAFETY: all luminance flicker is a CPU-clamped SafeFlicker multiplier only.
  col *= uFlicker;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
