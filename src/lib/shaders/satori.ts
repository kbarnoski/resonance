import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Sudden enlightenment: a moment of clarity rendered as a flash expanding infinitely,
// the instant of awakening frozen in perpetual expansion.
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

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 color = vec3(0.0);

  // The flash — a perpetually expanding wavefront
  // Multiple wavefronts at different stages of expansion (looping)
  for (int wave = 0; wave < 4; wave++) {
    float fw = float(wave);
    float wavePhase = fract(t * 0.3 + fw * 0.25);
    float waveR = wavePhase * 1.5;
    float waveWidth = 0.03 + wavePhase * 0.04; // widens as it expands

    // Sharp leading edge, soft trailing edge
    float leading = smoothstep(waveWidth, 0.0, abs(r - waveR));
    float trailing = smoothstep(waveWidth * 3.0, 0.0, r - waveR + waveWidth) * step(r, waveR);

    // Wavefront intensity — brightest when young, fading as it expands
    float intensity = (1.0 - wavePhase) * (1.0 - wavePhase);

    // Angular detail on wavefront — crystalline fracturing
    float crystal = sin(a * (8.0 + fw * 4.0) + wavePhase * 10.0 + t * 2.0);
    crystal = smoothstep(0.3, 0.9, crystal * 0.5 + 0.5) * leading * 0.5;

    vec3 waveCol = palette(
      fw * 0.2 + wavePhase * 0.3 + paletteShift,
      vec3(0.8, 0.75, 0.6),
      vec3(0.25, 0.25, 0.2),
      vec3(1.0, 0.9, 0.65),
      vec3(0.0, 0.08, 0.18)
    );

    color += waveCol * (leading * 1.5 + trailing * 0.4) * intensity * (0.7 + 0.3 * u_mid);
    color += waveCol * crystal * intensity;
  }

  // Central flash core — the point of enlightenment
  float coreFlash = exp(-r * r * 20.0) * (1.5 + u_bass * 1.0);
  // Pulsing at the moment frequency
  float corePulse = 0.8 + 0.4 * sin(t * 5.0) + 0.3 * sin(t * 7.7);
  coreFlash *= corePulse;

  vec3 coreCol = palette(
    t * 0.12 + paletteShift,
    vec3(0.95, 0.9, 0.8),
    vec3(0.1, 0.1, 0.08),
    vec3(1.0, 1.0, 0.9),
    vec3(0.0, 0.02, 0.05)
  );
  color += coreCol * coreFlash;

  // Radial awareness lines — rays of sudden understanding
  float rayCount = 32.0;
  float rayAngle = mod(a + t * 0.15, 6.28318 / rayCount) - 3.14159 / rayCount;
  float ray = smoothstep(0.02, 0.0, abs(rayAngle));
  ray *= exp(-r * 2.0) * (0.4 + 0.3 * u_treble);
  // Rays pulse with the flash
  ray *= (0.6 + 0.4 * sin(r * 20.0 - t * 8.0));

  vec3 rayCol = palette(
    a * 0.08 + r * 0.3 + paletteShift + 0.2,
    vec3(0.7, 0.6, 0.45),
    vec3(0.3, 0.3, 0.25),
    vec3(1.0, 0.85, 0.55),
    vec3(0.05, 0.1, 0.25)
  );
  color += rayCol * ray;

  // Clarity field — the space between waves is not empty, it's CLEAR
  float clarity = snoise(uv * 4.0 + t * 0.2);
  clarity = smoothstep(0.2, 0.6, clarity * 0.5 + 0.5) * 0.08;
  vec3 clarityCol = palette(
    clarity * 3.0 + paletteShift + 0.7,
    vec3(0.5, 0.5, 0.6),
    vec3(0.3, 0.25, 0.3),
    vec3(0.7, 0.9, 1.0),
    vec3(0.2, 0.1, 0.3)
  );
  color += clarityCol * clarity * smoothstep(1.0, 0.2, r);

  // Moment particles — frozen in the flash
  float particles = snoise(uv * 18.0 + t * 0.5);
  particles = pow(max(particles, 0.0), 8.0) * 0.4 * u_treble;
  color += vec3(1.0, 0.98, 0.92) * particles * smoothstep(1.0, 0.2, r);

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
