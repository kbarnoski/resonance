/* ── 3456-surge · WebGL2 energy-tunnel shader ─────────────────────────────
 *
 *  A raw #version 300 es full-screen fragment shader. An endless neon
 *  tunnel of rushing rings whose speed, zoom, brightness and hue track the
 *  arc engine:
 *
 *    build   →  visuals COMPRESS inward (u_comp > 0), rings tighten, hue
 *               heats toward the drop as energy climbs
 *    drop    →  visuals EXPLODE outward (u_comp goes negative via u_flash),
 *               a white bloom flash blows out the centre
 *    groove  →  fast forward travel, brightness THROBS on every kick (u_pump)
 *    breakdown → travel slows, everything cools and dims
 *
 *  All temporal behaviour arrives through uniforms set from JS, so the
 *  shader and the audio share ONE clock. Luminance changes are smooth
 *  ramps (no hard strobe); u_reduce damps motion for prefers-reduced-motion.
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
uniform float u_travel;  // integrated forward travel (energy-weighted)
uniform float u_comp;    // radial compression: + pulls in (build), - pushes out (drop)
uniform float u_bright;  // overall brightness
uniform float u_pump;    // 0..1 kick throb
uniform float u_flash;   // 0..1 drop bloom flash
uniform float u_energy;  // 0..1 charge
uniform float u_hue;     // base hue rotation
uniform float u_reduce;  // 1.0 => reduced-motion damping

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 hue2rgb(float h) {
  vec3 k = mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0);
  return clamp(min(k, 4.0 - k), 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  float ang = atan(uv.y, uv.x);
  float r = length(uv);

  // radial compression / explosion. Positive u_comp squeezes the field
  // toward the centre (the build); the drop flash drives it negative and
  // the whole tunnel blows outward.
  float squeeze = 1.0 + u_comp * 0.9;
  float rc = r / max(0.12, squeeze);

  // classic tunnel mapping: inverse radius = depth down the tube
  float depth = u_travel + 0.9 / (rc + 0.06);

  // rushing rings + angular ribs
  float rings = 0.5 + 0.5 * sin(depth * 6.2831 - u_travel * 0.6);
  float ribs = 0.5 + 0.5 * sin(ang * 8.0 + depth * 0.8);
  float grain = hash21(vec2(floor(depth * 12.0), floor(ang * 6.0)));

  float wall = pow(rings, 2.2) * (0.55 + 0.45 * ribs);
  wall += grain * 0.12;

  // depth fog — distant tube fades to black (bloom lives at the centre)
  float fog = smoothstep(0.0, 1.4, rc);
  wall *= 1.0 - 0.7 * fog;

  // centre bloom: the "light at the end", flares on the drop
  float core = smoothstep(0.55, 0.0, r);
  float bloom = core * (0.5 + 1.6 * u_flash + 0.4 * u_energy);

  // hue heats up as energy builds; kick throb adds a bright pulse
  float hue = fract(u_hue + 0.06 * sin(depth * 0.4) - u_energy * 0.12);
  vec3 col = hue2rgb(hue) * wall;
  col += hue2rgb(fract(hue + 0.12)) * bloom;

  // kick pump: a soft outward brightness throb, strongest near the centre
  col += (0.25 + 0.6 * (1.0 - fog)) * u_pump * (0.35 + u_energy * 0.4)
         * hue2rgb(fract(hue + 0.5));

  // drop bloom flash — a smooth white wash, damped under reduced motion
  col += vec3(1.0) * u_flash * (0.6 - 0.4 * u_reduce) * (0.4 + core);

  col *= u_bright;

  // gentle vignette to seat the tunnel in the dark frame
  col *= 1.0 - 0.35 * smoothstep(0.7, 1.5, r);

  // tone-map + mild gamma so highlights bloom instead of clipping hard
  col = col / (1.0 + col);
  col = pow(col, vec3(0.85));

  fragColor = vec4(col, 1.0);
}`;
