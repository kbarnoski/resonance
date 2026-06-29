/* ── 1041-nde-tunnel · GLSL for the raymarched infinite wormhole ──────────
 *
 *  A full-screen WebGL2 fragment shader that raymarches an infinite,
 *  curving tunnel. The camera flies endlessly down it toward a growing
 *  "being of light" at the vanishing point. A hypoxic vignette constricts
 *  the field toward the centre, and a "gamma clarity-snap" briefly sharpens
 *  everything near the peak.
 *
 *  All temporal behaviour is driven by uniforms set from the JS timeline,
 *  so visuals and audio share ONE clock. Nothing here flashes: every
 *  luminance change is a smooth ramp (photosensitive-epilepsy safe).
 */

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  u_res;       // viewport pixels
uniform float u_time;      // seconds since start (time-dilated upstream)
uniform float u_speed;     // forward travel speed along the tunnel
uniform float u_light;     // 0..1 intensity of the being-of-light bloom
uniform float u_vignette;  // 0..1 how tightly the hypoxic vignette constricts
uniform float u_clarity;   // 0..1 gamma clarity-snap (contrast/coherence)
uniform float u_open;      // 0..1 how "open" the void is (onset → drifting)
uniform vec2  u_drift;     // gentle pointer/gyro camera nudge, [-1,1]

#define STEPS 72
#define FAR 26.0

// cheap hash / value noise for faint drifting structures
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// the curving spine of the tunnel at depth z — endless sin/cos path
vec2 spine(float z) {
  return vec2(
    sin(z * 0.18) * 1.6 + sin(z * 0.07 + 1.3) * 0.9,
    cos(z * 0.15) * 1.4 + cos(z * 0.09 + 2.1) * 0.8
  );
}

// tunnel SDF: distance to a wobbling cylindrical wall around the spine
float mapTunnel(vec3 p, out float wallDetail) {
  vec2 c = spine(p.z);
  vec2 d = p.xy - c;
  float r = length(d);
  // breathing radius + slow ribbing along the wall for parallax texture
  float ribs = 0.12 * sin(p.z * 2.4 + atan(d.y, d.x) * 5.0);
  float radius = 2.05 + 0.18 * sin(p.z * 0.5 + u_time * 0.2) + ribs;
  wallDetail = ribs;
  // negative inside, positive outside → we march toward the wall from inside
  return radius - r;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  // camera flies forward; gentle drift nudges look direction (weightless)
  float travel = u_time * u_speed;
  vec3 ro = vec3(spine(travel), travel);
  // forward tangent of the spine, approximated
  vec2 ahead = spine(travel + 0.6) - spine(travel - 0.6);
  vec3 fwd = normalize(vec3(ahead * 0.5, 1.2));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);

  vec2 look = uv + u_drift * 0.08;
  vec3 rd = normalize(fwd + look.x * right + look.y * up);

  // raymarch toward the wall (we live inside the tube, so accumulate glow)
  float t = 0.0;
  vec3 col = vec3(0.0);
  float glow = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float detail;
    float dist = mapTunnel(p, detail);
    // accumulate luminous wisps near the wall, attenuated by depth fog
    float fog = exp(-t * 0.16);
    float wall = exp(-abs(dist) * 3.2);
    // iridescent oil-on-water sheen keyed to angle + depth
    float ang = atan(p.y - spine(p.z).y, p.x - spine(p.z).x);
    vec3 sheen = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + ang * 1.5 + p.z * 0.35 + detail * 6.0);
    col += wall * fog * sheen * 0.05;
    // sparse luminous structures drifting past (stars / wisps)
    float star = hash21(floor(p.xy * 3.0) + floor(p.z));
    star = smoothstep(0.985, 1.0, star);
    col += star * fog * vec3(0.7, 0.8, 1.0) * 0.7;
    glow += fog * 0.012;
    t += max(0.06, abs(dist) * 0.5 + 0.05);
    if (t > FAR) break;
  }

  // ── being of light: additive radial bloom at the vanishing point ──
  float centre = length(look);
  // light grows from a faint distant point (onset) to a filling glow (peak)
  float core = u_open * 0.15 + u_light;
  float bloom = pow(max(0.0, 1.0 - centre * (1.4 - u_light)), 3.0);
  float spark = exp(-centre * (10.0 - u_light * 7.0));
  vec3 lightCol = mix(
    vec3(1.0, 0.82, 0.45),   // warm gold
    vec3(1.0, 0.98, 0.95),   // toward white at the peak
    u_light
  );
  col += lightCol * (bloom * core * 1.4 + spark * (0.3 + u_light * 1.6));

  // base void tint — deep indigo, never pure black so structures read
  col += vec3(0.02, 0.02, 0.05) * u_open;
  col += glow * vec3(0.3, 0.35, 0.6) * u_open;

  // ── slow chromatic aberration (subtle, increases slightly toward peak) ──
  float ca = 0.0025 + u_clarity * 0.0025;
  col.r *= 1.0 + ca * centre * 20.0;
  col.b *= 1.0 - ca * centre * 14.0;

  // ── gamma clarity-snap: brief hyper-lucid contrast/coherence lift ──
  float g = mix(1.0, 0.62, u_clarity);     // lower gamma = more contrast
  col = pow(max(col, 0.0), vec3(g));
  col *= 1.0 + u_clarity * 0.35;

  // ── hypoxic vignette: peripheral darkening constricting toward centre ──
  // animated, smooth — the literal tunnel-vision of retinal ischaemia
  float vig = smoothstep(1.0, 0.1 + u_vignette * 0.05, length(uv) * (0.9 + u_vignette * 0.9));
  // breathing edge so it feels alive, not a hard mask
  vig *= 0.92 + 0.08 * sin(u_time * 0.6);
  col *= mix(1.0, vig, 0.55 + u_vignette * 0.45);

  // soft filmic-ish roll-off so the light never clips to a harsh flat white
  col = col / (col + vec3(0.85));

  fragColor = vec4(col, 1.0);
}`;
