import { U, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  VORONOI +
  `
// Animated voronoi — adds time-based movement to cell centers
vec3 voronoiAnimated(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cellId = n + g;
      vec2 rnd = vec2(
        dot(cellId, vec2(127.1, 311.7)),
        dot(cellId, vec2(269.5, 183.3))
      );
      vec2 o = 0.5 + 0.5 * sin(rnd + time * 1.5);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) { md2 = md1; md1 = d; }
      else if (d < md2) { md2 = d; }
    }
  }
  return vec3(sqrt(md1), sqrt(md2), 0.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.4;

  vec3 color = vec3(0.0);

  // ── Layer 1: Large-scale mycelial network ──
  float scale1 = 3.0;
  vec3 v1 = voronoiAnimated(uv * scale1 + vec2(t * 0.1, t * 0.05), t * 0.6);
  float f1_dist = v1.x;
  float f2f1_1 = v1.y - v1.x;

  // Network ridges from F2-F1
  float ridge1 = smoothstep(0.08, 0.0, f2f1_1);

  // Pulse traveling along network
  float pulse1 = sin(f1_dist * 15.0 - t * 4.0 + uv.x * 3.0) * 0.5 + 0.5;
  pulse1 = pow(pulse1, 4.0);

  // ── Layer 2: Medium-scale branching ──
  float scale2 = 6.0;
  vec3 v2 = voronoiAnimated(uv * scale2 + vec2(-t * 0.08, t * 0.12), t * 0.8);
  float f1_dist2 = v2.x;
  float f2f1_2 = v2.y - v2.x;

  float ridge2 = smoothstep(0.06, 0.0, f2f1_2);

  float pulse2 = sin(f1_dist2 * 20.0 + t * 3.0 - uv.y * 4.0) * 0.5 + 0.5;
  pulse2 = pow(pulse2, 5.0);

  // ── Layer 3: Fine detail network (treble-activated) ──
  float scale3 = 12.0;
  vec3 v3 = voronoiAnimated(uv * scale3 + vec2(t * 0.15, -t * 0.07), t * 1.0);
  float f1_dist3 = v3.x;
  float f2f1_3 = v3.y - v3.x;

  float ridge3 = smoothstep(0.05, 0.0, f2f1_3);

  float pulse3 = sin(f1_dist3 * 25.0 - t * 5.0) * 0.5 + 0.5;
  pulse3 = pow(pulse3, 6.0);

  // ── Color palettes ──
  // Palette 1: bioluminescent blue-green
  vec3 col1 = palette(
    f1_dist * 2.0 + t * 0.15 + paletteShift,
    vec3(0.2, 0.4, 0.5),
    vec3(0.4, 0.5, 0.4),
    vec3(0.6, 1.0, 0.8),
    vec3(0.0, 0.25, 0.35)
  );

  // Palette 2: deep violet-magenta for medium layer
  vec3 col2 = palette(
    f1_dist2 * 1.5 + t * 0.1 + paletteShift + 0.3,
    vec3(0.4, 0.2, 0.5),
    vec3(0.4, 0.3, 0.5),
    vec3(0.8, 0.4, 1.0),
    vec3(0.15, 0.05, 0.4)
  );

  // Palette 3: electric cyan for fine detail
  vec3 col3 = palette(
    f1_dist3 * 3.0 + paletteShift + 0.6,
    vec3(0.3, 0.5, 0.6),
    vec3(0.3, 0.5, 0.5),
    vec3(0.4, 0.9, 1.0),
    vec3(0.1, 0.2, 0.3)
  );

  // ── Compose layers ──

  // Large network: ridges + pulse
  float ridgeBright1 = ridge1 * (0.6 + pulse1 * u_bass * 2.0);
  color += col1 * ridgeBright1 * 1.2;

  // Node glow at F1 centers (large)
  float nodeGlow1 = smoothstep(0.25, 0.0, f1_dist);
  nodeGlow1 = pow(nodeGlow1, 2.0);
  color += col1 * nodeGlow1 * (0.8 + u_bass * 1.0);

  // Medium network
  float ridgeBright2 = ridge2 * (0.4 + pulse2 * u_mid * 1.5);
  color += col2 * ridgeBright2 * 0.9;

  // Node glow at F1 centers (medium)
  float nodeGlow2 = smoothstep(0.15, 0.0, f1_dist2);
  nodeGlow2 = pow(nodeGlow2, 3.0);
  color += col2 * nodeGlow2 * 0.7;

  // Fine detail layer — activated by treble
  float trebleActivation = smoothstep(0.1, 0.6, u_treble);
  float ridgeBright3 = ridge3 * (0.2 + pulse3 * 1.5) * trebleActivation;
  color += col3 * ridgeBright3 * 0.8;

  // Fine node glow
  float nodeGlow3 = smoothstep(0.1, 0.0, f1_dist3);
  nodeGlow3 = pow(nodeGlow3, 4.0);
  color += col3 * nodeGlow3 * 0.5 * trebleActivation;

  // ── Cross-layer interaction ──
  // Where large and medium ridges overlap — bright intersection
  float overlap12 = ridge1 * ridge2;
  color += col1 * overlap12 * 1.5;

  // ── Emissive highlights ──

  // Warm white on active pulse peaks (bass-driven)
  float warmPulse = pulse1 * ridge1 * u_bass;
  color += vec3(1.4, 1.2, 0.95) * warmPulse * 2.5;

  // Cool white on node intersections
  float coolNode = nodeGlow1 * nodeGlow2;
  color += vec3(0.95, 1.15, 1.5) * coolNode * 3.0;

  // Bright pulse traveling along main ridges
  float travelPulse = sin(f1_dist * 10.0 + f1_dist2 * 8.0 - t * 6.0) * 0.5 + 0.5;
  travelPulse = pow(travelPulse, 8.0) * ridge1;
  color += vec3(1.3, 1.35, 1.1) * travelPulse * (1.0 + u_bass * 2.0);

  // Emissive haze around active regions
  float haze = smoothstep(0.5, 0.0, f1_dist) * (0.1 + u_amplitude * 0.15);
  color += col1 * haze * 0.3;

  // Subtle vignette to keep edges dark
  float vignette = 1.0 - smoothstep(0.6, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
