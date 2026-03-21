import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Rosette Pattern ----
// Rotational symmetry flower pattern. Uses n-fold symmetry
// with petal shapes defined by polar equations.

float petalShape(float angle, float n, float phase) {
  return abs(cos(n * angle + phase));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Layer 1: outer petals — 8-fold symmetry
  float n1 = 8.0;
  float petal1 = petalShape(a, n1 * 0.5, t * 0.4);
  float r1 = petal1 * (0.45 + u_bass * 0.06);
  float d1 = abs(r - r1);
  float glow1 = exp(-d1 * (20.0 + u_mid * 8.0));
  float fill1 = smoothstep(0.02, -0.02, r - r1);

  vec3 col1 = palette(
    a * 0.3 + t * 0.2 + u_amplitude * 0.2,
    vec3(0.5, 0.5, 0.55),
    vec3(0.45, 0.42, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );

  color += col1 * glow1 * 0.4;
  color += col1 * fill1 * 0.06;

  // Layer 2: inner petals — 6-fold, counter-rotating
  float n2 = 6.0;
  float petal2 = petalShape(a, n2 * 0.5, -t * 0.5 + 0.5);
  float r2 = petal2 * (0.3 + u_mid * 0.04);
  float d2 = abs(r - r2);
  float glow2 = exp(-d2 * (25.0 + u_treble * 10.0));
  float fill2 = smoothstep(0.02, -0.02, r - r2);

  vec3 col2 = palette(
    a * 0.4 + t * 0.25 + 0.35,
    vec3(0.48, 0.5, 0.55),
    vec3(0.4, 0.4, 0.48),
    vec3(0.7, 0.85, 1.0),
    vec3(0.02, 0.1, 0.28)
  );

  color += col2 * glow2 * 0.35;
  color += col2 * fill2 * 0.05;

  // Layer 3: fine petals — 12-fold
  float n3 = 12.0;
  float petal3 = petalShape(a, n3 * 0.5, t * 0.6 + 1.0);
  float r3 = petal3 * (0.2 + u_treble * 0.03);
  float d3 = abs(r - r3);
  float glow3 = exp(-d3 * (30.0 + u_bass * 8.0));

  vec3 col3 = palette(
    a * 0.5 + t * 0.3 + 0.7,
    vec3(0.45, 0.48, 0.55),
    vec3(0.35, 0.38, 0.45),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.1, 0.3)
  );

  color += col3 * glow3 * 0.25;

  // Concentric rings between petal layers
  for (int i = 1; i <= 4; i++) {
    float fi = float(i);
    float ringR = fi * 0.12 + u_amplitude * 0.02;
    float ringDist = abs(r - ringR);
    float ringGlow = exp(-ringDist * 50.0) * 0.15;
    vec3 ringCol = palette(
      fi * 0.25 + t * 0.2,
      vec3(0.5, 0.52, 0.58),
      vec3(0.3, 0.32, 0.38),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += ringCol * ringGlow;
  }

  // Central stamen: bright point
  float center = exp(-r * r * 200.0) * (0.5 + u_amplitude * 0.5);
  vec3 centerCol = palette(
    t * 0.5,
    vec3(0.7, 0.7, 0.75),
    vec3(0.3, 0.3, 0.35),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += centerCol * center;

  // Petal vein lines radiating outward
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float veinAngle = fi * 0.785 + t * 0.15; // pi/4
    float veinDist = abs(sin(a - veinAngle)) * r;
    float veinLine = exp(-veinDist * 40.0) * 0.1 * smoothstep(0.0, 0.3, r);
    color += vec3(0.3, 0.35, 0.5) * veinLine * u_mid;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
