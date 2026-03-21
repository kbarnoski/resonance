import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Doppler — red/blue shifted waves, approaching and receding frequencies.
// Visualizes the Doppler effect with waves compressed to blue on one side
// and stretched to red on the other, centered on a moving emitter.

float dopplerWave(vec2 uv, vec2 source, float freq, float velocity, float t) {
  vec2 d = uv - source;
  float r = length(d);
  float angle = atan(d.y, d.x);

  // Doppler shift — frequency changes based on direction relative to motion
  float motionAngle = 0.0; // moving right
  float cosTheta = cos(angle - motionAngle);
  float shiftedFreq = freq / (1.0 - velocity * cosTheta);

  float wave = sin(r * shiftedFreq - t * freq * 3.0) * 0.5 + 0.5;
  wave *= exp(-r * 1.5);
  return wave;
}

float emitter(vec2 uv, vec2 pos) {
  return exp(-length(uv - pos) * 25.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;

  // Moving emitter — oscillates left to right
  float velocity = 0.3 + u_bass * 0.15;
  vec2 sourcePos = vec2(sin(t * 0.5) * 0.3, cos(t * 0.3) * 0.1);

  // Multiple wave frequencies
  float waves = 0.0;
  float shiftMap = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float freq = 15.0 + fi * 8.0 + u_mid * 3.0;
    float w = dopplerWave(uv, sourcePos, freq, velocity, t + fi * 0.3);
    waves += w * (0.4 - fi * 0.07);
  }

  // Calculate shift direction for coloring
  vec2 d = uv - sourcePos;
  float angle = atan(d.y, d.x);
  float motionAngle = atan(cos(t * 0.5) * 0.3, 1.0); // direction of motion
  float cosTheta = cos(angle - motionAngle);
  float shift = cosTheta; // -1 = receding (red), +1 = approaching (blue)

  // Spectral lines — horizontal bands showing frequency shift
  float spectral = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float baseY = -0.5 + fi * 0.2;
    float shiftedY = baseY + shift * 0.02 * (1.0 + fi * 0.3);
    float line = smoothstep(0.008, 0.0, abs(uv.y - shiftedY));
    line *= smoothstep(0.8, 0.0, abs(uv.x));
    spectral += line * 0.15;
  }

  // Compression/expansion visualization
  float compression = abs(shift);
  float compressNoise = snoise(uv * (10.0 + shift * 5.0) + t * 0.3) * 0.5 + 0.5;

  // Shock front — when approaching fast
  float shockFront = 0.0;
  if (shift > 0.5) {
    float shockR = length(d);
    float shockAngle = atan(d.y, d.x);
    float shock = smoothstep(0.02, 0.0, abs(shockR - 0.15 - sin(shockAngle * 4.0 + t * 3.0) * 0.02));
    shockFront = shock * (shift - 0.5) * 2.0;
  }

  // Moving emitter glow
  float emit = emitter(uv, sourcePos);

  // Wave trail — past positions
  float trail = 0.0;
  for (int i = 1; i < 8; i++) {
    float fi = float(i);
    float pastT = t - fi * 0.05;
    vec2 pastPos = vec2(sin(pastT * 0.5) * 0.3, cos(pastT * 0.3) * 0.1);
    trail += exp(-length(uv - pastPos) * 20.0) * (1.0 - fi * 0.12);
  }

  float paletteShift = u_amplitude * 0.25;

  // Blue-shifted color (approaching) — compressed, high energy
  vec3 blueShift = palette(
    waves + t * 0.05 + paletteShift,
    vec3(0.2, 0.3, 0.7),
    vec3(0.2, 0.25, 0.4),
    vec3(0.4, 0.5, 0.9),
    vec3(0.1, 0.15, 0.4)
  );

  // Red-shifted color (receding) — stretched, low energy
  vec3 redShift = palette(
    waves + t * 0.05 + paletteShift + 0.5,
    vec3(0.7, 0.25, 0.15),
    vec3(0.35, 0.15, 0.1),
    vec3(0.6, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Neutral emitter color
  vec3 emitCol = palette(
    t * 0.08 + paletteShift + 0.25,
    vec3(0.8, 0.8, 0.75),
    vec3(0.15, 0.15, 0.1),
    vec3(0.3, 0.3, 0.2),
    vec3(0.0, 0.0, 0.05)
  );

  // Mix wave color based on shift direction
  float shiftNorm = shift * 0.5 + 0.5; // 0 = red, 1 = blue
  vec3 waveCol = mix(redShift, blueShift, shiftNorm);

  vec3 color = vec3(0.0);

  // Waves with shift coloring
  color += waveCol * waves * (0.7 + u_bass * 0.4);

  // Spectral lines
  vec3 spectralCol = mix(vec3(0.8, 0.2, 0.1), vec3(0.1, 0.3, 0.9), shiftNorm);
  color += spectralCol * spectral * (0.4 + u_treble * 0.4);

  // Compression noise overlay
  color += waveCol * compressNoise * 0.05 * compression;

  // Shock front
  color += vec3(0.4, 0.6, 1.0) * shockFront * (0.5 + u_treble * 0.5);

  // Emitter and trail
  color += emitCol * emit * 1.2;
  color += emitCol * trail * 0.15 * (0.5 + u_mid * 0.3);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
