import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Involute of a Circle ----
// The involute is the path traced by unwinding a taut string from a circle.
// Parametric: x = r*(cos(s) + s*sin(s)), y = r*(sin(s) - s*cos(s))

float involuteDist(vec2 p, float r, float maxS) {
  float minD = 999.0;
  for (int i = 0; i < 100; i++) {
    float s = float(i) * maxS / 100.0;
    vec2 pt = r * vec2(cos(s) + s * sin(s), sin(s) - s * cos(s));
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  float baseR = 0.04 + u_bass * 0.005;

  // Multiple involute spirals unwinding from different angles
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float startAngle = fi * 1.5708 + t * 0.3; // 90 degree offsets
    float maxS = 8.0 + u_amplitude * 2.0 + fi * 0.5;

    vec2 rp = rot2(startAngle) * uv;
    float d = involuteDist(rp, baseR, maxS);

    float glow = exp(-d * (30.0 + u_mid * 10.0));
    float core = smoothstep(0.006, 0.0, d);

    vec3 col = palette(
      fi * 0.25 + t * 0.25 + u_amplitude * 0.2,
      vec3(0.5, 0.52, 0.55),
      vec3(0.4, 0.42, 0.48),
      vec3(0.7, 0.9, 1.0),
      vec3(0.0, 0.08, 0.25)
    );

    color += col * glow * (0.35 - fi * 0.04);
    color += col * core * (0.5 - fi * 0.06);
  }

  // Base circle from which the involute unwinds
  float circleDist = abs(length(uv) - baseR * 1.5);
  float circleGlow = exp(-circleDist * 60.0) * 0.5;
  vec3 circleCol = palette(
    t * 0.4,
    vec3(0.6, 0.6, 0.65),
    vec3(0.3, 0.32, 0.38),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += circleCol * circleGlow;

  // Unwinding string visualization: tangent lines
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float s = t * 1.5 + fi * 1.05;
    float r = baseR * 1.5;
    // Point on circle
    vec2 circP = r * vec2(cos(s), sin(s));
    // Point on involute
    float invR = baseR;
    vec2 invP = invR * vec2(cos(s) + s * sin(s), sin(s) - s * cos(s));
    // Distance from uv to line segment
    vec2 pa = uv - circP;
    vec2 ba = invP - circP;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float lineDist = length(pa - ba * h);
    float lineGlow = exp(-lineDist * 80.0) * 0.15;
    vec3 lineCol = palette(
      fi * 0.2 + t * 0.3 + 0.5,
      vec3(0.4, 0.42, 0.5),
      vec3(0.25, 0.28, 0.35),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += lineCol * lineGlow * (0.5 + u_treble * 0.5);
  }

  // Gear tooth hints along the base circle
  float angle = atan(uv.y, uv.x);
  float teeth = smoothstep(0.02, 0.0, abs(sin(angle * 12.0 + t)) * length(uv) - baseR * 1.3);
  float teethMask = smoothstep(0.1, 0.04, abs(length(uv) - baseR * 1.5));
  color += vec3(0.3, 0.35, 0.45) * teeth * teethMask * 0.2 * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
