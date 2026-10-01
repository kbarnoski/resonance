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

// Pendulum Dust — a glittering bob swinging on an unseen thread,
// shedding dust at the bottom of each arc. Bass widens the swing.
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = vec3(0.0);

  vec2 pivot = vec2(0.15, 0.85);
  float swing = (0.5 + u_bass * 0.45) * sin(u_time * 1.1);
  float ang = -1.5708 + swing;
  float armLen = 1.05;
  vec2 bob = pivot + vec2(cos(ang), sin(ang)) * armLen;
  float d = length(uv - bob);
  vec3 tint = pal(palT(0.0));
  col += tint * 0.0016 / (d * d + 0.0009) * 0.45;
  for (int k = 1; k <= 22; k++) {
    float fk = float(k);
    float ta = u_time - fk * 0.05;
    float swa = (0.5 + u_bass * 0.45) * sin(ta * 1.1);
    vec2 pb = pivot + vec2(cos(-1.5708 + swa), sin(-1.5708 + swa)) * armLen;
    vec3 rnd = hash3(floor(ta * 16.0) + fk * 3.7) - 0.5;
    pb += rnd.xy * fk * 0.014;
    pb.y -= fk * fk * 0.0012;
    float dk = length(uv - pb);
    float tw = 0.5 + 0.5 * sin(u_time * (5.0 + hash(fk) * 7.0) * (0.6 + u_treble) + fk);
    col += pal(palT(fk * 0.012)) * 0.00034 / (dk * dk + 0.00012) * (1.0 - fk / 22.0) * tw * 0.3;
  }

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
