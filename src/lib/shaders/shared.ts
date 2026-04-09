// ─── Shared GLSL utilities for all shaders ───

export const U = `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_amplitude;
`;

export const SMOOTH_NOISE = `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float snoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(hash2(i), f),
                 dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}
`;

// Iq cosine palette — replaces HSV everywhere
export const VISIONARY_PALETTE = `
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}
`;

// 2D rotation matrix
export const ROT2 = `
mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}
`;

// Smooth minimum for SDF blending
export const SMIN = `
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
`;

// Voronoi — F1 and F2 distances
export const VORONOI = `
vec3 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  vec2 mg;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.5 * sin(vec2(dot(n + g, vec2(127.1, 311.7)), dot(n + g, vec2(269.5, 183.3))) + 6.28 * fract(sin(dot(n + g, vec2(41.7, 89.3))) * 2745.3));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) { md2 = md1; md1 = d; mg = r; }
      else if (d < md2) { md2 = d; }
    }
  }
  return vec3(sqrt(md1), sqrt(md2), 0.0);
}
`;

// SDF primitives
export const SDF_PRIMITIVES = `
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTriangle(vec2 p, float r) {
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
`;
