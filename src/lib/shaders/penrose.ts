import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Penrose tiling via multigrid method (de Bruijn)
// 5 sets of parallel lines at 72-degree angles — intersections define rhombi

float penroseGrid(vec2 p, float angle, float offset) {
  vec2 dir = vec2(cos(angle), sin(angle));
  return dot(p, dir) + offset;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Slowly rotate the whole tiling
  vec2 p = rot2(t * 0.08) * uv;

  // Scale for tile density
  float scale = 4.0 + u_bass * 0.5;
  p *= scale;

  // Slow drift
  p += vec2(t * 0.3, t * 0.2);

  vec3 color = vec3(0.0);

  // 5 grid directions at 72-degree intervals (pentagrid)
  float grids[5];
  float gridFrac[5];
  for (int i = 0; i < 5; i++) {
    float angle = float(i) * 1.2566370614; // 2*PI/5
    float g = penroseGrid(p, angle, 0.0);
    grids[i] = g;
    gridFrac[i] = fract(g);
  }

  // Tile index: floor of each grid value
  // Edge detection: minimum distance to any grid line
  float minEdge = 1.0;
  for (int i = 0; i < 5; i++) {
    float f = gridFrac[i];
    float edgeDist = min(f, 1.0 - f);
    minEdge = min(minEdge, edgeDist);
  }

  // Tile identity from grid floors — hash for color
  float tileId = 0.0;
  for (int i = 0; i < 5; i++) {
    tileId += floor(grids[i]) * (17.3 + float(i) * 31.7);
  }
  tileId = fract(sin(tileId) * 43758.5453);

  // Determine tile type (thin/thick rhombus) from grid pair angles
  // Use the two closest grid lines to determine rhombus type
  float type1 = 0.0;
  float minD1 = 1.0, minD2 = 1.0;
  int idx1 = 0, idx2 = 0;
  for (int i = 0; i < 5; i++) {
    float f = gridFrac[i];
    float d = min(f, 1.0 - f);
    if (d < minD1) {
      minD2 = minD1; idx2 = idx1;
      minD1 = d; idx1 = i;
    } else if (d < minD2) {
      minD2 = d; idx2 = i;
    }
  }
  // Angle difference between the two closest grid lines determines rhombus type
  float angleDiff = abs(float(idx1 - idx2));
  angleDiff = min(angleDiff, 5.0 - angleDiff);
  // Thin rhombus: adjacent grids (diff=1 or 4), thick: diff=2 or 3
  float isThin = step(1.5, angleDiff) * step(angleDiff, 1.5); // exactly 1
  isThin += step(4.0, angleDiff); // or 4

  // Tile fill color — two distinct palettes for thin vs thick
  vec3 thinCol = palette(
    tileId + t * 0.2 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.3, 0.5),
    vec3(0.8, 0.8, 0.5),
    vec3(0.0, 0.2, 0.5)
  );
  vec3 thickCol = palette(
    tileId * 1.3 + t * 0.25 + paletteShift + 0.5,
    vec3(0.5, 0.4, 0.4),
    vec3(0.4, 0.5, 0.3),
    vec3(1.0, 0.7, 0.4),
    vec3(0.1, 0.05, 0.2)
  );

  vec3 tileCol = mix(thickCol, thinCol, isThin);

  // Fill with gentle brightness, glow at edges
  float fillBright = 0.15 + tileId * 0.15;
  color += tileCol * fillBright;

  // Edge glow
  float edgeGlow = smoothstep(0.08, 0.0, minEdge);
  float edgeCore = smoothstep(0.03, 0.0, minEdge);

  vec3 edgeCol = palette(
    tileId * 0.7 + t * 0.35 + paletteShift + 0.3,
    vec3(0.6, 0.6, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.3)
  );

  color += edgeCol * edgeGlow * 0.5;
  color += edgeCol * edgeCore * 1.2;

  // Vertex glow: where multiple grid lines converge
  float vertexGlow = smoothstep(0.06, 0.0, minEdge) * smoothstep(0.06, 0.0, minD2);
  color += vec3(1.0, 0.9, 0.8) * vertexGlow * 0.8;

  // Audio: treble brightens edges
  color += edgeCol * edgeCore * u_treble * 0.6;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
