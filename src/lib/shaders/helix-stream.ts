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

// Helix Stream — a double spiral of particles climbing one column of
// the frame. Bass accelerates the climb; the strands counter-color.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  float climb = u_time * (0.25 + u_bass * 0.5);
  float xAnchor = -0.45;
  for (int i = 0; i < 60; i++) {
    float fi = float(i);
    float strand = fi < 30.0 ? 0.0 : 3.14159;
    float s = fract(fi * 0.0333 + climb * 0.17);
    float y = -1.1 + s * 2.2;
    float ang = y * 4.2 + climb + strand;
    vec3 h = hash3(fi * 4.19);
    vec2 p = vec2(xAnchor + cos(ang) * (0.16 + u_mid * 0.07) + (h.x - 0.5) * 0.02, y);
    float depth = 0.75 + sin(ang) * 0.25;
    float d = length(uv - p);
    float tw = 0.55 + 0.45 * sin(u_time * (4.0 + h.y * 7.0) * (0.6 + u_treble) + fi);
    col += pal(palT(strand * 0.08 + s * 0.1)) * 0.0004 / (d * d + 0.00013) * depth * tw * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
