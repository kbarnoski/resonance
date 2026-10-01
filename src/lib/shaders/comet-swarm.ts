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

// Comet Swarm — six comets arcing through 3D depth, trails of glitter.
// Bass surges their speed; each comet wears its own evolving color.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float t = u_time * (0.35 + u_bass * 0.75);
  for (int c = 0; c < 6; c++) {
    float fc = float(c);
    vec3 tint = pal(palT(fc * 0.17));
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float tt = t - fi * 0.06 + fc * 2.3;
      vec3 p = vec3(sin(tt * 0.43 + fc) * 1.3, cos(tt * 0.31 + fc * 1.7) * 0.8, 2.2 + sin(tt * 0.19 + fc * 0.9) * 1.1);
      if (p.z < 0.4) continue;
      vec2 ss = p.xy / p.z;
      float d = length(uv - ss);
      float headB = fi == 0.0 ? 2.6 : 0.0;
      float fade = 1.0 - fi / 12.0;
      float tw = 0.6 + 0.4 * sin(u_time * (4.0 + hash(fc * 7.0 + fi) * 6.0) * (0.5 + u_treble) + fi);
      col += tint * (0.00052 + 0.0002 * headB) / (d * d + 0.00018) * fade * fade * tw * 0.16;
    }
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
