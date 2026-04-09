import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Thick smoke columns rising — lit from within by hidden fire below.
// Domain-warped fbm3 smoke, warm underlighting fading to cool at top.

// Light 3-octave fbm
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Domain-warped smoke — double warp for turbulent billowing
float smokeField(vec2 p, float t) {
  // First warp layer
  float wx = fbm3(p + vec2(t * 0.3, -t * 0.5));
  float wy = fbm3(p + vec2(-t * 0.2, t * 0.4) + vec2(5.2, 1.3));
  vec2 warped = p + vec2(wx, wy) * 0.7;

  // Second warp — finer turbulence
  float wx2 = fbm3(warped * 1.5 + vec2(t * 0.2, 0.0) + vec2(8.1, 3.7));
  warped += vec2(wx2, 0.0) * 0.25;

  // Rising motion built into the lookup
  return fbm3(warped + vec2(0.0, -t * 0.8));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.2;

  vec3 color = vec3(0.0);

  // ── Multiple smoke columns at different positions ──
  float totalSmoke = 0.0;
  float warmth = 0.0;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float colX = (fi - 1.0) * 0.4; // columns at -0.4, 0.0, 0.4
    float colWidth = 0.25 + fi * 0.05;

    // Horizontal distance from column center
    float dx = uv.x - colX;
    // Column mask — gaussian falloff from center
    float colMask = exp(-dx * dx / (colWidth * colWidth));

    // Vertical: smoke rises from below
    float baseY = -0.5 + fi * 0.05;
    float aboveBase = uv.y - baseY;
    float heightMask = smoothstep(-0.1, 0.1, aboveBase) * smoothstep(1.2, 0.0, aboveBase);

    // Smoke density from warped noise
    vec2 smokeUV = vec2(dx / colWidth * 1.5, aboveBase * 2.0);
    float density = smokeField(smokeUV * 1.8 + fi * 7.3, t * (0.9 + fi * 0.1));
    density = density * 0.5 + 0.5;
    density = smoothstep(0.2, 0.75, density);

    float smokeMask = density * colMask * heightMask;
    totalSmoke += smokeMask;

    // Warmth: strongest at base, decays upward
    float warmFalloff = exp(-aboveBase * 2.5);
    warmth += smokeMask * warmFalloff;
  }

  totalSmoke = clamp(totalSmoke, 0.0, 1.0);
  warmth = clamp(warmth, 0.0, 1.0);

  // ── Fire glow at the base ── hidden fire below
  float fireRegion = smoothstep(0.0, -0.45, uv.y);
  float fireNoise = fbm3(vec2(uv.x * 3.0, uv.y * 2.0 - t * 2.0)) * 0.5 + 0.5;
  float fireGlow = fireRegion * fireNoise * (0.6 + u_bass * 0.5);

  // Fire color — hot orange-white
  vec3 fireCol = palette(
    fireNoise * 0.3 + paletteShift + 0.05,
    vec3(0.25, 0.10, 0.02),
    vec3(0.25, 0.12, 0.02),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.05, 0.1)
  );
  color += fireCol * fireGlow * 0.35;

  // ── Warm smoke (lower half) — fire-lit from below ──
  vec3 warmSmokeCol = palette(
    totalSmoke * 0.4 + paletteShift + 0.1,
    vec3(0.10, 0.04, 0.02),
    vec3(0.12, 0.05, 0.01),
    vec3(0.8, 0.5, 0.2),
    vec3(0.0, 0.08, 0.15)
  );

  // ── Cool smoke (upper half) — dissipating into darkness ──
  vec3 coolSmokeCol = palette(
    totalSmoke * 0.3 + paletteShift + 0.5,
    vec3(0.04, 0.04, 0.05),
    vec3(0.05, 0.04, 0.05),
    vec3(0.4, 0.4, 0.5),
    vec3(0.1, 0.1, 0.2)
  );

  // Blend warm to cool based on height
  float warmCoolMix = smoothstep(-0.3, 0.4, uv.y);
  vec3 smokeCol = mix(warmSmokeCol, coolSmokeCol, warmCoolMix);

  // Underlighting — warm glow illuminates the bottom of smoke masses
  vec3 underlight = vec3(0.20, 0.08, 0.02) * warmth * (0.5 + u_bass * 0.6);
  smokeCol += underlight;

  color += smokeCol * totalSmoke;

  // ── Ember sparks rising through smoke ──
  float sparks = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float sx = fract(sin(fi * 127.1) * 43758.5) * 1.2 - 0.6;
    float sy = fract(sin(fi * 311.7) * 43758.5);
    // Rise upward, loop
    sy = mod(sy + t * (0.4 + fract(fi * 0.37) * 0.5), 1.8) - 0.6;
    // Horizontal drift
    sx += sin(t * 1.5 + fi * 2.7) * 0.08;
    float sd = length(uv - vec2(sx, sy));
    float sparkBright = 0.0008 / (sd * sd + 0.0008);
    sparkBright *= smoothstep(1.0, -0.3, sy); // fade as they rise
    sparks += sparkBright;
  }
  vec3 sparkCol = vec3(0.35, 0.18, 0.04);
  color += sparkCol * sparks * 0.008 * (0.5 + u_treble * 0.5);

  // ── Background — near-black with faint warmth at bottom ──
  vec3 bgBot = vec3(0.02, 0.01, 0.005);
  vec3 bgTop = vec3(0.01, 0.01, 0.015);
  vec3 bg = mix(bgBot, bgTop, smoothstep(-0.5, 0.5, uv.y));
  color = mix(bg, color, max(totalSmoke, fireGlow));

  // Mid-frequency modulates overall smoke luminosity
  color *= 0.92 + u_mid * 0.12;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
