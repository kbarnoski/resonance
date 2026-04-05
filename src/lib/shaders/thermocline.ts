import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Thermocline — Temperature boundary layer in water: warm/cool colors meeting and mixing

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;

  // The boundary — a wavy horizontal line that separates warm above from cool below
  float boundaryBase = sin(uv.x * 2.0 + t * 1.5) * 0.08
                     + sin(uv.x * 4.5 + t * 2.3) * 0.04;
  float boundaryNoise = fbm3(vec2(uv.x * 2.0 + t * 0.5, t * 0.3)) * 0.12;
  float boundary = boundaryBase + boundaryNoise;
  boundary *= (1.0 + u_bass * 0.3);

  // Distance from boundary — positive = warm side, negative = cool side
  float dist = uv.y - boundary;
  float absDist = abs(dist);

  // Mixing zone — turbulent diffusion at the interface
  float mixZone = smoothstep(0.15, 0.0, absDist);
  float turbulence = fbm3(uv * 5.0 + vec2(t * 1.5, t * 0.8));
  float mixing = mixZone * (0.5 + 0.5 * turbulence);
  mixing *= (0.6 + u_mid * 0.5);

  // Kelvin-Helmholtz instability — rolling wave patterns at the interface
  float khWave = sin(uv.x * 8.0 + t * 3.0 + turbulence * 3.0) * 0.5 + 0.5;
  khWave *= mixZone;
  float khRoll = snoise(vec2(uv.x * 4.0 + t * 2.0, dist * 20.0));
  khRoll = smoothstep(0.0, 0.5, khRoll) * mixZone * 0.4;

  // Temperature field — smooth gradient with noise perturbation
  float warmField = smoothstep(-0.1, 0.3, dist) + fbm3(uv * 2.0 + vec2(t * 0.3, 0.0)) * 0.15;
  float coolField = smoothstep(0.1, -0.3, dist) + fbm3(uv * 2.0 + vec2(0.0, t * 0.3)) * 0.15;

  // Convection currents — warm water rising, cool sinking
  float convection = snoise(vec2(uv.x * 3.0 + t * 0.8, uv.y * 2.0 - t * 0.5 * sign(dist)));
  convection = abs(convection) * 0.2;

  // Particle-like detail at interface
  float particles = snoise(uv * 15.0 + vec2(t * 2.0));
  particles = pow(max(particles, 0.0), 5.0) * mixZone * u_treble * 0.5;

  // ── Color ──
  // Warm water — amber/coral tones
  vec3 warmColor = palette(
    warmField * 0.4 + convection * 0.2 + t * 0.05 + u_amplitude * 0.1,
    vec3(0.25, 0.10, 0.06),
    vec3(0.30, 0.15, 0.08),
    vec3(0.8, 0.5, 0.3),
    vec3(0.02, 0.15, 0.28)
  );

  // Cool water — deep blue/teal tones
  vec3 coolColor = palette(
    coolField * 0.4 + convection * 0.2 + t * 0.05,
    vec3(0.04, 0.10, 0.20),
    vec3(0.05, 0.15, 0.25),
    vec3(0.3, 0.6, 0.8),
    vec3(0.08, 0.20, 0.38)
  );

  // Interface color — where both temperatures meet, creates unique hues
  vec3 interfaceColor = palette(
    mixing * 0.5 + khWave * 0.3 + t * 0.08,
    vec3(0.15, 0.15, 0.18),
    vec3(0.20, 0.18, 0.22),
    vec3(0.7, 0.6, 0.8),
    vec3(0.10, 0.20, 0.35)
  );

  // Temperature blend factor
  float tempBlend = smoothstep(-0.15, 0.15, dist + turbulence * 0.1 * mixZone);

  // Build
  vec3 color = mix(coolColor, warmColor, tempBlend);

  // Interface mixing
  color = mix(color, interfaceColor, mixing * 0.5);

  // K-H rolling waves
  color += interfaceColor * khRoll;

  // Convection detail
  color += (dist > 0.0 ? warmColor : coolColor) * convection * 0.3;

  // Interface particles
  color += vec3(0.6, 0.5, 0.7) * particles;

  // Subtle shimmer at the boundary
  float shimmer = sin(uv.x * 30.0 + t * 5.0) * sin(dist * 50.0);
  shimmer = max(shimmer, 0.0) * mixZone * 0.06;
  color += vec3(0.5, 0.6, 0.7) * shimmer;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
