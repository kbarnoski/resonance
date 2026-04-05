import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Animated Voronoi with fluid-like movement
vec4 voronoiFlow(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  vec2 mg;
  vec2 nearestCell = vec2(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cellId = n + g;
      // Animated cell centers — fluid motion
      vec2 o = 0.5 + 0.4 * sin(
        vec2(
          dot(cellId, vec2(127.1, 311.7)),
          dot(cellId, vec2(269.5, 183.3))
        ) + time * 2.0
      );
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) {
        md2 = md1;
        md1 = d;
        mg = r;
        nearestCell = cellId;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  return vec4(sqrt(md1), sqrt(md2), nearestCell);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Slowly rotate and scale
  vec2 p = rot2(t * 0.06) * uv;
  float scale = 4.0 + sin(t * 0.3) * 0.5 + u_bass * 0.3;
  p *= scale;

  // Drift
  p += vec2(sin(t * 0.4) * 0.5, cos(t * 0.3) * 0.5);

  vec3 color = vec3(0.0);

  // Multi-layer Voronoi
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float layerScale = 1.0 + fl * 0.7;
    float layerSpeed = t * (0.8 + fl * 0.3);
    vec2 lp = p * layerScale + vec2(fl * 5.0);

    vec4 v = voronoiFlow(lp, layerSpeed);
    float f1 = v.x;
    float f2 = v.y;
    vec2 cell = v.zw;

    // Edge distance (F2 - F1)
    float edge = f2 - f1;

    // Cell identity for color
    float cellId = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);

    // Edge glow
    float edgeGlow = smoothstep(0.15, 0.0, edge);
    float edgeCore = smoothstep(0.05, 0.0, edge);

    // Cell fill: gentle gradient based on F1
    float cellFill = smoothstep(0.6, 0.0, f1) * 0.15;

    // Color per cell
    vec3 cellCol = palette(
      cellId + fl * 0.3 + t * 0.2 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.7 + fl * 0.1, 1.0, 0.5),
      vec3(0.0, 0.1, 0.4)
    );

    vec3 edgeCol = palette(
      edge * 2.0 + t * 0.3 + paletteShift + fl * 0.2 + 0.5,
      vec3(0.6, 0.6, 0.6),
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.9, 1.0),
      vec3(0.0, 0.05, 0.25)
    );

    // Layer opacity decreases with depth
    float layerOpacity = 1.0 / (1.0 + fl * 1.2);

    color += cellCol * cellFill * layerOpacity;
    color += edgeCol * edgeGlow * 0.4 * layerOpacity;
    color += edgeCol * edgeCore * 0.8 * layerOpacity;

    // Audio: treble brightens edges
    color += edgeCol * edgeCore * u_treble * 0.3 * layerOpacity;
  }

  // Merge/split animation: pulsing cells
  float pulse = sin(t * 1.5) * 0.5 + 0.5;
  vec4 v0 = voronoiFlow(p, t * 0.8);
  float mergeGlow = smoothstep(0.08, 0.0, v0.x) * pulse * 0.2;
  vec3 mergeCol = palette(
    t * 0.5 + paletteShift + 0.3,
    vec3(0.7, 0.6, 0.5),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.8, 0.4),
    vec3(0.05, 0.1, 0.2)
  );
  color += mergeCol * mergeGlow;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
