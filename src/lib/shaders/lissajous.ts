import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Lissajous Figures ----
// Parametric curves: x = A*sin(a*t + d), y = B*sin(b*t)
// Different frequency ratios create distinct looping patterns.

float lissajousDist(vec2 p, float freqA, float freqB, float phase, float scale) {
  float minD = 999.0;
  for (int i = 0; i < 128; i++) {
    float s = float(i) * 6.28318 / 128.0;
    vec2 pt = scale * vec2(sin(freqA * s + phase), sin(freqB * s));
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  vec3 color = vec3(0.0);

  // Multiple Lissajous figures with evolving frequency ratios
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // Frequency ratios: 3:2, 5:4, 3:4, 5:6 — slowly evolving
    float freqA = 3.0 + fi * 0.7 + sin(t * 0.3 + fi) * 0.5;
    float freqB = 2.0 + fi * 0.5 + cos(t * 0.25 + fi) * 0.4;
    float phase = t * (0.8 + fi * 0.15) + u_bass * 0.5;
    float scale = 0.35 + u_amplitude * 0.05 - fi * 0.03;

    vec2 rp = rot2(fi * 0.3 + t * 0.05) * uv;
    float d = lissajousDist(rp, freqA, freqB, phase, scale);

    float glow = exp(-d * (45.0 + u_mid * 12.0));
    float core = smoothstep(0.004, 0.0, d);

    vec3 col = palette(
      fi * 0.25 + t * 0.2 + u_amplitude * 0.25,
      vec3(0.5, 0.52, 0.55),
      vec3(0.45, 0.42, 0.5),
      vec3(0.7, 0.9, 1.0),
      vec3(0.0, 0.08, 0.28)
    );

    color += col * glow * (0.45 - fi * 0.06);
    color += col * core * (0.5 - fi * 0.08);
  }

  // Animated tracing dot showing the current parametric position
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float freqA = 3.0 + fi * 0.7 + sin(t * 0.3 + fi) * 0.5;
    float freqB = 2.0 + fi * 0.5 + cos(t * 0.25 + fi) * 0.4;
    float phase = t * (0.8 + fi * 0.15) + u_bass * 0.5;
    float scale = 0.35 + u_amplitude * 0.05 - fi * 0.03;
    float s = t * 3.0 + fi * 2.0;
    vec2 dotP = scale * vec2(sin(freqA * s + phase), sin(freqB * s));
    vec2 rp = rot2(fi * 0.3 + t * 0.05) * uv;
    float dd = length(rp - dotP);
    float dotGlow = exp(-dd * dd * 500.0) * (0.6 + u_treble * 0.4);
    color += vec3(0.85, 0.9, 1.0) * dotGlow;
  }

  // Subtle axis cross-hairs
  float axisX = exp(-abs(uv.y) * 40.0) * 0.03;
  float axisY = exp(-abs(uv.x) * 40.0) * 0.03;
  color += vec3(0.3, 0.4, 0.5) * (axisX + axisY);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
