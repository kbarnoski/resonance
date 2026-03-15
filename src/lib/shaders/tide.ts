import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.08;

  // ── Wave source positions — slowly orbiting ──
  vec2 src0 = vec2(
    cos(t * 0.7) * 0.35,
    sin(t * 0.5) * 0.30
  );
  vec2 src1 = vec2(
    cos(t * 0.4 + 2.1) * 0.40,
    sin(t * 0.6 + 2.1) * 0.35
  );
  vec2 src2 = vec2(
    cos(t * 0.55 + 4.2) * 0.30,
    sin(t * 0.45 + 4.2) * 0.38
  );
  vec2 src3 = vec2(
    cos(t * 0.35 + 5.8) * 0.25,
    sin(t * 0.65 + 5.8) * 0.28
  );

  // ── Wave parameters ──
  float waveFreq = 22.0;
  float speed = 3.0;

  // ── Circular waves from each source ──
  float d0 = length(uv - src0);
  float d1 = length(uv - src1);
  float d2 = length(uv - src2);
  float d3 = length(uv - src3);

  // Each source emits expanding sinusoidal waves
  // Amplitude decays with distance (1/sqrt for 2D)
  float decay0 = 1.0 / (1.0 + d0 * 2.5);
  float decay1 = 1.0 / (1.0 + d1 * 2.5);
  float decay2 = 1.0 / (1.0 + d2 * 2.5);
  float decay3 = 1.0 / (1.0 + d3 * 2.5);

  float w0 = sin(d0 * waveFreq - t * speed) * decay0;
  float w1 = sin(d1 * waveFreq * 1.05 - t * speed * 0.95) * decay1;
  float w2 = sin(d2 * waveFreq * 0.97 - t * speed * 1.03) * decay2;
  float w3 = sin(d3 * waveFreq * 1.02 - t * speed * 0.98) * decay3;

  // ── Plane wave — adds straight-line interference ──
  float planeAngle = t * 0.12;
  vec2 planeDir = vec2(cos(planeAngle), sin(planeAngle));
  float planeWave = sin(dot(uv, planeDir) * 16.0 - t * speed * 0.6) * 0.4;

  // ── Sum all wave amplitudes — interference ──
  float waveSum = w0 + w1 + w2 + w3 + planeWave;

  // Normalize to roughly -1..1 range
  float waveNorm = waveSum * 0.35;

  // ── Intensity: square the wave for visual contrast ──
  // Constructive = bright peaks, destructive = dark nodes
  float intensity = waveNorm * 0.5 + 0.5; // map to 0..1
  float peaks = pow(intensity, 2.0);
  float nodes = pow(1.0 - intensity, 3.0);

  // ── Second harmonic layer for moire complexity ──
  float h0 = sin(d0 * waveFreq * 2.1 - t * speed * 1.5) * decay0 * 0.3;
  float h1 = sin(d1 * waveFreq * 1.95 - t * speed * 1.4) * decay1 * 0.3;
  float h2 = sin(d2 * waveFreq * 2.05 - t * speed * 1.6) * decay2 * 0.3;
  float harmonicSum = (h0 + h1 + h2) * 0.4;
  float harmonicIntensity = harmonicSum * 0.5 + 0.5;

  // ── FBM subtle surface texture — not dominant ──
  float surfaceNoise = fbm(uv * 6.0 + t * 0.08) * 0.08;

  // ── Color mapping ──
  // Deep blue for calm/nodal regions
  vec3 deepCol = palette(
    nodes * 0.8 + paletteShift + 0.6,
    vec3(0.03, 0.06, 0.15),
    vec3(0.04, 0.08, 0.15),
    vec3(0.2, 0.4, 0.8),
    vec3(0.05, 0.12, 0.30)
  );

  // Silver-white for constructive peaks
  vec3 peakCol = palette(
    peaks * 0.6 + t * 0.015 + paletteShift + 0.15,
    vec3(0.50, 0.52, 0.55),
    vec3(0.30, 0.32, 0.35),
    vec3(0.3, 0.5, 0.7),
    vec3(0.08, 0.12, 0.20)
  );

  // Warm amber for strongest constructive zones
  vec3 warmCol = palette(
    peaks * 1.2 + paletteShift + 0.85,
    vec3(0.45, 0.35, 0.18),
    vec3(0.25, 0.18, 0.08),
    vec3(0.7, 0.5, 0.3),
    vec3(0.05, 0.08, 0.15)
  );

  // Harmonic layer color — subtle mid-blue
  vec3 harmonicCol = palette(
    harmonicIntensity * 0.5 + paletteShift + 0.4,
    vec3(0.10, 0.18, 0.28),
    vec3(0.08, 0.14, 0.22),
    vec3(0.3, 0.6, 0.8),
    vec3(0.05, 0.15, 0.30)
  );

  // ── Compose ──
  vec3 color = deepCol;

  // Silver peaks from primary interference
  color = mix(color, peakCol, smoothstep(0.4, 0.8, intensity));

  // Warm amber at strongest constructive points
  float strongPeak = smoothstep(0.75, 0.95, intensity);
  color = mix(color, warmCol, strongPeak * 0.5);

  // Harmonic layer adds fine detail
  color += harmonicCol * harmonicIntensity * 0.12;

  // Surface noise texture
  color += surfaceNoise;

  // ── Ripple highlight — sharp bright lines at wave crests ──
  float crest = smoothstep(0.92, 1.0, intensity);
  color += vec3(0.5, 0.55, 0.6) * crest * 0.3;

  // ── Source point glow — faint light at each emitter ──
  float srcGlow = 0.0;
  srcGlow += 0.004 / (d0 * d0 + 0.004);
  srcGlow += 0.004 / (d1 * d1 + 0.004);
  srcGlow += 0.004 / (d2 * d2 + 0.004);
  srcGlow += 0.003 / (d3 * d3 + 0.003);

  vec3 glowCol = palette(
    t * 0.02 + paletteShift + 0.2,
    vec3(0.40, 0.45, 0.50),
    vec3(0.25, 0.30, 0.35),
    vec3(0.4, 0.7, 0.9),
    vec3(0.05, 0.10, 0.25)
  );
  color += glowCol * srcGlow * 0.08;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
