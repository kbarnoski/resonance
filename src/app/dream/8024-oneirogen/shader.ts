// ─────────────────────────────────────────────────────────────────────────────
// 8024-oneirogen · shaders for the reality-monitoring particle field
//
// A single THREE.Points cloud is driven by ONE hidden dial, uAlpha ∈ [0,1]:
//   • uAlpha low  → PERCEPTION. Each particle is pushed / lit by the LIVE mic
//     spectrum (uBandsLive). What you hear is literally what you see.
//   • uAlpha high → HALLUCINATION. The live spectrum is ignored; the field is
//     regenerated autonomously from a learned running-statistics prior
//     (uBandsPrior) — it swirls into a Klüver-ish spiral/cobweb form-constant
//     and dreams on its own, no longer answering your sound.
// The vertex shader computes both regimes and mix()es them by uAlpha, so the
// crossfade IS the perception→generation reality-monitoring blend.
//
// The colour ramp is the canonical shared Resonance violet palette (dreamPalette).
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE_GLSL } from "../_shared/palette";

export const VERT = /* glsl */ `
attribute float aSeed;
attribute float aBand;

uniform float uTime;
uniform float uAlpha;
uniform float uAmpLive;
uniform float uAmpPrior;
uniform float uBandsLive[6];
uniform float uBandsPrior[6];
uniform float uPointScale;
uniform float uMotion;

varying vec3 vColor;
varying float vBright;

${PALETTE_GLSL}

void main() {
  vec3 p = position;
  float r = length(p);
  vec3 dir = r > 0.0001 ? p / r : vec3(0.0, 1.0, 0.0);
  int bi = int(aBand + 0.5);
  float liveE = uBandsLive[bi];
  float priorE = uBandsPrior[bi];
  float tw = aSeed * 6.28318;

  // ---- PERCEPTION: a faithful live mirror of your spectrum -------------------
  float pPush = liveE * (0.7 + 0.5 * uAmpLive);
  vec3 pPos = p + dir * pPush * 1.3;
  pPos += dir * 0.18 * liveE * sin(uTime * 3.0 * uMotion + tw);

  // ---- HALLUCINATION: autonomous dreamed replay from the prior ---------------
  float g = priorE;
  // primary swirl around Y — the funnel/spiral form-constant
  float ang = r * 2.3 + uTime * 0.45 * uMotion * (0.5 + g) + tw;
  float ca = cos(ang), sa = sin(ang);
  vec3 gPos = p;
  gPos.xz = mat2(ca, -sa, sa, ca) * gPos.xz;
  // second twist axis — cobweb/lattice richness
  float ang2 = r * 1.7 - uTime * 0.3 * uMotion + tw * 1.7;
  float cb = cos(ang2), sb = sin(ang2);
  gPos.xy = mat2(cb, -sb, sb, cb) * gPos.xy;
  // slow dreamed breathing shells, amplitude from the prior
  gPos += dir * (0.35 + 0.9 * g) *
          (0.5 + 0.5 * sin(uTime * 0.7 * uMotion + r * 3.0 + tw));

  vec3 pos = mix(pPos, gPos, uAlpha);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float energy = mix(liveE, priorE, uAlpha);
  gl_PointSize = uPointScale * (0.6 + 2.4 * energy) / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;

  // ---- colour ---------------------------------------------------------------
  float tPerc = clamp(aBand / 5.0 * 0.55 + liveE * 0.5, 0.0, 1.0);
  vec3 cPerc = dreamPalette(tPerc);
  float tGen = clamp(0.42 + aBand / 5.0 * 0.28 + priorE * 0.35
                     + 0.18 * sin(uTime * 0.3 * uMotion + tw), 0.0, 1.0);
  vec3 cGen = dreamPalette(tGen);
  vec3 col = mix(cPerc, cGen, uAlpha);
  // the dream intensifies toward magenta / light as alpha climbs
  col = mix(col, dreamPalette(0.78 + 0.15 * sin(uTime * 0.25 + tw)), uAlpha * 0.35);
  vColor = col;
  vBright = mix(0.55 + liveE * 0.8, 0.75 + priorE * 0.7, uAlpha);
}
`;

export const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vBright;
uniform float uLuma;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.0, d);
  a = pow(a, 1.6);
  vec3 col = vColor * vBright * uLuma;
  gl_FragColor = vec4(col, a);
}
`;
