import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Deep ocean abyss with bioluminescent organisms.
// Tiny glowing blue/cyan/green dots and tendrils in absolute darkness.
// Hash-based particle system with soft glowing points.

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float hash2d(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Light 3-octave fbm for tendril shapes
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.2;

  // ── Abyss background — near-total darkness with subtle depth ──
  vec3 color = vec3(0.005, 0.008, 0.015);

  // Very faint depth gradient — slightly lighter far below
  float depthGrad = smoothstep(0.5, -0.6, uv.y) * 0.01;
  color += vec3(0.0, 0.005, 0.01) * depthGrad;

  // ── Bioluminescent particles — hash-based system ──
  float totalGlow = 0.0;
  vec3 bioColor = vec3(0.0);

  for (int i = 0; i < 40; i++) {
    float fi = float(i);

    // Particle position from hash
    float px = hash1(fi * 13.37) * 2.4 - 1.2;
    float py = hash1(fi * 7.91) * 2.0 - 1.0;

    // Slow drift — each particle drifts uniquely
    float driftSpeed = 0.02 + hash1(fi * 3.13) * 0.04;
    float phase = hash1(fi * 5.71) * 6.28;
    px += sin(t * driftSpeed * 8.0 + phase) * 0.15;
    py += cos(t * driftSpeed * 6.0 + phase * 1.3) * 0.12;

    // Gentle upward drift (organisms rise slowly)
    py += mod(t * driftSpeed * 2.0 + hash1(fi * 2.0), 2.4) - 1.2;

    vec2 toP = uv - vec2(px, py);
    float d = length(toP);

    // Particle size
    float size = 0.005 + hash1(fi * 11.3) * 0.015;

    // Pulsing: each organism pulses at its own rate
    float pulseRate = 0.5 + hash1(fi * 9.1) * 2.0;
    float pulse = 0.4 + 0.6 * sin(t * pulseRate * 5.0 + phase);
    // Treble makes organisms flicker brighter
    pulse *= (0.7 + u_treble * 0.4);

    // Soft glow falloff — inverse square with minimum
    float glow = (size * size) / (d * d + size * size * 0.2) * pulse;

    // Color per organism — blue, cyan, or green
    float colorSeed = hash1(fi * 17.3);
    vec3 orgColor;
    if (colorSeed < 0.4) {
      // Deep blue
      orgColor = palette(
        pulse * 0.3 + paletteShift + 0.6,
        vec3(0.05, 0.08, 0.20),
        vec3(0.05, 0.10, 0.25),
        vec3(0.3, 0.5, 1.0),
        vec3(0.15, 0.2, 0.4)
      );
    } else if (colorSeed < 0.75) {
      // Cyan
      orgColor = palette(
        pulse * 0.3 + paletteShift + 0.3,
        vec3(0.03, 0.15, 0.18),
        vec3(0.05, 0.18, 0.20),
        vec3(0.3, 0.8, 0.9),
        vec3(0.1, 0.25, 0.3)
      );
    } else {
      // Green bioluminescence
      orgColor = palette(
        pulse * 0.3 + paletteShift + 0.1,
        vec3(0.02, 0.12, 0.05),
        vec3(0.03, 0.15, 0.06),
        vec3(0.2, 0.9, 0.4),
        vec3(0.1, 0.3, 0.15)
      );
    }

    bioColor += orgColor * glow;
    totalGlow += glow;
  }

  // Scale particle contribution
  color += bioColor * 0.04;

  // ── Bioluminescent tendrils — long flowing shapes ──
  // 3 jellyfish-like trailing tendrils
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    // Tendril anchor point
    float ax = hash1(fj * 43.7 + 100.0) * 1.6 - 0.8;
    float ay = hash1(fj * 71.3 + 100.0) * 1.2 - 0.6;
    ax += sin(t * 0.4 + fj * 2.0) * 0.3;
    ay += cos(t * 0.35 + fj * 1.7) * 0.2;

    // Tendril extends downward from anchor
    vec2 tendrilUV = uv - vec2(ax, ay);
    // Rotate slightly
    tendrilUV *= rot2(sin(t * 0.2 + fj * 1.5) * 0.3);

    // Tendril shape: narrow in x, extends in -y
    float tendrilLen = tendrilUV.y; // 0 at anchor, positive below
    float tendrilWidth = 0.02 + tendrilLen * 0.03;

    // Wavy motion along length
    float wave = sin(tendrilLen * 8.0 - t * 2.0 + fj * 3.0) * 0.02;
    wave += sin(tendrilLen * 15.0 - t * 3.0) * 0.008;
    float dx = abs(tendrilUV.x - wave) / tendrilWidth;

    // Tendril mask
    float mask = smoothstep(1.0, 0.2, dx) * smoothstep(-0.05, 0.05, tendrilLen) * smoothstep(0.6, 0.0, tendrilLen);
    mask *= 0.5 + 0.5 * sin(t * 1.5 + fj * 2.0); // pulsing

    // Tendril color — ethereal cyan-blue
    vec3 tColor = palette(
      tendrilLen * 2.0 + paletteShift + fj * 0.3,
      vec3(0.03, 0.10, 0.15),
      vec3(0.05, 0.12, 0.18),
      vec3(0.3, 0.7, 0.9),
      vec3(0.1, 0.2, 0.35)
    );

    color += tColor * mask * 0.15 * (0.7 + u_mid * 0.3);
  }

  // ── Ambient deep-sea current — faint noise-based flow ──
  float current = fbm3(uv * 1.5 + vec2(t * 0.3, t * 0.2));
  current = current * 0.5 + 0.5;
  current = smoothstep(0.4, 0.7, current) * 0.015;
  vec3 currentCol = vec3(0.0, 0.03, 0.05);
  color += currentCol * current;

  // ── Bass creates a deep pressure pulse ──
  float bassPulse = u_bass * 0.03;
  float pulseRing = abs(length(uv) - 0.3 - sin(t * 2.0) * 0.1);
  float pressureWave = smoothstep(0.08, 0.0, pulseRing) * bassPulse;
  color += vec3(0.02, 0.04, 0.08) * pressureWave;

  // Amplitude drives subtle overall brightness
  color *= 0.9 + u_amplitude * 0.15;

  // Vignette — deep, enhancing the abyss feeling
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
