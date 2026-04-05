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

  // Multiple wave sources — each emits circular waves
  // Sources slowly orbit
  vec2 sources[6];
  sources[0] = vec2(cos(t * 0.5), sin(t * 0.5)) * 0.6;
  sources[1] = vec2(cos(t * 0.5 + 2.094), sin(t * 0.5 + 2.094)) * 0.6;
  sources[2] = vec2(cos(t * 0.5 + 4.189), sin(t * 0.5 + 4.189)) * 0.6;
  sources[3] = vec2(cos(t * 0.3 + 1.0), sin(t * 0.3 + 1.0)) * 0.35;
  sources[4] = vec2(cos(t * 0.4 + 3.5), sin(t * 0.4 + 3.5)) * 0.45;
  sources[5] = vec2(0.0, 0.0); // center source

  // Bass adds a source, mid modulates frequency
  float baseFreq = 18.0 + u_mid * 3.0;

  // Sum wave amplitudes from all sources
  float waveSum = 0.0;
  float waveSumAbs = 0.0;

  for (int i = 0; i < 6; i++) {
    float d = length(uv - sources[i]);
    float fi = float(i);

    // Each source has slightly different frequency (creates beating)
    float freq = baseFreq + fi * 0.5;
    float phase = t * (3.0 + fi * 0.3);

    // Circular wave with 1/sqrt(r) amplitude falloff (2D wave)
    float amp = 1.0 / (1.0 + d * 4.0);
    float wave = sin(d * freq - phase) * amp;

    waveSum += wave;
    waveSumAbs += abs(wave);
  }

  // Constructive interference: bright where waves reinforce
  float constructive = waveSum * waveSum;

  // Destructive: dark where waves cancel
  float destructive = 1.0 - smoothstep(0.0, 0.3, abs(waveSum));

  // Nodal lines: where sum is near zero
  float nodal = smoothstep(0.05, 0.0, abs(waveSum)) * 0.5;

  // Antinodal lines: where |sum| is maximum
  float antinodal = smoothstep(0.3, 0.5, abs(waveSum));

  // Color the interference pattern
  vec3 constructiveCol = palette(
    waveSum * 0.5 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 1.0, 0.5),
    vec3(0.0, 0.1, 0.4)
  );
  vec3 antinodeCol = palette(
    waveSum * 0.3 + t * 0.2 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.5),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.8, 0.4),
    vec3(0.05, 0.1, 0.2)
  );
  vec3 nodalCol = palette(
    t * 0.15 + paletteShift + 0.7,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );

  // Compose
  color += constructiveCol * constructive * 0.15;
  color += antinodeCol * antinodal * 0.4;
  color += nodalCol * nodal;

  // Intensity pattern (what you'd see on a screen)
  float intensity = constructive * 0.3;
  color += constructiveCol * intensity;

  // Source point glow
  for (int i = 0; i < 6; i++) {
    float d = length(uv - sources[i]);
    float srcGlow = exp(-d * 15.0) * 0.4;
    vec3 srcCol = palette(
      float(i) * 0.17 + t * 0.4 + paletteShift + 0.2,
      vec3(0.7, 0.7, 0.7),
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.9, 1.0),
      vec3(0.0, 0.05, 0.25)
    );
    color += srcCol * srcGlow;
  }

  // Audio: treble brightens the interference pattern
  color += constructiveCol * constructive * u_treble * 0.2;
  // Bass pulses the central source
  float bassPulse = exp(-length(uv) * 8.0) * u_bass * 0.2;
  color += antinodeCol * bassPulse;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
