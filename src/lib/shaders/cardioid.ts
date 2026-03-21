import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Cardioid ----
// Heart-shaped curve from a circle rolling around another circle of equal radius.
// Polar form: r = a(1 + cos(theta))

float cardioidDist(vec2 p, float a) {
  float minD = 999.0;
  for (int i = 0; i < 80; i++) {
    float theta = float(i) * 6.28318 / 80.0;
    float r = a * (1.0 + cos(theta));
    vec2 pt = r * vec2(cos(theta), sin(theta));
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  // Shift center so cardioid sits nicely
  vec2 p = uv + vec2(0.15, 0.0);
  p = rot2(t * 0.2) * p;

  float baseA = 0.18 + u_bass * 0.04;

  // Layered cardioids with different rotations
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = baseA * (1.0 + fi * 0.12);
    float rot = fi * 1.0472 + t * (0.4 + fi * 0.1); // 60 degree offsets
    vec2 rp = rot2(rot) * p;

    float d = cardioidDist(rp, a);
    float glow = exp(-d * (50.0 + u_mid * 15.0));
    float core = smoothstep(0.004, 0.0, d);

    vec3 col = palette(
      fi * 0.15 + t * 0.25 + u_amplitude * 0.3,
      vec3(0.5, 0.5, 0.55),
      vec3(0.45, 0.4, 0.5),
      vec3(0.7, 0.85, 1.0),
      vec3(0.0, 0.1, 0.3)
    );

    float alpha = 0.5 - fi * 0.05;
    color += col * glow * alpha;
    color += col * core * 0.6;
  }

  // Rolling circle visualization: show the generating circle
  float circAngle = t * 1.5;
  float circR = baseA;
  vec2 circCenter = circR * 2.0 * vec2(cos(circAngle), sin(circAngle));
  circCenter = rot2(t * 0.2) * (circCenter - vec2(0.15, 0.0));
  float circDist = abs(length(uv - circCenter) - circR);
  float circGlow = exp(-circDist * 60.0) * (0.3 + u_treble * 0.3);
  vec3 circCol = palette(
    t * 0.6,
    vec3(0.6, 0.6, 0.65),
    vec3(0.3, 0.35, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.15, 0.1, 0.35)
  );
  color += circCol * circGlow;

  // Tracing point on the rolling circle
  vec2 traceP = circCenter + circR * vec2(cos(-circAngle), sin(-circAngle));
  float traceDot = exp(-length(uv - traceP) * length(uv - traceP) * 600.0);
  color += vec3(0.8, 0.85, 1.0) * traceDot * (0.7 + u_amplitude * 0.3);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
