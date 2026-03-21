import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Multiple point sources creating circular ripples
  // Each source emits spherical waves that interfere constructively/destructively

  float waveSum = 0.0;
  float waveSumAbs = 0.0;

  // 9 wave sources arranged in a dynamic pattern
  for (int i = 0; i < 9; i++) {
    float fi = float(i);

    // Source positions orbit and drift
    float sourceAngle = fi * 0.6981 + t * (0.15 + fi * 0.03); // golden-ish spacing
    float sourceR = 0.25 + fi * 0.04 + sin(t * 0.2 + fi * 1.5) * 0.1;
    sourceR *= (1.0 + u_bass * 0.15);

    vec2 source = vec2(
      cos(sourceAngle) * sourceR,
      sin(sourceAngle) * sourceR
    );

    // Distance from this pixel to the source
    float d = length(uv - source);

    // Wave from this source: circular ripple
    float frequency = 18.0 + fi * 2.0 + u_mid * 5.0;
    float phase = d * frequency - t * (4.0 + fi * 0.5);

    // Amplitude decreases with distance (1/sqrt(r) for 2D waves)
    float amplitude = 1.0 / (1.0 + d * 3.0);

    // Each source has slightly different wave character
    float wave = sin(phase) * amplitude;

    waveSum += wave;
    waveSumAbs += abs(wave);
  }

  // Normalize
  waveSum /= 4.0;
  waveSumAbs /= 4.0;

  // Constructive interference: bright peaks
  float constructive = smoothstep(0.3, 0.8, waveSum);
  float destructive = smoothstep(-0.3, -0.8, waveSum);

  // Interference pattern intensity
  float pattern = waveSum * 0.5 + 0.5;
  float patternSharp = pow(pattern, 2.0);

  // Primary interference color
  vec3 col1 = palette(
    pattern * 2.0 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.2)
  );

  // Secondary: phase-shifted for chromatic fringing
  vec3 col2 = palette(
    pattern * 2.0 + t * 0.3 + paletteShift + 0.33,
    vec3(0.5, 0.5, 0.6),
    vec3(0.5, 0.4, 0.5),
    vec3(0.7, 1.0, 0.6),
    vec3(0.1, 0.2, 0.4)
  );

  // Build up the color from the wave pattern
  color += col1 * patternSharp * 0.6;
  color += col2 * (1.0 - patternSharp) * 0.2;

  // Bright constructive peaks
  vec3 peakCol = palette(
    waveSum * 3.0 + paletteShift + 0.5,
    vec3(0.8, 0.8, 0.8),
    vec3(0.4, 0.3, 0.5),
    vec3(0.8, 0.6, 1.0),
    vec3(0.0, 0.05, 0.15)
  );
  color += peakCol * constructive * 0.8;

  // Destructive troughs: dark but with subtle hue
  vec3 troughCol = palette(
    waveSum * 2.0 + paletteShift + 0.8,
    vec3(0.1, 0.1, 0.15),
    vec3(0.1, 0.08, 0.15),
    vec3(0.4, 0.5, 1.0),
    vec3(0.2, 0.1, 0.35)
  );
  color += troughCol * destructive * 0.3;

  // Moire overlay: second wave pattern at slightly different scale
  float moire = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float mAngle = fi * 1.2566 + t * 0.08; // 72 degrees
    vec2 mDir = vec2(cos(mAngle), sin(mAngle));
    float mPhase = dot(uv * 25.0, mDir) + t * 2.0;
    moire += sin(mPhase) * 0.2;
  }
  moire = moire * 0.5 + 0.5;

  vec3 moireCol = palette(
    moire * 3.0 + t * 0.2 + paletteShift + 0.15,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.4),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.05, 0.3)
  );
  color += moireCol * moire * 0.1 * waveSumAbs;

  // Source point glow: bright dots at each wave source
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float sourceAngle = fi * 0.6981 + t * (0.15 + fi * 0.03);
    float sourceR = 0.25 + fi * 0.04 + sin(t * 0.2 + fi * 1.5) * 0.1;
    sourceR *= (1.0 + u_bass * 0.15);
    vec2 source = vec2(cos(sourceAngle) * sourceR, sin(sourceAngle) * sourceR);

    float d = length(uv - source);
    float pointGlow = smoothstep(0.06, 0.0, d);
    float pointCore = smoothstep(0.015, 0.0, d);

    vec3 pointCol = palette(
      fi * 0.11 + t * 0.5 + paletteShift + 0.2,
      vec3(0.8, 0.8, 0.8),
      vec3(0.4, 0.3, 0.5),
      vec3(1.0, 0.7, 0.5),
      vec3(0.0, 0.1, 0.2)
    );

    color += pointCol * pointGlow * 0.4;
    color += vec3(1.0, 0.97, 0.9) * pointCore * 1.5;
  }

  // Treble: high-frequency fringe enhancement
  float fringe = sin(waveSum * 40.0 + t * 3.0) * 0.5 + 0.5;
  color += vec3(0.9, 0.85, 1.0) * fringe * u_treble * 0.15 * waveSumAbs;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
