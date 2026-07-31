/* ── 4168-surge · WebGL2 energy-FIELD shader ──────────────────────────────
 *
 *  A full-screen #version 300 es fragment shader: a flowing, domain-warped
 *  PLASMA bloom (not a point cloud, not a tunnel) whose speed, warp depth and
 *  brightness are coupled to the arc engine and a live audio envelope:
 *
 *    intro/breakdown → slow, cool violet drift, low bloom
 *    build           → the field TIGHTENS and heats as energy climbs; the
 *                       riser's rising drive pushes warp frequency up
 *    drop            → a radial SURGE: central bloom blooms outward, warm
 *                       accents flare, the whole field pulses with the kick
 *    drop 2          → wider, hotter, higher-contrast than drop 1
 *
 *  SAFETY: all luminance change is a smooth SWELL — the kick "pump" and drop
 *  "flash" ride slow envelopes set from JS (well under 3 Hz), and u_reduce
 *  damps every motion term. There is NO hard black↔white strobe anywhere.
 *  Palette stays violet-forward; warm (magenta/amber) appears only inside the
 *  art, at the peak of the surge.
 */

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  u_res;     // viewport pixels
uniform float u_time;    // wall-clock seconds
uniform float u_energy;  // 0..1 arc energy
uniform float u_riser;   // 0..1 build riser drive
uniform float u_rms;     // 0..1 live broadband envelope
uniform float u_low;     // 0..1 live low-band (kick/sub) pump
uniform float u_flash;   // 0..1 drop bloom impulse
uniform float u_warm;    // 0..1 warmth of the palette (heats toward drops)
uniform float u_reduce;  // 1.0 => reduced-motion damping

// value noise + fbm ---------------------------------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.1);
    amp *= 0.5;
  }
  return v;
}

vec3 palette(float t, float warm) {
  // violet-forward base; warm pushes toward magenta/amber accents on the drop
  vec3 deep   = vec3(0.05, 0.02, 0.12);   // near-black violet
  vec3 violet = vec3(0.42, 0.24, 0.85);   // brand violet
  vec3 lilac  = vec3(0.72, 0.60, 1.00);   // soft highlight
  vec3 hot    = mix(vec3(0.85, 0.30, 0.90),  // magenta
                    vec3(1.00, 0.62, 0.38),  // warm amber accent
                    warm);
  vec3 c = mix(deep, violet, smoothstep(0.0, 0.45, t));
  c = mix(c, lilac, smoothstep(0.4, 0.8, t));
  c = mix(c, hot, smoothstep(0.72, 1.0, t) * warm);
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float r = length(uv);

  float damp = 1.0 - 0.7 * u_reduce;
  float t = u_time * (0.06 + 0.20 * u_energy) * damp;

  // domain warp: two chained fbm displacements. Warp scale rises with the
  // build riser so the field visibly TIGHTENS heading into each drop.
  float scale = 1.6 + 2.6 * u_energy + 1.6 * u_riser;
  vec2 p = uv * scale;

  // slow rotation, energy-scaled (a swell, not a spin-strobe)
  float a = 0.15 * u_time * damp;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;

  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, 1.3) - vec2(t, 0.0)));
  vec2 rr = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.5),
                 fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.4));
  float f = fbm(p + 2.4 * rr);

  // radial SURGE: on the drop the flash pushes a bright bloom outward from
  // the centre; the low-band pump adds a slow luminance throb (< ~3 Hz).
  float surge = u_flash * exp(-r * (2.4 - 1.4 * u_flash));
  float pump = 0.10 * u_low + 0.06 * u_rms;
  float core = smoothstep(0.9, 0.0, r) * (0.25 + 0.9 * u_energy);

  float field = f + 0.5 * (rr.x + rr.y) * 0.5;
  float lum = field * (0.5 + 0.6 * u_energy) + core * 0.6 + surge + pump;

  // vignette keeps edges calm
  lum *= 1.0 - 0.55 * smoothstep(0.6, 1.3, r);
  lum = clamp(lum, 0.0, 1.6);

  float warm = clamp(u_warm + 0.5 * u_flash, 0.0, 1.0);
  vec3 col = palette(clamp(lum, 0.0, 1.0), warm);

  // bloom lift from the surge/pump, tinted warm at the peak (never pure white)
  col += (surge * 0.8 + pump * 1.2) * mix(vec3(0.5, 0.35, 0.9),
                                          vec3(1.0, 0.7, 0.55), warm);
  col = col / (1.0 + 0.35 * col); // soft tone-map, no blown highlights

  fragColor = vec4(col, 1.0);
}`;
