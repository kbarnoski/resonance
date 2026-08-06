/* ── 7416-temperlattice · GLSL for the living crystal lattice ───────────────
 *
 * "Watch your tuning re-crystallize as you reshape your instrument's timbre."
 *
 * The derived scale degrees ride in an RGBA32F data texture (one texel per
 * site: xy = position, z = valley-depth brightness, w = played glow). A
 * full-screen fragment shader renders each site as a glowing crystalline node
 * via a signed-distance field, links neighbouring degrees with faint structural
 * bonds, and draws the adaptive-JI dyad as a bright strut snapping into place.
 *
 * A ping-pong RGBA8 feedback pass (no float-render extension needed — the float
 * data texture is only ever SAMPLED, which is core WebGL2) decays the previous
 * frame in place, so as a site migrates to its new consonance valley it leaves
 * a comet-tail: you literally see the tuning re-form.
 *
 * Photosensitive safety is absolute: brightness is slow eased drift driven by
 * uniforms — nothing flashes, nothing strobes.
 */

import { PALETTE_GLSL } from "../_shared/palette";

/** Full-screen triangle, shared by the scene and present passes. */
export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const MAX_SITES_GLSL = 16;

/** Scene pass: renders lattice nodes + bonds, blends the decayed prev frame. */
export const FRAG_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  u_res;       // viewport pixels
uniform float u_time;      // seconds since first paint
uniform int   u_count;     // number of live sites
uniform float u_morph;     // 0..1 how fast the timbre is currently moving
uniform float u_reduce;    // 1.0 if prefers-reduced-motion
uniform int   u_bondA;     // adaptive-JI dyad site index (or -1)
uniform int   u_bondB;
uniform float u_bondAmt;   // 0..1 snap progress of the forming dyad bond
uniform sampler2D u_sites; // RGBA32F: xy pos, z depth, w played glow
uniform sampler2D u_prev;  // previous ping-pong frame (RGBA8)

${PALETTE_GLSL}

#define MAX_SITES ${MAX_SITES_GLSL}

// distance from point p to segment a-b
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(1e-6, dot(ba, ba)), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 sitePos(int i) { return texelFetch(u_sites, ivec2(i, 0), 0).xy; }

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * u_res) / u_res.y; // centered, aspect-correct
  vec2 suv = frag / u_res;

  float mo = mix(1.0, 0.45, u_reduce);
  vec3 col = vec3(0.0);

  // ── structural bonds: link consecutive degrees around the spiral ─────────
  for (int i = 0; i < MAX_SITES; i++) {
    if (i >= u_count - 1) break;
    vec2 a = sitePos(i);
    vec2 b = sitePos(i + 1);
    float d = segDist(uv, a, b);
    float ba = texelFetch(u_sites, ivec2(i, 0), 0).z;
    float bb = texelFetch(u_sites, ivec2(i + 1, 0), 0).z;
    float bond = smoothstep(0.006, 0.0, d) * (0.12 + 0.10 * 0.5 * (ba + bb));
    col += dreamPalette(0.34) * bond;
  }

  // ── the adaptive-JI dyad: a bright strut snapping into place ─────────────
  if (u_bondA >= 0 && u_bondB >= 0 && u_bondA < u_count && u_bondB < u_count) {
    vec2 a = sitePos(u_bondA);
    vec2 b = sitePos(u_bondB);
    float d = segDist(uv, a, b);
    // the strut thickens + brightens as the glide locks in
    float w = mix(0.004, 0.012, u_bondAmt);
    float strut = smoothstep(w, 0.0, d) * (0.25 + 0.75 * u_bondAmt);
    // a travelling glint runs the strut as it forms
    float along = clamp(dot(uv - a, b - a) / max(1e-6, dot(b - a, b - a)), 0.0, 1.0);
    float glint = smoothstep(0.10, 0.0, abs(along - fract(u_time * 0.35))) * u_bondAmt;
    col += dreamPalette(0.80) * (strut + 0.5 * glint * strut);
  }

  // ── the crystalline nodes ────────────────────────────────────────────────
  for (int i = 0; i < MAX_SITES; i++) {
    if (i >= u_count) break;
    vec4 s = texelFetch(u_sites, ivec2(i, 0), 0);
    vec2 p = s.xy;
    float bright = s.z;
    float act = s.w;
    float d = length(uv - p);

    // faceted core: a soft SDF disc with a slow luminance shimmer
    float shimmer = 0.85 + 0.15 * sin(u_time * 0.6 * mo + float(i) * 1.7);
    float rad = 0.020 + 0.028 * bright + 0.030 * act;
    float core = smoothstep(rad, 0.0, d);
    float halo = exp(-d * 8.0) * (0.35 + 0.4 * bright);
    float lum = (0.30 + 0.70 * bright) * (core + halo) * shimmer;
    lum *= (0.55 + 1.15 * act);

    float hue = 0.30 + 0.42 * bright + 0.18 * act;
    col += dreamPalette(hue) * lum;

    // a thin crystalline ring on strongly-played sites
    float ring = smoothstep(0.006, 0.0, abs(d - rad * 1.6)) * act * 0.7;
    col += dreamPalette(0.70) * ring;
  }

  // faint pull toward the tonic centre so the crystal reads as anchored
  col += dreamPalette(0.18) * smoothstep(0.5, 0.0, length(uv)) * 0.05;

  // ── ping-pong feedback: decay the previous frame in place for the tail ──
  vec3 prev = texture(u_prev, suv).rgb;
  // longer trail while the lattice is actively migrating
  float decay = mix(0.88, 0.955, clamp(u_morph, 0.0, 1.0));
  vec3 outc = clamp(max(col, prev * decay), 0.0, 1.0);
  fragColor = vec4(outc, 1.0);
}`;

/** Present pass: tone-maps the ping-pong texture to the screen. */
export const PRESENT_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2 u_res;

void main() {
  vec2 suv = gl_FragCoord.xy / u_res;
  vec3 c = texture(u_tex, suv).rgb;
  // subtle radial vignette keeps the crystal intimate, not cosmic-bright
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  c *= smoothstep(1.35, 0.15, length(uv));
  c = pow(c, vec3(0.9));
  fragColor = vec4(c, 1.0);
}`;
