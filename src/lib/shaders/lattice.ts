import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
// Project a 3D point onto 2D with perspective division
vec2 project3D(vec3 p, float fov) {
  float z = p.z + fov;
  if (z < 0.01) z = 0.01;
  return vec2(p.x, p.y) * (fov / z);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera flies forward through the lattice
  float camZ = t * 2.0 + u_bass * 0.5;
  float rotSpeedX = 0.12 + u_mid * 0.05;
  float rotSpeedY = 0.09 + u_bass * 0.04;

  vec3 color = vec3(0.0);

  // Draw multiple layers of lattice planes receding into depth
  for (int layer = 0; layer < 10; layer++) {
    float lf = float(layer);

    // Each layer sits at a different depth, cycling as camera moves
    float depth = mod(lf * 0.7 - camZ * 0.35, 7.0);
    float worldZ = depth - 0.5;

    // Perspective fade: closer layers are brighter and thicker
    float perspScale = 1.2 / (worldZ + 1.5);
    float fade = smoothstep(0.0, 0.5, perspScale) * smoothstep(4.0, 0.5, worldZ);

    // Lattice grid spacing shrinks with depth (perspective)
    float gridSize = perspScale * (0.12 + u_treble * 0.02);

    // Slight rotation accumulates with depth
    vec2 uvRot = rot2(lf * 0.03 + t * rotSpeedX) * uv;
    uvRot = rot2(lf * 0.02 + t * rotSpeedY) * uvRot;

    // UV in lattice space
    vec2 cellUV = uvRot / gridSize;
    vec2 cellFrac = fract(cellUV) - 0.5;

    // Two sets of lines: horizontal and vertical
    float lineThick = 0.015 + u_bass * 0.01;
    float gx = abs(cellFrac.x);
    float gy = abs(cellFrac.y);
    float gridLine = min(gx, gy);

    // Diagonal cross-braces for the wireframe look
    vec2 diagUV = rot2(0.7854) * cellFrac; // 45 deg
    float diagLine = min(abs(diagUV.x), abs(diagUV.y));

    float wire = min(gridLine, diagLine * 1.4);
    float wireGlow = smoothstep(lineThick * 3.0, 0.0, wire);
    float wireCore = smoothstep(lineThick, 0.0, wire);

    // Color: shifts with depth and time — palette lookup 1
    float colorT = lf * 0.1 + t * 0.4 + paletteShift;
    vec3 col1 = palette(
      colorT,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.8, 1.0, 0.5),
      vec3(0.0, 0.1, 0.4)
    );
    // Palette lookup 2: warm complement for depth contrast
    vec3 col2 = palette(
      colorT + 0.5,
      vec3(0.5, 0.4, 0.3),
      vec3(0.5, 0.4, 0.3),
      vec3(1.0, 0.7, 0.3),
      vec3(0.05, 0.2, 0.1)
    );
    // Blend based on which line type
    vec3 wireColor = mix(col1, col2, smoothstep(lineThick, lineThick * 2.5, wire));

    color += wireColor * wireGlow * 0.35 * fade;
    color += wireColor * wireCore * 1.1 * fade;

    // Vertex nodes at intersections — treble sparkle
    float nodeDist = length(cellFrac);
    float nodeGlow = smoothstep(0.06, 0.0, nodeDist);
    float nodeCore = smoothstep(0.018, 0.0, nodeDist);
    vec3 nodeCol = palette(
      lf * 0.15 + t * 0.6 + paletteShift + 0.25,
      vec3(0.6, 0.6, 0.7),
      vec3(0.4, 0.4, 0.5),
      vec3(0.5, 1.0, 0.9),
      vec3(0.1, 0.2, 0.3)
    );
    color += nodeCol * nodeGlow * 0.5 * fade;
    color += vec3(1.1, 1.2, 1.4) * nodeCore * 1.5 * fade * (0.5 + u_treble);
  }

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vign;

  // Depth fog glow at center vanishing point
  float vpGlow = smoothstep(0.8, 0.0, length(uv));
  vec3 fogCol = palette(
    t * 0.2 + paletteShift,
    vec3(0.1, 0.1, 0.15),
    vec3(0.1, 0.1, 0.2),
    vec3(0.4, 0.6, 1.0),
    vec3(0.2, 0.1, 0.3)
  );
  color += fogCol * vpGlow * 0.08;

  gl_FragColor = vec4(color, 1.0);
}
`;
