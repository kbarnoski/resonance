import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Voyager — deep space probe, signal waves fading into void.
// Radio transmissions radiate outward from a tiny probe,
// growing weaker as they traverse the interstellar medium.

float signalWave(vec2 uv, vec2 source, float freq, float t, float decay) {
  float d = length(uv - source);
  float wave = sin(d * freq - t * 3.0) * 0.5 + 0.5;
  wave *= exp(-d * decay);
  return wave;
}

float probeBody(vec2 uv, vec2 pos) {
  // Simple probe shape — dish and body
  float body = smoothstep(0.015, 0.008, length(uv - pos));
  vec2 dishOffset = pos + vec2(-0.02, 0.01);
  float dish = smoothstep(0.025, 0.018, length((uv - dishOffset) / vec2(1.0, 0.5)));
  return max(body, dish);
}

float dataStream(vec2 uv, float angle, float t) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(uv, dir);
  float perp = abs(dot(uv, vec2(-dir.y, dir.x)));
  float bits = sin(proj * 50.0 - t * 8.0) * 0.5 + 0.5;
  bits = step(0.6, bits);
  float beam = smoothstep(0.008, 0.0, perp) * smoothstep(0.0, 0.02, proj);
  return beam * bits * exp(-proj * 2.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Probe position — slowly drifting
  vec2 probePos = vec2(-0.3 + sin(t * 0.1) * 0.02, 0.1 + cos(t * 0.08) * 0.015);

  // Signal waves emanating from probe
  float signal = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float phase = fi * 1.05;
    float freq = 25.0 + fi * 5.0;
    float decay = 1.5 + fi * 0.3;
    signal += signalWave(uv, probePos, freq, t + phase, decay) * (0.3 - fi * 0.04);
  }

  // Data stream — directional transmission toward Earth
  float earthAngle = 0.7 + sin(t * 0.05) * 0.1;
  vec2 relUv = uv - probePos;
  float data = dataStream(relUv, earthAngle, t);
  data *= (0.5 + u_treble * 0.8);

  // The probe itself
  float probe = probeBody(uv, probePos);

  // Interstellar medium — thin wisps of gas
  float ism = fbm(uv * 2.0 + vec2(t * 0.05, t * 0.03)) * 0.5 + 0.5;
  ism = smoothstep(0.4, 0.7, ism) * 0.15;

  // Distant stars — the void is mostly empty
  float stars = 0.0;
  vec2 starUv = uv * 60.0;
  vec2 starId = floor(starUv);
  vec2 starF = fract(starUv) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  if (starH > 0.97) {
    float twinkle = 0.5 + 0.5 * sin(u_time * (1.0 + starH * 3.0) + starH * 50.0);
    stars = smoothstep(0.03, 0.0, length(starF)) * twinkle * 0.3;
  }

  // Pale blue dot — Earth in the distance
  vec2 earthPos = probePos + vec2(cos(earthAngle), sin(earthAngle)) * 0.7;
  float earth = exp(-length(uv - earthPos) * 40.0) * 0.6;
  float earthTwinkle = 0.7 + 0.3 * sin(t * 2.0);
  earth *= earthTwinkle;

  // Heliosphere boundary — faint bow shock
  float helioR = length(uv + vec2(0.5, 0.0));
  float helioBow = smoothstep(0.01, 0.0, abs(helioR - 0.6)) * 0.2;
  helioBow *= (0.4 + u_bass * 0.4);

  float paletteShift = u_amplitude * 0.2;

  // Signal color — fading golden transmission
  vec3 signalCol = palette(
    signal + t * 0.04 + paletteShift,
    vec3(0.5, 0.5, 0.4),
    vec3(0.25, 0.2, 0.15),
    vec3(0.6, 0.4, 0.2),
    vec3(0.05, 0.08, 0.15)
  );

  // Data stream color — bright white-blue digital
  vec3 dataCol = palette(
    data + t * 0.1 + paletteShift + 0.3,
    vec3(0.6, 0.7, 0.85),
    vec3(0.2, 0.2, 0.25),
    vec3(0.4, 0.5, 0.8),
    vec3(0.1, 0.1, 0.25)
  );

  // ISM color — deep purple void dust
  vec3 ismCol = palette(
    ism + t * 0.02 + paletteShift + 0.6,
    vec3(0.1, 0.08, 0.18),
    vec3(0.05, 0.05, 0.1),
    vec3(0.3, 0.2, 0.5),
    vec3(0.15, 0.1, 0.3)
  );

  vec3 color = vec3(0.0);

  // Deep void background
  color += vec3(0.01, 0.008, 0.02);

  // Interstellar medium
  color += ismCol * ism * (0.4 + u_mid * 0.4);

  // Stars
  color += vec3(0.8, 0.85, 1.0) * stars;

  // Heliosphere boundary
  color += vec3(0.15, 0.2, 0.35) * helioBow;

  // Signal waves
  color += signalCol * signal * (0.5 + u_bass * 0.5);

  // Data stream
  color += dataCol * data;

  // Earth — pale blue dot
  color += vec3(0.3, 0.5, 0.9) * earth * (0.6 + u_mid * 0.4);

  // Probe
  color += vec3(0.9, 0.85, 0.7) * probe;

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
