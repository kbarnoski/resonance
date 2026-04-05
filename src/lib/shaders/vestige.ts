import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Ancient light traces: ghost-like luminous trails of something that passed
// long ago — fading afterimages, spectral echoes, temporal residue.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Ghost trails — curved paths through space at different phases of fading
  for (int trail = 0; trail < 5; trail++) {
    float ft = float(trail);
    float trailSeed = ft * 2.7 + 1.3;

    // Each trail follows a different curved path
    float pathPhase = t * (0.3 + ft * 0.08) + ft * 1.2;
    float pathCurve = sin(pathPhase) * 0.4;
    float pathY = cos(pathPhase * 0.7 + ft) * 0.35;

    // Sample multiple points along the trail (afterimages)
    for (int echo = 0; echo < 8; echo++) {
      float fe = float(echo);
      float delay = fe * 0.08;
      float echoPhase = pathPhase - delay * 2.0;

      vec2 echoPos = vec2(
        sin(echoPhase) * 0.4 + cos(echoPhase * 1.3 + ft) * 0.2,
        cos(echoPhase * 0.7 + ft) * 0.35 + sin(echoPhase * 0.5) * 0.15
      );

      float echoDist = length(uv - echoPos);
      float echoFade = exp(-fe * 0.4); // older echoes dimmer
      float echoGlow = exp(-echoDist * echoDist * (40.0 + fe * 20.0)) * echoFade;

      vec3 echoCol = palette(
        ft * 0.2 + fe * 0.05 + paletteShift,
        vec3(0.5, 0.45, 0.4),
        vec3(0.4, 0.35, 0.3),
        vec3(1.0, 0.85, 0.6),
        vec3(0.05, 0.1, 0.25)
      );

      // Older echoes shift toward violet
      float ageShift = fe * 0.03;
      echoCol = mix(echoCol, vec3(0.4, 0.3, 0.6), ageShift);

      color += echoCol * echoGlow * (0.5 + 0.5 * u_mid);
    }
  }

  // Residual light field — fbm texture of ancient light
  float residue = fbm(uv * 3.0 + vec2(t * 0.1, -t * 0.07));
  residue = smoothstep(-0.1, 0.4, residue) * 0.15;
  vec3 residueCol = palette(
    residue * 3.0 + paletteShift + 0.5,
    vec3(0.4, 0.35, 0.45),
    vec3(0.3, 0.25, 0.35),
    vec3(0.8, 0.9, 1.1),
    vec3(0.2, 0.1, 0.35)
  );
  color += residueCol * residue * smoothstep(1.1, 0.3, r);

  // Temporal dust — fine noise particles
  float dust = snoise(uv * 15.0 + t * 0.8);
  dust = pow(max(dust, 0.0), 4.0) * 0.2 * u_treble;
  color += vec3(0.8, 0.75, 0.65) * dust * smoothstep(1.0, 0.2, r);

  // Faint radial streaks — as if light smeared over aeons
  float a = atan(uv.y, uv.x);
  float streak = sin(a * 7.0 + t * 0.3 + snoise(vec2(a * 3.0, t * 0.2)) * 2.0);
  streak = pow(max(streak, 0.0), 6.0) * exp(-r * 4.0) * 0.3 * (0.5 + 0.5 * u_bass);
  vec3 streakCol = palette(
    a * 0.15 + paletteShift + 0.3,
    vec3(0.6, 0.5, 0.4),
    vec3(0.3, 0.3, 0.3),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.1, 0.2)
  );
  color += streakCol * streak;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
