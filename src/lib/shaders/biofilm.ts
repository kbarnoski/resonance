import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Animated voronoi for bacterial colonies
vec3 voronoiBio(vec2 p, float time) {
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
      vec2 o = 0.5 + 0.5 * sin(rnd + time * 0.5);
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
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: substrate surface ──
  float bgN = fbm(uv * 3.0 + vec2(t * 0.03, -t * 0.02));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.2,
    vec3(0.025, 0.02, 0.015),
    vec3(0.03, 0.025, 0.02),
    vec3(0.35, 0.3, 0.25),
    vec3(0.0, 0.08, 0.12)
  );
  color = bgColor * (bgN * 0.1 + 0.04);

  // ── Colony growth frontier — expanding from center ──
  float growthRadius = 0.15 + fract(t * 0.08) * 0.6;
  float frontier = smoothstep(growthRadius + 0.05, growthRadius - 0.02, length(uv));
  float frontierEdge = smoothstep(0.03, 0.0, abs(length(uv) - growthRadius));

  // Irregular frontier shape — not perfectly circular
  float frontierNoise = snoise(vec2(atan(uv.y, uv.x) * 3.0, t * 0.5)) * 0.08;
  float irregFrontier = smoothstep(growthRadius + frontierNoise + 0.03, growthRadius + frontierNoise - 0.02, length(uv));

  // ── Bacterial colony voronoi — individual cells ──
  vec2 warp = vec2(
    snoise(uv * 3.0 + vec2(t * 0.15, 0.0)),
    snoise(uv * 3.0 + vec2(0.0, t * 0.12) + 5.0)
  );
  vec2 warped = uv + warp * 0.06;

  // Dense colony cells
  vec3 v1 = voronoiBio(warped * 8.0, t * 0.3);
  float ridge1 = v1.y - v1.x;
  float edge1 = smoothstep(0.06, 0.0, ridge1);
  float cell1 = v1.x;
  float node1 = smoothstep(0.15, 0.0, cell1);

  // Micro colony structure
  vec3 v2 = voronoiBio(warped * 18.0 + 5.0, t * 0.5);
  float ridge2 = v2.y - v2.x;
  float edge2 = smoothstep(0.04, 0.0, ridge2);

  // ── Colony colors — biological greens, yellows, amber ──
  vec3 colonyColor = palette(
    cell1 * 0.4 + ridge1 * 0.2 + t * 0.02 + paletteShift,
    vec3(0.3, 0.35, 0.2),
    vec3(0.25, 0.3, 0.15),
    vec3(0.7, 0.8, 0.4),
    vec3(0.0, 0.12, 0.18)
  );

  vec3 cellWallColor = palette(
    edge1 * 0.3 + t * 0.03 + paletteShift + 0.2,
    vec3(0.35, 0.4, 0.25),
    vec3(0.3, 0.35, 0.2),
    vec3(0.8, 0.9, 0.5),
    vec3(0.0, 0.1, 0.15)
  );

  // ── Compose colony within growth frontier ──
  // Cell walls
  color += cellWallColor * edge1 * 0.5 * irregFrontier;
  color += cellWallColor * edge2 * 0.15 * irregFrontier;

  // Cell interiors — filled with life
  float cellFill = smoothstep(0.2, 0.08, cell1) * irregFrontier;
  color += colonyColor * cellFill * 0.2;

  // Colony nodes — brighter centers of activity
  color += colonyColor * node1 * 0.4 * irregFrontier;

  // ── Frontier glow — active growth zone ──
  vec3 frontierColor = palette(
    t * 0.06 + paletteShift + 0.5,
    vec3(0.4, 0.45, 0.25),
    vec3(0.35, 0.4, 0.2),
    vec3(0.9, 1.0, 0.5),
    vec3(0.0, 0.15, 0.2)
  );
  float fEdgeGlow = smoothstep(0.06, 0.0, abs(length(uv) - growthRadius - frontierNoise));
  color += frontierColor * fEdgeGlow * (0.5 + u_bass * 0.8);

  // ── Quorum sensing signals — communication waves ──
  // Radial waves emanating from colony centers
  float signalAccum = 0.0;
  for (int s = 0; s < 5; s++) {
    float sf = float(s);
    float seed = hash1(sf * 7.3);
    float seed2 = hash1(sf * 11.1 + 2.0);

    vec2 signalOrigin = vec2(
      (seed - 0.5) * 0.4,
      (seed2 - 0.5) * 0.4
    );

    // Only emit from inside colony
    float inColony = smoothstep(growthRadius + 0.05, growthRadius - 0.1, length(signalOrigin));

    float signalR = fract(t * 0.3 + sf * 0.23) * 0.5;
    float signalDist = abs(length(uv - signalOrigin) - signalR);
    float signalWave = smoothstep(0.015, 0.0, signalDist);
    signalWave *= (1.0 - signalR * 2.0); // fade with expansion
    signalWave *= inColony;

    signalAccum += signalWave;
  }

  vec3 signalColor = palette(
    signalAccum * 0.5 + t * 0.04 + paletteShift + 0.7,
    vec3(0.4, 0.5, 0.3),
    vec3(0.35, 0.45, 0.25),
    vec3(0.8, 1.0, 0.6),
    vec3(0.0, 0.2, 0.25)
  );
  color += signalColor * signalAccum * 0.4 * (1.0 + u_mid * 0.8);

  // ── EPS matrix — extracellular slime layer ──
  float eps = fbm(warped * 4.0 + t * 0.1);
  float epsLayer = smoothstep(0.3, 0.6, eps) * irregFrontier;
  vec3 epsColor = palette(
    eps * 0.3 + paletteShift + 0.35,
    vec3(0.2, 0.25, 0.15),
    vec3(0.18, 0.22, 0.12),
    vec3(0.5, 0.6, 0.35),
    vec3(0.0, 0.1, 0.15)
  );
  color += epsColor * epsLayer * 0.1;

  // ── Nutrient gradient — diffusing into colony from outside ──
  float nutrientGrad = smoothstep(0.0, 0.4, length(uv) - growthRadius);
  float nutrientFlow = sin(length(uv) * 20.0 - t * 2.0) * 0.5 + 0.5;
  nutrientFlow = pow(nutrientFlow, 5.0) * nutrientGrad;
  vec3 nutrientColor = palette(
    nutrientFlow * 0.3 + paletteShift + 0.6,
    vec3(0.2, 0.3, 0.35),
    vec3(0.15, 0.25, 0.3),
    vec3(0.5, 0.7, 0.8),
    vec3(0.0, 0.15, 0.35)
  );
  color += nutrientColor * nutrientFlow * 0.08;

  // ── Bass: colony pulsing / metabolic activity ──
  float metabolic = sin(cell1 * 15.0 - t * 3.0) * 0.5 + 0.5;
  metabolic = pow(metabolic, 5.0) * irregFrontier;
  color += colonyColor * metabolic * u_bass * 0.3;

  // ── Treble: division sparkle — bacteria dividing ──
  float divisionSparkle = snoise(uv * 25.0 + t * 3.0);
  divisionSparkle = smoothstep(0.82, 1.0, divisionSparkle) * u_treble * irregFrontier;
  color += frontierColor * divisionSparkle * 0.4;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.55, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
