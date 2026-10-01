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

// Rose Window — particles tracing a slowly turning five-petal rose
// curve around the shared anchor (concentric law). Bass blooms it.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  vec2 c = vec2(-0.08, 0.05);
  float bloom = 0.42 + u_bass * 0.22;
  float turn = u_time * 0.09;
  for (int i = 0; i < 64; i++) {
    float fi = float(i);
    float th = fi / 64.0 * 6.28318 + turn;
    float r = bloom * cos(2.5 * th) ;
    vec2 p = c + vec2(cos(th + turn * 0.4), sin(th + turn * 0.4)) * abs(r);
    vec3 h = hash3(fi * 2.33);
    float d = length(uv - p);
    float tw = 0.55 + 0.45 * sin(u_time * (3.5 + h.x * 6.0) * (0.6 + u_treble) + fi);
    col += pal(palT(abs(r) * 0.3)) * 0.00038 / (d * d + 0.00012) * tw * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
