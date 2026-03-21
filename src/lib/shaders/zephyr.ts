import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Zephyr — swirling wind patterns tracing visible currents.
// Stronger than breeze: twisting spirals and flowing filaments.
// Like watching autumn leaves trace wind patterns.
// Warm earth tones (amber, sienna, sage) against a twilight sky gradient.

// Curl noise — takes the perpendicular gradient of noise for swirling flow
vec2 curlNoise(vec2 p, float t) {
  float eps = 0.01;
  float n = fbm(p + vec2(t * 0.1, 0.0));
  float nx = fbm(p + vec2(eps, 0.0) + vec2(t * 0.1, 0.0));
  float ny = fbm(p + vec2(0.0, eps) + vec2(t * 0.1, 0.0));
  // Curl: perpendicular to gradient
  return vec2(-(ny - n) / eps, (nx - n) / eps) * 0.3;
}

// Swirl field — advects a point through curl noise for visible flow lines
float swirlField(vec2 uv, float t, float scale, float speed) {
  vec2 p = uv * scale;

  // Advect through curl noise in several steps
  for (int i = 0; i < 4; i++) {
    vec2 curl = curlNoise(p * 0.5, t * speed);
    p += curl * 0.4;
  }

  // The noise at the advected position creates visible flow lines
  float n = fbm(p * 0.8 + vec2(t * speed * 0.5, 0.0));
  return n;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.10;

  // ── Twilight sky gradient — warm at bottom, cool at top ──
  float skyGrad = uv.y * 0.5 + 0.5; // 0 at bottom, 1 at top

  vec3 skyWarm = palette(
    skyGrad * 0.3 + paletteShift,
    vec3(0.12, 0.06, 0.04),
    vec3(0.10, 0.06, 0.03),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.08, 0.15)
  );

  vec3 skyCool = palette(
    skyGrad * 0.4 + paletteShift + 0.5,
    vec3(0.04, 0.05, 0.10),
    vec3(0.03, 0.04, 0.08),
    vec3(0.3, 0.4, 0.6),
    vec3(0.08, 0.10, 0.22)
  );

  vec3 skyColor = mix(skyWarm, skyCool, smoothstep(0.0, 1.0, skyGrad));

  // ── Wind layer 1: Large dominant spirals ──
  float swirl1 = swirlField(uv, t, 2.0, 1.0);
  // Create visible filament lines from the noise
  float filament1 = smoothstep(0.0, 0.4, swirl1) * smoothstep(0.8, 0.4, swirl1);
  filament1 = pow(filament1, 0.7) * 0.8;

  // ── Wind layer 2: Medium counter-rotating spirals ──
  vec2 uv2 = uv * rot2(0.4) + vec2(5.0, 3.0);
  float swirl2 = swirlField(uv2, t * 1.3, 3.0, 0.8);
  float filament2 = smoothstep(0.05, 0.35, swirl2) * smoothstep(0.75, 0.35, swirl2);
  filament2 = pow(filament2, 0.8) * 0.6;

  // ── Wind layer 3: Fine fast detail ──
  vec2 uv3 = uv * rot2(-0.25) + vec2(12.0, 8.0);
  float swirl3 = swirlField(uv3, t * 1.8, 4.5, 1.2);
  float filament3 = smoothstep(0.1, 0.3, swirl3) * smoothstep(0.7, 0.3, swirl3);
  filament3 = pow(filament3, 0.9) * 0.4;

  // ── Leaf-trace particles — tiny bright dots following the wind ──
  float particles = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 particleUV = uv * (8.0 + fi * 4.0);
    // Advect particle position along curl noise
    vec2 curl = curlNoise(particleUV * 0.15, t * (0.8 + fi * 0.2));
    particleUV += curl * 3.0 + vec2(t * (1.0 + fi * 0.5), fi * 7.3);

    float grain = snoise(particleUV);
    grain = pow(max(grain, 0.0), 6.0) * (0.4 - fi * 0.04);
    particles += grain;
  }

  // ── Colors for wind layers ──
  // Amber wind — dominant swirl
  vec3 amberWind = palette(
    swirl1 * 0.5 + filament1 * 0.3 + paletteShift + 0.1,
    vec3(0.25, 0.14, 0.06),
    vec3(0.20, 0.12, 0.05),
    vec3(0.9, 0.6, 0.3),
    vec3(0.0, 0.08, 0.15)
  );

  // Sienna wind — secondary swirl
  vec3 siennaWind = palette(
    swirl2 * 0.4 + filament2 * 0.3 + paletteShift + 0.25,
    vec3(0.20, 0.10, 0.05),
    vec3(0.15, 0.08, 0.04),
    vec3(0.7, 0.4, 0.2),
    vec3(0.02, 0.10, 0.18)
  );

  // Sage wind — fine detail
  vec3 sageWind = palette(
    swirl3 * 0.3 + paletteShift + 0.45,
    vec3(0.10, 0.12, 0.08),
    vec3(0.08, 0.10, 0.06),
    vec3(0.5, 0.6, 0.4),
    vec3(0.05, 0.12, 0.10)
  );

  // Leaf particle color — warm golden
  vec3 leafColor = vec3(0.50, 0.35, 0.15);

  // ── Composite ──
  vec3 color = skyColor;

  // Apply wind layers with translucent blending
  color = mix(color, amberWind, filament1 * 0.55);
  color = mix(color, siennaWind, filament2 * 0.40);
  color = mix(color, sageWind, filament3 * 0.30);

  // Add leaf particles
  color += leafColor * particles;

  // ── Atmospheric depth — wind creates slight brightening ──
  float totalWind = filament1 + filament2 + filament3;
  color += vec3(0.04, 0.025, 0.01) * totalWind;

  // Horizon glow — warm light where earth meets sky
  float horizonGlow = exp(-pow(uv.y + 0.1, 2.0) * 8.0) * 0.15;
  color += vec3(0.25, 0.15, 0.06) * horizonGlow;

  // Very subtle audio — bass barely intensifies the warm tones
  color *= 1.0 + u_bass * 0.05;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
