import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Breeze — gentle flowing air currents made visible.
// Translucent wisps of warm-cool air drift and curl across the screen.
// Like watching heat shimmer or incense smoke. Extremely smooth and calming.
// Soft amber and cool blue tones interweave.

// Domain-warped fbm for organic wisp shapes
float wispNoise(vec2 p, float t) {
  // Double domain warp for ultra-organic motion
  vec2 q = vec2(
    fbm(p + vec2(t * 0.12, t * 0.08)),
    fbm(p + vec2(t * 0.09, -t * 0.06) + vec2(5.2, 1.3))
  );
  vec2 r = vec2(
    fbm(p + q * 1.8 + vec2(t * 0.05, 0.0) + vec2(1.7, 9.2)),
    fbm(p + q * 1.5 + vec2(0.0, t * 0.07) + vec2(8.3, 2.8))
  );
  return fbm(p + r * 2.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.08;

  // ── Gentle horizontal drift — the base current ──
  vec2 driftUV = uv + vec2(t * 0.3, 0.0);

  // ── Wisp layer 1: Large, slow, warm-toned ──
  float wisp1 = wispNoise(driftUV * 0.8, t);
  // Soft threshold for translucent wisp shape
  float wisp1Shape = smoothstep(-0.2, 0.5, wisp1) * smoothstep(0.9, 0.3, wisp1);

  // ── Wisp layer 2: Medium, slightly faster, cool-toned ──
  vec2 uv2 = uv * rot2(0.15) + vec2(t * 0.4, t * 0.05) + vec2(10.0, 7.0);
  float wisp2 = wispNoise(uv2 * 1.1, t * 1.2);
  float wisp2Shape = smoothstep(-0.15, 0.45, wisp2) * smoothstep(0.85, 0.25, wisp2);

  // ── Wisp layer 3: Fine, fastest, mixing both tones ──
  vec2 uv3 = uv * rot2(-0.1) + vec2(t * 0.55, -t * 0.08) + vec2(20.0, 15.0);
  float wisp3 = wispNoise(uv3 * 1.6, t * 1.5);
  float wisp3Shape = smoothstep(-0.1, 0.4, wisp3) * smoothstep(0.8, 0.2, wisp3);

  // ── Wisp layer 4: Very subtle background curl ──
  vec2 uv4 = uv + vec2(t * 0.15, t * 0.1);
  float wisp4 = wispNoise(uv4 * 0.5, t * 0.6);
  float wisp4Shape = smoothstep(-0.3, 0.3, wisp4) * 0.4;

  // ── Temperature mapping: warm and cool zones ──
  // Warm regions (amber) and cool regions (blue) drift independently
  float warmZone = fbm(uv * 1.2 + vec2(t * 0.1, t * 0.05)) * 0.5 + 0.5;
  float coolZone = 1.0 - warmZone;

  // ── Colors ──
  // Warm amber palette
  vec3 warmColor = palette(
    wisp1 * 0.4 + warmZone * 0.3 + paletteShift,
    vec3(0.18, 0.10, 0.06),
    vec3(0.15, 0.10, 0.05),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.10, 0.18)
  );

  // Cool blue palette
  vec3 coolColor = palette(
    wisp2 * 0.4 + coolZone * 0.3 + paletteShift + 0.4,
    vec3(0.08, 0.10, 0.18),
    vec3(0.06, 0.08, 0.15),
    vec3(0.4, 0.6, 0.9),
    vec3(0.10, 0.15, 0.28)
  );

  // Blended middle tone — where warm meets cool
  vec3 blendColor = palette(
    (wisp3 + wisp1) * 0.25 + paletteShift + 0.2,
    vec3(0.12, 0.10, 0.12),
    vec3(0.10, 0.08, 0.10),
    vec3(0.6, 0.5, 0.6),
    vec3(0.05, 0.10, 0.20)
  );

  // Background — very dark neutral with a hint of depth
  vec3 bgColor = palette(
    wisp4 * 0.2 + paletteShift + 0.6,
    vec3(0.03, 0.03, 0.05),
    vec3(0.02, 0.02, 0.04),
    vec3(0.3, 0.3, 0.5),
    vec3(0.05, 0.05, 0.12)
  );

  // ── Composite ──
  vec3 color = bgColor;

  // Background curl layer
  color += blendColor * wisp4Shape * 0.25;

  // Main warm wisps
  color = mix(color, warmColor, wisp1Shape * warmZone * 0.5);

  // Cool wisps
  color = mix(color, coolColor, wisp2Shape * coolZone * 0.45);

  // Fine detail wisps — blend of both
  vec3 fineColor = mix(warmColor, coolColor, coolZone);
  color = mix(color, fineColor, wisp3Shape * 0.3);

  // Subtle incandescent edge glow where wisps are strongest
  float edgeGlow = pow(max(wisp1Shape * 0.5 + wisp2Shape * 0.3, 0.0), 2.0);
  color += vec3(0.15, 0.12, 0.10) * edgeGlow * 0.2;

  // Extremely subtle audio: amplitude gently warms the overall tone
  color *= 1.0 + u_amplitude * 0.04;

  // Vignette — very soft
  float vignette = 1.0 - smoothstep(0.6, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
