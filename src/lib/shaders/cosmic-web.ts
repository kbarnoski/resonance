import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Cosmic Web — Large-scale structure of the universe:
// filaments of faint light connecting bright galaxy cluster nodes.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Galaxy cluster — bright node in the web
float galaxyCluster(vec2 uv, vec2 center, float size, float t, float seed) {
  float r = length(uv - center);

  // Bright core
  float core = exp(-r * r / (size * size));

  // Extended halo
  float halo = exp(-r / (size * 3.0)) * 0.3;

  // Internal structure — many sub-galaxies
  float substructure = snoise((uv - center) * 30.0 / size + seed + t * 0.05) * 0.5 + 0.5;
  substructure = pow(substructure, 3.0);

  // Pulsation from gravitational interactions
  float pulse = 1.0 + 0.1 * sin(t * 1.5 + seed * 3.0);

  return (core + halo) * pulse + substructure * core * 0.3;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  float paletteShift = u_amplitude * 0.15;

  // Slow drift through the cosmic web
  vec2 drift = vec2(sin(t * 0.2) * 0.3, cos(t * 0.15) * 0.2) + t * vec2(0.05, 0.03);
  vec2 webUV = uv + drift;

  vec3 color = vec3(0.003, 0.003, 0.01);

  // ── Voronoi-based cosmic web structure ──
  // The cosmic web naturally follows Voronoi patterns
  float webScale = 2.5;
  vec3 vor = voronoi(webUV * webScale);
  float F1 = vor.x;
  float F2 = vor.y;

  // Filaments are at the Voronoi edges (F2 - F1 is small at edges)
  float edgeDist = F2 - F1;
  float filament = smoothstep(0.3, 0.0, edgeDist);

  // Voids are far from edges (large F1)
  float voidMask = smoothstep(0.2, 0.5, F1);

  // Nodes are at Voronoi vertices (small F1)
  float nodeMask = smoothstep(0.15, 0.0, F1);

  // ── Fine filament detail ──
  // Sub-structure along filaments
  float filamentDetail = snoise(webUV * 12.0 + t * 0.03) * 0.5 + 0.5;
  filament *= (0.5 + filamentDetail * 0.5);
  filament *= (0.5 + u_bass * 0.8);

  // Second scale filaments — finer web
  vec3 vor2 = voronoi(webUV * webScale * 2.5 + vec2(10.0));
  float fineFilament = smoothstep(0.25, 0.0, vor2.y - vor2.x) * 0.3;
  fineFilament *= (0.4 + u_mid * 0.4);

  // ── Galaxy clusters at nodes ──
  // Place clusters at Voronoi cell centers
  float clusters = 0.0;
  // Use voronoi nearest cell to place cluster
  float clusterBright = nodeMask * 2.0;

  // Individual bright clusters at specific positions
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 clusterPos = vec2(
      sin(fi * 2.39996 + 1.0) * 0.35,
      cos(fi * 3.17 + 2.0) * 0.3
    );
    clusterPos += drift * 0.1;
    clusters += galaxyCluster(uv, clusterPos, 0.04 + 0.02 * sin(fi), t, fi * 7.0);
  }

  // ── Background galaxies — tiny points everywhere ──
  float bgGalaxies = 0.0;
  vec2 bgId = floor(webUV * 30.0);
  vec2 bgF = fract(webUV * 30.0) - 0.5;
  float bgH = fract(sin(dot(bgId, vec2(127.1, 311.7))) * 43758.5453);
  float isBg = step(0.92, bgH);
  float bgBright = smoothstep(0.04, 0.0, length(bgF)) * isBg;
  float bgTwinkle = 0.6 + 0.4 * sin(u_time * (1.0 + bgH * 4.0) + bgH * 50.0);
  bgGalaxies = bgBright * bgTwinkle;

  // ── Colors ──
  // Filament color — ghostly blue-violet
  vec3 filCol = palette(
    filament * 0.5 + edgeDist * 2.0 + t * 0.01 + paletteShift,
    vec3(0.25, 0.25, 0.4),
    vec3(0.15, 0.12, 0.25),
    vec3(0.35, 0.25, 0.7),
    vec3(0.1, 0.1, 0.3)
  );

  // Fine filament color — slightly different
  vec3 fineCol = palette(
    fineFilament + t * 0.015 + paletteShift + 0.25,
    vec3(0.2, 0.22, 0.35),
    vec3(0.1, 0.1, 0.2),
    vec3(0.3, 0.2, 0.6),
    vec3(0.1, 0.1, 0.25)
  );

  // Cluster color — warm golden
  vec3 clusterCol = palette(
    clusters * 0.3 + t * 0.02 + paletteShift + 0.5,
    vec3(0.7, 0.6, 0.45),
    vec3(0.2, 0.15, 0.1),
    vec3(0.35, 0.25, 0.15),
    vec3(0.05, 0.05, 0.1)
  );

  // Node glow — bright hot points
  vec3 nodeCol = palette(
    clusterBright + t * 0.03 + paletteShift + 0.35,
    vec3(0.8, 0.7, 0.55),
    vec3(0.2, 0.15, 0.1),
    vec3(0.3, 0.2, 0.1),
    vec3(0.03, 0.05, 0.1)
  );

  // ── Compose ──
  // Filaments
  color += filCol * filament * 0.4;
  color += fineCol * fineFilament;

  // Node glow
  color += nodeCol * clusterBright * 0.3;

  // Galaxy clusters
  color += clusterCol * clusters * (0.8 + u_bass * 0.5);

  // Background galaxies
  color += vec3(0.6, 0.6, 0.8) * bgGalaxies * 0.3 * (0.7 + u_treble * 0.5);

  // ── Void glow — very faint remnant light in voids ──
  float voidGlow = voidMask * 0.005;
  color += vec3(0.05, 0.04, 0.08) * voidGlow;

  // ── Dark matter invisible mass — subtle lensing warble ──
  float lensWarp = snoise(webUV * 3.0 + t * 0.02) * 0.003;
  color += color * lensWarp * 5.0;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= (0.75 + 0.25 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;
