import { U, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  `
// Drift — multi-layer parallax star fields at independent speeds.
// 4 depth layers create an unmistakable sense of infinite travel.
// The fastest nearby layer blurs at high amplitude (motion blur).
// Pure hash-based — no noise functions needed, extremely efficient.

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Generate one depth layer of stars
// scale: cell density (higher = more, smaller stars)
// drift: accumulated travel offset
// starChance: 0-1, probability a cell has a star
// Returns vec2(brightness, hue)
vec2 starLayer(vec2 uv, float scale, vec2 drift, float starChance, float t) {
  vec2 p = uv * scale + drift;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;

  float h = hash2(id);
  if (h > starChance) return vec2(0.0);

  // Star position jitter within cell
  vec2 jitter = vec2(hash(h * 7.1), hash(h * 13.3)) - 0.5;
  jitter *= 0.6;
  vec2 df = f - jitter;

  float size = (0.03 + hash(h * 3.7) * 0.07) / scale * 8.0;

  float d = length(df);
  float brightness = smoothstep(size, 0.0, d);
  // Soft glow corona
  brightness += smoothstep(size * 4.0, 0.0, d) * 0.1;

  // Twinkle
  float freq = 0.5 + hash(h * 9.1) * 4.0;
  float twinkle = 0.65 + 0.35 * sin(t * freq + h * 100.0);
  twinkle = mix(twinkle, 1.0, 1.0 - u_treble * 0.7);

  return vec2(brightness * twinkle, h);
}

// Shooting star — a streak across the field
float shootingStar(vec2 uv, float t) {
  // One shooting star every ~8 seconds
  float cycle = mod(t * 0.15, 1.0);
  float active = step(0.85, cycle); // only last 15% of cycle

  float localT = (cycle - 0.85) / 0.15;

  // Random direction seeded by floor of cycle
  float seed = floor(t * 0.15);
  float angle = hash(seed) * 6.28318;
  vec2 dir = vec2(cos(angle), sin(angle));

  // Start and end points
  vec2 start = vec2(hash(seed * 7.1), hash(seed * 13.3)) * 2.0 - 1.0;
  start *= 0.8;
  vec2 end = start + dir * 0.5;

  // Current position along trail
  vec2 pos = mix(start, end, localT);

  // Distance to line segment
  vec2 pa = uv - start;
  vec2 ba = end - start;
  float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, localT);
  float d = length(pa - ba * hh);

  float streak = smoothstep(0.004, 0.0, d) * (1.0 - localT); // fades as it travels
  streak *= active;

  return streak;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.28;

  // ── Travel direction — slight curve over time ──
  float travelAngle = sin(t * 0.08) * 0.3;
  vec2 travelDir = vec2(sin(travelAngle), cos(travelAngle));

  // ── Per-layer parallax drift speeds ──
  // Layer 0: nearest — 4x travel speed, motion blur at high amplitude
  vec2 drift0 = travelDir * t * 3.2;
  // Layer 1: near — 2x
  vec2 drift1 = travelDir * t * 1.6 + vec2(7.3, 2.1);
  // Layer 2: mid — 1x
  vec2 drift2 = travelDir * t * 0.8 + vec2(30.0, 15.0);
  // Layer 3: far — 0.3x, almost stationary (near infinity)
  vec2 drift3 = travelDir * t * 0.25 + vec2(63.0, 41.0);

  // Bass creates warp surge — everything rushes toward center
  float warpSurge = u_bass * 0.15;
  drift0 += uv * warpSurge * 4.0;
  drift1 += uv * warpSurge * 2.0;
  drift2 += uv * warpSurge * 0.8;

  // ── 4 star layers ──
  vec2 s0 = starLayer(uv, 3.5,  drift0, 0.07, t); // nearest: sparse large
  vec2 s1 = starLayer(uv, 7.0,  drift1, 0.10, t); // near
  vec2 s2 = starLayer(uv, 14.0, drift2, 0.12, t); // mid
  vec2 s3 = starLayer(uv, 28.0, drift3, 0.14, t); // far: dense tiny

  // ── Motion blur on nearest layer at high amplitude ──
  // Sample layer 0 in travel direction with offset
  float blur = u_amplitude * 0.5;
  if (blur > 0.05) {
    vec2 blurOffset = travelDir * blur * 0.06;
    vec2 sb1 = starLayer(uv + blurOffset, 3.5, drift0, 0.07, t);
    vec2 sb2 = starLayer(uv + blurOffset * 2.0, 3.5, drift0, 0.07, t);
    s0.x = max(s0.x, sb1.x * 0.6);
    s0.x = max(s0.x, sb2.x * 0.3);
  }

  // ── Shooting stars ──
  float shoot = shootingStar(uv, t);

  // ── Colors ──
  // Layer 0 — warmest, biggest, nearest: yellow-white main sequence
  vec3 col0 = palette(
    s0.y * 0.8 + paletteShift,
    vec3(0.55, 0.5, 0.4),
    vec3(0.45, 0.4, 0.3),
    vec3(0.7, 0.5, 0.2),
    vec3(0.0, 0.03, 0.07)
  );

  // Layer 1 — blue-white: hot A-type stars
  vec3 col1 = palette(
    s1.y * 0.9 + paletteShift + 0.18,
    vec3(0.5, 0.52, 0.55),
    vec3(0.4, 0.42, 0.5),
    vec3(0.4, 0.6, 1.0),
    vec3(0.08, 0.12, 0.3)
  );

  // Layer 2 — cool blue-violet: distant field
  vec3 col2 = palette(
    s2.y * 1.0 + paletteShift + 0.38,
    vec3(0.42, 0.42, 0.52),
    vec3(0.3, 0.3, 0.5),
    vec3(0.35, 0.3, 0.85),
    vec3(0.1, 0.08, 0.3)
  );

  // Layer 3 — faintest, red-shifted: cosmological distance
  vec3 col3 = palette(
    s3.y * 1.1 + paletteShift + 0.6,
    vec3(0.35, 0.32, 0.4),
    vec3(0.2, 0.18, 0.3),
    vec3(0.5, 0.25, 0.6),
    vec3(0.08, 0.05, 0.18)
  );

  // ── Background — absolute black void ──
  vec3 color = vec3(0.002, 0.002, 0.005);

  // Faint inter-layer glow — zodiacal light analog
  float zodiacal = exp(-pow(uv.y * 5.0, 2.0)) * 0.012;
  vec3 zodCol = palette(
    t * 0.01 + paletteShift + 0.5,
    vec3(0.1, 0.12, 0.15),
    vec3(0.05, 0.06, 0.1),
    vec3(0.3, 0.4, 0.7),
    vec3(0.1, 0.12, 0.25)
  );
  color += zodCol * zodiacal * (0.5 + u_mid * 0.5);

  // Composite — far first
  color += col3 * s3.x * 0.45 * (0.6 + u_treble * 0.4);
  color += col2 * s2.x * 0.65 * (0.7 + u_treble * 0.3);
  color += col1 * s1.x * 0.9;
  color += col0 * s0.x * 1.4;

  // Nearest star bloom pulse on bass
  color += col0 * pow(s0.x, 2.0) * (0.5 + u_bass * 1.5);

  // Shooting star — brilliant white trail
  vec3 shootCol = palette(
    t * 0.3 + paletteShift + 0.85,
    vec3(0.9, 0.9, 0.95),
    vec3(0.1, 0.08, 0.15),
    vec3(0.3, 0.2, 0.5),
    vec3(0.0, 0.02, 0.05)
  );
  color += shootCol * shoot * 2.5;

  // Vignette — gentle, not crushing
  float vignette = 1.0 - smoothstep(0.6, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
