// ─────────────────────────────────────────────────────────────────────────────
// 1784-second-sight — GLSL for the hallucination-growth pipeline.
//
//   Two full-screen fragment passes on a three.js quad (GLSL ES 1.00):
//     GROWTH  — a ping-pong feedback field. Each frame it advects the previous
//               state (slow zoom + salience-driven swirl), decays it (decay<1,
//               so nothing runs away), and ADDS new motif emission gated by the
//               machine-vision salience field. Over seconds, eyes / paisley
//               form-constants literally GROW out of the salient structure.
//     DISPLAY — composites the veridical feed against the grown hallucination,
//               letting the "dose" and the salience field decide how much of
//               reality is over-written (predictive-processing reducing valve).
//               Chromatic aberration + cheap bloom + tone-map + slow (≤0.05 Hz)
//               luminance drift. No strobe, no flash — brightness is clamped.
//
//   Salience comes from a real tfjs conv "seer" (uSalience texture, uSeerActive
//   = 1). If the seer is unavailable it falls back to a luminance-gradient
//   salience computed here from uSource, so the piece never dies.
//
//   uTime = frame/60 (integer-frame driven on the CPU) — no wall-clock time.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Shared prelude: hashes, the iridescent-fleshy palette, and the salience
// sampler that unifies the ML texture with the shader-only fallback.
const PRELUDE = /* glsl */ `
varying vec2 vUv;

uniform sampler2D uSource;    // veridical feed (camera or procedural scene)
uniform sampler2D uSalience;  // seer output: R=salience G=edges B=warm A=feat
uniform float uSeerActive;    // 1.0 if the ML seer texture is valid
uniform float uDose;          // 0..1 reducing-valve dose
uniform float uTime;          // frame/60 seconds
uniform vec2  uAspect;        // viewport aspect for centered coords
uniform float uReduced;       // 1.0 if prefers-reduced-motion

float hash1(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) {
  return vec2(hash1(p), hash1(p + 19.19));
}

// iridescent → fleshy cosine palette (IQ form)
vec3 palette(float t) {
  vec3 a = vec3(0.55, 0.42, 0.46);
  vec3 b = vec3(0.45, 0.34, 0.40);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.00, 0.18, 0.38);
  return a + b * cos(6.28318530718 * (c * t + d));
}

float lumAt(vec2 uv) {
  return dot(texture2D(uSource, uv).rgb, vec3(0.299, 0.587, 0.114));
}
// shader-only fallback salience: luminance gradient magnitude
float fallbackSal(vec2 uv) {
  vec2 e = vec2(1.0 / 128.0, 0.0);
  float gx = lumAt(uv + e.xy) - lumAt(uv - e.xy);
  float gy = lumAt(uv + e.yx) - lumAt(uv - e.yx);
  return clamp(length(vec2(gx, gy)) * 3.5, 0.0, 1.0);
}
float salienceAt(vec2 uv) {
  if (uSeerActive > 0.5) return texture2D(uSalience, uv).r;
  return fallbackSal(uv);
}
float edgeAt(vec2 uv) {
  if (uSeerActive > 0.5) return texture2D(uSalience, uv).g;
  return fallbackSal(uv);
}
`;

// ── GROWTH pass ──────────────────────────────────────────────────────────────
export const FRAG_GROWTH =
  PRELUDE +
  LOGPOLAR_GLSL +
  /* glsl */ `
uniform sampler2D uPrev;   // previous feedback state

// Eye / creature motif: sparse iris+pupil cells that "open" where the machine
// sees salient structure and the dose is high. Colour is iridescent-fleshy.
vec3 eyes(vec2 uv, float dose) {
  float N = 5.0 + 5.0 * dose;
  vec2 g = uv * N;
  vec2 cell = floor(g);
  vec2 fpos = fract(g) - 0.5;
  vec2 jit = (hash2(cell + 3.1) - 0.5) * 0.55;
  float d = length(fpos - jit);

  float sc = salienceAt((cell + 0.5) / N);
  float sparse = step(hash1(cell + 7.7), 0.30 + 0.35 * dose);
  float open = smoothstep(0.45, 0.95, dose * mix(0.35, 1.15, sc)) * sparse;

  float iris  = smoothstep(0.30, 0.24, d) - smoothstep(0.15, 0.09, d);
  float pupil = smoothstep(0.11, 0.06, d);
  float glint = smoothstep(0.05, 0.0, length(fpos - jit + vec2(0.03, -0.03)));

  vec3 irisCol = palette(hash1(cell) * 0.7 + 0.15 + 0.03 * uTime);
  vec3 col = irisCol * iris * 1.1;
  col *= (1.0 - pupil);                 // dark pupil bitten out of the iris
  col += vec3(0.9, 0.85, 0.95) * glint * 0.6;
  return col * open;
}

// Paisley / form-constant filaments in cortical (log-polar) space, gated by the
// edge channel — hallucinated structure crawling along real contours.
vec3 paisley(vec2 uv, float dose) {
  vec2 p = (uv - 0.5) * vec2(uAspect.x / uAspect.y, 1.0) * 2.4;
  vec2 cx = screenToCortex(p);
  float honey = honeycomb(cx * 2.2, uTime * 0.08);
  float spiral = formConstant(cx, 0.7854, 7.0, uTime * 0.12);
  float form = mix(honey, spiral, 0.4 + 0.3 * dose);
  form = smoothstep(0.62, 0.92, form);

  float ed = edgeAt(uv);
  float gate = smoothstep(0.35, 0.9, dose) * (0.25 + 0.75 * ed);
  vec3 col = palette(0.5 + 0.25 * honey + 0.05 * uTime);
  return col * form * gate * 0.8;
}

void main() {
  vec2 uv = vUv;
  float reduced = uReduced;
  float s = salienceAt(uv);

  // advection: gentle inward zoom + salience-varied swirl (the "crawl")
  vec2 dcen = uv - 0.5;
  float zoom = 1.0 - (0.004 + 0.010 * uDose) * mix(1.0, 0.35, reduced);
  float ang = (0.020 + 0.060 * uDose) * mix(1.0, 0.35, reduced) * (0.5 - s);
  float ca = cos(ang), sa = sin(ang);
  vec2 warpUv = 0.5 + mat2(ca, -sa, sa, ca) * dcen * zoom;

  // salience-gradient push — filaments migrate toward structure
  vec2 e = vec2(1.5 / 256.0, 0.0);
  float sgx = salienceAt(uv + e.xy) - salienceAt(uv - e.xy);
  float sgy = salienceAt(uv + e.yx) - salienceAt(uv - e.yx);
  warpUv += vec2(sgx, sgy) * (0.006 + 0.010 * uDose) * mix(1.0, 0.4, reduced);

  vec3 prev = texture2D(uPrev, warpUv).rgb;
  float decay = mix(0.945, 0.86, reduced);
  prev *= decay;

  // new emission — accumulates over frames so structure GROWS, not flashes
  vec3 emit = eyes(uv, uDose) + paisley(uv, uDose);
  emit *= 0.16;

  vec3 outc = clamp(prev + emit, 0.0, 1.0);
  gl_FragColor = vec4(outc, 1.0);
}
`;

// ── DISPLAY pass ─────────────────────────────────────────────────────────────
export const FRAG_DISPLAY =
  PRELUDE +
  /* glsl */ `
uniform sampler2D uState;  // grown hallucination field

vec3 tonemap(vec3 x) {
  return vec3(1.0) - exp(-x * 1.6);
}

void main() {
  vec2 uv = vUv;
  float reduced = uReduced;

  // hallucination with chromatic aberration (per-channel radial offset)
  vec2 dir = uv - 0.5;
  float cab = (0.003 + 0.005 * uDose) * mix(1.0, 0.4, reduced);
  float hr = texture2D(uState, uv - dir * cab).r;
  float hg = texture2D(uState, uv).g;
  float hb = texture2D(uState, uv + dir * cab).b;
  vec3 hall = vec3(hr, hg, hb);

  // cheap bloom — a few offset taps of the state
  vec3 bloom = vec3(0.0);
  bloom += texture2D(uState, uv + vec2( 0.004,  0.0)).rgb;
  bloom += texture2D(uState, uv + vec2(-0.004,  0.0)).rgb;
  bloom += texture2D(uState, uv + vec2( 0.0,  0.004)).rgb;
  bloom += texture2D(uState, uv + vec2( 0.0, -0.004)).rgb;
  hall += (bloom * 0.25) * (0.4 + 0.6 * uDose);
  hall = tonemap(hall);

  // veridical feed, graded slightly fleshy and fading as the valve closes
  vec3 verid = texture2D(uSource, uv).rgb;
  float g = dot(verid, vec3(0.299, 0.587, 0.114));
  verid = mix(vec3(g), verid, 0.85);
  verid *= vec3(1.04, 0.98, 0.99);
  verid *= (1.0 - 0.70 * uDose);

  // reducing valve: salient regions get over-written first
  float s = salienceAt(uv);
  float veil = clamp(uDose * (0.35 + 0.65 * s), 0.0, 1.0);
  vec3 col = mix(verid, hall, veil);
  col += hall * 0.18 * uDose;           // residual bloom everywhere at high dose

  // slow luminance drift (≤0.05 Hz) — warp/zoom feel, never a brightness flash
  float lfo = 1.0 + (reduced > 0.5 ? 0.02 : 0.06) * sin(6.28318530718 * 0.05 * uTime);
  col *= lfo;

  // vignette + final clamp/tone
  float vig = smoothstep(1.25, 0.35, length(dir) * 1.6);
  col *= mix(0.72, 1.0, vig);
  col = col / (1.0 + col * 0.35);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
