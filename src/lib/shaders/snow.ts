import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite falling snow — 6 parallax depth layers of hash-based snowflakes,
// each layer drifting at different speed and scale, creating bottomless depth.

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2d(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Returns snowflake brightness for a single tiled layer
// cellSize controls the density / depth of that layer
float snowLayer(vec2 uv, float cellSize, float speed, float drift, float seed) {
  // Tile uv into a grid of cells
  vec2 scaledUV = uv / cellSize;
  // Scroll downward with time; drift laterally
  scaledUV.y += u_time * speed;
  scaledUV.x += sin(u_time * 0.3 + seed * 5.0) * drift;

  vec2 cell = floor(scaledUV);
  vec2 f    = fract(scaledUV);

  float brightness = 0.0;
  // Check the current cell and the 8 neighbors to avoid clipping at edges
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 nb = cell + vec2(float(dx), float(dy));
      // Random center within cell
      float h1 = hash2d(nb + seed);
      float h2 = hash2d(nb + seed + vec2(17.3, 31.7));
      vec2 center = vec2(h1, h2);
      // Individual flake drift
      center.x += sin(u_time * (0.2 + h1 * 0.4) + h2 * 6.28) * 0.25;

      vec2 toFlake = f - vec2(float(dx), float(dy)) - center;
      float dist = length(toFlake);

      float radius = 0.06 + h1 * 0.08;
      // Soft disc
      float flake = smoothstep(radius, radius * 0.3, dist);
      // Treble pulses flake brightness
      flake *= (0.7 + 0.3 * sin(u_time * 2.0 + h1 * 20.0 + h2 * 30.0));
      flake *= (0.8 + u_treble * 0.2);

      brightness += flake;
    }
  }
  return clamp(brightness, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.26;

  // ── Background — deep winter night sky ──
  float skyGrad = smoothstep(-0.8, 0.8, uv.y);
  float bgNoise = fbm(uv * 1.5 + vec2(t * 0.1, 0.0)) * 0.5 + 0.5;

  vec3 bgNight = palette(
    skyGrad * 0.4 + bgNoise * 0.2 + t * 0.04 + paletteShift + 0.6,
    vec3(0.06, 0.07, 0.14),
    vec3(0.08, 0.07, 0.16),
    vec3(0.4, 0.3, 0.6),
    vec3(0.1, 0.08, 0.25)
  );

  // ── Ground glow — snow on the ground reflects ambient light ──
  float ground = smoothstep(-0.45, -0.62, uv.y);
  vec3 groundCol = palette(
    t * 0.08 + paletteShift + 0.15,
    vec3(0.50, 0.52, 0.60),
    vec3(0.12, 0.10, 0.18),
    vec3(0.5, 0.4, 0.7),
    vec3(0.05, 0.02, 0.15)
  );
  vec3 bgColor = mix(bgNight, groundCol * 0.9, ground);

  // ── Six snow layers — from far (fine, slow) to near (large, fast) ──
  // Layer 1: very far — tiny, slow, faint
  float s1 = snowLayer(uv, 0.025, 0.10, 0.02, 0.0);
  // Layer 2: far
  float s2 = snowLayer(uv, 0.040, 0.16, 0.03, 11.3);
  // Layer 3: mid-far
  float s3 = snowLayer(uv, 0.065, 0.24, 0.04, 23.7);
  // Layer 4: mid
  float s4 = snowLayer(uv, 0.095, 0.35, 0.06, 37.1);
  // Layer 5: near
  float s5 = snowLayer(uv, 0.140, 0.50, 0.09, 51.9);
  // Layer 6: very near — large flakes, fast
  float s6 = snowLayer(uv, 0.200, 0.70, 0.14, 67.3);

  // ── Flake color — each depth layer a slightly different tint ──
  vec3 farSnow = palette(
    s1 * 0.5 + paletteShift + 0.05,
    vec3(0.80, 0.82, 0.90),
    vec3(0.08, 0.06, 0.12),
    vec3(0.4, 0.3, 0.6),
    vec3(0.0, 0.05, 0.1)
  );
  vec3 midSnow = palette(
    s3 * 0.5 + paletteShift + 0.25,
    vec3(0.88, 0.90, 0.96),
    vec3(0.06, 0.05, 0.10),
    vec3(0.3, 0.25, 0.5),
    vec3(0.02, 0.0, 0.08)
  );
  vec3 nearSnow = palette(
    s6 * 0.4 + paletteShift + 0.45,
    vec3(0.95, 0.96, 1.00),
    vec3(0.04, 0.03, 0.07),
    vec3(0.2, 0.15, 0.35),
    vec3(0.0, 0.0, 0.05)
  );

  // Composite snow onto background
  vec3 color = bgColor;
  color += farSnow  * s1 * 0.30;  // faint far layer
  color += farSnow  * s2 * 0.40;
  color += midSnow  * s3 * 0.55;
  color += midSnow  * s4 * 0.70;
  color += nearSnow * s5 * 0.85;
  color += nearSnow * s6 * 1.00;  // near layer is fully opaque-bright

  // Bass causes heavier snowfall shimmer — pulses all layers
  color += farSnow * (s1 + s2) * u_bass * 0.15;

  // Mid: subtle aurora-like color wash in the sky
  float aurora = fbm(vec2(uv.x * 2.0 + t * 0.5, uv.y * 1.0 + 0.3)) * 0.5 + 0.5;
  vec3 auroraCol = palette(
    aurora * 0.7 + t * 0.15 + paletteShift + 0.5,
    vec3(0.1, 0.3, 0.2),
    vec3(0.1, 0.25, 0.15),
    vec3(0.3, 0.7, 0.5),
    vec3(0.05, 0.2, 0.1)
  );
  float auroraMask = smoothstep(0.1, 0.7, uv.y) * aurora * u_mid * 0.4;
  color += auroraCol * auroraMask * 0.3;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
