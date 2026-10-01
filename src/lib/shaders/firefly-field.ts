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

// Firefly Field — a deep 3D meadow of drifting lights that blink on
// the highs and breathe with the bass. Color wanders slowly.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float breathe = 1.0 + u_bass * 0.12;
  for (int i = 0; i < 72; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 5.21);
    vec3 p = vec3(
      (h.x - 0.5) * 3.0 + sin(u_time * 0.21 * (0.5 + h.y) + fi) * 0.35,
      (h.y - 0.5) * 1.8 + sin(u_time * 0.17 * (0.5 + h.z) + fi * 1.3) * 0.28,
      0.8 + h.z * 2.6
    );
    vec2 ss = p.xy / (p.z / breathe);
    float d = length(uv - ss);
    float blink = smoothstep(0.25, 0.95, 0.5 + 0.5 * sin(u_time * (1.2 + h.x * 2.4) * (0.7 + u_treble * 1.6) + fi * 2.2));
    vec3 tint = pal(palT(h.y * 0.3));
    col += tint * 0.00042 / (d * d + 0.00012) * blink / p.z * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
