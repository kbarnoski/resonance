import { U, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  `
// Fast hash for particle positions
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

// Single bioluminescent spore particle
// Returns glow intensity and color offset
vec2 spore(vec2 uv, vec2 center, float radius, float phase, float t) {
  float d = length(uv - center);
  // Core glow — soft exponential
  float core = exp(-d * d / (radius * radius * 0.5));
  // Pulsing bioluminescence
  float pulse = 0.5 + 0.5 * sin(t * 2.5 + phase);
  return vec2(core * pulse, phase);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.30;

  vec3 color = vec3(0.0);

  // ── Infinite depth cloud: many layers of floating spores ──
  // Each layer is a depth slice with its own density, scale, drift speed
  // Farther layers: smaller, dimmer, denser, slower
  // Closer layers: larger, brighter, sparser, faster

  int NUM_LAYERS = 8;
  for (int layer = 0; layer < 8; layer++) {
    float lf = float(layer);
    float layerFrac = lf / 7.0; // 0.0 = far, 1.0 = near

    // Depth parameters
    float depthScale = mix(12.0, 3.0, layerFrac);  // far = small/dense, near = large/sparse
    float brightness = mix(0.06, 1.0, layerFrac * layerFrac); // exponential brightness with depth
    float driftSpeed = mix(0.04, 0.25, layerFrac); // near drifts faster

    // Per-layer drift direction and velocity
    float driftAngle = lf * 1.37 + t * 0.05;
    vec2 drift = vec2(cos(driftAngle), sin(driftAngle)) * driftSpeed * t;

    // Transform UV to layer's cell space
    vec2 layerUV = uv * depthScale + drift + vec2(lf * 5.71, lf * 3.31);

    // Atmosphere parallax — bass moves near layers more than far
    float bassParallax = u_bass * (layerFrac * layerFrac) * 0.15;
    layerUV += vec2(bassParallax, 0.0);

    // Grid cell — 1 spore per cell (with hash-based sub-cell placement)
    vec2 cellIdx = floor(layerUV);
    vec2 cellFrac = fract(layerUV);

    // Sample cell and 8 neighbors for smooth overlap
    for (int dj = -1; dj <= 1; dj++) {
      for (int di = -1; di <= 1; di++) {
        vec2 neighbor = cellIdx + vec2(float(di), float(dj));
        vec2 h = hash2(neighbor + lf * vec2(17.3, 31.7));

        // Sub-cell position — jitter within cell
        vec2 sporeCenter = vec2(float(di), float(dj)) + h - cellFrac;

        // Individual particle parameters
        float particlePhase = h.x * 6.28 + lf * 2.1;
        float particleSize = (0.06 + h.y * 0.12) / depthScale * 12.0;

        // Gentle individual float motion
        float floatFreq = 0.4 + h.x * 0.6;
        vec2 floatOffset = vec2(
          sin(t * floatFreq + particlePhase) * 0.05,
          cos(t * floatFreq * 0.7 + particlePhase) * 0.08
        );
        sporeCenter += floatOffset;

        float dist = length(sporeCenter);
        float glow = exp(-dist * dist / (particleSize * particleSize));

        // Bioluminescent pulse — bass makes near layers surge
        float pulse = 0.5 + 0.5 * sin(t * 2.0 + particlePhase);
        float bassPulse = 1.0 + u_bass * layerFrac * 1.5;
        glow *= pulse * bassPulse;

        // Color — each layer has a dominant hue, treble shifts far layers
        float colorT = h.x * 0.5 + lf * 0.08 + t * 0.02 + paletteShift;
        colorT += u_treble * (1.0 - layerFrac) * 0.3; // treble = far layer color shift

        vec3 sporeColor = palette(
          colorT,
          vec3(0.4, 0.5, 0.6),
          vec3(0.4, 0.4, 0.5),
          vec3(0.8, 1.0, 0.9),
          vec3(0.0, 0.25, 0.5)
        );

        // Mid frequencies — warm up color slightly
        float midWarm = u_mid * 0.25 * layerFrac;
        sporeColor += palette(
          colorT + 0.5,
          vec3(0.5, 0.3, 0.2),
          vec3(0.3, 0.2, 0.1),
          vec3(1.0, 0.6, 0.3),
          vec3(0.05, 0.1, 0.2)
        ) * midWarm;

        color += sporeColor * glow * brightness;
      }
    }
  }

  // ── Background void — deep black with faint nebulosity ──
  // Very faint FBM haze to suggest infinite space
  vec2 p = uv;
  float bgHaze = 0.0;
  float amp = 0.5;
  float freq = 1.5;
  for (int i = 0; i < 4; i++) {
    vec2 h2 = hash2(floor(p * freq) + float(i) * vec2(3.7, 5.1));
    bgHaze += amp * max(0.0, dot(h2, fract(p * freq) - 0.5));
    freq *= 2.1;
    amp *= 0.45;
  }
  bgHaze = clamp(bgHaze, 0.0, 1.0);

  vec3 voidColor = palette(
    bgHaze * 0.5 + t * 0.01 + paletteShift + 0.4,
    vec3(0.02, 0.03, 0.05),
    vec3(0.02, 0.03, 0.04),
    vec3(0.5, 0.6, 0.9),
    vec3(0.0, 0.2, 0.4)
  );
  color += voidColor * bgHaze * 0.15;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.55, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
