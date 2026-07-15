// ─────────────────────────────────────────────────────────────────────────────
// 1762-nde-void · shader.ts — raymarched sparse-SDF architecture of the VOID
//
//   A single full-viewport three.js ShaderMaterial. The fragment shader
//   sphere-traces (Inigo Quilez / Shadertoy volumetric-SDF technique) through a
//   cold, near-empty space and ACCUMULATES glow — exp(-d·k) per step, no
//   lighting model — so each of the seven distant structures reads as a
//   luminous cold silhouette floating in black.
//
//   Geometry is NOT computed here: the seven structures' camera-relative
//   positions arrive as the uStructPos[] uniform, written by scene.ts —
//   the SAME array that drives the audio panners. The shader only marches them.
//   Ray direction is rotated by uGaze (the tilt/gyro/ghost gaze), so looking
//   around and the audio's listener orientation stay welded to one geometry.
//
//   Safety: brightness is tone-mapped and hard-clamped ≤ 0.7 (no white-out);
//   all motion comes from uTime = frame/60 (deterministic, no wall clock).
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE_GLSL } from "../_shared/palette";

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

#define NS 7
#define STEPS 80

uniform float uTime;          // frame / 60 — deterministic clock
uniform vec2  uAspect;        // aspect normalisation (fov correct)
uniform mat3  uGaze;          // eye→world rotation from the gaze
uniform float uReduce;        // 1.0 when prefers-reduced-motion
uniform vec3  uStructPos[NS]; // camera-relative positions (from scene.ts)
uniform float uStructKind[NS];// 0 torus · 1 box-frame · 2 saddle · 3 arch
uniform float uStructSize[NS];
uniform float uStructHue[NS]; // 0..1 palette position (cold band)

${PALETTE_GLSL}

// ── SDF primitives (iq) ──────────────────────────────────────────────────────
float sdTorus(vec3 p, float R, float r) {
  vec2 q = vec2(length(p.xz) - R, p.y);
  return length(q) - r;
}
float sdBoxFrame(vec3 p, vec3 b, float e) {
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(min(
    length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
    length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
    length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
}
// Thin hyperbolic-paraboloid (saddle) patch: y = k(x² − z²), bounded + shelled.
float sdSaddle(vec3 p, float s) {
  float k = 0.16 / max(s, 0.001);
  float f = p.y - k * (p.x * p.x - p.z * p.z);
  float g = sqrt(1.0 + 4.0 * k * k * (p.x * p.x + p.z * p.z));
  float sheet = abs(f) / g - 0.06 * s;           // thin shell
  float patch = length(p.xz) - s * 1.6;          // bound the patch radius
  return max(sheet, patch);
}

mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,s, 0.,1.,0., -s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,-s, 0.,s,c); }

// Distance to structure i in world-relative space p, and its cold colour.
float sdStruct(int i, vec3 p, out vec3 col) {
  vec3 lp = p - uStructPos[i];
  float s = uStructSize[i];
  float k = uStructKind[i];
  float hue = uStructHue[i];

  // slow, safe per-structure rotation (well under 0.3 Hz), eased under RM
  float spin = uTime * (0.05 + 0.03 * fract(hue * 7.0)) * (1.0 - 0.7 * uReduce);
  lp = rotY(spin) * rotX(0.4 * sin(spin * 0.5)) * lp;

  float d;
  if (k < 0.5) {                       // portal torus
    d = sdTorus(lp, s, s * 0.16);
  } else if (k < 1.5) {                // box-frame mullion
    d = sdBoxFrame(lp, vec3(s * 0.9, s * 1.3, s * 0.9), s * 0.05);
  } else if (k < 2.5) {                // saddle sheet
    d = sdSaddle(lp, s);
  } else {                             // arch — torus faded below the springline
    d = sdTorus(lp, s, s * 0.14) + max(0.0, -lp.y) * 0.5;
  }
  // cold violet-neutral emission; darker deep hues, faint cool cores
  col = mix(vec3(0.16, 0.14, 0.30), dreamPalette(0.15 + 0.45 * hue), 0.6);
  return d;
}

void main() {
  // fov-correct ray in eye space, then rotate into world by the gaze
  vec2 uv = (vUv - 0.5) * uAspect;
  vec3 rd = normalize(uGaze * normalize(vec3(uv, -0.9)));

  // ── volumetric glow march: accumulate exp(-d·k), no lighting ──────────────
  vec3 acc = vec3(0.0);
  float t = 0.6;
  for (int step = 0; step < STEPS; step++) {
    vec3 p = rd * t;                 // camera at origin (camera-relative space)
    float dmin = 1e9;
    vec3 col = vec3(0.0);
    for (int i = 0; i < NS; i++) {
      vec3 c;
      float d = sdStruct(i, p, c);
      if (d < dmin) { dmin = d; col = c; }
    }
    // tight halo around sparse structures; fades with depth into the void
    float glow = exp(-max(dmin, 0.0) * 2.6);
    float depthFade = exp(-t * 0.014);
    acc += col * glow * 0.085 * depthFade;
    // adaptive step, capped so thin sheets are not skipped
    t += clamp(dmin * 0.6, 0.12, 3.2);
    if (t > 150.0) break;
  }

  // faint cold breath in the deep distance so the void is never dead-black
  float breath = 0.018 + 0.010 * sin(uTime * 0.06 * 6.2831853);
  vec3 haze = vec3(0.05, 0.045, 0.085) * breath;

  vec3 c = acc + haze;

  // gentle radial vignette — the periphery falls into the in-between
  float vig = smoothstep(1.25, 0.15, length((vUv - 0.5) * uAspect));
  c *= mix(0.55, 1.0, vig);

  // soft tone-map, then a hard ceiling: no full-white flash, ever
  c = c / (c + vec3(0.9));
  c = min(c, vec3(0.7));
  gl_FragColor = vec4(c, 1.0);
}
`;
