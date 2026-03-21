import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Wings of light: radiating feather-like patterns from center using polar coordinates,
// layered transparency, slow rotation, treble drives fine detail.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Six wings radiating from center (3 pairs with mirror symmetry)
  float wingCount = 6.0;
  float wingSpread = 0.42 + 0.08 * u_bass;

  // Slow majestic rotation
  float baseRotation = t * 0.5;

  // Wing layers: primary structure and overlapping ethereal layers
  for (int w = 0; w < 3; w++) {
    float fw = float(w);
    float layerScale = 1.0 - fw * 0.15;
    float layerRot = baseRotation + fw * 0.15;

    float ra = a + layerRot;

    // Fold into wing sectors
    float sector = 6.28318 / wingCount;
    float sa = mod(ra + sector * 0.5, sector) - sector * 0.5;

    // Wing envelope: wider near center, tapering outward
    float wingTaper = exp(-r * (2.5 - fw * 0.3)) * wingSpread;
    float wingMask = smoothstep(wingTaper, wingTaper * 0.3, abs(sa));

    // Feather barbs: radiating lines that fan out
    float barbFreq = 25.0 + fw * 10.0 + u_treble * 15.0;
    float barbAngle = sa * barbFreq;
    float barb = sin(barbAngle + r * 8.0 - t * 3.0);
    barb = smoothstep(0.2, 0.8, barb);

    // Feather vane structure: curved lines perpendicular to barbs
    float vaneWave = sin(r * 30.0 * layerScale - t * 2.0 + sa * 5.0 + u_mid * 3.0);
    vaneWave = smoothstep(0.4, 0.9, vaneWave) * 0.5;

    // Rachis (central shaft of each wing)
    float rachis = smoothstep(0.012, 0.0, abs(sa)) * smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.1, r);

    // FBM distortion along feathers for organic quality
    float featherNoise = snoise(vec2(sa * 10.0 + fw * 5.0, r * 8.0 - t)) * 0.3;
    float featherDetail = barb * wingMask * (0.7 + featherNoise) + vaneWave * wingMask;

    // Downy under-feathers: soft fbm glow underneath
    float downy = fbm(vec2(sa * 6.0, r * 5.0 + t * 0.5 + fw * 3.0));
    downy = smoothstep(-0.1, 0.4, downy) * wingMask * 0.4;

    // Color per wing layer - shifting from warm inner to cool outer
    vec3 wingCol = palette(
      fw * 0.25 + r * 0.3 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.9, 0.7),
      vec3(0.0, 0.1, 0.2)
    );

    vec3 tipCol = palette(
      fw * 0.25 + r * 0.5 + paletteShift + 0.4,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.5),
      vec3(0.7, 0.9, 1.2),
      vec3(0.3, 0.15, 0.0)
    );

    float layerOpacity = 1.0 / (1.0 + fw * 0.5);

    color += wingCol * featherDetail * layerOpacity * (0.6 + 0.4 * u_mid);
    color += tipCol * downy * layerOpacity;
    color += wingCol * rachis * 1.5 * (0.8 + 0.3 * u_bass);
  }

  // Treble-driven iridescent shimmer on wing surfaces
  float shimmerAngle = a + baseRotation;
  float shimmerSector = mod(shimmerAngle + 3.14159 / wingCount, 6.28318 / wingCount) - 3.14159 / wingCount;
  float shimmer = sin(shimmerSector * 60.0 + r * 40.0 + t * 5.0);
  shimmer = pow(max(shimmer, 0.0), 3.0) * u_treble * 0.4;
  float shimmerMask = exp(-r * 3.0) * smoothstep(0.5, 0.1, abs(shimmerSector));
  vec3 shimmerCol = palette(
    r * 2.0 + a * 0.5 + paletteShift + 0.7,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 0.5),
    vec3(0.0, 0.3, 0.5)
  );
  color += shimmerCol * shimmer * shimmerMask;

  // Central radiance - bright emissive core
  float core = smoothstep(0.15, 0.0, r) * (1.2 + 0.8 * u_amplitude);
  vec3 coreCol = palette(
    t * 0.3 + paletteShift,
    vec3(0.7, 0.6, 0.5),
    vec3(0.3, 0.3, 0.3),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.05, 0.1)
  );
  color += coreCol * core;

  // Halo ring around the core
  float halo = smoothstep(0.008, 0.0, abs(r - 0.2 - 0.03 * sin(t * 2.0))) * (0.7 + 0.4 * u_mid);
  color += coreCol * halo * 0.8;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
