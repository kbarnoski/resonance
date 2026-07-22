// ════════════════════════════════════════════════════════════════════════════
// 2320-three-valves · shader.ts
//
// One WebGL2 fragment shader painting the C×G×D "reducing-valve cube". The three
// uniforms are ORTHOGONAL — each drives a genuinely different visual dimension,
// so no combination collapses to a single intensity dial:
//
//   uC  Classifier constraint (relaxed) → log-polar Klüver FORM CONSTANTS bloom
//       (tunnels / spirals / spokes / honeycomb). Cool / teal channel.
//   uG  Generator prior → abstract fine grain organises into FIGURATIVE, almost-
//       recognisable, bilaterally-symmetric forms. Warm / coral–magenta channel.
//   uD  Discriminator (reality monitoring) → whether the same imagery renders as
//       drifting, hazy, translucent "unreal" or crisp, grounded, present "real".
//
// The log-polar helpers (screenToCortex / formConstant / honeycomb) are the
// shared _shared/psych/logpolar engine, spliced in verbatim below.
// ════════════════════════════════════════════════════════════════════════════

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

export const VERT_SRC = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uC;       // classifier relaxation → geometry   [0,1]
uniform float uG;       // generator prior → figuration        [0,1]
uniform float uD;       // reality monitoring → solidity       [0,1]
uniform float uReduced; // 1.0 = prefers-reduced-motion (slow drift)
uniform float uLevel;   // audio loudness, subtle breathing    [0,1]

${LOGPOLAR_GLSL}

// ── value noise + fbm ────────────────────────────────────────────────────────
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 res = uRes;
  vec2 uv = (gl_FragCoord.xy * 2.0 - res) / min(res.x, res.y); // aspect-safe, centered

  // slow time; reduced-motion collapses all motion to a gentle drift.
  float t = uTime * mix(1.0, 0.16, uReduced);
  float breath = 0.5 + 0.5 * sin(t * 0.25) + uLevel * 0.15;

  // ── D acts FIRST as a spatial reality transform ───────────────────────────
  // Low D → the field floats: coordinates wobble, imagery drifts, unbound.
  float unreal = 1.0 - uD;
  vec2 p = uv;
  p += unreal * 0.045 * vec2(
        sin(t * 0.7 + uv.y * 3.1),
        cos(t * 0.6 + uv.x * 2.7));

  // ── C · CLASSIFIER → geometric form constants (cool channel) ──────────────
  // Relaxing the classifier lets the log-polar plane-wave lattice surface. The
  // form constant self-sweeps tunnel→spiral→spoke and blends to honeycomb, so
  // all four Klüver constants appear over time. Amplitude & density scale with C.
  vec2 cx = screenToCortex(p * 1.15);
  float phase = t * 0.22;
  float morph = 0.5 + 0.5 * sin(t * 0.05);        // 0..1 slow sweep of orientation
  float phi = morph * 3.14159265;                  // 0=tunnel, PI/2=spoke, etc.
  float freq = mix(2.6, 8.5, uC);                  // relaxed classifier → finer rings
  float planeC = formConstant(cx, phi, freq, phase);
  float honey = honeycomb(cx, freq * 0.85, phase * 0.7);
  float latticeMix = smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(t * 0.037 + 1.7));
  float geomRaw = mix(planeC, honey, latticeMix);
  // sharpen into ridges so it reads as luminous geometry, not a soft grating.
  float geom = pow(geomRaw, mix(1.0, 3.0, uC));
  float geomI = geom * smoothstep(0.04, 0.55, uC); // C gates the geometry in

  // ── G · GENERATOR → abstract grain organises into figurative forms ────────
  // Bilateral symmetry, domain warp, and a dropping spatial frequency all grow
  // with G: low G = flat fine abstract texture; high G = large coherent, almost-
  // recognisable symmetric figures with darker nuclei (eyes / mouths / masks).
  vec2 q = p;
  q.x = mix(q.x, abs(q.x), uG);                    // symmetry rises with G
  vec2 warp = vec2(fbm(q * 1.6 + t * 0.05),
                   fbm(q * 1.6 + 5.2 - t * 0.04));
  q += (uG * 0.55) * (warp - 0.5);
  float scale = mix(8.5, 2.3, uG);                 // large coherent forms at high G
  float figRaw = fbm(q * scale + vec2(0.0, t * 0.02));
  float blob = smoothstep(0.44, 0.63, figRaw);     // coherent silhouettes
  float grain = fbm(q * 9.0 - t * 0.03);           // flat abstract texture
  float figure = mix(grain, blob, uG);
  // punch dark nuclei (eyes / voids) into the figures as G rises → face cue.
  float nuc = smoothstep(0.72, 0.9, fbm(q * mix(6.0, 3.0, uG) + 11.0));
  figure -= uG * 0.55 * nuc;
  float figI = clamp(figure, 0.0, 1.0) * smoothstep(0.04, 0.5, uG);

  // ── combine content, then let D decide how REAL it renders ────────────────
  float cool = geomI * (0.85 + 0.3 * breath);
  float warm = figI  * (0.85 + 0.3 * breath);
  float total = cool + warm;

  // D crispness: high D snaps intensity to bound, high-contrast edges (present);
  // low D leaves it soft, milky, translucent (imagined / in-here).
  float sharp = smoothstep(0.12, 0.72, total);
  float lum = mix(total * 0.85, sharp * 1.15, uD);

  // ── spectral duotone on graphite ──────────────────────────────────────────
  vec3 graphite = vec3(0.078, 0.086, 0.102);       // #14161a ground (not pure black)
  vec3 teal     = vec3(0.16, 0.86, 0.82);
  vec3 coral    = vec3(1.00, 0.36, 0.42);
  vec3 magenta  = vec3(0.96, 0.26, 0.70);

  float hueT = total > 1e-4 ? warm / total : 0.0;  // geometry→cool, figure→warm
  vec3 coolCol = mix(vec3(0.09, 0.45, 0.52), teal, clamp(cool, 0.0, 1.0));
  vec3 warmCol = mix(coral, magenta, clamp(warm, 0.0, 1.0));
  vec3 duo = mix(coolCol, warmCol, hueT);

  vec3 col = graphite + duo * lum;

  // low D: a floating milky veil + soft bloom (the "unreal, drowned" look).
  float veil = unreal * (0.5 + 0.5 * fbm(uv * 3.0 + t * 0.05));
  col += veil * 0.05 * vec3(0.42, 0.72, 0.82);
  col += unreal * 0.10 * duo * smoothstep(0.2, 1.1, lum); // ghost bloom

  // high D: a grounding vignette focuses & binds the imagery (out-there, present).
  float r = length(uv);
  float vig = mix(1.0, smoothstep(1.35, 0.15, r), uD * 0.75);
  col *= vig;

  // faint graphite floor so the emptiest octant is never pure black.
  col = max(col, graphite * 0.85);

  fragColor = vec4(col, 1.0);
}
`;
