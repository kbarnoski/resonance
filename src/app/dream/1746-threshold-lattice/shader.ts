// ─────────────────────────────────────────────────────────────────────────────
// 1746-threshold-lattice — GLSL for the hypnagogic honeycomb descent.
//
// A single fullscreen quad rendered by a three.js fragment ShaderMaterial.
// It composes the shared log-polar / form-constant engine:
//   - honeycomb() generates Klüver's lattice form-constant in *cortical* space;
//   - screenToCortex() applies the inverse (complex-log) retina→V1 warp so the
//     honeycomb appears to stream inward as the sleeper sinks;
//   - formConstant() at phi=PI/4 sketches faint peripheral spirals — the
//     "fragmentary half-images" that surface near the threshold of dream.
//
// Everything is driven by uniforms the CPU updates from an integer frame
// counter (uTime = frame/60), so the visual path calls no wall-clock time.
// Tint is clamped ≤ 0.7 — dim violet phosphene light, never a white flash.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;    // integer-frame time: frame / 60  (deterministic)
uniform float uDepth;   // slow "how deep am I" reward channel, 0..1
uniform float uStill;   // fast stillness channel, 0..1 (high = quiet room)
uniform float uJerkAmp; // signed damped-spring amplitude of a myoclonic lurch
uniform vec2  uJerkDir; // unit direction of the current lurch (golden-angle)
uniform vec2  uAspect;  // aspect normalisation so cells stay round

${LOGPOLAR_GLSL}

void main() {
  // centered, aspect-corrected screen point, roughly [-1, 1]
  vec2 p = (vUv - 0.5) * uAspect * 2.0;
  float r0 = length(p);

  // ── myoclonic-jerk shear: a single smooth whole-field lurch that settles.
  //    Scaled by radius so the periphery swings more than the sink centre.
  p += uJerkDir * uJerkAmp * (0.35 + 0.65 * r0);

  // ── inverse log-polar warp: evaluate the lattice in cortical coordinates.
  vec2 c = screenToCortex(p);

  // sink: the honeycomb streams inward, faster and further as depth rises.
  float stream = uTime * (0.06 + 0.10 * uDepth) + uDepth * 1.4;
  c.x -= stream;
  c.y += 0.05 * sin(uTime * 0.03); // barely-there rotational sway

  // honeycomb form-constant — density (freq) climbs with depth.
  float freq = 6.0 + 10.0 * uDepth;
  float hc = honeycomb(c, freq, uTime * 0.15);
  hc = pow(clamp(hc, 0.0, 1.0), 1.0 + 1.5 * uDepth); // cells sharpen with depth

  // peripheral spiral "fragmentary half-image" hints, only near the edge,
  // and only once the descent is well underway.
  float spiral = formConstant(c, 0.7853981634, 3.0 + 4.0 * uDepth, uTime * 0.2);
  float periph = smoothstep(0.35, 1.10, r0);
  float halfImage = spiral * periph * uDepth * 0.5;

  float field = hc * (0.5 + 0.5 * uDepth) + halfImage;

  // ── fast center-sink glow: the immediately-legible reward for stillness.
  float sink = exp(-r0 * r0 * (3.5 - 2.0 * uDepth));
  float glow = sink * (0.25 + 0.75 * uStill);

  // dim violet-neutral phosphene tint (violet is the only accent hue).
  vec3 tintDeep = vec3(0.34, 0.26, 0.52);
  vec3 tintCore = vec3(0.52, 0.46, 0.62);
  vec3 col = mix(tintDeep, tintCore, uDepth);

  float lum = field * (0.30 + 0.35 * uDepth) + glow * 0.6;

  // radial vignette, deepening as the descent proceeds.
  float vig = smoothstep(1.5, 0.2, r0);
  vig = mix(vig, vig * vig, uDepth);
  lum *= vig;

  vec3 outc = col * lum;
  outc = min(outc, vec3(0.7)); // hard clamp — no full-white flash, ever
  gl_FragColor = vec4(outc, 1.0);
}
`;
