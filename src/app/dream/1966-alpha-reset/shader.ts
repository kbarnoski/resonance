// ─────────────────────────────────────────────────────────────────────────────
// 1966-alpha-reset / shader.ts
//
// The fragment shader that renders four Klüver form constants (tunnels, spokes,
// spirals, honeycomb) in cortical (log r, theta) space and blends them. Each
// layer carries its own PHASE OFFSET uniform (uOff). When those offsets are
// aligned the layers fall into registration and the mandala crystallises; when
// they drift apart the pattern smears toward a flat, desaturated field of
// "visual snow". Sound (via the phase-reset controller in page.tsx) snaps the
// offsets back into alignment on every note onset.
//
// The shared log-polar engine (`_shared/psych/logpolar.ts`) is spliced in as
// GLSL below — we IMPORT it, we do not re-derive it.
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

// ── from the shared engine: screenToCortex / cortexToScreen / formConstant / honeycomb
${LOGPOLAR_GLSL}

uniform vec2  uAspect;     // aspect correction
uniform float uTime;       // seconds (deterministic; performance.now based)
uniform float uPhase;      // slow common phase (overall drift / tunnel motion)
uniform vec4  uOff;        // per-layer phase offsets: x=tunnel y=spoke z=spiral w=honey
uniform float uWarp;       // bass -> log-polar warp depth
uniform float uZoom;       // bass -> zoom into the cortical map
uniform float uFreq;       // mids -> form-constant ring/spoke density
uniform float uFold;       // highs -> kaleidoscope fold count
uniform float uDetail;     // highs -> honeycomb fine-detail multiplier
uniform float uSat;        // loudness -> saturation / iridescence gain
uniform float uCoherence;  // 0 = incoherent snow, 1 = crystalline mandala
uniform float uGain;       // GLOBAL brightness envelope (slew-limited <=3Hz in JS)
uniform float uCA;         // chromatic-aberration amount
uniform float uReduced;    // 1.0 if prefers-reduced-motion

const float PI = 3.14159265359;

// cheap per-pixel hash for the "visual snow" that appears when incoherent
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// IQ cosine palette — neon-iridescent thin-film feel
vec3 pal(float t, float irid) {
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33 + 0.12 * irid, 0.67 - 0.1 * irid);
  return a + b * cos(6.28318530718 * (c * t + d));
}

void main() {
  // screen coord, centered + aspect corrected, in [-1,1]-ish
  vec2 p = (vUv - 0.5) * 2.0;
  p *= uAspect;

  // ── kaleidoscope fold (highs). Variable fold count without a loop so it
  //    stays GLSL-ES-1.00 legal (three.js default). ────────────────────────
  float rad = length(p);
  float ang = atan(p.y, p.x);
  float sectors = max(2.0, uFold);
  float sec = TAU_LP / sectors;
  ang = mod(ang, sec);
  ang = abs(ang - sec * 0.5);       // mirror -> kaleidoscope
  p = vec2(cos(ang), sin(ang)) * rad;

  // zoom into the map (bass)
  p *= (1.0 / max(0.35, uZoom));

  // screen -> cortical (the retina->V1 complex-log map)
  vec2 c = screenToCortex(p);

  // bass warps the cortical radius -> breathing tunnel depth
  c.x -= uWarp * (0.5 + 0.5 * sin(uPhase * 0.5));

  // ── four form constants, each with its own drifting phase offset ─────────
  float ph = uPhase;
  float tun = formConstant(c, 0.0,        uFreq, ph + uOff.x);   // tunnels
  float spk = formConstant(c, PI * 0.5,   uFreq, ph + uOff.y);   // spokes
  float spr = formConstant(c, PI * 0.25,  uFreq, ph + uOff.z);   // spirals
  float hon = honeycomb(c, uFreq * (0.5 + uDetail), ph + uOff.w);// honeycomb lattice

  // Blend. When the offsets agree the layers reinforce into a crisp lattice;
  // when they diverge the average washes toward 0.5 (flat = incoherent).
  float m = (tun + spk + spr + hon) * 0.25;

  // coherence -> contrast. Low coherence pulls everything toward flat gray;
  // high coherence sharpens into a crystalline mandala. This is a SPATIAL
  // reorganization, not a global flash.
  float contrast = mix(0.3, 1.7, uCoherence);
  m = clamp(0.5 + (m - 0.5) * contrast, 0.0, 1.0);

  // visual snow when incoherent (per-pixel grain, low amplitude -> not a
  // full-screen synchronized flicker)
  float snowAmt = (1.0 - uCoherence) * (uReduced > 0.5 ? 0.05 : 0.11);
  float snow = hash21(p * 90.0 + floor(uTime * 24.0)) - 0.5;
  m = clamp(m + snow * snowAmt, 0.0, 1.0);

  // ── color: iridescent palette + chromatic aberration ────────────────────
  float irid = uSat;
  float ca = uCA * (0.4 + 0.6 * uCoherence);
  float rr = pal(m + ca, irid).r;
  vec3  gg = pal(m, irid);
  float bb = pal(m - ca, irid).b;
  vec3 col = vec3(rr, gg.g, bb);

  // saturation: rich at the coherence peak, desaturated as it dissolves
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float sat = mix(0.15, 1.0, uCoherence) * (0.6 + 0.8 * uSat);
  col = mix(vec3(lum), col, clamp(sat, 0.0, 1.35));

  // gentle radial vignette so the center reads as the tunnel mouth
  float vig = smoothstep(2.2, 0.15, length((vUv - 0.5) * 2.0 * uAspect));
  col *= mix(0.55, 1.0, vig);

  // GLOBAL brightness envelope — slew-limited in JS so it can never modulate
  // faster than ~3 Hz (photosensitive-safety).
  col *= uGain;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
