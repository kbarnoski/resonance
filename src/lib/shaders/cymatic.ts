import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Cymatic Patterns ----
// Chladni-like vibration patterns on a circular plate.
// Superposition of radial and angular modes creates nodal patterns.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec2 p = rot2(t * 0.1) * uv;
  float r = length(p);
  float a = atan(p.y, p.x);

  vec3 color = vec3(0.0);

  // Superposition of circular drum modes: J_m(k_mn * r) * cos(m * theta)
  // Approximate Bessel functions with sin for visual effect
  float pattern = 0.0;

  // Mode 1: radial frequency driven by bass
  float k1 = 6.0 + u_bass * 3.0;
  float m1 = 3.0;
  pattern += sin(k1 * r) * cos(m1 * a + t * 0.5);

  // Mode 2: higher frequency driven by mid
  float k2 = 10.0 + u_mid * 4.0;
  float m2 = 5.0;
  pattern += 0.7 * sin(k2 * r) * cos(m2 * a - t * 0.7);

  // Mode 3: treble-reactive fine detail
  float k3 = 15.0 + u_treble * 5.0;
  float m3 = 7.0;
  pattern += 0.4 * sin(k3 * r + t * 0.3) * cos(m3 * a + t * 0.9);

  // Mode 4: slow evolving background
  float k4 = 4.0 + sin(t * 0.4) * 2.0;
  float m4 = 2.0;
  pattern += 0.5 * sin(k4 * r - t * 0.2) * cos(m4 * a);

  // Nodal lines: where pattern crosses zero
  float nodalLine = 1.0 - smoothstep(0.0, 0.15 + u_amplitude * 0.05, abs(pattern));

  // Anti-nodal regions: where amplitude is highest
  float antiNodal = smoothstep(0.3, 1.5, abs(pattern));

  // Color the nodal lines
  vec3 nodalCol = palette(
    r * 2.0 + a * 0.3 + t * 0.3 + u_amplitude * 0.2,
    vec3(0.5, 0.52, 0.55),
    vec3(0.5, 0.45, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );

  // Background fill in anti-nodal regions
  vec3 fillCol = palette(
    pattern * 0.3 + t * 0.15,
    vec3(0.05, 0.05, 0.08),
    vec3(0.05, 0.06, 0.1),
    vec3(0.4, 0.6, 0.9),
    vec3(0.1, 0.1, 0.3)
  );

  color += nodalCol * nodalLine * (0.7 + u_bass * 0.3);
  color += fillCol * antiNodal * 0.08;

  // Plate boundary: circular edge
  float plateEdge = abs(r - 0.7);
  float edgeGlow = exp(-plateEdge * 30.0) * 0.4;
  vec3 edgeCol = palette(
    t * 0.4 + u_amplitude * 0.3,
    vec3(0.6, 0.6, 0.65),
    vec3(0.35, 0.35, 0.4),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.15, 0.3)
  );
  color += edgeCol * edgeGlow;

  // Particles vibrating at anti-nodes
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float pa = fi * 0.785 + t * 0.2;
    float pr = 0.25 + fi * 0.05;
    vec2 pp = pr * vec2(cos(pa), sin(pa));
    float vibAmp = abs(pattern) * 0.02;
    pp += vibAmp * vec2(sin(t * 5.0 + fi), cos(t * 5.0 + fi * 1.3));
    float dd = length(uv - pp);
    float dotGlow = exp(-dd * dd * 1200.0) * 0.4 * (0.5 + u_treble * 0.5);
    color += vec3(0.7, 0.8, 1.0) * dotGlow;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
