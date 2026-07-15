// ─────────────────────────────────────────────────────────────────────────────
// shader.ts — WebGL2 (GLSL ES 3.00) sources for the jeweled tesseract melt.
//
//   The vertex stage is a single full-screen triangle. All the work is in the
//   fragment stage: the 32 projected tesseract edges arrive as uniform arrays
//   (each a vec4 of the two 2D endpoints, plus a vec2 of hyper-depth w + z
//   brightness). For every pixel we fold the plane into an N-fold kaleidoscope,
//   accumulate a soft additive glow field over all edges, tint each edge with a
//   thin-film iridescence ramp keyed to its 4D w-coordinate, and sample the
//   whole field three times at slightly different radii for chromatic
//   aberration. A slow, soft luminance multiplier (u_flick, always ≤1, never a
//   hard strobe) breathes the whole frame. No three.js — raw WebGL2.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_EDGES = 32;

export const VERT_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform int   u_edgeCount;
uniform vec4  u_edges[${MAX_EDGES}];   // (ax, ay, bx, by)
uniform vec2  u_edgeMeta[${MAX_EDGES}]; // (wColor, depth)
uniform float u_flick;      // soft luminance multiplier in [floor,1]
uniform float u_kfold;      // kaleidoscope fold count
uniform float u_intensity;  // overall glow gain (rises with motion)

out vec4 fragColor;

// Distance from point p to segment a-b.
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Fold the plane into an N-fold mirrored kaleidoscope wedge.
vec2 kaleido(vec2 p, float n) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float seg = 6.28318530718 / n;
  a = mod(a, seg);
  a = abs(a - 0.5 * seg);
  return vec2(cos(a), sin(a)) * r;
}

// Thin-film iridescence ramp — saturated jeweled spectrum, not pastel.
vec3 irid(float t) {
  vec3 base = 0.5 + 0.5 * cos(6.28318530718 * (vec3(0.0, 0.33, 0.67) + t));
  // push saturation: bias away from grey
  vec3 g = vec3(dot(base, vec3(0.333)));
  return mix(g, base, 1.35);
}

// Additive glow of all edges evaluated at (already-folded) point p.
vec3 fieldRGB(vec2 p) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${MAX_EDGES}; i++) {
    if (i >= u_edgeCount) break;
    vec4 e = u_edges[i];
    float d = segDist(p, e.xy, e.zw);
    float g = 0.0055 / (d + 0.004);
    g = g * g * 0.9;
    float wv = u_edgeMeta[i].x;
    float depth = u_edgeMeta[i].y;
    vec3 tint = irid(wv * 0.32 + u_time * 0.05 + float(i) * 0.013);
    col += tint * g * (0.35 + 0.75 * depth);
  }
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);

  // Chromatic aberration: sample the folded field at three radii, one per
  // channel, so edges fringe into their spectral neighbours.
  float kf = u_kfold;
  vec3 A = fieldRGB(kaleido(uv * 0.986, kf));
  vec3 B = fieldRGB(kaleido(uv * 1.000, kf));
  vec3 C = fieldRGB(kaleido(uv * 1.014, kf));
  vec3 col = vec3(A.r, B.g, C.b);

  // Faint jeweled backdrop so pure black is never dead — deep violet vignette.
  float r = length(uv);
  col += vec3(0.05, 0.02, 0.09) * (1.0 - smoothstep(0.0, 1.4, r));

  col *= u_intensity;
  col = col / (1.0 + col);          // Reinhard tone map — no blown highlights
  col *= u_flick;                   // soft, slow luminance breath (≤1)
  col = pow(col, vec3(0.82));       // gentle gamma lift

  fragColor = vec4(col, 1.0);
}`;
