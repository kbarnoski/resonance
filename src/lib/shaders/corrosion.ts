import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  ROT2 +
  `
// Metal decay — surface eating away in patches, pitting, green verdigris
// patterns spreading, structural dissolution, beautiful destruction.

float pitPattern(vec2 p, float density) {
  vec3 vor = voronoi(p);
  float edge = vor.y - vor.x;
  float pit = smoothstep(0.02, 0.0, edge) * density;
  float surface = smoothstep(0.0, 0.15, edge);
  return mix(pit, surface, 0.5);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Corrosion spreading over time — bass accelerates the decay
  float age = t * 1.5 + u_bass * 0.5;
  float corrosionFront = sin(age * 0.3) * 0.5 + 0.5;

  // Metal surface: layered voronoi at different scales for grain structure
  vec3 vor1 = voronoi(uv * 6.0 + t * 0.02);
  vec3 vor2 = voronoi(uv * 15.0 + vec2(10.0) + t * 0.01);
  vec3 vor3 = voronoi(uv * 30.0 + vec2(20.0));

  float metalGrain = vor1.x * 0.5 + vor2.x * 0.3 + vor3.x * 0.2;
  float grainEdge = smoothstep(0.05, 0.0, vor1.y - vor1.x);

  // Corrosion map — where decay has reached
  float corrosionNoise = fbm(uv * 3.0 + t * 0.05);
  float corrosionNoise2 = fbm(uv * 5.0 - t * 0.03 + vec2(7.0));
  float corrosionMap = corrosionNoise * 0.6 + corrosionNoise2 * 0.4;
  corrosionMap = corrosionMap * 0.5 + 0.5;

  // Spreading from edges and low points
  float edgeDist = min(min(abs(uv.x + 0.8), abs(uv.x - 0.8)),
                       min(abs(uv.y + 0.5), abs(uv.y - 0.5)));
  float edgeSpread = smoothstep(0.4, 0.0, edgeDist);
  corrosionMap = corrosionMap * 0.7 + edgeSpread * 0.3;

  float corroded = smoothstep(0.3, 0.7, corrosionMap + corrosionFront * 0.3);
  corroded = clamp(corroded + u_mid * 0.15, 0.0, 1.0);

  // Pitting in corroded areas — deep holes
  float pits = pitPattern(uv * 12.0 + t * 0.03, corroded);
  float deepPits = pitPattern(uv * 25.0 + vec2(5.0), corroded * 0.8);

  // Verdigris texture — flowing organic patterns of green patina
  vec2 verdigrisUV = uv * 4.0 + vec2(
    fbm(uv * 2.0 + t * 0.02) * 0.5,
    fbm(uv * 2.5 + t * 0.015 + vec2(3.0)) * 0.5
  );
  float verdigris = fbm(verdigrisUV);
  verdigris = smoothstep(0.0, 0.5, verdigris * 0.5 + 0.5) * corroded;

  // Rust streaks — vertical drip patterns
  float drip = fbm(vec2(uv.x * 8.0, uv.y * 2.0 - t * 0.1));
  float rustStreak = smoothstep(0.2, 0.6, drip) * corroded;
  rustStreak *= smoothstep(-0.5, 0.5, -uv.y);

  // Metal color — dark oxidized surface
  vec3 metalColor = palette(metalGrain * 0.3 + paletteShift,
    vec3(0.04, 0.035, 0.03),
    vec3(0.05, 0.04, 0.035),
    vec3(0.6, 0.5, 0.4),
    vec3(0.0, 0.05, 0.1));

  // Grain highlight on uncorroded metal
  vec3 grainHighlight = palette(vor1.x + paletteShift + 0.2,
    vec3(0.06, 0.05, 0.04),
    vec3(0.04, 0.03, 0.025),
    vec3(0.5, 0.4, 0.3),
    vec3(0.05, 0.08, 0.12));
  metalColor += grainHighlight * grainEdge * 0.3 * (1.0 - corroded);

  // Verdigris color — dark muted greens and teals
  vec3 verdigrisColor = palette(verdigris * 0.4 + paletteShift + 0.5,
    vec3(0.02, 0.05, 0.04),
    vec3(0.04, 0.08, 0.06),
    vec3(0.4, 0.8, 0.6),
    vec3(0.1, 0.2, 0.15));

  // Rust color — deep browns and dark reds
  vec3 rustColor = palette(rustStreak * 0.3 + paletteShift + 0.8,
    vec3(0.06, 0.02, 0.01),
    vec3(0.08, 0.03, 0.01),
    vec3(0.8, 0.4, 0.2),
    vec3(0.0, 0.1, 0.15));

  // Pit darkness
  vec3 pitColor = vec3(0.005, 0.003, 0.002);

  // Composite
  vec3 color = metalColor;
  color = mix(color, verdigrisColor, verdigris * 0.7);
  color = mix(color, rustColor, rustStreak * 0.5);
  color = mix(color, pitColor, pits * 0.6);
  color = mix(color, pitColor * 0.5, deepPits * 0.3);

  // Corrosion boundary — slightly brighter edge where decay meets metal
  float boundary = smoothstep(0.02, 0.0, abs(corrosionMap + corrosionFront * 0.3 - 0.5));
  vec3 boundaryColor = palette(t + paletteShift,
    vec3(0.04, 0.06, 0.03),
    vec3(0.06, 0.08, 0.04),
    vec3(0.5, 0.7, 0.4),
    vec3(0.1, 0.15, 0.2));
  color += boundaryColor * boundary * 0.15 * (0.5 + u_treble * 0.5);

  // Moisture sheen on corroded areas — subtle wet-look highlight
  float sheen = snoise(uv * 20.0 + t * 0.3);
  sheen = pow(max(sheen, 0.0), 4.0) * corroded * 0.06;
  color += vec3(sheen) * (0.3 + u_amplitude * 0.7);

  // Vignette
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.4, 1.3, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
