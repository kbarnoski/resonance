/* ── 1320-khole-tunnel · GLSL for the raymarched dissociative void ─────────
 *
 *  A full-screen WebGL2 fragment shader raymarching a vast dark void. The
 *  disembodied viewer drifts forward toward a distant warm being-of-light.
 *  Sparse luminous wisps and a faint tunnel of soft rings pass by; a hypoxic
 *  vignette constricts toward the light as you approach.
 *
 *  Temporal behaviour is driven entirely by uniforms set from JS, so the
 *  visual and the (desynced) audio share ONE steady pulse clock. NOTHING here
 *  flashes: the ~3 Hz pulse is a gentle, continuous luminance BREATH (small
 *  contrast), and the gamma clarity-swell is a smooth eased lift — never a
 *  strobe. Photosensitive-epilepsy safe by construction.
 */

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  u_res;      // viewport pixels
uniform float u_time;     // dilated journey seconds (scene motion)
uniform float u_pulse;    // 0..1 the SEEN ~3 Hz pulse breath (visual only)
uniform float u_light;    // 0..1 approach: distant point → filling glow
uniform float u_vignette; // 0..1 hypoxic constriction toward the light
uniform float u_clarity;  // 0..1 gamma clarity-swell near arrival (no strobe)
uniform float u_dissoc;   // 0..1 depth of dissociation (drift / smear)
uniform vec2  u_drift;    // gentle pointer look nudge, [-1,1]

#define STEPS 64
#define FAR 30.0

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// A faint tunnel of soft rings the viewer drifts through: distance to the
// nearest ring plane, wobbling gently so it feels alive, not mechanical.
float ringField(vec3 p) {
  float ringZ = 4.0; // spacing between rings
  float zc = mod(p.z, ringZ) - ringZ * 0.5;
  float r = length(p.xy);
  float radius = 3.1 + 0.35 * sin(p.z * 0.11 + u_time * 0.15);
  // torus-ish: near a ring when radius matches AND z near a ring plane
  float ring = length(vec2(r - radius, zc * 1.4));
  return ring;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  // Disembodied forward drift down the void; pointer nudges look direction.
  vec3 ro = vec3(0.0, 0.0, u_time * 1.1);
  vec3 fwd = normalize(vec3(u_drift * 0.18, 1.0));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec2 look = uv + u_drift * 0.05;
  vec3 rd = normalize(fwd + look.x * right + look.y * up);

  // Accumulate volumetric glow along the ray (we drift through open space).
  float t = 0.5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float fog = exp(-t * 0.12);

    // soft rings glow where the ray grazes them
    float ring = ringField(p);
    float ringGlow = exp(-ring * 2.6);
    vec3 ringCol = mix(vec3(0.22, 0.26, 0.42), vec3(0.5, 0.4, 0.55), u_dissoc);
    col += ringGlow * fog * ringCol * 0.05;

    // sparse luminous wisps drifting past (dust of the void)
    float w = hash21(floor(p.xy * 2.0) + floor(p.z * 0.5));
    w = smoothstep(0.992, 1.0, w);
    col += w * fog * vec3(0.55, 0.62, 0.85) * 0.6;

    // step: coarse but adaptive to the ring surface for a little parallax
    t += max(0.12, ring * 0.4);
    if (t > FAR) break;
  }

  // ── being of light: additive warm bloom at the vanishing point ──
  // A distant point at rest; a filling glow as you approach (u_light).
  float centre = length(look);
  float core = 0.06 + u_light * 0.9;
  float bloom = pow(max(0.0, 1.0 - centre * (1.5 - u_light * 0.9)), 3.0);
  float spark = exp(-centre * (13.0 - u_light * 9.0));
  vec3 lightCol = mix(
    vec3(1.0, 0.72, 0.36),  // warm amber (distant)
    vec3(1.0, 0.95, 0.9),   // toward soft white (arrival)
    u_light
  );
  col += lightCol * (bloom * core * 1.3 + spark * (0.35 + u_light * 1.4));

  // deep indigo void floor so structure reads without pure black
  col += vec3(0.015, 0.016, 0.035);

  // ── dissociative smear: gentle chromatic drift, grows with depth ──
  float ca = 0.0015 + u_dissoc * 0.004;
  col.r *= 1.0 + ca * centre * 22.0;
  col.b *= 1.0 - ca * centre * 16.0;

  // ── the ~3 Hz SEEN pulse: a small, smooth full-field luminance breath ──
  // Contrast intentionally shallow (max ~14%) and continuous — not a strobe.
  float breath = 0.93 + 0.14 * u_pulse;
  col *= breath;

  // ── gamma clarity-swell near arrival: smooth eased lucidity lift ──
  float g = mix(1.0, 0.68, u_clarity);
  col = pow(max(col, 0.0), vec3(g));
  col *= 1.0 + u_clarity * 0.3;

  // ── hypoxic vignette: peripheral darkening constricting toward the light ──
  float vig = smoothstep(1.05, 0.12 + u_vignette * 0.04, length(uv) * (0.85 + u_vignette * 1.0));
  vig *= 0.94 + 0.06 * sin(u_time * 0.5);
  col *= mix(1.0, vig, 0.4 + u_vignette * 0.5);

  // filmic roll-off so the light never clips to a harsh flat white (blowout guard)
  col = col / (col + vec3(0.9));

  fragColor = vec4(col, 1.0);
}`;
