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

// Orbit Weaver — particles on four concentric orbital shells around
// the SHARED anchor (concentric law). Bass surges orbital speed.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  vec2 c = vec2(-0.08, 0.05);
  float w = 0.25 + u_bass * 1.1;
  for (int i = 0; i < 56; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 4.63);
    float shell = floor(h.x * 4.0);
    float radius = 0.18 + shell * 0.17 + (h.y - 0.5) * 0.02;
    float ang = h.z * 6.28318 + u_time * w * (1.0 - shell * 0.18) * (h.x > 0.5 ? 1.0 : -1.0);
    vec2 p = c + vec2(cos(ang), sin(ang)) * radius;
    float d = length(uv - p);
    float tw = 0.55 + 0.45 * sin(u_time * (4.0 + h.y * 7.0) * (0.6 + u_treble) + fi);
    vec3 tint = pal(palT(shell * 0.12));
    col += tint * 0.00045 / (d * d + 0.00013) * tw * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
