/* ── 6968-kholapse · GLSL for the folding wireframe k-hole tunnel ──────────
 *
 *  "Your own music dissolved into a ketamine k-hole." A single dissociation
 *  scalar d ∈ [0,1] drives an analytic polar tunnel receding toward an
 *  infinite center. A gridded violet WIREFRAME kaleido-folds and shears its
 *  shards into fractured receding planes as d rises.
 *
 *  Mapped onto Bera et al. 2026 (cortical mechanisms of ketamine
 *  dissociation): the cortex SUPPRESSES feedforward stimulus-specific detail
 *  while feedback context/salience persists, and at depth GENERATES internal
 *  patterns "without input."
 *    · feedforward (suppressed as d→1): wireline sharpness, spectral detail,
 *      the treble-tear that carries pitch identity — all thin and blur.
 *    · feedback (persists / amplifies): the global tunnel motion, the core
 *      glow, the low-frequency bass fold, the long feedback smear.
 *    · d→1: an internally-generated seeded drift takes over as the (thinning)
 *      audio surrenders control — "generation without input."
 *
 *  Ping-pong RGBA8 feedback (no float-buffer extension) advects the smear
 *  inward. Per-angular-sector spectral advection: bass folds the walls one
 *  way, treble tears the shards the other — the SHAPE of the real music
 *  descends the hole.
 *
 *  Photosensitive-safety is absolute: every luminance change here is a slow
 *  eased drift driven by uniforms — nothing flashes, nothing strobes.
 */

import { PALETTE_GLSL } from "../_shared/palette";

/** Full-screen triangle. Shared by the scene pass and the present pass. */
export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** Scene pass: draws the folding tunnel and blends the advected previous frame.
 *  Renders into the ping-pong target FBO while sampling the source FBO. */
export const FRAG_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  u_res;       // viewport pixels
uniform float u_time;      // seconds since first paint
uniform float u_d;         // 0..1 dissociation depth (the whole arc)
uniform float u_amp;       // 0..1 live amplitude (feedback: global glow)
uniform float u_centroid;  // 0..1 spectral centroid (feedforward: color hue)
uniform float u_bass;      // 0..1 low-band energy  (feedback: wall fold)
uniform float u_mid;       // 0..1 mid-band energy
uniform float u_treble;    // 0..1 high-band energy (feedforward: shard tear)
uniform float u_reduce;    // 1.0 if prefers-reduced-motion
uniform sampler2D u_prev;  // previous ping-pong frame (RGBA8)

${PALETTE_GLSL}

#define PI 3.14159265359

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * u_res) / u_res.y; // centered, aspect-correct
  vec2 suv = frag / u_res;                  // 0..1 for prev sampling

  float r = length(uv) + 1e-4;
  float a = atan(uv.y, uv.x);               // -PI..PI

  // Forward travel slows as depth freezes time (feedforward time-smear), and
  // slows further under reduced-motion. Never zero: the visual always drifts.
  float mo = mix(1.0, 0.4, u_reduce);
  float travel = u_time * (0.5 - 0.34 * u_d) * mo;

  // ── kaleido fold: the angle folds into more shards as d rises ───────────
  // (feedback gestalt reorganizing space without adding detail)
  float folds = 3.0 + floor(u_d * 9.0);
  float foldAmt = smoothstep(0.12, 1.0, u_d);
  float seg = 2.0 * PI / folds;
  float folded = abs(mod(a + PI, seg) - 0.5 * seg);
  float af = mix(a, folded * folds * 0.5 - PI * 0.5, foldAmt);

  // ── spectral advection per angular sector ───────────────────────────────
  // bass folds the walls (low-freq context, persists), treble tears the
  // shards (high-freq detail, suppressed as d->1 via the thin fade below).
  float sector = a / PI;                    // -1..1
  float bassFold = u_bass * 0.55 * sin(sector * 3.0 + travel * 0.4);
  float trebTear = u_treble * (0.5 * (1.0 - 0.7 * u_d)) * sin(af * 7.0 - travel * 1.3);

  // Tunnel coordinates receding toward the infinite center.
  float depth = 1.0 / r + travel + bassFold;
  float ang = af / PI;

  // ── internal seeded drift takes over as the real audio thins (d→1) ──────
  float internal = sin(depth * 1.7 + u_time * 0.21) * cos(ang * 2.0 - u_time * 0.13);
  float thin = smoothstep(0.62, 1.0, u_d);  // how far the audio has surrendered
  float drive = mix(u_amp, 0.45 + 0.45 * internal, thin);

  // ── the wireframe grid ──────────────────────────────────────────────────
  float gridN = 6.0;                        // rings along depth
  float gridM = folds * 2.0;                // spokes around the angle
  float lz = abs(fract(depth * gridN) - 0.5);
  float la = abs(fract(ang * gridM + trebTear) - 0.5);
  // Lines are crisp near the surface and blur/widen as feedforward detail is
  // suppressed with depth.
  float lw = 0.02 + 0.07 * (1.0 - u_d);
  float lineZ = smoothstep(lw, 0.0, lz);
  float lineA = smoothstep(lw, 0.0, la);
  float wire = max(lineZ, lineA);

  // Color: violet arc along depth, hue nudged by spectral centroid (detail).
  float ct = fract(depth * 0.14 + u_centroid * 0.28);
  vec3 col = dreamPalette(clamp(ct + 0.18 * drive, 0.0, 1.0));

  // Core light at the vanishing point — feedback/salience that persists and
  // amplifies with depth. Intimate, not a blown-out white end.
  float core = smoothstep(0.55, 0.0, r) * (0.35 + 0.55 * u_amp);
  vec3 glow = dreamPalette(0.74 + 0.18 * u_centroid) * core * (0.5 + 0.5 * u_d);

  vec3 scene = col * wire * (0.65 + 0.85 * drive) + glow;

  // Radial vignette keeps the hole personal and receding, never cosmic-bright.
  scene *= smoothstep(1.45, 0.08, r);

  // ── ping-pong feedback advection: draw the previous frame inward ────────
  vec2 center = vec2(0.5);
  float pull = 0.008 + 0.032 * u_d + 0.02 * u_bass; // inward smear grows w/ depth
  vec2 padv = mix(suv, center, pull);
  vec3 prev = texture(u_prev, padv).rgb;
  float decay = mix(0.8, 0.945, u_d);       // longer trails deeper

  vec3 outc = clamp(max(scene, prev * decay), 0.0, 1.0);
  fragColor = vec4(outc, 1.0);
}`;

/** Present pass: tone-maps the ping-pong texture to the screen. Fine detail
 *  desaturates slightly with depth (a last feedforward-suppression beat). */
export const PRESENT_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_d;

void main() {
  vec2 suv = gl_FragCoord.xy / u_res;
  vec3 c = texture(u_tex, suv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l), 0.22 * u_d);          // color detail thins with depth
  c = pow(c, vec3(0.9));                     // gentle gamma lift
  fragColor = vec4(c, 1.0);
}`;
