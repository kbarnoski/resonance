import { U } from "./shared";

export const FRAG =
  U +
  `
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }

// Binary Stars — two bright hearts orbiting each other, exchanging a
// stream of particles. Bass tightens and brightens the dance.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  vec2 c = vec2(0.1, -0.05);
  float orb = u_time * (0.4 + u_bass * 0.35);
  float sep = 0.34 - u_bass * 0.08;
  vec2 a = c + vec2(cos(orb), sin(orb) * 0.6) * sep;
  vec2 b = c - vec2(cos(orb), sin(orb) * 0.6) * sep;
  vec3 ta = pal(palT(0.0));
  vec3 tb = pal(palT(0.4));
  float da = length(uv - a); float db = length(uv - b);
  col += ta * 0.0011 / (da * da + 0.0006) * 0.45;
  col += tb * 0.0009 / (db * db + 0.0006) * 0.45;
  for (int i = 0; i < 34; i++) {
    float fi = float(i);
    float s = fi / 34.0;
    vec3 h = hash3(fi * 5.57 + floor(u_time * 2.0));
    vec2 p = mix(a, b, s) + vec2(sin(s * 3.14159 + orb) * 0.1, cos(s * 6.28 + orb) * 0.06) + (h.xy - 0.5) * 0.03;
    float d = length(uv - p);
    float tw = 0.5 + 0.5 * sin(u_time * (5.0 + h.z * 8.0) * (0.6 + u_treble) + fi);
    col += mix(ta, tb, s) * 0.0003 / (d * d + 0.00012) * tw * 0.28;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
