import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Domain warp: bass distorts the voronoi space
  vec2 warpedUV = uv * 3.5;
  warpedUV += vec2(
    snoise(uv * 2.0 + t * 0.5) * (0.3 + u_bass * 0.6),
    snoise(uv * 2.0 + t * 0.5 + 100.0) * (0.3 + u_bass * 0.6)
  );

  // Slow rotation of the entire pattern
  warpedUV = rot2(t * 0.15 + u_mid * 0.1) * warpedUV;

  // Primary voronoi layer
  vec3 v1 = voronoi(warpedUV + t * 0.3);
  float f1 = v1.x;
  float f2 = v1.y;

  // Edge detection: the difference between F2 and F1 gives sharp edges
  float edge = f2 - f1;
  float edgeGlow = smoothstep(0.08 + u_treble * 0.03, 0.0, edge);
  float edgeCore = smoothstep(0.03, 0.0, edge);

  // Cell interior color based on F1 distance (each cell gets unique color)
  float cellId = floor(f1 * 20.0 + t * 0.5);
  vec3 cellCol = palette(
    cellId * 0.13 + t * 0.2 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.2)
  );

  // Cell pulse: each cell breathes at slightly different rate
  float pulse = 0.5 + 0.5 * sin(cellId * 2.7 + t * 4.0 + u_bass * 3.0);
  float cellFill = smoothstep(0.6, 0.0, f1) * pulse;
  color += cellCol * cellFill * 0.35;

  // Edge color — bright, contrasting
  vec3 edgeCol = palette(
    edge * 5.0 + t * 0.6 + paletteShift + 0.4,
    vec3(0.7, 0.7, 0.8),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += edgeCol * edgeGlow * 0.8;
  color += vec3(1.0, 0.95, 0.9) * edgeCore * 1.2;

  // Second voronoi layer: smaller scale, overlaid for complexity
  vec2 uv2 = uv * 7.0 + t * 0.2;
  uv2 += vec2(snoise(uv * 1.5 + t * 0.3)) * u_mid * 0.4;
  vec3 v2 = voronoi(uv2);
  float edge2 = v2.y - v2.x;
  float edgeGlow2 = smoothstep(0.06, 0.0, edge2);

  vec3 layer2Col = palette(
    v2.x * 3.0 + t * 0.3 + paletteShift + 0.6,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.05, 0.35)
  );
  color += layer2Col * edgeGlow2 * 0.25;

  // Third layer: very fine detail, treble-reactive
  vec2 uv3 = uv * 14.0 - t * 0.15;
  vec3 v3 = voronoi(uv3);
  float microEdge = smoothstep(0.04, 0.0, v3.y - v3.x);
  vec3 microCol = palette(
    v3.x * 8.0 + paletteShift + 0.2,
    vec3(0.5, 0.5, 0.6),
    vec3(0.4, 0.3, 0.5),
    vec3(1.0, 0.6, 0.8),
    vec3(0.05, 0.2, 0.3)
  );
  color += microCol * microEdge * u_treble * 0.5;

  // Bass impact: bright flash in cells near center
  float centerDist = length(uv);
  float bassFlash = u_bass * smoothstep(0.8, 0.0, centerDist) * pulse * 0.3;
  color += cellCol * bassFlash;

  // Ambient background glow
  vec3 bgCol = palette(
    centerDist * 0.5 + t * 0.1 + paletteShift + 0.8,
    vec3(0.02, 0.02, 0.04),
    vec3(0.03, 0.02, 0.05),
    vec3(0.3, 0.5, 0.8),
    vec3(0.1, 0.1, 0.3)
  );
  color += bgCol * 0.1;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, centerDist);
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
