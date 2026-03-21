import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Equinox — balance of light and dark halves, day/night divide.
// A celestial body where one hemisphere blazes with golden solar light
// and the other rests in deep blue-silver shadow, the terminator line
// between them alive with atmospheric scattering.

float terminator(vec2 uv, float offset) {
  float wobble = snoise(vec2(uv.y * 3.0, u_time * 0.1)) * 0.08;
  return smoothstep(-0.08, 0.08, uv.x + offset + wobble);
}

float atmosphere(vec2 uv, float t) {
  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float scatter = fbm(vec2(angle * 2.0 + t * 0.15, r * 5.0 - t * 0.2)) * 0.5 + 0.5;
  return scatter * smoothstep(0.7, 0.35, r);
}

float coronaRays(vec2 uv, float t) {
  float angle = atan(uv.y, uv.x);
  float rays = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = angle + fi * 0.785 + t * 0.05;
    rays += pow(abs(sin(a * 3.0 + fi * 1.3)), 12.0) * 0.15;
  }
  return rays;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);

  // The terminator line shifts with bass
  float shift = sin(t * 0.3) * 0.05 + u_bass * 0.08;
  float dayMask = terminator(uv, shift);
  float nightMask = 1.0 - dayMask;

  // Planetary disk
  float disk = smoothstep(0.52, 0.48, r);

  // Surface detail — terrain/cloud noise
  vec2 surfUv = uv * rot2(t * 0.02) * 3.0;
  float terrain = fbm(surfUv + vec2(t * 0.05, 0.0)) * 0.5 + 0.5;
  float clouds = snoise(surfUv * 0.8 + vec2(t * 0.08, t * 0.03)) * 0.5 + 0.5;

  // Atmosphere halo outside disk
  float halo = smoothstep(0.55, 0.4, r) - smoothstep(0.48, 0.4, r);
  float atmo = atmosphere(uv, t);

  // Corona on day side
  float corona = coronaRays(uv - vec2(0.5, 0.0), t) * smoothstep(0.7, 0.45, r);

  float paletteShift = u_amplitude * 0.25;

  // Day side palette — warm gold solar illumination
  vec3 dayCol = palette(
    terrain * 0.5 + t * 0.03 + paletteShift,
    vec3(0.6, 0.5, 0.3),
    vec3(0.4, 0.3, 0.2),
    vec3(0.8, 0.6, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Night side palette — deep blue-silver moonlight
  vec3 nightCol = palette(
    terrain * 0.3 + t * 0.02 + paletteShift + 0.5,
    vec3(0.1, 0.12, 0.2),
    vec3(0.1, 0.15, 0.25),
    vec3(0.3, 0.4, 0.7),
    vec3(0.6, 0.55, 0.7)
  );

  // Terminator glow — atmospheric scattering at the edge
  vec3 terminatorCol = palette(
    atmo + t * 0.05 + paletteShift + 0.25,
    vec3(0.7, 0.3, 0.2),
    vec3(0.4, 0.3, 0.3),
    vec3(0.5, 0.3, 0.5),
    vec3(0.0, 0.1, 0.2)
  );

  // Atmospheric halo color
  vec3 haloCol = palette(
    r + t * 0.04 + paletteShift + 0.7,
    vec3(0.3, 0.4, 0.6),
    vec3(0.2, 0.2, 0.3),
    vec3(0.5, 0.6, 0.9),
    vec3(0.1, 0.15, 0.3)
  );

  vec3 color = vec3(0.0);

  // Compose surface
  vec3 surfaceCol = mix(nightCol, dayCol, dayMask);
  surfaceCol += clouds * 0.12 * (dayMask * 0.8 + 0.2);

  // Terminator glow band
  float termBand = exp(-abs(uv.x + shift) * 8.0);
  surfaceCol += terminatorCol * termBand * (0.4 + u_mid * 0.6) * atmo;

  color += surfaceCol * disk;

  // Atmospheric halo
  color += haloCol * halo * (0.5 + u_mid * 0.5);

  // Corona rays on day side
  color += vec3(1.0, 0.85, 0.5) * corona * dayMask * 0.3 * (0.6 + u_treble * 0.6);

  // Faint stars in background
  vec2 starUv = uv * 40.0;
  vec2 starId = floor(starUv);
  vec2 starF = fract(starUv) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float star = (starH > 0.96) ? smoothstep(0.04, 0.0, length(starF)) * 0.6 : 0.0;
  color += vec3(star) * (1.0 - disk);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
