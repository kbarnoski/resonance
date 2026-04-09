import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Glowing iron being worked — dark metallic surface with bright
// orange-white hot spots that pulse with bass. Bloom-like falloff.

// Light 3-octave fbm
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

float hash1(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.2;

  // ── Metallic surface texture ──
  // Subtle hammered/brushed metal look from noise
  vec2 metalUV = uv * 3.0;
  float metalGrain = fbm3(metalUV + vec2(t * 0.05, 0.0));
  float metalGrain2 = snoise(metalUV * 4.0 + vec2(0.0, t * 0.03));

  // Anisotropic brushed effect — stretch noise horizontally
  float brushed = snoise(vec2(uv.x * 8.0, uv.y * 2.0) + t * 0.02);
  float metalTex = metalGrain * 0.5 + brushed * 0.3 + metalGrain2 * 0.2;
  metalTex = metalTex * 0.5 + 0.5;

  // Base metal color — dark iron gray
  vec3 metalBase = palette(
    metalTex * 0.3 + paletteShift,
    vec3(0.025, 0.022, 0.02),
    vec3(0.02, 0.018, 0.015),
    vec3(0.5, 0.45, 0.4),
    vec3(0.1, 0.12, 0.15)
  );

  // Subtle specular on metal surface
  float metalSpec = pow(max(metalTex, 0.0), 4.0) * 0.03;
  metalBase += vec3(0.06, 0.06, 0.07) * metalSpec;

  vec3 color = metalBase;

  // ── Hot spots — glowing heated regions ──
  // Multiple hot spots that drift and pulse
  float totalHeat = 0.0;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    // Hot spot centers — slowly drifting
    float hx = hash1(fi * 13.37) * 1.4 - 0.7;
    float hy = hash1(fi * 7.91) * 1.0 - 0.5;
    hx += sin(t * (0.3 + hash1(fi * 3.1) * 0.4) + fi * 2.1) * 0.2;
    hy += cos(t * (0.25 + hash1(fi * 5.3) * 0.3) + fi * 1.7) * 0.15;

    // Distance to hot spot
    vec2 toSpot = uv - vec2(hx, hy);
    // Rotate for variety
    toSpot *= rot2(fi * 1.047);
    // Elliptical shape — stretched randomly
    float aspect = 0.6 + hash1(fi * 11.3) * 0.8;
    toSpot.x *= aspect;
    float d = length(toSpot);

    // Size varies per spot
    float baseSize = 0.08 + hash1(fi * 9.7) * 0.12;

    // Bass pulsing — each spot pulses at slightly different phase
    float pulse = 0.5 + 0.5 * sin(t * 3.0 + fi * 1.5);
    float bassBoost = u_bass * pulse;
    float size = baseSize * (0.7 + bassBoost * 0.6);

    // Soft glowing falloff — bloom-like
    float heat = size * size / (d * d + size * size * 0.3);
    heat = pow(heat, 1.5);

    // Noise-driven hotspot shape variation
    float shapeNoise = fbm3(toSpot * 5.0 + vec2(t * 0.2, fi * 3.0));
    heat *= 0.7 + shapeNoise * 0.4;

    totalHeat += heat;
  }

  totalHeat = clamp(totalHeat, 0.0, 2.5);

  // ── Heat color ramp: dark red -> orange -> yellow-white ──
  // Low heat: deep red glow
  vec3 heatLow = palette(
    totalHeat * 0.3 + paletteShift + 0.05,
    vec3(0.12, 0.02, 0.0),
    vec3(0.15, 0.03, 0.0),
    vec3(0.8, 0.3, 0.1),
    vec3(0.0, 0.05, 0.1)
  );

  // Medium heat: bright orange
  vec3 heatMid = palette(
    totalHeat * 0.5 + paletteShift + 0.08,
    vec3(0.25, 0.10, 0.02),
    vec3(0.25, 0.12, 0.01),
    vec3(1.0, 0.6, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // High heat: white-hot
  vec3 heatHigh = vec3(0.40, 0.35, 0.25);

  // Blend through the temperature range
  float lowT = smoothstep(0.0, 0.5, totalHeat);
  float midT = smoothstep(0.4, 1.0, totalHeat);
  float highT = smoothstep(1.0, 2.0, totalHeat);

  vec3 heatColor = mix(heatLow, heatMid, midT);
  heatColor = mix(heatColor, heatHigh, highT);

  // Add heat glow to metal base
  color += heatColor * lowT;

  // ── Radiant glow around hot spots — scattered light ──
  // Broad soft glow that tints nearby metal
  float glowRadius = totalHeat * 0.3;
  color += vec3(0.08, 0.02, 0.005) * glowRadius * (0.6 + u_mid * 0.4);

  // ── Scale / oxide texture on cooling regions ──
  float oxide = snoise(uv * 12.0 + metalGrain * 2.0);
  oxide = smoothstep(0.1, 0.5, oxide) * (1.0 - lowT); // only on cool areas
  vec3 oxideCol = vec3(0.03, 0.02, 0.015);
  color = mix(color, oxideCol, oxide * 0.3);

  // ── Treble: small bright sparks from hammering ──
  float sparks = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float sx = hash1(fi * 47.1 + floor(t * 3.0) * 13.0) * 1.6 - 0.8;
    float sy = hash1(fi * 83.7 + floor(t * 3.0) * 7.0) * 1.2 - 0.6;
    float lifetime = fract(t * 2.0 + fi * 0.167);
    // Sparks fly outward from center and fade
    sx *= 0.3 + lifetime * 0.7;
    sy *= 0.3 + lifetime * 0.7;
    float sd = length(uv - vec2(sx, sy));
    float spark = 0.0005 / (sd * sd + 0.0005);
    spark *= (1.0 - lifetime); // fade out
    sparks += spark;
  }
  color += vec3(0.35, 0.25, 0.10) * sparks * 0.005 * (0.3 + u_treble * 0.7);

  // Amplitude drives overall forge intensity
  color *= 0.85 + u_amplitude * 0.2;

  // Vignette — heavy, forge is lit from within
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
