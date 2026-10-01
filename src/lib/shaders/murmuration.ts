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

// Murmuration — a flock of tiny lights swirling as one organism.
// Mid is the wind in the flock; bass pulls it tight then releases.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float t = u_time * 0.3;
  vec2 flock = vec2(sin(t * 0.47) * 0.5, cos(t * 0.36) * 0.3);
  float tightness = 0.9 - u_bass * 0.35;
  for (int i = 0; i < 80; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 3.91);
    float a1 = t * (0.7 + h.x * 0.5) + fi * 0.6;
    float turb = 0.1 + u_mid * 0.3;
    vec2 p = flock + vec2(
      sin(a1) * (0.2 + h.y * 0.45) + sin(a1 * 2.3 + fi) * turb,
      cos(a1 * 0.83 + h.z * 4.0) * (0.14 + h.x * 0.3) + cos(a1 * 1.9) * turb * 0.7
    ) * tightness;
    float d = length(uv - p);
    vec3 tint = pal(palT(0.1 + h.y * 0.1));
    col += tint * 0.00028 / (d * d + 0.0001) * 0.33;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
