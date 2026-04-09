import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Deep underwater current — dark indigo fluid with flowing ridges
// and bioluminescent specks caught in the flow.

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.2;

  // ── Domain warping — creates the flowing current structure ──
  // Two layers of warp for organic fluid feel
  float warp1x = fbm3(uv * 2.0 + vec2(t * 0.4, t * 0.2));
  float warp1y = fbm3(uv * 2.0 + vec2(t * 0.3, -t * 0.35) + vec2(5.2, 1.3));
  vec2 warped1 = uv + vec2(warp1x, warp1y) * 0.35;

  // Second warp pass — feeds back into itself for swirling motion
  float warp2x = fbm3(warped1 * 1.8 + vec2(-t * 0.25, t * 0.15) + vec2(8.1, 3.7));
  float warp2y = fbm3(warped1 * 1.8 + vec2(t * 0.2, t * 0.3) + vec2(2.9, 7.4));
  vec2 warped2 = warped1 + vec2(warp2x, warp2y) * 0.2;

  // ── Flow field noise — the visible ridges in the current ──
  float flow = fbm3(warped2 * 3.0 + vec2(t * 0.5, 0.0));
  float flowRidge = abs(flow); // ridges where noise crosses zero
  flowRidge = smoothstep(0.0, 0.4, flowRidge); // soften

  // Secondary finer flow pattern
  float flowFine = fbm3(warped2 * 5.0 + vec2(-t * 0.3, t * 0.4) + vec2(13.0, 7.0));
  float fineRidge = smoothstep(0.0, 0.3, abs(flowFine));

  // ── Base water color — deep indigo/navy ──
  vec3 deepBase = palette(
    flow * 0.3 + paletteShift,
    vec3(0.01, 0.015, 0.035),
    vec3(0.01, 0.015, 0.03),
    vec3(0.3, 0.4, 0.7),
    vec3(0.15, 0.2, 0.4)
  );

  // ── Ridge highlights — lighter blue where currents collide ──
  vec3 ridgeColor = palette(
    flowRidge * 0.5 + flow * 0.2 + paletteShift + 0.1,
    vec3(0.03, 0.05, 0.1),
    vec3(0.04, 0.06, 0.12),
    vec3(0.3, 0.5, 0.8),
    vec3(0.1, 0.2, 0.45)
  );

  // Combine base with ridges
  float ridgeIntensity = (1.0 - flowRidge) * 0.7 + (1.0 - fineRidge) * 0.3;
  ridgeIntensity = pow(ridgeIntensity, 2.0);
  vec3 color = deepBase + ridgeColor * ridgeIntensity * 0.2;

  // Bass makes the ridges more prominent
  color += ridgeColor * ridgeIntensity * u_bass * 0.08;

  // ── Depth layers — vertical gradient for sense of looking down ──
  float depthGrad = smoothstep(-0.6, 0.8, uv.y);
  vec3 shallowerTint = palette(
    depthGrad * 0.2 + paletteShift + 0.3,
    vec3(0.02, 0.03, 0.06),
    vec3(0.02, 0.04, 0.08),
    vec3(0.3, 0.5, 0.7),
    vec3(0.1, 0.15, 0.35)
  );
  color = mix(color, shallowerTint, depthGrad * 0.15);

  // ── Bioluminescent specks — caught in the current ──
  float specks = 0.0;
  vec3 speckColorAccum = vec3(0.0);
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float seed = fi * 13.37;

    // Position influenced by flow field
    float sx = fract(sin(seed) * 43758.5) * 2.4 - 1.2;
    float sy = fract(sin(seed + 7.1) * 27183.8) * 2.4 - 1.2;

    // Drift with the current
    float driftT = t * (0.3 + fract(fi * 0.137) * 0.4);
    sx += sin(driftT + fi * 0.7) * 0.4 + warp1x * 0.15;
    sy += cos(driftT * 0.8 + fi * 1.3) * 0.3 + warp1y * 0.15;

    // Wrap positions
    sx = mod(sx + 1.5, 3.0) - 1.5;
    sy = mod(sy + 1.5, 3.0) - 1.5;

    float d = length(uv - vec2(sx, sy));
    float speckSize = 0.003 + fract(fi * 0.37) * 0.005;

    // Pulsing glow
    float pulse = 0.5 + 0.5 * sin(u_time * (1.0 + fract(fi * 0.73) * 2.0) + fi * 3.1);
    float glow = speckSize / (d * d + speckSize * 0.4) * pulse;

    // Treble makes specks brighter
    glow *= (0.4 + u_treble * 0.6);

    // Color per speck — cyan to blue to violet
    float hueT = fract(fi * 0.271);
    vec3 speckColor = palette(
      hueT * 0.4 + paletteShift + 0.5,
      vec3(0.1, 0.2, 0.3),
      vec3(0.15, 0.2, 0.3),
      vec3(0.3, 0.7, 0.9),
      vec3(0.15, 0.25, 0.5)
    );

    speckColorAccum += speckColor * glow;
  }
  color += speckColorAccum * 0.006;

  // ── Mid-frequency current surge — slow undulating brightness ──
  float surge = sin(warped2.x * 4.0 + warped2.y * 2.0 + t * 2.0) * 0.5 + 0.5;
  surge = smoothstep(0.4, 0.8, surge) * u_mid * 0.04;
  color += ridgeColor * surge;

  // ── Subtle caustic-like patterns on the ridges ──
  float causticHint = snoise(warped2 * 8.0 + t * 0.6);
  causticHint = smoothstep(0.3, 0.7, causticHint * 0.5 + 0.5);
  color += vec3(0.01, 0.02, 0.04) * causticHint * ridgeIntensity * 0.5;

  // Vignette — deep and immersive
  float vd = length(uv * vec2(0.9, 0.85));
  float vignette = 1.0 - smoothstep(0.3, 1.3, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
