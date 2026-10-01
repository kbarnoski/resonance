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

// Meteor Rain — sparse diagonal meteors with glittering wakes.
// Bass raises the fall rate and streak length.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  vec2 dir = normalize(vec2(0.55, -1.0));
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec3 h = hash3(fi * 6.91);
    float period = 2.5 + h.x * 4.0;
    float cycle = fract(u_time * (0.22 + u_bass * 0.22) / period * 3.0 + h.y);
    vec2 start = vec2(-1.6 + h.x * 3.2, 1.25 + h.z * 0.4);
    vec2 head = start + dir * cycle * 3.0;
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      vec2 p = head - dir * fk * (0.035 + u_bass * 0.03);
      float d = length(uv - p);
      float fade = (1.0 - fk / 7.0) * (1.0 - cycle);
      float tw = k == 0 ? 1.0 : 0.5 + 0.5 * sin(u_time * (6.0 + hash(fi + fk) * 8.0) * (0.6 + u_treble) + fk);
      vec3 tint = pal(palT(h.z * 0.3 + fk * 0.02));
      col += tint * 0.0007 / (d * d + 0.00013) * fade * fade * tw * 0.42;
    }
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
