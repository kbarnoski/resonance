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
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Rotate the whole scene gently
  vec2 uvR = rot2(t * 0.12 + u_mid * 0.06) * uv;

  // Breathing scale: the structure inhales/exhales with bass
  float breathe = 1.0 + u_bass * 0.15 + sin(t * 1.5) * 0.05;

  // Define 6 rigid bar endpoints (compression members)
  // Arranged in a tensegrity icosahedron-like pattern projected to 2D
  // Each bar is defined by two endpoints that float and rotate
  float barMinDist = 999.0;
  float tensionMinDist = 999.0;
  float barIdx = 0.0;

  vec2 barEnds[12]; // 6 bars x 2 endpoints = 12 points

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float baseAngle = fi * 1.0472 + t * 0.2; // 60 degrees apart

    // Bar center orbits at different radius and speed
    float orbitR = 0.35 * breathe + 0.1 * sin(t * 0.7 + fi * 1.8);
    vec2 barCenter = vec2(
      cos(baseAngle + sin(t * 0.3 + fi) * 0.4) * orbitR,
      sin(baseAngle + cos(t * 0.25 + fi * 1.3) * 0.4) * orbitR
    );

    // Bar orientation rotates independently
    float barAngle = fi * 0.5236 + t * (0.3 + fi * 0.05) + u_mid * 0.2;
    float barLen = 0.18 + u_bass * 0.04;
    vec2 barDir = vec2(cos(barAngle), sin(barAngle)) * barLen;

    vec2 endA = barCenter - barDir;
    vec2 endB = barCenter + barDir;

    barEnds[i * 2] = endA;
    barEnds[i * 2 + 1] = endB;

    // Distance to bar (thick line SDF)
    float d = sdLine(uvR, endA, endB);
    if (d < barMinDist) {
      barMinDist = d;
      barIdx = fi;
    }
  }

  // Draw tension lines connecting bar endpoints
  // Each bar endpoint connects to endpoints of other bars
  for (int i = 0; i < 6; i++) {
    for (int j = 0; j < 6; j++) {
      if (i == j) continue;
      // Connect end of bar i to start of bar j (selective for visual clarity)
      int ci = i * 2 + 1; // end of bar i
      int cj = j * 2;     // start of bar j

      float d = sdLine(uvR, barEnds[ci], barEnds[cj]);

      // Tension lines are thinner and vibrate with treble
      float vibration = sin(d * 80.0 + t * 8.0 + u_treble * 5.0) * 0.002 * u_treble;
      d += vibration;

      tensionMinDist = min(tensionMinDist, d);
    }
  }

  // Render bars: thick, solid, glowing
  float barThick = 0.012 + u_bass * 0.004;
  float barGlow = smoothstep(barThick * 4.0, 0.0, barMinDist);
  float barCore = smoothstep(barThick, barThick * 0.3, barMinDist);

  vec3 barCol = palette(
    barIdx * 0.16 + t * 0.4 + paletteShift,
    vec3(0.6, 0.6, 0.6),
    vec3(0.4, 0.4, 0.5),
    vec3(0.8, 0.6, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += barCol * barGlow * 0.5;
  color += barCol * barCore * 1.5;

  // Render tension lines: thin, taut, luminous
  float tensionThick = 0.003 + u_treble * 0.002;
  float tensionGlow = smoothstep(tensionThick * 6.0, 0.0, tensionMinDist);
  float tensionCore = smoothstep(tensionThick, 0.0, tensionMinDist);

  vec3 tensionCol = palette(
    tensionMinDist * 10.0 + t * 0.6 + paletteShift + 0.4,
    vec3(0.5, 0.5, 0.7),
    vec3(0.4, 0.3, 0.6),
    vec3(0.6, 0.9, 1.0),
    vec3(0.1, 0.05, 0.35)
  );
  color += tensionCol * tensionGlow * 0.3;
  color += tensionCol * tensionCore * 0.8;

  // Node points: bright dots at bar endpoints
  float nodeDist = 999.0;
  float nodeIdx = 0.0;
  for (int i = 0; i < 12; i++) {
    float d = length(uvR - barEnds[i]);
    if (d < nodeDist) {
      nodeDist = d;
      nodeIdx = float(i);
    }
  }
  float nodeSize = 0.015 + u_amplitude * 0.008;
  float nodeGlow = smoothstep(nodeSize * 5.0, 0.0, nodeDist);
  float nodeCore = smoothstep(nodeSize, 0.0, nodeDist);

  vec3 nodeCol = palette(
    nodeIdx * 0.08 + t * 0.5 + paletteShift + 0.2,
    vec3(0.8, 0.8, 0.8),
    vec3(0.4, 0.3, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.05, 0.15)
  );
  color += nodeCol * nodeGlow * 0.6;
  color += vec3(1.0, 0.97, 0.9) * nodeCore * 1.5;

  // Stress field: subtle background showing tension forces
  float stressField = 0.0;
  for (int i = 0; i < 12; i++) {
    float d = length(uvR - barEnds[i]);
    stressField += 0.01 / (d + 0.05);
  }
  stressField = clamp(stressField, 0.0, 1.0);

  vec3 stressCol = palette(
    stressField * 2.0 + t * 0.15 + paletteShift + 0.7,
    vec3(0.05, 0.05, 0.08),
    vec3(0.05, 0.05, 0.1),
    vec3(0.3, 0.5, 0.8),
    vec3(0.15, 0.1, 0.3)
  );
  color += stressCol * stressField * 0.15;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
