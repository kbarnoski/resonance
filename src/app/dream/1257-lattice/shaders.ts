// ─────────────────────────────────────────────────────────────────────────────
// 1257-lattice/shaders.ts — GLSL for the GPU reaction-diffusion realm-membrane.
//
//   Three programs share one full-screen triangle:
//     • VERT_SRC       — trivial pass-through (both passes read gl_FragCoord).
//     • SIM_FRAG_SRC   — the Gray-Scott update (Turing morphogenesis) + reset
//                        seeding + onset injection. Runs into a ping-pong FBO at
//                        a capped simulation resolution.
//     • makeDisplayFrag(LOGPOLAR_GLSL) — samples the V field through an N-fold
//                        kaleidoscope + log-polar honeycomb warp (the shared
//                        _shared/psych/logpolar engine) and colours it with
//                        thin-film iridescence on a luminous nacre ground.
//
//   The Gray-Scott system (Pearson 1993) is the classic self-replicating-spot /
//   maze reaction-diffusion model — Alan Turing's "Chemical Basis of
//   Morphogenesis" (1952) made physical. Sweeping feed (F) and kill (K) walks
//   the pattern from sparse spots → mitosis → labyrinth, which is exactly the
//   living, growing "realm-membrane" of the DMT breakthrough phenomenology.
// ─────────────────────────────────────────────────────────────────────────────

export const VERT_SRC = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Gray-Scott update. State texture stores U in .x, V in .y (both 0..1).
// texelFetch reads exact texels (a 9-point Laplacian) so the reaction is
// filter-independent; toroidal wrap keeps the membrane seamless.
export const SIM_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uState;
uniform float uF;      // feed
uniform float uK;      // kill
uniform float uDu;     // U diffusion
uniform float uDv;     // V diffusion
uniform float uDt;     // timestep (mic neural-gain scales this)
uniform int   uReset;  // 1 = re-seed the whole field
uniform vec4  uSeed;   // xy in [0,1], z = radius, w = amount (onset pulse)

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  ivec2 sz = textureSize(uState, 0);
  ivec2 P = ivec2(gl_FragCoord.xy);
  vec2 uv = (vec2(P) + 0.5) / vec2(sz);

  if (uReset == 1) {
    // Sparse spots seeding from a soft central disc (BLOOM).
    vec2 c = uv - 0.5;
    float d = length(c);
    float n = hash21(floor(uv * 22.0) + 5.0);
    float seed = (d < 0.20 && n > 0.60) ? 1.0 : 0.0;
    // U ~1 background, seeded cells drop U and raise V.
    outColor = vec4(mix(1.0, 0.4, seed), mix(0.0, 0.32, seed), 0.0, 1.0);
    return;
  }

  // 9-point Laplacian with toroidal wrap.
  #define TX(dx, dy) texelFetch(uState, (P + ivec2(dx, dy) + sz) % sz, 0).xy
  vec2 c  = TX(0, 0);
  vec2 lap =
      (TX(-1, 0) + TX(1, 0) + TX(0, 1) + TX(0, -1)) * 0.2 +
      (TX(-1, 1) + TX(1, 1) + TX(-1, -1) + TX(1, -1)) * 0.05 -
      c;

  float u = c.x;
  float v = c.y;
  float uvv = u * v * v;
  float du = uDu * lap.x - uvv + uF * (1.0 - u);
  float dv = uDv * lap.y + uvv - (uF + uK) * v;
  u += du * uDt;
  v += dv * uDt;

  // Local injection — onset pulses / mic seeds (never a full-field flash).
  if (uSeed.w > 0.0) {
    float d = length(uv - uSeed.xy);
    float m = smoothstep(uSeed.z, 0.0, d) * uSeed.w;
    v += m;
    u -= m * 0.5;
  }

  outColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
}`;

// Display pass. `logpolarGlsl` is the shared LOGPOLAR_GLSL prelude (spliced so
// screenToCortex / honeycomb / TAU_LP are in scope).
export function makeDisplayFrag(logpolarGlsl: string): string {
  return /* glsl */ `#version 300 es
precision highp float;

${logpolarGlsl}

uniform sampler2D uState;
uniform vec2  uRes;
uniform float uTime;
uniform float uSymmetry;   // N-fold kaleidoscope (climbs 3 -> 12)
uniform float uSaturation; // prismatic vividness
uniform float uBrightness; // gentle luminance lift
uniform float uScale;      // RD field sampling scale (membrane density)
uniform float uFlow;       // slow inward log-polar drift
uniform float uIrid;       // thin-film iridescence strength
uniform float uFlicker;    // safe luminance multiplier [floor,1]; 1 = steady

out vec4 fragColor;

// Thin-film / oil-on-water interference: a scalar optical path -> spectral bands.
vec3 thinFilm(float d) {
  vec3 f = vec3(1.00, 0.82, 0.66);
  return 0.55 + 0.45 * cos(TAU_LP * (f * d + vec3(0.0, 0.28, 0.56)));
}

// Seamless mirror-tile into [0,1] so the membrane fills the screen edge-free.
vec2 mirrorTile(vec2 x) {
  return abs(fract(x * 0.5) * 2.0 - 1.0);
}

void main() {
  // Centered, aspect-safe screen coordinate.
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // N-fold kaleidoscope with mirror fold -> honeycomb rotational symmetry.
  float ang = atan(p.y, p.x);
  float rad = length(p);
  float seg = TAU_LP / max(3.0, uSymmetry);
  float a = mod(ang, seg);
  a = abs(a - 0.5 * seg);
  vec2 pf = rad * vec2(cos(a), sin(a));

  // Log-polar (cortical) coordinates -> the Bressloff-Cowan honeycomb warp.
  vec2 cx = screenToCortex(pf);

  // Two reads of the living RD field: a direct kaleidoscopic sample and a
  // log-polar tiled sample that drifts slowly inward.
  vec2 s1 = mirrorTile(pf * uScale + 0.5);
  vec2 s2 = fract(vec2(cx.x * 0.5 + uTime * uFlow, cx.y / TAU_LP + 0.5)
                  * vec2(0.5, uSymmetry / 6.0));
  float vA = texture(uState, s1).y;
  float vB = texture(uState, s2).y;
  float field = mix(vA, vB, 0.35);

  // Honeycomb vein modulation from the shared engine.
  float hex = honeycomb(cx * 3.0, 2.0, uTime * 0.15);

  float structure = smoothstep(0.10, 0.48, field);
  // Optical path shifts across the membrane -> spectral banding travels.
  float d = field * 6.0 + hex * 1.2 + rad * 0.6 - uTime * 0.05 * uFlow;

  vec3 irid  = thinFilm(d);
  vec3 nacre = vec3(0.82, 0.85, 0.92);              // luminous pearl ground
  vec3 col = mix(nacre, irid, clamp(structure * uIrid, 0.0, 1.0));
  col += vec3(0.16, 0.14, 0.18) * smoothstep(0.44, 0.62, field); // vein glow

  // Saturation around luminance (never below neutral -> stays high-key).
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, clamp(uSaturation, 0.0, 1.6));
  col *= (0.86 + 0.22 * uBrightness);
  col *= uFlicker;

  // Keep a luminous floor -> never a dark strobe; mean luminance stays stable.
  col = max(col, vec3(0.06));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
}
