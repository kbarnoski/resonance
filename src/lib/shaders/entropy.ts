import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
// Heat death — particles slowing to a stop, all energy dissipating,
// everything fading to uniform grey, the end of all structure.

float particleField(vec2 p, float seed, float decay) {
  float total = 0.0;
  for (int i = 0; i < 20; i++) {
    float fi = float(i) + seed;
    vec2 pos = hash2(vec2(fi * 7.13, fi * 3.91));
    float speed = max(0.001, 0.3 * exp(-decay * 0.02));
    float phase = fi * 1.618;
    pos += vec2(
      sin(u_time * speed * 0.3 + phase) * (0.5 * exp(-decay * 0.01)),
      cos(u_time * speed * 0.2 + phase * 1.3) * (0.5 * exp(-decay * 0.01))
    );
    float d = length(p - pos);
    float brightness = exp(-decay * 0.008) * 0.5;
    float glow = brightness * 0.003 / (d * d + 0.002);
    total += glow;
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Decay factor: everything slows over time, bass briefly re-energizes
  float decay = t * 3.0 - u_bass * 8.0;
  decay = max(decay, 0.0);
  float deathProgress = 1.0 - exp(-decay * 0.015);

  // Voronoi structure dissolving — the last crystalline order breaking down
  vec2 voroUV = uv * (3.0 - deathProgress * 1.5) + vec2(t * 0.05);
  vec3 vor = voronoi(voroUV);
  float cellEdge = smoothstep(0.0, 0.08 + deathProgress * 0.3, vor.y - vor.x);
  float cellStructure = cellEdge * (1.0 - deathProgress * 0.9);

  // Noise field — once turbulent, now flattening
  float noiseScale = 4.0 - deathProgress * 2.5;
  float n1 = fbm(uv * noiseScale + t * (0.15 - deathProgress * 0.12));
  float n2 = fbm(uv * noiseScale * 0.6 - t * 0.08 + vec2(10.0));
  float noiseField = (n1 * 0.5 + 0.5) * (n2 * 0.5 + 0.5);
  noiseField = mix(noiseField, 0.5, deathProgress * 0.85);

  // Particle layers — slowing, dimming
  float p1 = particleField(uv, 0.0, decay);
  float p2 = particleField(uv * 0.7 + vec2(0.3), 50.0, decay * 1.2);
  float particles = p1 + p2 * 0.7;
  particles *= (0.4 + u_treble * 0.6);

  // Color: starts with faint warm tones, converges to uniform grey
  vec3 aliveColor = palette(noiseField * 0.5 + paletteShift + 0.3,
    vec3(0.08, 0.04, 0.02),
    vec3(0.1, 0.06, 0.04),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.1, 0.2));

  vec3 deadGrey = vec3(0.035);

  vec3 color = mix(aliveColor, deadGrey, deathProgress);

  // Cell structure overlay — fading grid of reality
  vec3 structureColor = palette(vor.x * 2.0 + paletteShift,
    vec3(0.03, 0.02, 0.04),
    vec3(0.06, 0.03, 0.05),
    vec3(0.8, 0.6, 1.0),
    vec3(0.1, 0.15, 0.3));
  color += structureColor * cellStructure * 0.15 * (1.0 - deathProgress);

  // Particles: last sparks of energy
  vec3 sparkColor = palette(particles * 0.3 + paletteShift + 0.5,
    vec3(0.05, 0.03, 0.01),
    vec3(0.12, 0.06, 0.02),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.1, 0.2));
  color += sparkColor * particles * 0.02 * (1.0 - deathProgress * 0.7);

  // Noise texture — once dynamic, now barely perceptible
  float texNoise = snoise(uv * 8.0 + t * 0.02) * 0.5 + 0.5;
  float texStrength = 0.04 * (1.0 - deathProgress * 0.8);
  color += vec3(texNoise * texStrength) * (0.5 + u_mid * 0.5);

  // Bass: brief flashes of residual energy — dying gasps
  float flashMask = smoothstep(0.6, 1.0, u_bass) * (1.0 - deathProgress * 0.5);
  float flashNoise = snoise(uv * 12.0 + t * 3.0);
  color += palette(flashNoise + paletteShift,
    vec3(0.02, 0.01, 0.0),
    vec3(0.08, 0.04, 0.02),
    vec3(1.0, 0.6, 0.3),
    vec3(0.0, 0.15, 0.3)) * flashMask * smoothstep(0.3, 0.8, flashNoise) * 0.15;

  // Subtle drift toward absolute uniformity
  float uniformity = snoise(uv * 2.0 + t * 0.01) * 0.5 + 0.5;
  color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), deathProgress * 0.6);

  // Vignette — the last visible boundary fading
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.3 + (1.0 - deathProgress) * 0.3, 1.4, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
