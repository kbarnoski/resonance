import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Shimmer — light playing on a surface, like sunlight reflected off water
// onto a ceiling. Caustic patterns of golden-white light flowing over
// a warm surface. Warm gold, honey, cream tones. Extremely calming.

// Animated Voronoi for caustic network
float causticVoronoi(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 cellId = i + g;
      vec2 rnd = vec2(
        fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453),
        fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453)
      );
      // Smooth circular orbit for each cell center
      vec2 o = 0.5 + 0.4 * sin(t * 0.4 * (0.8 + rnd.x * 0.4) + 6.28 * rnd);
      float d = length(f - g - o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

// Multi-scale caustic combining two frequencies
float caustics(vec2 uv, float t) {
  // Primary caustic pattern — larger cells
  float c1 = causticVoronoi(uv * 3.0 + vec2(t * 0.05), t);
  c1 = 1.0 - smoothstep(0.0, 0.12, c1);
  c1 = pow(c1, 1.8);

  // Secondary caustic — finer detail, slightly offset
  float c2 = causticVoronoi(uv * 5.5 + vec2(t * 0.07, t * 0.04), t * 1.2);
  c2 = 1.0 - smoothstep(0.0, 0.08, c2);
  c2 = pow(c2, 2.0);

  // Tertiary — very fine shimmer
  float c3 = causticVoronoi(uv * 9.0 + vec2(-t * 0.03, t * 0.06), t * 0.8);
  c3 = 1.0 - smoothstep(0.0, 0.06, c3);
  c3 = pow(c3, 2.5);

  return c1 * 0.5 + c2 * 0.35 + c3 * 0.15;
}

// Soft focus light blob — simulates reflected light spots
float lightBlob(vec2 uv, vec2 center, float size) {
  float d = length(uv - center);
  return exp(-d * d / (size * size));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.2;

  // ── Warm base surface — ceiling/wall receiving the light ──
  // Subtle noise for surface texture
  float surfaceNoise = fbm(uv * 2.0 + vec2(t * 0.01)) * 0.5 + 0.5;

  vec3 surfaceColor = palette(
    surfaceNoise * 0.15 + uv.y * 0.05 + paletteShift + 0.1,
    vec3(0.45, 0.38, 0.30),
    vec3(0.08, 0.06, 0.04),
    vec3(0.3, 0.4, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  // ── Main caustic light pattern ──
  // Slowly moving "water surface" position
  vec2 waterOffset = vec2(
    sin(t * 0.3) * 0.2 + cos(t * 0.17) * 0.1,
    cos(t * 0.25) * 0.15 + sin(t * 0.13) * 0.12
  );

  vec2 causticUV = uv + waterOffset;

  // Gentle warping — as if the water surface undulates
  float warp = snoise(uv * 2.0 + vec2(t * 0.15)) * 0.08;
  float warp2 = snoise(uv * 3.5 + vec2(-t * 0.12, t * 0.1)) * 0.05;
  causticUV += vec2(warp, warp2);

  // Bass subtly distorts the caustic pattern
  causticUV += vec2(u_bass * 0.02 * sin(t * 1.5), u_bass * 0.015 * cos(t * 1.8));

  float caustic = caustics(causticUV, t);

  // Mid frequencies modulate caustic intensity
  caustic *= (0.6 + u_mid * 0.4);

  // ── Caustic coloring — golden-white light ──
  vec3 lightColor = palette(
    caustic * 0.3 + t * 0.02 + paletteShift,
    vec3(0.85, 0.75, 0.55),
    vec3(0.15, 0.12, 0.08),
    vec3(0.5, 0.6, 0.8),
    vec3(0.0, 0.05, 0.1)
  );

  // Brighter highlights are more white, dimmer ones more golden
  vec3 causticColor = mix(
    vec3(0.7, 0.6, 0.35),   // golden tint for dim caustics
    vec3(1.0, 0.97, 0.90),  // near-white for bright caustics
    smoothstep(0.2, 0.8, caustic)
  );

  // ── Drifting light blobs — large soft areas of brightness ──
  float blobs = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 blobCenter = vec2(
      sin(t * 0.2 * (0.5 + fi * 0.2) + fi * 2.0) * 0.5,
      cos(t * 0.15 * (0.5 + fi * 0.15) + fi * 1.5) * 0.4
    );
    float blobSize = 0.25 + 0.1 * sin(t * 0.3 + fi * 1.7);
    blobs += lightBlob(uv, blobCenter, blobSize) * 0.2;
  }

  // ── Compose the scene ──
  vec3 color = surfaceColor;

  // Caustic light overlay — additive blending
  color += causticColor * caustic * 0.55;

  // Soft blob light — creates moving pools of warmth
  vec3 blobColor = palette(
    blobs * 0.5 + t * 0.03 + paletteShift + 0.2,
    vec3(0.6, 0.5, 0.35),
    vec3(0.1, 0.08, 0.05),
    vec3(0.4, 0.5, 0.6),
    vec3(0.0, 0.05, 0.15)
  );
  color += blobColor * blobs;

  // ── Honey glow — overall warm ambient ──
  float ambientWarmth = 0.5 + 0.5 * sin(t * 0.1);
  vec3 honeyAmbient = vec3(0.08, 0.06, 0.03) * ambientWarmth;
  color += honeyAmbient;

  // ── Treble sparkle — fine bright points on caustic peaks ──
  float sparkle = caustic;
  sparkle = pow(sparkle, 4.0);
  color += vec3(1.0, 0.95, 0.85) * sparkle * u_treble * 0.4;

  // ── Warm color grading ──
  // Push everything slightly toward warm gold
  color = mix(color, color * vec3(1.05, 0.98, 0.88), 0.3);

  // ── Soft vignette — slightly darker at edges, like a warm room ──
  float vignette = 1.0 - smoothstep(0.3, 1.2, length(uv));
  color *= 0.75 + 0.25 * vignette;

  // Clamp to prevent overflow
  color = min(color, vec3(1.2));

  gl_FragColor = vec4(color, 1.0);
}
`;
