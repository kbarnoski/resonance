import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Chladni Patterns ----
// Standing wave patterns on a rectangular membrane.
// Chladni equation: cos(n*pi*x)*cos(m*pi*y) - cos(m*pi*x)*cos(n*pi*y) = 0
// Nodal lines form beautiful geometric patterns.

float chladniRect(vec2 p, float n, float m) {
  float nx = cos(n * 3.14159 * p.x) * cos(m * 3.14159 * p.y);
  float ny = cos(m * 3.14159 * p.x) * cos(n * 3.14159 * p.y);
  return nx - ny;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  vec3 color = vec3(0.0);

  // Scale UV to plate coordinates (-1 to 1)
  vec2 p = uv * 2.2;

  // Blend between different mode pairs over time
  float modeT = t * 0.3;
  float blend = smoothstep(0.0, 1.0, fract(modeT));

  // Mode pairs that cycle
  float idx = mod(floor(modeT), 4.0);
  float n1, m1, n2, m2;

  // Set mode pairs based on index
  // Mode set 1: (2, 5)
  // Mode set 2: (3, 7)
  // Mode set 3: (4, 9)
  // Mode set 4: (5, 11)
  n1 = 2.0 + idx;
  m1 = 5.0 + idx * 2.0;
  n2 = 2.0 + mod(idx + 1.0, 4.0);
  m2 = 5.0 + mod(idx + 1.0, 4.0) * 2.0;

  // Audio shifts the mode numbers slightly
  n1 += u_bass * 0.5;
  m1 += u_mid * 0.8;
  n2 += u_bass * 0.5;
  m2 += u_mid * 0.8;

  float c1 = chladniRect(p, n1, m1);
  float c2 = chladniRect(p, n2, m2);
  float pattern = mix(c1, c2, blend);

  // Nodal lines (zero crossings)
  float nodalWidth = 0.06 + u_treble * 0.03;
  float nodal = 1.0 - smoothstep(0.0, nodalWidth, abs(pattern));

  // Sand accumulation: particles gather at nodal lines
  float sand = pow(nodal, 2.0);

  // Color the sand/nodal lines
  vec3 sandCol = palette(
    length(p) * 0.3 + t * 0.2 + u_amplitude * 0.25,
    vec3(0.6, 0.58, 0.55),
    vec3(0.35, 0.35, 0.4),
    vec3(0.7, 0.85, 1.0),
    vec3(0.0, 0.1, 0.2)
  );

  // Anti-nodal region fill (where plate vibrates most)
  float antiNodal = abs(pattern);
  vec3 vibCol = palette(
    antiNodal * 0.5 + t * 0.1,
    vec3(0.03, 0.03, 0.06),
    vec3(0.04, 0.05, 0.08),
    vec3(0.3, 0.5, 0.8),
    vec3(0.15, 0.1, 0.3)
  );

  color += sandCol * sand * (0.8 + u_bass * 0.3);
  color += vibCol * antiNodal * 0.04;

  // Plate boundary rectangle
  vec2 ap = abs(p);
  float rectDist = max(ap.x - 1.1, ap.y - 1.1);
  float rectEdge = exp(-abs(rectDist) * 25.0) * 0.4;
  vec3 borderCol = palette(
    t * 0.35,
    vec3(0.5, 0.5, 0.55),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += borderCol * rectEdge;

  // Secondary fine pattern overlay — higher harmonics
  float fineN = n1 * 2.0 + u_treble * 1.0;
  float fineM = m1 * 2.0 + u_treble * 1.0;
  float finePat = chladniRect(p, fineN, fineM);
  float fineNodal = 1.0 - smoothstep(0.0, 0.04, abs(finePat));
  vec3 fineCol = palette(
    t * 0.5 + 0.5,
    vec3(0.4, 0.42, 0.5),
    vec3(0.25, 0.25, 0.35),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.1, 0.25)
  );
  color += fineCol * fineNodal * 0.15;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
