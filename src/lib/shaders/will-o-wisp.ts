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

// Will-o-Wisp — four large wandering souls of light, each trailing
// glitter and wearing its own slowly turning color. Bass is breath.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  for (int wsp = 0; wsp < 4; wsp++) {
    float fw = float(wsp);
    float t = u_time * (0.21 + fw * 0.04) + fw * 9.7;
    vec2 p = vec2(sin(t * 0.53) * 0.9 + sin(t * 0.27) * 0.3, cos(t * 0.41) * 0.55 + sin(t * 0.19) * 0.2);
    float d = length(uv - p);
    vec3 tint = pal(palT(fw * 0.26));
    float breath = 0.5 + u_bass * 0.8;
    col += tint * 0.0022 / (d * d + 0.0016) * breath * 0.3;
    for (int k = 1; k <= 9; k++) {
      float fk = float(k);
      float tt = t - fk * 0.09;
      vec2 wp = vec2(sin(tt * 0.53) * 0.9 + sin(tt * 0.27) * 0.3, cos(tt * 0.41) * 0.55 + sin(tt * 0.19) * 0.2);
      vec3 rnd = hash3(floor(tt * 14.0) + fk * 5.3) - 0.5;
      wp += rnd.xy * fk * 0.025;
      float dk = length(uv - wp);
      float tw = 0.5 + 0.5 * sin(u_time * (5.0 + hash(fw * 9.0 + fk) * 8.0) * (0.6 + u_treble) + fk);
      col += tint * 0.00032 / (dk * dk + 0.00012) * (1.0 - fk / 9.0) * tw * 0.24;
    }
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
