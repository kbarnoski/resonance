import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  ROT2 +
  `
// Animated voronoi with time-based drift
vec3 voronoiAnim(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  vec2 mg;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cellId = n + g;
      vec2 rnd = vec2(
        dot(cellId, vec2(127.1, 311.7)),
        dot(cellId, vec2(269.5, 183.3))
      );
      vec2 o = 0.5 + 0.5 * sin(rnd + time * 1.2);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) { md2 = md1; md1 = d; mg = r; }
      else if (d < md2) { md2 = d; }
    }
  }
  return vec3(sqrt(md1), sqrt(md2), 0.0);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: earthy subsurface void ──
  float bgN = fbm(uv * 1.5 + vec2(t * 0.04, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.15,
    vec3(0.03, 0.02, 0.02),
    vec3(0.04, 0.03, 0.02),
    vec3(0.4, 0.35, 0.3),
    vec3(0.0, 0.1, 0.15)
  );
  color = bgColor * (bgN * 0.15 + 0.05);

  // ── Rhizomatic network: non-hierarchical spreading connections ──
  // Use domain-warped voronoi at multiple scales for the horizontal network

  // Domain warp — organic displacement of the network
  vec2 warp = vec2(
    snoise(uv * 2.0 + vec2(t * 0.2, 0.0)),
    snoise(uv * 2.0 + vec2(0.0, t * 0.15) + 7.0)
  );
  vec2 warped = uv + warp * 0.15;

  // Stretch horizontally to emphasize lateral spreading
  vec2 rhizUV = warped * vec2(1.0, 1.8);

  // ── Layer 1: Primary root network — large scale ──
  vec3 v1 = voronoiAnim(rhizUV * 3.5 + vec2(t * 0.08, 0.0), t * 0.5);
  float ridge1 = v1.y - v1.x;
  float edge1 = smoothstep(0.12, 0.0, ridge1);
  float cell1 = v1.x;

  // ── Layer 2: Secondary connections — medium scale ──
  vec3 v2 = voronoiAnim(rhizUV * 7.0 + vec2(-t * 0.06, t * 0.04), t * 0.7);
  float ridge2 = v2.y - v2.x;
  float edge2 = smoothstep(0.08, 0.0, ridge2);
  float cell2 = v2.x;

  // ── Layer 3: Fine root hairs — small scale, treble-activated ──
  vec3 v3 = voronoiAnim(rhizUV * 14.0 + vec2(t * 0.1, -t * 0.05), t * 0.9);
  float ridge3 = v3.y - v3.x;
  float edge3 = smoothstep(0.06, 0.0, ridge3);
  float cell3 = v3.x;

  // ── Node points: where connections meet ──
  // Nodes glow at voronoi cell centers (where F1 is very small)
  float node1 = smoothstep(0.2, 0.0, cell1);
  node1 = pow(node1, 2.0);
  float node2 = smoothstep(0.12, 0.0, cell2);
  node2 = pow(node2, 2.5);

  // ── Colors: earthy tones — umber, ochre, root-brown, with mineral blues ──
  vec3 rootColor = palette(
    cell1 * 0.5 + ridge1 * 0.3 + t * 0.03 + paletteShift,
    vec3(0.35, 0.25, 0.15),
    vec3(0.3, 0.2, 0.12),
    vec3(0.8, 0.6, 0.4),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 nodeColor = palette(
    cell1 * 0.3 + t * 0.05 + paletteShift + 0.3,
    vec3(0.4, 0.35, 0.2),
    vec3(0.35, 0.3, 0.18),
    vec3(0.9, 0.7, 0.5),
    vec3(0.05, 0.12, 0.25)
  );

  vec3 secondaryColor = palette(
    cell2 * 0.4 + t * 0.04 + paletteShift + 0.5,
    vec3(0.25, 0.3, 0.25),
    vec3(0.2, 0.25, 0.2),
    vec3(0.6, 0.8, 0.6),
    vec3(0.0, 0.15, 0.2)
  );

  vec3 fineColor = palette(
    cell3 * 0.5 + paletteShift + 0.7,
    vec3(0.3, 0.35, 0.3),
    vec3(0.2, 0.3, 0.25),
    vec3(0.5, 0.9, 0.7),
    vec3(0.0, 0.2, 0.3)
  );

  // ── Compose the rhizomatic network ──

  // Primary ridges — thick root connections
  float rootPulse = sin(cell1 * 12.0 - t * 3.0) * 0.5 + 0.5;
  rootPulse = pow(rootPulse, 4.0);
  color += rootColor * edge1 * (0.6 + rootPulse * u_bass * 1.5);

  // Node glows — bright at junctions
  color += nodeColor * node1 * (0.8 + u_bass * 0.8);

  // Secondary network
  float midPulse = sin(cell2 * 18.0 + t * 2.5) * 0.5 + 0.5;
  midPulse = pow(midPulse, 5.0);
  color += secondaryColor * edge2 * (0.3 + midPulse * u_mid * 1.0);
  color += secondaryColor * node2 * 0.5;

  // Fine root hairs — treble reveals them
  float trebleAct = smoothstep(0.1, 0.5, u_treble);
  color += fineColor * edge3 * 0.25 * trebleAct;

  // ── Intersection highlights: where scales overlap ──
  float overlap12 = edge1 * edge2;
  color += nodeColor * overlap12 * 1.2;
  float overlap123 = overlap12 * edge3;
  color += vec3(1.2, 1.1, 0.9) * overlap123 * 0.6;

  // ── Nutrient flow pulses along the network ──
  float flowPulse = sin(cell1 * 8.0 + cell2 * 12.0 - t * 5.0) * 0.5 + 0.5;
  flowPulse = pow(flowPulse, 7.0) * edge1;
  vec3 flowColor = palette(
    t * 0.08 + paletteShift + 0.4,
    vec3(0.45, 0.4, 0.25),
    vec3(0.35, 0.3, 0.2),
    vec3(0.9, 0.8, 0.5),
    vec3(0.0, 0.1, 0.2)
  );
  color += flowColor * flowPulse * (0.8 + u_bass * 1.5);

  // ── Mineral deposits at deep nodes — blue-green accents ──
  float mineralGlow = pow(node1, 3.0) * smoothstep(0.3, 0.0, cell2);
  vec3 mineralColor = palette(
    t * 0.06 + paletteShift + 0.8,
    vec3(0.2, 0.35, 0.4),
    vec3(0.15, 0.3, 0.35),
    vec3(0.4, 0.8, 0.9),
    vec3(0.0, 0.2, 0.4)
  );
  color += mineralColor * mineralGlow * (0.6 + u_mid * 0.5);

  // ── Soil texture overlay — fbm grain ──
  float soil = fbm(uv * 8.0 + t * 0.05);
  float soilGrain = fbm(uv * 20.0 + soil * 2.0);
  color *= 0.9 + soilGrain * 0.15;

  // ── Spreading animation: radial wave from center ──
  float spreadR = fract(t * 0.2) * 2.0;
  float spreadWave = smoothstep(0.06, 0.0, abs(length(uv) - spreadR));
  spreadWave *= (1.0 - spreadR / 2.0); // fade with expansion
  color += rootColor * spreadWave * u_amplitude * 0.5;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.55, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
