import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Ripple — concentric water ripples expanding from multiple points.
// Rings of light expand outward with gentle interference patterns.
// Colors: silver, pale blue, deep navy background. Zen and hypnotic.

// Single ripple ring from a point — returns brightness
float rippleRing(vec2 uv, vec2 center, float birthTime, float t, float lifespan) {
  float age = t - birthTime;
  if (age < 0.0 || age > lifespan) return 0.0;

  float dist = length(uv - center);

  // Ring expands outward
  float radius = age * 0.35;
  float ringWidth = 0.015 + age * 0.008; // rings widen as they age

  // Distance to the ring edge
  float ringDist = abs(dist - radius);
  float ring = smoothstep(ringWidth, 0.0, ringDist);

  // Fade out over lifetime
  float fade = 1.0 - age / lifespan;
  fade = fade * fade; // quadratic fade — lingers then vanishes

  // Multiple concentric echoes from the same drop
  float echo1 = smoothstep(ringWidth * 1.5, 0.0, abs(dist - radius * 0.65));
  float echo2 = smoothstep(ringWidth * 2.0, 0.0, abs(dist - radius * 0.35));

  return (ring + echo1 * 0.4 + echo2 * 0.15) * fade;
}

// Deterministic hash for ripple center positions
float rHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.18;
  float paletteShift = u_amplitude * 0.10;

  // ── Deep navy background with subtle noise texture ──
  float bgNoise = fbm(uv * 2.0 + vec2(t * 0.02)) * 0.5 + 0.5;
  vec3 bgColor = palette(
    bgNoise * 0.15 + paletteShift,
    vec3(0.01, 0.02, 0.06),
    vec3(0.02, 0.03, 0.06),
    vec3(0.2, 0.3, 0.5),
    vec3(0.08, 0.10, 0.20)
  );

  // Very slow background undulation — like deep still water
  float deepWater = snoise(uv * 1.5 + vec2(t * 0.05, t * 0.03)) * 0.3;
  bgColor += vec3(0.005, 0.008, 0.02) * (deepWater + 0.5);

  // ── Generate ripple sources ──
  // 8 ripple points, each with staggered birth times on a cycle
  float totalRipple = 0.0;
  float rippleHue = 0.0;

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float cycle = 6.0 + fi * 1.3; // each ripple repeats on its own cycle
    float birthTime = floor(t / cycle) * cycle;

    // Center position — slowly drifts between cycles
    float seed = floor(t / cycle) + fi * 17.3;
    vec2 center = vec2(
      rHash(seed) * 1.4 - 0.7,
      rHash(seed + 31.7) * 1.4 - 0.7
    );

    float lifespan = 5.0 + fi * 0.5;
    float r = rippleRing(uv, center, birthTime, t, lifespan);
    totalRipple += r;

    // Accumulate hue info for coloring
    rippleHue += r * (fi * 0.12 + 0.1);
  }

  // ── Secondary set of smaller, quieter ripples for texture ──
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float cycle = 8.0 + fi * 2.0;
    float birthTime = floor((t + 3.0) / cycle) * cycle - 3.0;
    float seed = floor((t + 3.0) / cycle) + fi * 43.7;
    vec2 center = vec2(
      rHash(seed + 100.0) * 1.2 - 0.6,
      rHash(seed + 137.0) * 1.2 - 0.6
    );
    float r = rippleRing(uv, center, birthTime, t, 7.0) * 0.35;
    totalRipple += r;
    rippleHue += r * (fi * 0.08 + 0.5);
  }

  // Clamp total ripple to avoid blowout
  totalRipple = min(totalRipple, 2.0);

  // ── Interference pattern — where ripples overlap, create moiré-like shimmer ──
  float interference = pow(totalRipple, 1.5) * 0.3;
  float interferenceShimmer = sin(totalRipple * 12.0 + t * 0.5) * 0.5 + 0.5;
  interference *= interferenceShimmer;

  // ── Colors ──
  // Silver ripple light
  vec3 silverColor = palette(
    totalRipple * 0.4 + rippleHue * 0.1 + paletteShift + 0.1,
    vec3(0.55, 0.58, 0.65),
    vec3(0.20, 0.22, 0.28),
    vec3(0.4, 0.5, 0.7),
    vec3(0.0, 0.05, 0.12)
  );

  // Pale blue for the stronger ring edges
  vec3 paleBlue = palette(
    totalRipple * 0.3 + paletteShift + 0.35,
    vec3(0.40, 0.50, 0.65),
    vec3(0.18, 0.22, 0.30),
    vec3(0.5, 0.6, 0.9),
    vec3(0.05, 0.10, 0.22)
  );

  // Interference highlight — brighter silver-white
  vec3 interColor = vec3(0.70, 0.75, 0.85);

  // ── Composite ──
  vec3 color = bgColor;

  // Ripple light
  color += silverColor * totalRipple * 0.35;
  color = mix(color, paleBlue, smoothstep(0.3, 1.2, totalRipple) * 0.4);

  // Interference bright spots
  color += interColor * interference * 0.25;

  // Faint outer glow around the ripple edges
  float glow = pow(max(totalRipple, 0.0), 0.5) * 0.08;
  color += vec3(0.15, 0.20, 0.35) * glow;

  // Very subtle audio — amplitude barely shifts the palette warmth
  color *= 1.0 + u_amplitude * 0.05;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
