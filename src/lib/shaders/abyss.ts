import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite descent — bioluminescent particles in the deep.
// Camera sinking slowly through layers of dark water.
// Caustic light from above dims as you go deeper.

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2d(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Caustic light network — animated voronoi ridges
float caustic(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash2d(i + g), hash2d(i + g + vec2(31.0, 17.0)));
      o = 0.5 + 0.5 * sin(u_time * 0.3 + 6.28 * o);
      float d = length(f - g - o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

// Bioluminescent particle field
float particles(vec2 uv, float depth, float seed) {
  float total = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i) + seed;
    float px = hash(fi * 13.37) * 2.0 - 1.0;
    float py = hash(fi * 7.91) * 2.0 - 1.0;
    float speed = 0.02 + hash(fi * 3.13) * 0.04;
    float phase = hash(fi * 5.71) * 6.28;

    // Gentle drift
    px += sin(u_time * speed + phase) * 0.3;
    py += cos(u_time * speed * 0.7 + phase) * 0.2;
    py -= mod(u_time * speed * 0.5 + hash(fi * 2.0), 2.0) - 1.0; // slow rise

    float d = length(uv - vec2(px, py));
    float size = 0.004 + hash(fi * 11.3) * 0.008;

    // Pulse with audio
    float pulse = 0.7 + 0.3 * sin(u_time * (1.0 + hash(fi * 9.1) * 3.0) + phase);
    pulse *= (0.6 + u_treble * 0.4);

    float glow = size / (d * d + size * 0.5) * pulse;
    total += glow;
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.25;

  // ── Depth simulation — camera sinking ──
  float depth = t * 2.0;
  float depthFade = 1.0 - smoothstep(0.0, 30.0, depth); // light from surface fades

  // ── Caustic light from above ──
  // Two scales of caustics, offset and blended
  float c1 = caustic(uv * 3.0 + vec2(t * 0.5, depth * 0.1));
  float c2 = caustic(uv * 5.0 - vec2(t * 0.3, depth * 0.15) + vec2(50.0));

  // Ridge extraction — bright lines where cells meet
  float ridge1 = smoothstep(0.0, 0.15, c1);
  float ridge2 = smoothstep(0.0, 0.1, c2);
  float causticNet = (1.0 - ridge1) * 0.6 + (1.0 - ridge2) * 0.4;
  causticNet = pow(causticNet, 1.5);

  // Caustics fade with depth, pulse with bass
  float causticStr = causticNet * (0.3 + u_bass * 0.7);

  // Caustic colors — light filtering through water
  vec3 causticCol = palette(
    c1 * 2.0 + paletteShift,
    vec3(0.3, 0.4, 0.5),
    vec3(0.2, 0.3, 0.4),
    vec3(0.4, 0.7, 0.8),
    vec3(0.1, 0.2, 0.4)
  );

  // ── Depth gradient — darkening as we descend ──
  // Vertical gradient simulating light from above
  float verticalLight = smoothstep(-0.8, 0.6, uv.y);
  verticalLight *= verticalLight;

  vec3 deepColor = vec3(0.0, 0.01, 0.03);
  vec3 shallowColor = palette(
    t * 0.05 + paletteShift,
    vec3(0.02, 0.04, 0.08),
    vec3(0.03, 0.05, 0.1),
    vec3(0.3, 0.5, 0.7),
    vec3(0.1, 0.15, 0.3)
  );

  vec3 waterColor = mix(deepColor, shallowColor, verticalLight * 0.5);

  // Add caustic light
  waterColor += causticCol * causticStr * verticalLight * 0.4;

  // ── Bioluminescent particles ──
  // Multiple layers at different depths for parallax
  float p1 = particles(uv, depth, 0.0);
  float p2 = particles(uv * 0.8 + vec2(0.3, -0.2), depth, 100.0);
  float p3 = particles(uv * 1.3 - vec2(0.1, 0.4), depth, 200.0);

  // Particle colors — each layer a different hue
  vec3 particleCol1 = palette(
    p1 * 0.5 + paletteShift + 0.2,
    vec3(0.3, 0.4, 0.5),
    vec3(0.3, 0.4, 0.5),
    vec3(0.2, 0.8, 0.7),
    vec3(0.1, 0.3, 0.5)
  );
  vec3 particleCol2 = palette(
    p2 * 0.5 + paletteShift + 0.5,
    vec3(0.3, 0.3, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.5, 0.3, 0.9),
    vec3(0.2, 0.1, 0.4)
  );
  vec3 particleCol3 = palette(
    p3 * 0.5 + paletteShift + 0.8,
    vec3(0.4, 0.3, 0.3),
    vec3(0.3, 0.3, 0.4),
    vec3(0.8, 0.4, 0.5),
    vec3(0.1, 0.15, 0.3)
  );

  waterColor += particleCol1 * p1 * 0.015;
  waterColor += particleCol2 * p2 * 0.01;
  waterColor += particleCol3 * p3 * 0.008;

  // ── Ambient deep glow — faint light from below suggesting more depth ──
  float abyssGlow = smoothstep(0.3, -0.8, uv.y) * 0.08;
  vec3 abyssCol = palette(
    t * 0.2 + paletteShift + 0.6,
    vec3(0.05, 0.05, 0.1),
    vec3(0.1, 0.08, 0.15),
    vec3(0.5, 0.3, 0.8),
    vec3(0.15, 0.1, 0.3)
  );
  waterColor += abyssCol * abyssGlow * (0.5 + u_mid * 0.5);

  // ── Noise fog layers — depth haze ──
  float fog1 = fbm(uv * 1.5 + vec2(t * 0.2, depth * 0.05)) * 0.5 + 0.5;
  float fog2 = fbm(uv * 0.8 - vec2(t * 0.15, depth * 0.03) + vec2(20.0)) * 0.5 + 0.5;
  float fogMix = fog1 * fog2;
  fogMix = smoothstep(0.2, 0.8, fogMix) * 0.1;

  vec3 fogCol = mix(shallowColor, abyssCol, 0.5);
  waterColor += fogCol * fogMix;

  // Emissive highlights on brightest caustic points
  float hotCaustic = pow(causticStr, 3.0) * verticalLight;
  waterColor += vec3(0.8, 0.9, 1.0) * hotCaustic * 0.5;

  // Vignette — heavier than most, enhancing the claustrophobic depth
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  waterColor *= vignette;

  gl_FragColor = vec4(waterColor, 1.0);
}
`;
