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

// Ember Fountain — sparks rising from below in a widening column.
// Bass erupts extra velocity and brightness; color drifts warm->cool.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float speed = 0.16 + u_bass * 0.3;
  for (int i = 0; i < 64; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 3.17);
    float cycle = fract(u_time * speed * (0.5 + h.x * 0.8) + h.y);
    float y = -1.05 + cycle * 2.1;
    float wander = sin(u_time * (0.6 + h.z) + fi) * 0.12;
    float x = (h.x - 0.5) * (0.25 + cycle * 0.9) + wander + sin(fi) * 0.1;
    float d = length(uv - vec2(x, y));
    float life = 1.0 - cycle;
    float tw = 0.55 + 0.45 * sin(u_time * (5.0 + h.y * 8.0) * (0.6 + u_treble) + fi);
    vec3 tint = pal(palT(0.05 + cycle * 0.22));
    col += tint * 0.0008 / (d * d + 0.00022) * life * life * tw * (0.4 + u_bass * 0.9) * 0.33;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
