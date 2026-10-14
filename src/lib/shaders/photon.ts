import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";
import { deriveFrag, fieldGrid } from "./prepass-pack";

// PERF (2026-10-14, the 120 fps law, pass 4): the probability cloud's fbm is
// smooth at a 3-pixel scale and weighted <= 0.15 — computed once per 3x3
// pixels in a float prepass (PRE, the same code at the same points) and
// interpolated; a photon whose flash is off this frame (exactly 0) skips its
// gaussian, and the particle palette only runs where a particle lights.
// ORIG is the reference and the no-float fallback. A/B: scripts/perf/shader-ab.mjs.
export const ORIG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Photon — particle-wave duality, light traveling as both wave and dot.
// Interference patterns merge with discrete particle flashes,
// visualizing the quantum nature of light itself.

float waveFront(vec2 uv, float freq, float phase, float t) {
  float wave = sin(uv.x * freq + t * 3.0 + phase);
  wave *= exp(-abs(uv.y) * 4.0);
  return wave * 0.5 + 0.5;
}

float particle(vec2 uv, vec2 pos, float radius) {
  float d = length(uv - pos);
  return exp(-d * d / (radius * radius));
}

float interference(vec2 uv, float t) {
  float d1 = length(uv - vec2(-0.3, 0.0));
  float d2 = length(uv - vec2(0.3, 0.0));
  float wave1 = sin(d1 * 30.0 - t * 4.0);
  float wave2 = sin(d2 * 30.0 - t * 4.0);
  return (wave1 + wave2) * 0.5;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;

  // Wave component — double slit interference
  float interf = interference(uv, t);
  float interfPattern = interf * 0.5 + 0.5;
  interfPattern = pow(interfPattern, 2.0);

  // Multiple wave fronts at different frequencies
  float waves = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 waveUv = uv * rot2(fi * 0.8 + t * 0.05);
    float freq = 15.0 + fi * 8.0 + u_treble * 5.0;
    waves += waveFront(waveUv, freq, fi * 1.5, t) * (0.3 - fi * 0.05);
  }

  // Particle flashes — discrete photon events
  float particles = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float seed = fi * 7.31;
    float lifeT = fract(t * 0.3 + seed * 0.17);
    float flash = smoothstep(0.0, 0.05, lifeT) * smoothstep(0.2, 0.05, lifeT);
    vec2 pos = vec2(
      sin(seed * 3.7 + t * 0.5) * 0.6,
      cos(seed * 5.3 + t * 0.4) * 0.4
    );
    particles += particle(uv, pos, 0.02 + u_bass * 0.01) * flash;
  }

  // Probability cloud — gaussian uncertainty
  float probCloud = fbm(uv * 4.0 + vec2(t * 0.3, t * 0.2)) * 0.5 + 0.5;
  float probMask = exp(-length(uv) * 2.0);
  probCloud *= probMask;

  // Energy quantization lines
  float quanta = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float level = -0.4 + fi * 0.2;
    float lineD = abs(uv.y - level - sin(uv.x * 8.0 + t * 2.0 + fi) * 0.03);
    quanta += smoothstep(0.008, 0.0, lineD) * 0.3;
  }

  float paletteShift = u_amplitude * 0.3;

  // Wave color — ethereal blue-violet
  vec3 waveCol = palette(
    waves + t * 0.05 + paletteShift,
    vec3(0.3, 0.35, 0.7),
    vec3(0.3, 0.25, 0.4),
    vec3(0.6, 0.5, 0.9),
    vec3(0.1, 0.15, 0.4)
  );

  // Particle color — bright golden sparks
  vec3 particleCol = palette(
    particles + t * 0.1 + paletteShift + 0.4,
    vec3(0.9, 0.8, 0.5),
    vec3(0.2, 0.2, 0.3),
    vec3(0.5, 0.4, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Interference color — deep indigo bands
  vec3 interfCol = palette(
    interfPattern + t * 0.03 + paletteShift + 0.6,
    vec3(0.2, 0.15, 0.4),
    vec3(0.2, 0.2, 0.35),
    vec3(0.5, 0.3, 0.8),
    vec3(0.15, 0.1, 0.35)
  );

  vec3 color = vec3(0.0);
  color += waveCol * waves * (0.7 + u_mid * 0.5);
  color += interfCol * interfPattern * 0.4 * (0.6 + u_bass * 0.6);
  color += particleCol * particles * (1.0 + u_treble * 0.8);
  color += waveCol * probCloud * 0.15;
  color += vec3(0.5, 0.6, 0.9) * quanta * (0.4 + u_treble * 0.4);

  // Ambient quantum foam
  float foam = snoise(uv * 30.0 + t * 1.0) * 0.5 + 0.5;
  color += vec3(0.02, 0.02, 0.05) * foam;

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;

const GRID = fieldGrid(1, 0);
export const PRE_SCALE = 1 / 3;

/** Field = (fbm of the probability cloud). */
export const PRE =
  U +
  SMOOTH_NOISE +
  GRID.pre +
  `
void main() {
  float block, row;
  vec2 fc = preTexel(block, row);
  vec2 uv = (fc - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  gl_FragColor = vec4(fbm(uv * 4.0 + vec2(t * 0.3, t * 0.2)), 0.0, 0.0, 1.0);
}
`;

export const FRAG = deriveFrag(ORIG, [
  ["void main() {", GRID.main + "\nvoid main() {"],
  ["    particles += particle(uv, pos, 0.02 + u_bass * 0.01) * flash;", "    if (flash > 0.0) particles += particle(uv, pos, 0.02 + u_bass * 0.01) * flash; // exact: 0 * finite"],
  ["  float probCloud = fbm(uv * 4.0 + vec2(t * 0.3, t * 0.2)) * 0.5 + 0.5;", "  float probCloud = preField(0.0).x * 0.5 + 0.5;"],
  [`  vec3 particleCol = palette(
    particles + t * 0.1 + paletteShift + 0.4,
    vec3(0.9, 0.8, 0.5),
    vec3(0.2, 0.2, 0.3),
    vec3(0.5, 0.4, 0.2),
    vec3(0.0, 0.05, 0.1)
  );`, `  vec3 particleCol = particles > 0.0 ? palette(
    particles + t * 0.1 + paletteShift + 0.4,
    vec3(0.9, 0.8, 0.5),
    vec3(0.2, 0.2, 0.3),
    vec3(0.5, 0.4, 0.2),
    vec3(0.0, 0.05, 0.1)
  ) : vec3(0.0); // exact: only ever multiplied by particles`],
], "photon");
