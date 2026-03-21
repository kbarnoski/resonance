import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Rain — falling rain streaks across a moody dark sky.
// Multiple depth layers create parallax: foreground fast/soft, background slow/sharp.
// Occasional bright drops catch light. Background shifts between deep blue and charcoal.

// Hash for deterministic rain placement
float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Single rain layer — returns brightness of rain at this position
float rainLayer(vec2 uv, float scale, float speed, float angle, float t, float density) {
  // Tilt the rain slightly
  float sa = sin(angle), ca = cos(angle);
  vec2 tilted = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);

  // Scale to create grid cells
  vec2 p = tilted * scale;

  // Scroll downward
  p.y += t * speed;

  // Cell coordinates
  vec2 id = floor(p);
  vec2 f = fract(p);

  float rain = 0.0;

  // Check this cell and neighbors for rain drops
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 neighbor = vec2(float(dx), float(dy));
      vec2 cellId = id + neighbor;

      // Deterministic: does this cell have a raindrop?
      float h = hash1(dot(cellId, vec2(127.1, 311.7)));
      if (h > density) continue;

      // Position jitter within cell
      float jx = hash1(h * 7.3 + cellId.x * 13.0) * 0.7 + 0.15;
      float jy = 0.0; // rain falls through full cell height

      vec2 dropPos = neighbor + vec2(jx, jy) - f;

      // Streak shape — very narrow horizontally, elongated vertically
      float streakLen = 0.15 + h * 0.25;
      float streakWidth = 0.008 + h * 0.012;

      // Distance to vertical line segment
      float dy2 = dropPos.y;
      float clampedY = clamp(dy2, -streakLen, 0.0);
      float dx2 = dropPos.x;
      float d = length(vec2(dx2, dy2 - clampedY));

      float brightness = smoothstep(streakWidth * 2.0, 0.0, d);

      // Fade at top of streak (trail effect)
      float trailFade = smoothstep(-streakLen, 0.0, dy2);
      brightness *= trailFade;

      // Occasional bright catch-light drops
      float isBright = step(0.92, hash1(cellId.x * 37.1 + cellId.y * 59.3 + floor(t * 0.5)));
      brightness *= 1.0 + isBright * 2.5;

      rain += brightness;
    }
  }

  return rain;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.35;
  float paletteShift = u_amplitude * 0.08;

  // ── Moody background — shifts between deep blue and charcoal ──
  float bgShift = snoise(uv * 0.8 + vec2(t * 0.02, t * 0.01)) * 0.5 + 0.5;
  float bgNoise = fbm(uv * 1.5 + vec2(t * 0.03, -t * 0.02)) * 0.5 + 0.5;

  vec3 deepBlue = palette(
    bgShift * 0.3 + paletteShift,
    vec3(0.03, 0.04, 0.10),
    vec3(0.03, 0.04, 0.08),
    vec3(0.3, 0.4, 0.7),
    vec3(0.10, 0.12, 0.25)
  );

  vec3 charcoal = palette(
    bgNoise * 0.2 + paletteShift + 0.5,
    vec3(0.05, 0.05, 0.06),
    vec3(0.03, 0.03, 0.04),
    vec3(0.2, 0.2, 0.3),
    vec3(0.0, 0.0, 0.10)
  );

  vec3 bgColor = mix(deepBlue, charcoal, bgShift * 0.6 + bgNoise * 0.4);

  // Subtle cloud-like variation in the background
  float clouds = fbm(uv * 2.0 + vec2(t * 0.04, 0.0)) * 0.5 + 0.5;
  bgColor += vec3(0.02, 0.025, 0.04) * clouds;

  // ── Rain layers — far to near ──
  // Layer 4 (farthest): small, slow, sharp, dim
  float rain4 = rainLayer(uv, 45.0, 3.0, 0.04, t, 0.15);
  // Layer 3: medium distance
  float rain3 = rainLayer(uv, 30.0, 5.5, 0.06, t, 0.12);
  // Layer 2: closer
  float rain2 = rainLayer(uv, 18.0, 9.0, 0.08, t, 0.10);
  // Layer 1 (nearest): large, fast, slightly softer, brightest
  float rain1 = rainLayer(uv, 10.0, 14.0, 0.10, t, 0.08);

  // ── Rain colors — pale blue-white, brighter for nearer layers ──
  vec3 rainColorFar = palette(
    rain4 * 0.3 + paletteShift + 0.2,
    vec3(0.30, 0.35, 0.45),
    vec3(0.10, 0.12, 0.18),
    vec3(0.4, 0.5, 0.7),
    vec3(0.05, 0.08, 0.15)
  );

  vec3 rainColorMid = palette(
    rain3 * 0.4 + paletteShift + 0.3,
    vec3(0.40, 0.45, 0.55),
    vec3(0.12, 0.14, 0.20),
    vec3(0.5, 0.6, 0.8),
    vec3(0.0, 0.05, 0.12)
  );

  vec3 rainColorNear = palette(
    rain2 * 0.5 + paletteShift + 0.4,
    vec3(0.55, 0.60, 0.70),
    vec3(0.15, 0.16, 0.22),
    vec3(0.5, 0.6, 0.8),
    vec3(0.0, 0.03, 0.10)
  );

  vec3 rainColorClose = vec3(0.65, 0.72, 0.82);

  // ── Composite ──
  vec3 color = bgColor;

  // Add rain layers from far to near
  color += rainColorFar * rain4 * 0.15;
  color += rainColorMid * rain3 * 0.25;
  color += rainColorNear * rain2 * 0.40;
  color += rainColorClose * rain1 * 0.55;

  // Nearest layer gets slight softness / bloom
  color += rainColorClose * pow(rain1, 0.5) * 0.08;

  // ── Ambient mist at the bottom — pooling rain atmosphere ──
  float mist = smoothstep(0.2, -0.5, uv.y) * 0.15;
  float mistNoise = fbm(vec2(uv.x * 3.0 + t * 0.1, uv.y * 2.0)) * 0.5 + 0.5;
  color += vec3(0.08, 0.10, 0.15) * mist * mistNoise;

  // Very subtle bass influence — darkens the atmosphere slightly
  color *= 1.0 - u_bass * 0.04;

  // Vignette — moody, slightly stronger than usual
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
