import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Deep space star field — varying star sizes and colors with parallax drift.
// Blue-white hot stars, yellow sun-like, red giants. Nebula wisps of color.
// Very slow parallax movement suggesting drift through space.

// Pseudo-random hash for star placement
float starHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 starHash2(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

// Single star layer with configurable density and drift speed
float starLayer(vec2 uv, float scale, float seed, float threshold, out vec3 starColor) {
  vec2 suv = uv * scale;
  vec2 id = floor(suv);
  vec2 f = fract(suv) - 0.5;

  float brightness = 0.0;
  starColor = vec3(0.0);

  // Check 3x3 neighborhood for stars
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = id + neighbor;
      vec2 h = starHash2(cellId + seed);

      // Only some cells have stars
      float presence = starHash(cellId * 7.3 + seed);
      if (presence < threshold) continue;

      // Star position within cell (slight jitter)
      vec2 starPos = neighbor + h - 0.5 - f;
      float d = length(starPos);

      // Star properties from hash
      float sizeSeed = starHash(cellId * 3.1 + seed + 100.0);
      float colorSeed = starHash(cellId * 5.7 + seed + 200.0);
      float twinkleSeed = starHash(cellId * 11.3 + seed + 300.0);

      // Star size — most are tiny, few are large
      float starSize = 0.02 + pow(sizeSeed, 4.0) * 0.12;

      // Twinkle — slow variation in brightness
      float twinkle = 0.7 + 0.3 * sin(u_time * (0.5 + twinkleSeed * 2.0) + twinkleSeed * 100.0);
      twinkle *= 0.8 + 0.2 * sin(u_time * (1.5 + twinkleSeed * 3.0) + twinkleSeed * 50.0);
      // Treble makes twinkle more pronounced
      twinkle = mix(twinkle, twinkle * (0.5 + sin(u_time * 4.0 + twinkleSeed * 20.0) * 0.5), u_treble * 0.4);

      // Star shape — core + soft glow + subtle cross spikes
      float core = exp(-d * d / (starSize * starSize * 0.08));
      float glow = exp(-d * d / (starSize * starSize * 0.8)) * 0.4;

      // Four-pointed spike (very subtle, only on larger stars)
      float spikes = 0.0;
      if (sizeSeed > 0.7) {
        vec2 sp = abs(starPos);
        float spike1 = exp(-sp.x * 80.0 / starSize) * exp(-sp.y * 300.0 / starSize);
        float spike2 = exp(-sp.y * 80.0 / starSize) * exp(-sp.x * 300.0 / starSize);
        spikes = (spike1 + spike2) * 0.3;
      }

      float star = (core + glow + spikes) * twinkle;

      // Star color based on spectral class
      vec3 sCol;
      if (colorSeed < 0.15) {
        // Red giant — warm red-orange
        sCol = vec3(1.0, 0.6, 0.3);
      } else if (colorSeed < 0.35) {
        // Yellow sun-like — warm yellow-white
        sCol = vec3(1.0, 0.95, 0.8);
      } else if (colorSeed < 0.6) {
        // White — pure white
        sCol = vec3(1.0, 1.0, 1.0);
      } else {
        // Blue-white hot — cool blue tint
        sCol = vec3(0.8, 0.9, 1.2);
      }

      brightness += star;
      starColor += sCol * star;
    }
  }

  return brightness;
}

// Nebula wisps — very faint, large-scale colored gas
vec3 nebulaWisp(vec2 uv, float t) {
  // Multiple octaves of warped noise at large scale
  vec2 p = uv * 0.4;
  float warp1 = fbm(p + vec2(t * 0.005, 0.0));
  float warp2 = fbm(p + vec2(3.7, t * 0.004));
  vec2 warped = p + vec2(warp1, warp2) * 0.6;

  float density = fbm(warped) * 0.5 + 0.5;
  density = smoothstep(0.3, 0.8, density);

  // Nebula color — shifts slowly across the palette
  vec3 nebCol1 = palette(
    density * 0.5 + t * 0.01 + u_amplitude * 0.2,
    vec3(0.15, 0.05, 0.2),
    vec3(0.15, 0.1, 0.2),
    vec3(0.6, 0.3, 0.8),
    vec3(0.1, 0.05, 0.3)
  );

  vec3 nebCol2 = palette(
    density * 0.5 + t * 0.01 + 0.5 + u_amplitude * 0.2,
    vec3(0.05, 0.1, 0.2),
    vec3(0.1, 0.15, 0.2),
    vec3(0.3, 0.6, 0.9),
    vec3(0.05, 0.1, 0.3)
  );

  // Mix two nebula color zones based on position
  float zoneMix = fbm(uv * 0.3 + vec2(50.0)) * 0.5 + 0.5;
  vec3 nebCol = mix(nebCol1, nebCol2, zoneMix);

  return nebCol * density * 0.08;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // ── Parallax drift — very slow movement through space ──
  vec2 drift = vec2(t * 0.02, t * 0.01);
  // Slight camera sway
  drift += vec2(sin(t * 0.15) * 0.02, cos(t * 0.12) * 0.015);

  // ── Deep space background — not pure black, subtle deep blue ──
  vec3 color = vec3(0.005, 0.005, 0.015);

  // Very faint large-scale background glow
  float bgGlow = fbm(uv * 0.3 + drift * 0.1) * 0.5 + 0.5;
  color += vec3(0.01, 0.008, 0.02) * bgGlow;

  // ── Nebula wisps ──
  vec3 nebula = nebulaWisp(uv + drift * 0.5, t);
  // Bass makes nebula glow slightly brighter
  color += nebula * (0.7 + u_bass * 0.5);

  // Second nebula layer at different scale for depth
  vec3 nebula2 = nebulaWisp(uv * 1.5 + drift * 0.3 + vec2(20.0, 15.0), t * 0.7);
  color += nebula2 * 0.5 * (0.7 + u_mid * 0.5);

  // ── Star layers — three depths for parallax ──

  // Far stars — small, dense, slow parallax
  vec3 farStarCol;
  float farStars = starLayer(uv + drift * 0.3, 80.0, 0.0, 0.55, farStarCol);
  color += farStarCol * 0.5;

  // Mid stars — medium, moderate parallax
  vec3 midStarCol;
  float midStars = starLayer(uv + drift * 0.6, 40.0, 50.0, 0.65, midStarCol);
  color += midStarCol * 0.7;

  // Near stars — larger, fewer, fastest parallax
  vec3 nearStarCol;
  float nearStars = starLayer(uv + drift * 1.0, 20.0, 100.0, 0.8, nearStarCol);
  color += nearStarCol * 1.0;

  // ── Bright foreground feature stars — just a few prominent ones ──
  vec3 brightStarCol;
  float brightStars = starLayer(uv + drift * 1.2, 8.0, 150.0, 0.92, brightStarCol);
  color += brightStarCol * 1.5;

  // ── Cosmic dust lane — dark band of obscuring dust ──
  float dustLane = fbm((uv + drift * 0.2) * vec2(0.5, 2.0) + vec2(0.0, t * 0.005));
  dustLane = smoothstep(0.0, 0.3, dustLane * 0.5 + 0.5);
  // Dust slightly dims stars behind it
  float dustDim = 1.0 - (1.0 - dustLane) * 0.15;
  color *= dustDim;

  // ── Audio reactivity — amplitude creates subtle overall glow ──
  float ampGlow = u_amplitude * 0.03;
  color += vec3(0.02, 0.015, 0.03) * ampGlow;

  // Bass adds subtle pulsing to the brightest stars
  color += nearStarCol * u_bass * 0.15;

  // ── Gentle vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= 0.85 + 0.15 * vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
