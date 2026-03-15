import { U, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  `
// Stardust — drifting through an infinite field of luminous particles.
// Multiple depth layers with independent parallax create true 3D depth.
// Each layer is at a different distance: near particles large and fast,
// far particles tiny and still, simulating infinite volumetric space.

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Single particle layer at a given depth scale and offset
// Returns: (brightness, hue) packed
vec2 particleLayer(vec2 uv, float scale, vec2 drift, float t, float seed) {
  vec2 p = uv * scale + drift;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;

  float h = hash2(id + seed);
  // Sparse: only ~8% of cells have a particle
  if (h > 0.92) {
    float size = 0.04 + hash(h * 7.31) * 0.08;
    // Depth-appropriate size: far layers (small scale) have smaller absolute particles
    size /= scale * 0.5;

    float d = length(f);

    // Twinkle — each particle at its own frequency
    float twinkleFreq = 0.5 + hash(h * 13.7) * 4.0;
    float twinkle = 0.6 + 0.4 * sin(t * twinkleFreq + h * 100.0);
    twinkle = mix(twinkle, 1.0, 1.0 - u_treble); // treble drives scintillation

    float brightness = smoothstep(size, 0.0, d) * twinkle;
    brightness += smoothstep(size * 3.0, 0.0, d) * 0.15 * twinkle; // soft glow halo

    return vec2(brightness, h);
  }
  return vec2(0.0, 0.0);
}

// Dust cloud — very faint volumetric haze between layers
float dustHaze(vec2 uv, float t) {
  vec2 p1 = uv * 2.0 + vec2(t * 0.05, t * 0.03);
  vec2 p2 = uv * 1.2 - vec2(t * 0.03, t * 0.07);

  // Simple hash-based soft noise (no fbm — just two lattice lookups)
  vec2 i1 = floor(p1);
  vec2 i2 = floor(p2);
  float n1 = hash2(i1) * 0.5 + hash2(i1 + 1.0) * 0.5;
  float n2 = hash2(i2) * 0.5 + hash2(i2 + vec2(3.0)) * 0.5;

  return (n1 * n2) * 0.04;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.28;

  // ── Drift through space — gentle camera movement ──
  // Each layer drifts at different speed (parallax from depth)
  vec2 drift0 = vec2(t * 0.40, t * 0.25);  // nearest — fastest
  vec2 drift1 = vec2(t * 0.22, t * 0.14);  // near-mid
  vec2 drift2 = vec2(t * 0.12, t * 0.08);  // mid
  vec2 drift3 = vec2(t * 0.05, t * 0.03);  // far — barely moves

  // Bass creates a surge forward — like accelerating
  float surge = u_bass * 0.08;
  drift0 += uv * surge * 3.0;
  drift1 += uv * surge * 1.5;
  drift2 += uv * surge * 0.7;

  // ── Layer 0: nearest stars — large, bright, few ──
  vec2 L0 = particleLayer(uv, 4.0, drift0, t, 0.0);
  // ── Layer 1: near-mid — medium ──
  vec2 L1 = particleLayer(uv, 8.0, drift1, t, 37.0);
  // ── Layer 2: mid distance — small, many ──
  vec2 L2 = particleLayer(uv, 16.0, drift2, t, 83.0);
  // ── Layer 3: far — tiny, dense, nearly still ──
  vec2 L3 = particleLayer(uv, 32.0, drift3, t, 157.0);

  // ── Colors: each layer a different temperature/hue regime ──
  // Layer 0 — warm nearby stars: yellow-white
  vec3 col0 = palette(
    L0.y * 0.7 + paletteShift,
    vec3(0.5, 0.5, 0.4),
    vec3(0.5, 0.4, 0.3),
    vec3(0.8, 0.6, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Layer 1 — blue-white mid-range
  vec3 col1 = palette(
    L1.y * 0.8 + paletteShift + 0.2,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.5),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.15, 0.3)
  );

  // Layer 2 — cool, slightly violet
  vec3 col2 = palette(
    L2.y * 0.9 + paletteShift + 0.45,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.4, 0.3, 0.8),
    vec3(0.1, 0.1, 0.3)
  );

  // Layer 3 — distant, red-shifted, faint
  vec3 col3 = palette(
    L3.y * 1.0 + paletteShift + 0.65,
    vec3(0.3, 0.3, 0.4),
    vec3(0.2, 0.2, 0.3),
    vec3(0.6, 0.3, 0.5),
    vec3(0.1, 0.05, 0.2)
  );

  // ── Background — absolute void of space ──
  vec3 color = vec3(0.003, 0.003, 0.007);

  // Dust haze — very subtle
  float haze = dustHaze(uv, t);
  vec3 hazeCol = palette(
    t * 0.02 + paletteShift + 0.5,
    vec3(0.1, 0.1, 0.15),
    vec3(0.05, 0.05, 0.1),
    vec3(0.4, 0.3, 0.6),
    vec3(0.15, 0.1, 0.25)
  );
  color += hazeCol * haze * (0.5 + u_mid * 0.5);

  // Composite layers: far first (additive)
  color += col3 * L3.x * 0.5;
  color += col2 * L2.x * 0.75;
  color += col1 * L1.x * 1.0;
  color += col0 * L0.x * 1.5;

  // Nearest particle bloom — extra glow on brightest near stars
  color += col0 * pow(L0.x, 2.0) * 0.8 * (1.0 + u_bass * 0.6);

  // Audio pulse — amplitude causes all particles to bloom
  float globalBoom = u_amplitude * 0.3;
  color += col1 * L1.x * globalBoom;
  color += col0 * L0.x * globalBoom * 2.0;

  // Faint Milky Way band — a subtle horizontal concentration of far stars
  float bandMask = exp(-pow(uv.y * 3.0, 2.0)) * 0.03;
  color += hazeCol * bandMask * (0.5 + u_mid * 0.5);

  // Vignette
  float vignette = 1.0 - smoothstep(0.55, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
