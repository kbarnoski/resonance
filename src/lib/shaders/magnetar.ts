import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Magnetar — ultra-magnetized neutron star with extreme field lines curving
// from poles, X-ray bursts along field lines, intense pulsing radiation.

// Magnetic field line — dipole field shape
float fieldLine(vec2 uv, float phase, float t, float strength) {
  // Dipole field: parametric curve r = sin^2(theta)
  float angle = atan(uv.y, uv.x);
  float r = length(uv);

  // Multiple field lines at different phases
  float fieldAngle = angle + phase;

  // Dipole shape — r proportional to sin^2(theta) from pole axis
  float sinA = sin(fieldAngle);
  float dipoleR = strength * sinA * sinA;

  // Distance from point to this field line curve
  float diff = abs(r - dipoleR);
  float lineWidth = 0.006 + 0.003 * sin(t * 2.0 + phase * 5.0);

  return smoothstep(lineWidth * 3.0, 0.0, diff) * smoothstep(0.01, 0.05, r);
}

// X-ray burst along field line
float xrayBurst(vec2 uv, float t, float phase) {
  float angle = atan(uv.y, uv.x) + phase;
  float r = length(uv);

  // Burst travels outward along field line
  float burstPos = fract(t * 0.4 + phase * 0.3) * 0.8;
  float sinA = sin(angle);
  float targetR = 0.6 * sinA * sinA;

  // Burst is a bright spot moving along the field line
  float burstR = mix(0.02, targetR, burstPos);
  float burstAngle = angle;

  vec2 burstP = vec2(cos(burstAngle - phase), sin(burstAngle - phase)) * burstR;
  float dist = length(uv - burstP);

  float burst = exp(-dist * dist * 800.0);
  // Trailing afterglow
  burst += exp(-dist * dist * 200.0) * 0.4;

  return burst * step(0.1, burstPos) * smoothstep(0.9, 0.7, burstPos);
}

// Magnetosphere distortion — warped space around the star
float magnetosphere(vec2 uv, float t) {
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Closed magnetosphere boundary
  float boundaryR = 0.5 + 0.1 * sin(angle * 2.0 + t * 0.3);
  float boundary = smoothstep(0.03, 0.0, abs(r - boundaryR));
  boundary *= exp(-abs(r - boundaryR) * 20.0);

  return boundary * 0.5;
}

// Radiation pressure waves
float radiationWaves(vec2 uv, float t, float bass) {
  float r = length(uv);
  float waves = 0.0;

  // Expanding shells of radiation
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float waveR = fract(t * 0.15 + fi * 0.2) * 1.5;
    float waveWidth = 0.02 + bass * 0.01;
    float waveBright = (1.0 - fract(t * 0.15 + fi * 0.2));
    waves += smoothstep(waveWidth, 0.0, abs(r - waveR)) * waveBright * 0.3;
  }
  return waves;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.25;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Slowly rotate the entire field to show it is spinning
  vec2 uvRot = rot2(t * 0.2) * uv;

  // ── Magnetar core — tiny, impossibly dense ──
  float coreGlow = 0.002 / (r * r + 0.0001);
  float coreSharp = exp(-r * 60.0) * 5.0;
  // Pulsing with bass
  float corePulse = 1.0 + u_bass * 0.8 + sin(t * 4.0) * 0.2;
  coreGlow *= corePulse;
  coreSharp *= corePulse;

  // ── Magnetic field lines — dipole configuration ──
  float fields = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float phase = fi * 0.785398; // pi/4 spacing
    float strength = 0.4 + 0.2 * sin(t * 0.5 + fi * 1.3);
    strength *= (0.8 + u_bass * 0.5);
    fields += fieldLine(uvRot, phase, t, strength);
  }

  // ── X-ray bursts traveling along field lines ──
  float xrays = 0.0;
  xrays += xrayBurst(uvRot, t, 0.0) * (0.5 + u_treble * 1.5);
  xrays += xrayBurst(uvRot, t * 1.1, 1.57) * (0.5 + u_treble * 1.2);
  xrays += xrayBurst(uvRot, t * 0.9, 3.14) * (0.5 + u_treble * 1.0);
  xrays += xrayBurst(uvRot, t * 1.2, 4.71) * (0.5 + u_treble * 0.8);

  // ── Magnetosphere boundary ──
  float magBound = magnetosphere(uvRot, t);

  // ── Radiation pressure waves ──
  float radWaves = radiationWaves(uv, t, u_bass);

  // ── Polar jets — intense beams from magnetic poles ──
  float polarAngle = abs(atan(uvRot.x, uvRot.y));
  float jetWidth = 0.08 + u_bass * 0.03;
  float jet1 = smoothstep(jetWidth, 0.0, polarAngle) * smoothstep(0.05, 0.15, r);
  float jet1Brightness = exp(-r * 1.5) * (0.8 + u_amplitude * 1.0);
  // Opposite pole
  float polarAngle2 = abs(atan(uvRot.x, -uvRot.y));
  float jet2 = smoothstep(jetWidth, 0.0, polarAngle2) * smoothstep(0.05, 0.15, r);
  float jet2Brightness = exp(-r * 1.5) * (0.8 + u_amplitude * 1.0);

  // Jet turbulence
  float jetNoise = snoise(uvRot * 8.0 + t * 0.5) * 0.5 + 0.5;
  jet1 *= (0.6 + jetNoise * 0.5);
  jet2 *= (0.6 + jetNoise * 0.5);

  // ── Ambient magnetic field distortion — fbm texture ──
  float fieldTexture = fbm(uvRot * 3.0 + t * 0.05) * 0.5 + 0.5;
  fieldTexture *= exp(-r * 2.0) * 0.15;

  // ── Colors ──
  // Background — deep violet void
  vec3 bgCol = palette(
    r * 0.3 + t * 0.01 + paletteShift,
    vec3(0.03, 0.02, 0.06),
    vec3(0.04, 0.02, 0.08),
    vec3(0.5, 0.2, 0.8),
    vec3(0.15, 0.05, 0.3)
  );

  // Field lines — electric blue-purple
  vec3 fieldCol = palette(
    fields * 2.0 + angle * 0.1 + t * 0.05 + paletteShift,
    vec3(0.5, 0.4, 0.6),
    vec3(0.4, 0.3, 0.5),
    vec3(0.3, 0.5, 1.0),
    vec3(0.1, 0.15, 0.4)
  );

  // X-ray bursts — brilliant white-blue
  vec3 xrayCol = palette(
    xrays + t * 0.1 + paletteShift + 0.7,
    vec3(0.8, 0.85, 0.95),
    vec3(0.2, 0.15, 0.1),
    vec3(0.3, 0.4, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  // Core — intense white-hot
  vec3 coreCol = palette(
    t * 0.15 + paletteShift,
    vec3(0.95, 0.9, 1.0),
    vec3(0.05, 0.1, 0.05),
    vec3(0.2, 0.1, 0.3),
    vec3(0.0, 0.0, 0.1)
  );

  // Jet color — hot pink-white gamma radiation
  vec3 jetCol = palette(
    r * 0.5 + t * 0.08 + paletteShift + 0.4,
    vec3(0.7, 0.5, 0.7),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.2, 0.6),
    vec3(0.1, 0.0, 0.2)
  );

  // Radiation wave color
  vec3 radCol = palette(
    radWaves * 3.0 + t * 0.06 + paletteShift + 0.5,
    vec3(0.5, 0.5, 0.6),
    vec3(0.3, 0.3, 0.4),
    vec3(0.4, 0.6, 0.9),
    vec3(0.1, 0.2, 0.4)
  );

  vec3 color = bgCol;

  // Radiation waves (outermost)
  color += radCol * radWaves * (0.5 + u_mid * 0.5);

  // Magnetosphere boundary
  color += fieldCol * magBound;

  // Field lines
  color += fieldCol * fields * (0.6 + u_mid * 0.6);

  // Ambient field texture
  color += fieldCol * fieldTexture;

  // Polar jets
  color += jetCol * jet1 * jet1Brightness;
  color += jetCol * jet2 * jet2Brightness;

  // X-ray bursts
  color += xrayCol * xrays * 2.0;

  // Core
  color += coreCol * (coreGlow + coreSharp);
  color += vec3(1.3, 1.2, 1.5) * exp(-r * 25.0) * corePulse;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, r);
  color *= vignette;

  // Tonemap
  color = color / (color + 0.6);
  color = pow(color, vec3(0.88));

  gl_FragColor = vec4(color, 1.0);
}
`;
