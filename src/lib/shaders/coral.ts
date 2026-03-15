import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.05;
  float paletteShift = u_amplitude * 0.08;

  // ── Slow global rotation of the cross-section view ──
  float ca = cos(t * 0.3);
  float sa = sin(t * 0.3);
  vec2 ruv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  // ── Domain warp for organic shapes ──
  vec2 warp = vec2(
    snoise(ruv * 1.5 + vec2(t * 0.2, 0.0)),
    snoise(ruv * 1.5 + vec2(0.0, t * 0.15) + 3.7)
  );
  vec2 warped = ruv + warp * 0.25;

  // ── Three scales of voronoi — coral skeleton cross-section ──
  // Large: major branch structure (0.8x)
  vec3 v1 = voronoi(warped * 2.4);
  float ridge1 = v1.y - v1.x;
  float edge1 = smoothstep(0.25, 0.0, ridge1);
  float cell1 = v1.x;

  // Medium: secondary branching (2.5x)
  vec3 v2 = voronoi(warped * 7.5 + vec2(t * 0.1, 0.0));
  float ridge2 = v2.y - v2.x;
  float edge2 = smoothstep(0.15, 0.0, ridge2);
  float cell2 = v2.x;

  // Fine: micro-structure / pores (7x)
  vec3 v3 = voronoi(warped * 21.0 + vec2(0.0, t * 0.08));
  float ridge3 = v3.y - v3.x;
  float edge3 = smoothstep(0.10, 0.0, ridge3);
  float cell3 = v3.x;

  // ── Branching intersections: where ridges from different scales meet ──
  float branchGlow = edge1 * edge2;
  float fineOverlap = edge2 * edge3;
  float fullIntersect = edge1 * edge2 * edge3;

  // ── Colors: warm coral/salmon, deep teal, ivory highlights ──
  // Dark teal background (the embedding medium / polarized light bg)
  vec3 bgColor = palette(
    cell1 * 0.3 + paletteShift,
    vec3(0.03, 0.08, 0.10),
    vec3(0.03, 0.06, 0.08),
    vec3(0.3, 0.5, 0.6),
    vec3(0.0, 0.20, 0.30)
  );

  // Coral salmon — main skeleton walls
  vec3 coralColor = palette(
    cell1 * 0.5 + ridge1 * 0.8 + t * 0.03 + paletteShift,
    vec3(0.55, 0.32, 0.28),
    vec3(0.40, 0.25, 0.22),
    vec3(1.0, 0.65, 0.50),
    vec3(0.0, 0.12, 0.30)
  );

  // Warm rose — secondary branches
  vec3 roseColor = palette(
    cell2 * 0.6 + t * 0.04 + paletteShift + 0.2,
    vec3(0.50, 0.28, 0.35),
    vec3(0.35, 0.22, 0.28),
    vec3(0.9, 0.6, 0.7),
    vec3(0.05, 0.15, 0.35)
  );

  // Ivory / bright — highlight where branches intersect
  vec3 ivoryColor = palette(
    ridge1 * 1.5 + t * 0.05 + paletteShift + 0.5,
    vec3(0.70, 0.65, 0.55),
    vec3(0.25, 0.22, 0.18),
    vec3(0.8, 0.7, 0.5),
    vec3(0.0, 0.08, 0.15)
  );

  // Deep teal accent for cell interiors
  vec3 tealColor = palette(
    cell2 * 0.4 + paletteShift + 0.7,
    vec3(0.08, 0.18, 0.22),
    vec3(0.06, 0.15, 0.18),
    vec3(0.4, 0.7, 0.8),
    vec3(0.0, 0.25, 0.35)
  );

  // ── Compose the cross-section ──
  vec3 color = bgColor;

  // Teal cell interiors — polarized light effect
  float cellFill = smoothstep(0.5, 0.1, cell1);
  color = mix(color, tealColor, cellFill * 0.4);

  // Primary skeleton ridges — coral salmon
  color = mix(color, coralColor, edge1 * 0.85);

  // Secondary branching — rose tint
  color = mix(color, roseColor, edge2 * 0.5);

  // Fine pore structure — subtle
  color += roseColor * edge3 * 0.15;

  // Branching intersections glow bright — ivory highlights
  color = mix(color, ivoryColor, branchGlow * 0.7);
  color += ivoryColor * fullIntersect * 0.5;

  // Subtle inner glow in cells nearest to major ridges
  float proximity = smoothstep(0.3, 0.05, cell1);
  color += coralColor * proximity * 0.12;

  // Fine detail brightening at overlap points
  color += roseColor * fineOverlap * 0.2;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
