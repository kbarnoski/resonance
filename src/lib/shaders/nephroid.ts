import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Nephroid ----
// Kidney-shaped epicycloid: circle of radius r rolling outside radius r.
// Parametric: x = 3*cos(s) - cos(3*s), y = 3*sin(s) - sin(3*s) (scaled)
// Also visible as the caustic envelope inside a cylindrical cup.

float nephroidDist(vec2 p, float size, float phase) {
  float minD = 999.0;
  for (int i = 0; i < 100; i++) {
    float s = float(i) * 6.28318 / 100.0;
    vec2 pt = size * vec2(
      3.0 * cos(s + phase) - cos(3.0 * (s + phase)),
      3.0 * sin(s + phase) - sin(3.0 * (s + phase))
    ) / 4.0;
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  float baseSize = 0.35 + u_bass * 0.05;

  // Main nephroid
  vec2 p = rot2(t * 0.2) * uv;
  float d = nephroidDist(p, baseSize, t * 0.3);

  float glow = exp(-d * (30.0 + u_mid * 10.0));
  float core = smoothstep(0.005, 0.0, d);

  vec3 mainCol = palette(
    d * 6.0 + t * 0.25 + u_amplitude * 0.2,
    vec3(0.5, 0.5, 0.55),
    vec3(0.45, 0.42, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );
  color += mainCol * glow * 0.45;
  color += mainCol * core * 0.6;

  // Caustic envelope: parallel light rays reflecting in a circle
  // The nephroid is the envelope of reflected rays in a circular mirror
  float circR = baseSize * 1.15;
  float circDist = abs(length(uv) - circR);
  float circGlow = exp(-circDist * 40.0) * 0.25;
  vec3 circCol = palette(
    t * 0.35 + 0.5,
    vec3(0.55, 0.55, 0.6),
    vec3(0.3, 0.32, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += circCol * circGlow;

  // Reflected ray lines inside the circle
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float incAngle = fi * 6.28318 / 24.0 + t * 0.2;
    // Incoming point on circle
    vec2 inP = circR * vec2(cos(incAngle), sin(incAngle));
    // Reflected point (reflection law in circle: reflect angle doubles)
    float refAngle = 2.0 * incAngle + 3.14159;
    vec2 refP = circR * vec2(cos(refAngle), sin(refAngle));

    // Line segment distance
    vec2 pa = uv - inP;
    vec2 ba = refP - inP;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float lineDist = length(pa - ba * h);
    float lineGlow = exp(-lineDist * 80.0) * 0.08;

    vec3 lineCol = palette(
      fi * 0.04 + t * 0.2,
      vec3(0.4, 0.42, 0.5),
      vec3(0.25, 0.28, 0.35),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += lineCol * lineGlow * (0.5 + u_treble * 0.5);
  }

  // Second nephroid: smaller, counter-rotating
  vec2 p2 = rot2(-t * 0.25 + 0.8) * uv;
  float d2 = nephroidDist(p2, baseSize * 0.5, -t * 0.4);
  float glow2 = exp(-d2 * (35.0 + u_treble * 10.0));
  vec3 col2 = palette(
    d2 * 5.0 + t * 0.2 + 0.4,
    vec3(0.45, 0.48, 0.55),
    vec3(0.35, 0.38, 0.45),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.1, 0.3)
  );
  color += col2 * glow2 * 0.2;

  // Cusp points (nephroid has 2 cusps)
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float ca = fi * 3.14159 + t * 0.3;
    vec2 cusp = baseSize * vec2(
      3.0 * cos(ca) - cos(3.0 * ca),
      3.0 * sin(ca) - sin(3.0 * ca)
    ) / 4.0;
    cusp = rot2(t * 0.2) * cusp;
    float dd = length(uv - cusp);
    float cuspGlow = exp(-dd * dd * 600.0) * (0.5 + u_amplitude * 0.4);
    color += vec3(0.7, 0.75, 0.9) * cuspGlow;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
