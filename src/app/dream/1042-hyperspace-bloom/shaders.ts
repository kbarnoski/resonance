/* ── 1042-hyperspace-bloom · WebGL2 raymarch shaders ─────────────────────
 *
 *  The 24-cell is rotated in 4D and stereographically projected to 3D on the
 *  CPU each frame; its 96 edges arrive here as 192 endpoints in u_edges.
 *  The fragment shader raymarches a smooth union of glowing capsules along
 *  those edges, shading them with thin-film iridescence + neon emission and
 *  finishing with chromatic aberration toward the rim and a soft vignette.
 *
 *  Performance: step count is capped and the march bails early; the SDF
 *  loops over a uniform edge count so empty space exits fast.
 */

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// 96 edges → 192 endpoints. Padded to a fixed array for a stable uniform.
export const MAX_EDGES = 96;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_speed;    // rotation/flow rate (audio bass lifts this)
uniform float u_glow;     // neon emissive gain (audio loudness lifts this)
uniform float u_sat;      // saturation / iridescence depth (audio highs)
uniform float u_bloom;    // stereographic balloon amount
uniform float u_peak;     // breakthrough proximity 0..1
uniform int   u_edgeCount;
uniform vec3  u_edges[${MAX_EDGES * 2}]; // [a0,b0, a1,b1, ...] projected 3D
uniform vec2  u_drift;    // device-tilt / optional camera nudge

const int  MAX_STEPS = 88;
const float MAX_DIST = 22.0;
const float SURF     = 0.0018;

// smooth-min for the glowing union of capsules
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// distance from point p to capsule segment a-b of radius r
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// scene SDF: smooth union over all projected edges
float map(vec3 p) {
  float d = MAX_DIST;
  float radius = 0.045 + 0.03 * u_bloom;
  for (int i = 0; i < ${MAX_EDGES}; i++) {
    if (i >= u_edgeCount) break;
    vec3 a = u_edges[i * 2];
    vec3 b = u_edges[i * 2 + 1];
    float dc = sdCapsule(p, a, b, radius);
    d = smin(d, dc, 0.16);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0009, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

// jeweled neon-iridescent palette (cosine palette, Inigo Quilez style)
vec3 palette(float t) {
  vec3 a = vec3(0.55, 0.40, 0.65);
  vec3 b = vec3(0.45, 0.45, 0.55);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

// thin-film iridescence shimmer based on view/normal angle
vec3 iridescence(float ang, float seed) {
  float f = ang * 5.0 + seed * 2.4 + u_time * 0.15;
  return palette(f);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  // slow auto-journey orbit camera, gently nudged by device tilt
  float orbit = u_time * 0.12 * (0.6 + 0.7 * u_speed);
  float yaw = orbit + u_drift.x * 0.6;
  float pitch = 0.25 + u_drift.y * 0.5 + 0.12 * sin(u_time * 0.07);
  float camR = 5.4 - 1.4 * u_peak;        // drift inward at breakthrough
  vec3 ro = vec3(
    camR * cos(yaw) * cos(pitch),
    camR * sin(pitch),
    camR * sin(yaw) * cos(pitch)
  );
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw + uv.x * rt + uv.y * up);

  // ── raymarch ──
  float t = 0.0;
  float glowAccum = 0.0;
  bool hit = false;
  vec3 hp = vec3(0.0);
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    // soft volumetric neon halo: accumulate as we pass near the edges
    glowAccum += 0.014 / (0.02 + d * d * 7.0);
    if (d < SURF) { hit = true; hp = p; break; }
    t += d * 0.9;
    if (t > MAX_DIST) break;
  }

  vec3 col = vec3(0.0);

  if (hit) {
    vec3 n = calcNormal(hp);
    vec3 v = normalize(ro - hp);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float ang = dot(n, v);
    float seed = length(hp) * 0.7;

    vec3 irid = iridescence(ang, seed);
    // saturate toward the jeweled palette
    float lum = dot(irid, vec3(0.299, 0.587, 0.114));
    irid = mix(vec3(lum), irid, 0.6 + u_sat * 0.7);

    vec3 base = irid * (0.4 + 0.9 * fres);
    col = base * (0.5 + 1.3 * u_glow);
    col += irid * fres * (0.6 + u_peak); // bright neon rim
  }

  // additive volumetric halo — the structure glows even off-surface
  vec3 haloTint = palette(0.5 + 0.2 * sin(u_time * 0.2) + length(uv) * 0.3);
  col += haloTint * glowAccum * (0.5 + 0.8 * u_glow) * (0.7 + u_sat);

  // chromatic aberration toward the rim (sample the halo color shifted)
  float rim = length(uv);
  float ca = (0.06 + 0.14 * u_peak) * rim;
  col.r *= 1.0 + ca;
  col.b *= 1.0 - ca * 0.6;

  // tone + vignette
  col = col / (col + vec3(0.75));         // soft filmic-ish compression
  float vig = smoothstep(1.25, 0.25, rim);
  col *= mix(0.35, 1.0, vig + 0.25 * u_peak);

  // subtle dark-purple cosmic floor so it never reads pure black
  col += vec3(0.015, 0.01, 0.03) * (1.0 - rim * 0.5);

  outColor = vec4(col, 1.0);
}
`;
