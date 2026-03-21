import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
// Erosion — slow wearing away of structure, revealing layers beneath

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.2;

  // Geological layers — stacked strata that are slowly being revealed
  float layerScale = 8.0;
  float layerY = uv.y * layerScale + snoise(vec2(uv.x * 3.0, t * 0.1)) * 0.5;
  float layerIndex = floor(layerY);
  float layerFrac = fract(layerY);

  // Each layer has a unique pattern
  float layerPattern = snoise(vec2(uv.x * 4.0 + layerIndex * 5.3, layerIndex * 7.1));

  // Voronoi crack network — erosion cracks
  vec2 crackUV = uv * 5.0 + vec2(t * 0.02, 0.0);
  vec3 vor = voronoi(crackUV);
  float cracks = smoothstep(0.08, 0.0, vor.y - vor.x);
  float cellEdge = vor.y - vor.x;

  // Erosion progression — areas being worn away
  float erosionNoise = fbm(uv * 2.0 + vec2(t * 0.15, t * 0.08));
  float erosionFront = erosionNoise * 0.5 + 0.5;
  erosionFront = smoothstep(0.3 - u_bass * 0.15, 0.7, erosionFront);

  // Surface texture — rough stone
  float surfTex = fbm(uv * 8.0 + layerIndex * 3.0) * 0.5 + 0.5;

  // Sediment patterns — flowing water carves channels
  float channels = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 chUV = uv * (3.0 + fi * 2.0);
    chUV.y += t * 0.05 * (1.0 + fi);
    float ch = snoise(chUV + fi * 9.0);
    ch = smoothstep(0.02, 0.0, abs(ch)) * (0.5 - fi * 0.1);
    channels += ch;
  }
  channels *= erosionFront;

  // Exposed layer beneath — different texture/color
  float exposedDepth = erosionFront * (1.0 + u_mid * 0.5);

  // Particle debris — worn-off material
  float debris = snoise(uv * 25.0 + vec2(t * 0.3, -t * 0.5));
  debris = pow(max(debris, 0.0), 5.0) * erosionFront * u_treble * 0.3;

  // Colors — layered earth tones
  vec3 surfaceColor = palette(
    surfTex * 0.3 + layerPattern * 0.2 + paletteShift,
    vec3(0.25, 0.2, 0.15),
    vec3(0.15, 0.12, 0.08),
    vec3(0.7, 0.6, 0.45),
    vec3(0.05, 0.08, 0.12)
  );

  // Each exposed layer gets a slightly different color
  vec3 layer1Color = palette(
    layerFrac * 0.4 + paletteShift + 0.2,
    vec3(0.3, 0.18, 0.1),
    vec3(0.2, 0.12, 0.06),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.1, 0.15)
  );

  vec3 layer2Color = palette(
    layerFrac * 0.3 + paletteShift + 0.5,
    vec3(0.15, 0.12, 0.1),
    vec3(0.1, 0.08, 0.06),
    vec3(0.6, 0.5, 0.4),
    vec3(0.08, 0.1, 0.15)
  );

  vec3 crackColor = palette(
    cellEdge * 0.5 + paletteShift + 0.7,
    vec3(0.08, 0.06, 0.05),
    vec3(0.05, 0.04, 0.03),
    vec3(0.4, 0.35, 0.3),
    vec3(0.05, 0.08, 0.1)
  );

  // Compose
  vec3 exposedLayer = mix(layer1Color, layer2Color, sin(layerIndex * 2.0) * 0.5 + 0.5);
  vec3 color = mix(surfaceColor, exposedLayer, erosionFront);

  // Crack lines darken
  color = mix(color, crackColor, cracks * 0.7);

  // Water channels — slightly darker with blue tint
  color = mix(color, color * vec3(0.7, 0.75, 0.85), channels * 0.5);

  // Debris particles
  color += vec3(0.3, 0.25, 0.18) * debris;

  // Layer boundaries — thin bright lines at strata edges
  float layerLine = smoothstep(0.05, 0.0, abs(layerFrac - 0.5) - 0.45);
  color += vec3(0.15, 0.1, 0.05) * layerLine * erosionFront * 0.5;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
