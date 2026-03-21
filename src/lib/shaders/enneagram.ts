import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Slow rotation of the whole form
  uv = rot2(t * 0.2) * uv;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float radius = 0.5 + u_bass * 0.06;

  // Nine points of the enneagram
  float lines = 1e5;
  float points = 1e5;

  // Place 9 points around a circle
  // Enneagram connections: 1-4-2-8-5-7 and 3-6-9 triangle
  // Using 0-indexed: 0-3-6 triangle, 1-4-2-8-5-7 hexagram lines
  for (int i = 0; i < 9; i++) {
    float angle = float(i) * 0.698132 - 1.5708;
    vec2 pt = vec2(cos(angle), sin(angle)) * radius;
    points = min(points, length(uv - pt) - 0.018 - u_mid * 0.008);
  }

  // Draw the inner connecting lines (1-4, 4-2, 2-8, 8-5, 5-7, 7-1)
  // In 0-indexed: 0-3, 3-5, 5-7, 7-4, 4-1, 1-6 (standard enneagram)
  float connLines = 1e5;
  // Connection pattern: 0->3, 3->6, 6->0 (triangle)
  for (int i = 0; i < 3; i++) {
    int idx = i * 3;
    int next = idx + 3;
    if (next >= 9) next -= 9;
    float a1 = float(idx) * 0.698132 - 1.5708;
    float a2 = float(next) * 0.698132 - 1.5708;
    vec2 pt1 = vec2(cos(a1), sin(a1)) * radius;
    vec2 pt2 = vec2(cos(a2), sin(a2)) * radius;
    connLines = min(connLines, sdLine(uv, pt1, pt2) - 0.004);
  }

  // Hexad: 1->4->2->8->5->7->1 (indices 0->3->1->7->4->6)
  // Simplified: connect every-other non-triangle point
  float hexLines = 1e5;
  // 1-4-2-8-5-7 pattern (1-indexed), 0-indexed: 0,3,1,7,4,6
  for (int i = 0; i < 6; i++) {
    float a1, a2;
    // Manual enneagram hexad
    if (i == 0) { a1 = 1.0; a2 = 4.0; }
    else if (i == 1) { a1 = 4.0; a2 = 2.0; }
    else if (i == 2) { a1 = 2.0; a2 = 8.0; }
    else if (i == 3) { a1 = 8.0; a2 = 5.0; }
    else if (i == 4) { a1 = 5.0; a2 = 7.0; }
    else { a1 = 7.0; a2 = 1.0; }
    float ang1 = (a1 - 1.0) * 0.698132 - 1.5708;
    float ang2 = (a2 - 1.0) * 0.698132 - 1.5708;
    vec2 p1 = vec2(cos(ang1), sin(ang1)) * radius;
    vec2 p2 = vec2(cos(ang2), sin(ang2)) * radius;
    hexLines = min(hexLines, sdLine(uv, p1, p2) - 0.003);
  }

  // Outer circle
  float outerRing = abs(sdCircle(uv, radius)) - 0.005;

  // Flowing energy along the hexad lines
  float flowParam = a / 6.28 * 9.0 + t * 3.0;
  float flow = sin(flowParam) * 0.5 + 0.5;
  flow *= smoothstep(0.06, 0.0, abs(r - radius * 0.7));

  // Glows
  float pointGlow = smoothstep(0.02, 0.0, abs(points));
  float triGlow = smoothstep(0.008, 0.0, abs(connLines));
  float hexGlow = smoothstep(0.006, 0.0, abs(hexLines));
  float ringGlow = smoothstep(0.01, 0.0, abs(outerRing));

  // FBM texture overlay
  float n = fbm(uv * 6.0 + t * 0.2);

  // Sacred violet / gold palette
  vec3 col1 = palette(
    r * 2.0 + paletteShift,
    vec3(0.5, 0.3, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 0.4, 0.9),
    vec3(0.6, 0.1, 0.3)
  );

  // Triangle — warm amber
  vec3 col2 = palette(
    a / 6.28 + t + paletteShift + 0.3,
    vec3(0.6, 0.5, 0.3),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // Hexad — cool electric blue
  vec3 col3 = palette(
    flow * 2.0 + t * 0.5 + paletteShift + 0.6,
    vec3(0.4, 0.5, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.7, 1.0),
    vec3(0.2, 0.3, 0.5)
  );

  vec3 color = vec3(0.0);

  // Points — bright nodes
  color += col1 * pointGlow * 2.0 * (0.8 + u_bass * 0.5);

  // Triangle connections
  color += col2 * triGlow * 1.5 * (0.7 + u_mid * 0.5);

  // Hexad flowing lines
  color += col3 * hexGlow * 1.2 * (0.6 + u_treble * 0.6);

  // Outer ring
  color += col1 * ringGlow * 0.8;

  // Flow energy
  color += col3 * flow * 0.4 * u_amplitude;

  // FBM depth
  color += col2 * smoothstep(0.0, 0.3, abs(n)) * smoothstep(0.7, 0.2, r) * 0.15;

  // Center glow
  float core = exp(-r * 5.0);
  color += vec3(1.1, 0.9, 1.3) * core * 0.4 * (1.0 + u_amplitude * 0.3);

  // Intersection highlights
  float interPt = pointGlow * (triGlow + hexGlow);
  color += vec3(1.4, 1.2, 1.0) * interPt * 2.5;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
