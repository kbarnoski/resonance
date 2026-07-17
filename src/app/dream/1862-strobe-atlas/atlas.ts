// ════════════════════════════════════════════════════════════════════════════
// atlas.ts — the deterministic "atlas of form" engine for 1862-strobe-atlas.
//
// Seven planform families, one WebGL2 fragment shader. Families 0–3 are the
// classic Klüver form constants, generated the ONLY way they can be — a
// periodic pattern seen through the retina→V1 complex-log warp (imported
// verbatim from _shared/psych/logpolar.ts). Families 4–6 are the motifs a
// 2026 large-scale computer-vision study of 10,598 flicker-hallucination
// drawings found the classic taxonomy MISSES: concentric squares (Chebyshev /
// L∞ rings), crosses (an axis-aligned Cartesian grid), and a hyperbolic
// planform (saddle level-sets). A pure log-polar exp() warp is radial by
// construction and literally cannot produce the Cartesian/hyperbolic three —
// which is the whole argument the piece makes visible.
//
// The self-running arc is DETERMINISTIC: a mulberry32 seeded with 0x1862 lays
// out a fixed playlist through all seven families, and every animated quantity
// is a pure function of an INTEGER frame counter. No Math.random, no Date.now
// in the render/arc path — a headless CI gets byte-identical output.
// ════════════════════════════════════════════════════════════════════════════

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";
import { PALETTE_GLSL } from "../_shared/palette";

// ── Family metadata (labels + provenance tag) ───────────────────────────────

export interface Family {
  /** Human label shown in the Atlas readout. */
  name: string;
  /** Short provenance tag rendered as a badge. */
  tag: string;
  /** True = beyond Klüver's four; the classic log-polar engine can't make it. */
  newlyMapped: boolean;
}

/** The atlas, in shader-index order. Indices are the `uFamA`/`uFamB` uniforms. */
export const FAMILIES: Family[] = [
  { name: "Tunnels / funnels", tag: "log-polar", newlyMapped: false },
  { name: "Radial spokes", tag: "log-polar", newlyMapped: false },
  { name: "Spirals", tag: "log-polar", newlyMapped: false },
  { name: "Honeycomb lattice", tag: "log-polar", newlyMapped: false },
  { name: "Concentric squares", tag: "Chebyshev · newly-mapped", newlyMapped: true },
  { name: "Crosses / Cartesian grid", tag: "Cartesian · newly-mapped", newlyMapped: true },
  { name: "Hyperbolic planform", tag: "hyperbolic · newly-mapped", newlyMapped: true },
];

// ── Deterministic PRNG + seeded playlist ────────────────────────────────────

/** mulberry32 — tiny deterministic PRNG. Seeded once, literal seed 0x1862. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a wandering playlist that visits every family, never repeats a family
 *  back-to-back, and loops seamlessly (last entry == first). Pure + seeded. */
function buildPlaylist(): number[] {
  const rnd = mulberry32(0x1862);
  const n = FAMILIES.length; // 7
  const stops = 28;
  const list: number[] = [0]; // always open on Tunnels — the canonical form
  for (let i = 1; i < stops; i++) {
    const prev = list[i - 1];
    let next = Math.floor(rnd() * n);
    if (next === prev) next = (next + 1) % n;
    list.push(next);
  }
  list.push(list[0]); // close the loop back to the opening family
  return list;
}

/** The fixed arc through the atlas. Deterministic — computed once at import. */
export const PLAYLIST: number[] = buildPlaylist();

/** Frames each A→B segment lasts (~7s at 60fps). */
export const FRAMES_PER_SEG = 420;

// A morph segment holds pure-A, crossfades, then holds pure-B (which is the
// next segment's A). Reviewer sees each form clearly, plus every transition.
const HOLD_A = 0.34;
const HOLD_B = 0.66;

export interface ArcState {
  famA: number;
  famB: number;
  /** Crossfade 0→1 from famA to famB. */
  mix: number;
  /** Traveling-wave phase (radians), continuous. */
  phase: number;
  /** Which family index the viewer is effectively seeing right now. */
  current: number;
  /** True while mid-crossfade (readout shows "A → B"). */
  transitioning: boolean;
}

/** The entire arc as a pure function of an integer frame counter. */
export function computeArc(frame: number): ArcState {
  const segCount = PLAYLIST.length - 1; // seamless loop
  const pos = frame / FRAMES_PER_SEG;
  const seg = ((Math.floor(pos) % segCount) + segCount) % segCount;
  const local = pos - Math.floor(pos);

  const famA = PLAYLIST[seg];
  const famB = PLAYLIST[seg + 1];

  let mix: number;
  let transitioning = false;
  if (local < HOLD_A) {
    mix = 0;
  } else if (local > HOLD_B) {
    mix = 1;
  } else {
    const t = (local - HOLD_A) / (HOLD_B - HOLD_A);
    mix = t * t * (3 - 2 * t); // smoothstep
    transitioning = true;
  }

  const current = mix < 0.5 ? famA : famB;
  const phase = frame * 0.02;
  return { famA, famB, mix, phase, current, transitioning };
}

// ── Shaders (GLSL ES 3.00) ──────────────────────────────────────────────────

export const VERT_SRC = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;      // seconds, derived from frame counter (deterministic)
uniform int   uFamA;
uniform int   uFamB;
uniform float uMix;       // crossfade famA -> famB
uniform float uPhase;     // traveling-wave phase
uniform float uAberr;     // chromatic-aberration amount
uniform float uFlicker;   // luminance multiplier from the SafeFlicker engine

out vec4 fragColor;

${LOGPOLAR_GLSL}
${PALETTE_GLSL}

const float PI = 3.14159265359;

// One planform family evaluated at screen point p (centered, aspect-normalized).
// Families 0–3 go through the log-polar (exp) warp; 4–6 are Cartesian/hyperbolic.
float familyField(int fam, vec2 p, float phase) {
  vec2 c = screenToCortex(p);
  float freq = 5.0;

  if (fam == 0) return formConstant(c, 0.0,      freq, phase); // tunnels (rings)
  if (fam == 1) return formConstant(c, PI * 0.5, freq, phase); // radial spokes
  if (fam == 2) return formConstant(c, PI * 0.25, freq, phase);// spirals
  if (fam == 3) return honeycomb(c, freq, phase);              // honeycomb lattice

  if (fam == 4) {
    // Concentric SQUARES: Chebyshev / L-infinity metric rings. max(|x|,|y|)
    // level-sets are axis-aligned squares — a "square tunnel" the exp() warp
    // (which only makes round rings) cannot produce.
    float m = max(abs(p.x), abs(p.y));
    return 0.5 + 0.5 * sin(freq * 2.0 * log(max(m, 1e-4)) + phase);
  }

  if (fam == 5) {
    // Crosses / Cartesian grid: sum of two axis-aligned 1-D plane waves ->
    // a plaid of bright plus/cross intersections.
    float k = 13.0;
    float g = sin(k * p.x + phase) + sin(k * p.y + phase);
    return 0.5 + 0.25 * g;
  }

  // fam == 6: hyperbolic planform — negatively-curved saddle level-sets.
  // Contours of (x^2 - y^2) and x*y are hyperbolae: a genuinely non-radial,
  // non-Cartesian motif from the 2026 mapping.
  float a = 9.0;
  float h = sin(a * (p.x * p.x - p.y * p.y) + phase)
          + sin(a * 2.0 * p.x * p.y - phase);
  return 0.5 + 0.25 * h;
}

float mixedField(vec2 p, float phase) {
  float a = familyField(uFamA, p, phase);
  float b = familyField(uFamB, p, phase);
  return mix(a, b, uMix);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // slow deterministic breathing zoom for the "alive" feel
  float zoom = 1.0 + 0.12 * sin(uTime * 0.15);
  vec2 p = uv * 1.9 * zoom;

  // chromatic aberration: evaluate the field at radially offset scales per channel
  float ab = uAberr;
  float vR = mixedField(p * (1.0 + ab), uPhase);
  float vG = mixedField(p,              uPhase);
  float vB = mixedField(p * (1.0 - ab), uPhase);

  // contrast shaping -> crisp neon bands
  vR = pow(clamp(vR, 0.0, 1.0), 1.6);
  vG = pow(clamp(vG, 0.0, 1.0), 1.6);
  vB = pow(clamp(vB, 0.0, 1.0), 1.6);

  vec3 col = vec3(dreamPalette(vR).r, dreamPalette(vG).g, dreamPalette(vB).b);
  col += dreamPalette(vG) * 0.35 * vG; // iridescent bloom off the center field

  // slow TRAVELING luminance drift — the safe default (NOT flicker)
  float drift = 0.82 + 0.18 * sin(uTime * 0.4 + length(p) * 1.5);

  // vignette to sink the field into near-black
  float vig = smoothstep(1.7, 0.2, length(uv));

  // uFlicker == 1.0 unless the opt-in Photic pulse is engaged (then a soft,
  // floor-limited sine <= 3 Hz supplied by _shared/psych/safeFlicker.ts).
  col *= drift * vig * uFlicker;

  // faint film grain (deterministic hash) so flats never band
  float gr = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  col += (gr - 0.5) * 0.04;

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;
