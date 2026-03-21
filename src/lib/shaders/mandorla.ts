import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Vesica piscis: overlapping circles creating an almond-shaped sacred form,
// interference patterns where circles intersect, nested layers at different scales.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Slow breathing expansion
  float breath = 1.0 + 0.08 * sin(t * 2.0) + u_bass * 0.1;

  // Multiple nested vesica piscis at different scales and rotations
  for (int layer = 0; layer < 6; layer++) {
    float fl = float(layer);
    float scale = 1.0 + fl * 0.4;
    float separation = (0.25 + 0.05 * sin(t * 0.7 + fl * 1.2)) * breath / scale;

    // Rotate each layer differently
    float layerAngle = t * 0.3 * (mod(fl, 2.0) < 0.5 ? 1.0 : -1.0) + fl * 0.5236;
    vec2 ruv = rot2(layerAngle) * uv * scale;

    // Two circle centers offset along x
    vec2 c1 = vec2(-separation, 0.0);
    vec2 c2 = vec2(separation, 0.0);

    float rad = separation * 1.7 + 0.05 * u_mid;

    // Signed distances from each circle
    float d1 = length(ruv - c1) - rad;
    float d2 = length(ruv - c2) - rad;

    // The vesica piscis is the intersection region
    float vesica = max(d1, d2);
    float vesicaEdge = smoothstep(0.008, 0.0, abs(vesica));

    // Individual circle edges
    float edge1 = smoothstep(0.006, 0.0, abs(d1));
    float edge2 = smoothstep(0.006, 0.0, abs(d2));

    // Interference pattern inside the vesica
    float inside = smoothstep(0.02, -0.02, vesica);
    float interference = sin((d1 - d2) * 60.0 / scale + t * 2.0 + u_treble * 3.0);
    interference = interference * 0.5 + 0.5;
    float interGlow = inside * interference * 0.6;

    // Radial ripples from intersection center
    float rippleDist = length(ruv);
    float ripple = sin(rippleDist * 40.0 / scale - t * 3.0 + u_bass * 4.0);
    ripple = smoothstep(0.3, 0.8, ripple) * inside * 0.3;

    // Color unique per layer
    vec3 layerCol = palette(
      fl * 0.16 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.7, 0.9),
      vec3(0.0, 0.15, 0.3)
    );

    vec3 interCol = palette(
      fl * 0.16 + paletteShift + 0.33,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.5),
      vec3(0.6, 1.0, 0.8),
      vec3(0.2, 0.0, 0.4)
    );

    // Fade outer layers more
    float layerFade = 1.0 / (1.0 + fl * 0.35);

    color += layerCol * (edge1 + edge2) * layerFade * 0.7;
    color += layerCol * vesicaEdge * layerFade * 1.2;
    color += interCol * interGlow * layerFade * (0.5 + 0.5 * u_mid);
    color += interCol * ripple * layerFade;
  }

  // Central almond glow at the intersection of the primary vesica
  float primarySep = 0.25 * breath;
  float pd1 = length(uv - vec2(-primarySep, 0.0)) - primarySep * 1.7;
  float pd2 = length(uv - vec2(primarySep, 0.0)) - primarySep * 1.7;
  float primaryVesica = max(pd1, pd2);
  float almondGlow = smoothstep(0.05, -0.15, primaryVesica) * (0.6 + 0.5 * u_bass);

  vec3 almondCol = palette(
    t * 0.15 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.1, 0.2)
  );
  color += almondCol * almondGlow * 0.5;

  // FBM texture overlay for depth
  float noiseField = fbm(uv * 4.0 + t * 0.2);
  float noiseAccent = smoothstep(0.0, 0.4, abs(noiseField)) * 0.12;
  color += almondCol * noiseAccent * smoothstep(1.0, 0.2, length(uv));

  // Treble-driven fine shimmer at intersection edges
  float shimmer = u_treble * 0.25 * sin(pd1 * 80.0 + t * 5.0) * smoothstep(0.02, 0.0, abs(primaryVesica));
  color += vec3(1.2, 1.15, 1.1) * shimmer;

  // Vignette
  color *= smoothstep(1.5, 0.4, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
