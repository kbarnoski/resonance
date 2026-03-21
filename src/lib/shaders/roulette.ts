import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Roulette / Spirograph ----
// Epicycloid/hypocycloid family: curves traced by a point on a circle
// rolling inside or outside another circle. Multiple layered curves.

vec2 hypotrochoid(float s, float R, float r, float d) {
  float diff = R - r;
  float ratio = diff / r;
  return vec2(
    diff * cos(s) + d * cos(ratio * s),
    diff * sin(s) - d * sin(ratio * s)
  );
}

vec2 epitrochoidCurve(float s, float R, float r, float d) {
  float sum = R + r;
  float ratio = sum / r;
  return vec2(
    sum * cos(s) - d * cos(ratio * s),
    sum * sin(s) - d * sin(ratio * s)
  );
}

float curveDist(vec2 p, float R, float r, float d, float scale, bool isHypo) {
  float minD = 999.0;
  for (int i = 0; i < 180; i++) {
    float s = float(i) * 6.28318 * 4.0 / 180.0;
    vec2 pt;
    if (isHypo) {
      pt = hypotrochoid(s, R, r, d) * scale;
    } else {
      pt = epitrochoidCurve(s, R, r, d) * scale;
    }
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  vec3 color = vec3(0.0);

  // Curve 1: hypotrochoid — bass reactive
  float R1 = 5.0;
  float r1 = 3.0 + u_bass * 0.3;
  float d1 = 2.5 + sin(t * 0.4) * 0.5;
  float scale1 = 0.06;
  vec2 p1 = rot2(t * 0.15) * uv;
  float dist1 = curveDist(p1, R1, r1, d1, scale1, true);
  float glow1 = exp(-dist1 * (30.0 + u_mid * 10.0));
  float core1 = smoothstep(0.005, 0.0, dist1);

  vec3 col1 = palette(
    dist1 * 5.0 + t * 0.3 + u_amplitude * 0.2,
    vec3(0.5, 0.5, 0.55),
    vec3(0.45, 0.42, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );
  color += col1 * glow1 * 0.4;
  color += col1 * core1 * 0.5;

  // Curve 2: epitrochoid — mid reactive, counter-rotating
  float R2 = 4.0;
  float r2 = 1.5 + u_mid * 0.2;
  float d2 = 1.8 + cos(t * 0.35) * 0.4;
  float scale2 = 0.07;
  vec2 p2 = rot2(-t * 0.2 + 1.0) * uv;
  float dist2 = curveDist(p2, R2, r2, d2, scale2, false);
  float glow2 = exp(-dist2 * (28.0 + u_treble * 8.0));
  float core2 = smoothstep(0.005, 0.0, dist2);

  vec3 col2 = palette(
    dist2 * 4.0 + t * 0.25 + 0.35,
    vec3(0.48, 0.5, 0.55),
    vec3(0.4, 0.38, 0.48),
    vec3(0.7, 0.85, 1.0),
    vec3(0.02, 0.1, 0.28)
  );
  color += col2 * glow2 * 0.3;
  color += col2 * core2 * 0.4;

  // Curve 3: small inner hypotrochoid — treble reactive
  float R3 = 3.0;
  float r3 = 2.0 + u_treble * 0.2;
  float d3 = 1.5;
  float scale3 = 0.05;
  vec2 p3 = rot2(t * 0.25) * uv;
  float dist3 = curveDist(p3, R3, r3, d3, scale3, true);
  float glow3 = exp(-dist3 * (35.0 + u_bass * 8.0));

  vec3 col3 = palette(
    dist3 * 3.0 + t * 0.2 + 0.7,
    vec3(0.45, 0.48, 0.55),
    vec3(0.35, 0.38, 0.45),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.1, 0.3)
  );
  color += col3 * glow3 * 0.2;

  // Rolling circle indicators
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cAngle = t * (1.5 + fi * 0.5);
    float cR = (0.3 - fi * 0.06) * (1.0 + u_amplitude * 0.1);
    vec2 cCenter = cR * vec2(cos(cAngle), sin(cAngle));
    float cDist = abs(length(uv - cCenter) - 0.05);
    float cGlow = exp(-cDist * 50.0) * 0.12;
    color += vec3(0.4, 0.5, 0.65) * cGlow;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
