import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Trefoil Knot ----
// Three-lobed knot with over/under crossings.
// Polar equation: r = cos(3*theta) mapped with knot topology.

float trefoilDist(vec2 p, float size, float phase) {
  float minD = 999.0;
  for (int i = 0; i < 120; i++) {
    float s = float(i) * 6.28318 / 120.0;
    // Trefoil knot in 2D projection:
    // x = sin(s) + 2*sin(2*s), y = cos(s) - 2*cos(2*s)
    vec2 pt = size * vec2(
      sin(s + phase) + 2.0 * sin(2.0 * s + phase),
      cos(s + phase) - 2.0 * cos(2.0 * s + phase)
    );
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  float baseSize = 0.1 + u_bass * 0.01;

  // Main trefoil knot
  vec2 p = rot2(t * 0.2) * uv;
  float d = trefoilDist(p, baseSize, t * 0.5);

  // Line glow
  float lineWidth = 0.015 + u_amplitude * 0.005;
  float glow = exp(-d * (25.0 + u_mid * 8.0));
  float core = smoothstep(lineWidth, lineWidth * 0.3, d);

  vec3 mainCol = palette(
    d * 8.0 + t * 0.3 + u_amplitude * 0.2,
    vec3(0.5, 0.5, 0.55),
    vec3(0.45, 0.42, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );

  color += mainCol * glow * 0.5;
  color += mainCol * core * 0.8;

  // Over/under crossings: simulate depth with brightness variation
  for (int i = 0; i < 120; i++) {
    float s = float(i) * 6.28318 / 120.0;
    vec2 pt = baseSize * vec2(
      sin(s + t * 0.5) + 2.0 * sin(2.0 * s + t * 0.5),
      cos(s + t * 0.5) - 2.0 * cos(2.0 * s + t * 0.5)
    );
    // Z-depth of trefoil knot: z = sin(3*s) gives over/under
    float z = sin(3.0 * s + t * 0.5);
    float dd = length(p - pt);
    if (dd < lineWidth * 2.0) {
      float brightness = 0.5 + z * 0.3;
      color *= mix(1.0, brightness, smoothstep(lineWidth * 2.0, 0.0, dd));
    }
  }

  // Secondary smaller trefoil, counter-rotating
  vec2 p2 = rot2(-t * 0.3 + 1.0) * uv;
  float d2 = trefoilDist(p2, baseSize * 0.6, -t * 0.4);
  float glow2 = exp(-d2 * (30.0 + u_treble * 10.0));
  vec3 col2 = palette(
    d2 * 6.0 + t * 0.25 + 0.4,
    vec3(0.45, 0.48, 0.55),
    vec3(0.35, 0.38, 0.45),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.12, 0.3)
  );
  color += col2 * glow2 * 0.25;

  // Celtic-style triple spiral at center
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  float spiral = sin(3.0 * angle + radius * 15.0 - t * 2.0);
  float spiralLine = smoothstep(0.05, 0.0, abs(spiral) * radius);
  float centerMask = smoothstep(0.15, 0.05, radius);
  vec3 spiralCol = palette(
    angle + t * 0.4,
    vec3(0.5, 0.5, 0.55),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += spiralCol * spiralLine * centerMask * 0.4 * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
