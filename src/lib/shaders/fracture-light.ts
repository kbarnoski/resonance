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

// Fracture Light — a jagged seam of light splits the dark and heals;
// bass restrikes a new fracture. Contained to one diagonal seam.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float strike = floor(u_time * (0.14 + u_bass * 0.1));
  float age = fract(u_time * (0.14 + u_bass * 0.1));
  float glow = 0.3 + 0.7 * (1.0 - age) * (1.0 - age); // never fully dark — the seam smolders between strikes
  for (int i = 0; i < 46; i++) {
    float fi = float(i);
    float s = fi / 46.0;
    vec3 h = hash3(strike * 31.7 + floor(s * 9.0));
    vec2 p = mix(vec2(-0.9, -0.45), vec2(0.75, 0.55), s);
    p += vec2((h.x - 0.5) * 0.22, (h.y - 0.5) * 0.3) * sin(s * 3.14159);
    float d = length(uv - p);
    float tw = 0.6 + 0.4 * sin(u_time * (6.0 + h.z * 9.0) * (0.6 + u_treble) + fi);
    col += pal(palT(s * 0.15)) * 0.0006 / (d * d + 0.00011) * glow * tw * 0.4;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
