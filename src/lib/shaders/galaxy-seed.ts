import { U } from "./shared";

export const FRAG =
  U +
  `
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}
// Evolving palette (Karel 2026-09-30: "they should also adjust in
// color... chemo just stays the same color"): a slow cycle through a
// cosmic gamut, nudged by the harmony (u_mid).
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }

// Galaxy Seed — particles born at a slowly turning spiral's heart,
// carried outward along two arms. Bass surges the arm glow.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  vec2 c = vec2(-0.08, 0.05);
  float spin = u_time * (0.12 + u_bass * 0.18);
  for (int i = 0; i < 66; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 7.73);
    float arm = h.x > 0.5 ? 0.0 : 3.14159;
    float birth = fract(u_time * 0.045 * (0.5 + h.y) + h.z);
    float r = 0.04 + birth * 0.95;
    float ang = arm + spin + r * 3.6 + (h.y - 0.5) * 0.35;
    vec2 p = c + vec2(cos(ang), sin(ang)) * r;
    float d = length(uv - p);
    float life = 1.0 - birth;
    float tw = 0.55 + 0.45 * sin(u_time * (3.0 + h.z * 7.0) * (0.6 + u_treble) + fi);
    vec3 tint = pal(palT(birth * 0.3));
    col += tint * 0.00045 / (d * d + 0.00014) * life * tw * (0.5 + u_bass * 0.7) * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
