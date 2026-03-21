import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Riptide — undertow current, pull pattern against surface flow

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // Two opposing flow fields: surface goes right, undertow pulls left and down
  vec2 surfaceFlow = vec2(t * 0.6, 0.0);
  vec2 undertowFlow = vec2(-t * 0.4, -t * 0.3);

  // Surface water — flowing right with wave patterns
  vec2 surfUV = uv + surfaceFlow;
  float surfNoise = fbm(surfUV * 3.0) * 0.5 + 0.5;
  float surfWaves = sin(surfUV.x * 8.0 + surfUV.y * 2.0 + t) * 0.5 + 0.5;
  surfWaves *= snoise(surfUV * 5.0 + t * 0.2) * 0.3 + 0.7;

  // Undertow — pulling in opposite direction, visible in lower half
  vec2 underUV = uv + undertowFlow;
  float underNoise = fbm(underUV * 2.5 + 3.0) * 0.5 + 0.5;

  // Conflict zone — where surface meets undertow, creates turbulence
  float conflictY = -0.05 + snoise(vec2(uv.x * 3.0, t * 0.3)) * 0.08;
  float surfaceMask = smoothstep(conflictY - 0.15, conflictY + 0.15, uv.y);
  float undertowMask = 1.0 - surfaceMask;

  // Turbulent mixing at the boundary
  float turbZone = 1.0 - abs(uv.y - conflictY) * 4.0;
  turbZone = max(turbZone, 0.0);
  vec2 turbUV = uv * rot2(snoise(uv * 3.0 + t * 0.5) * 0.5);
  float turb = fbm(turbUV * 6.0 + vec2(t * 0.8, -t * 0.3)) * turbZone;

  // Pulling streaks — visible lines of current pulling outward
  float streaks = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float streakX = (fi - 2.5) * 0.3 + snoise(vec2(fi * 5.0, t * 0.2)) * 0.1;
    float dx = uv.x - streakX;
    float streakWidth = 0.03 + u_bass * 0.01;
    float streak = exp(-dx * dx / (streakWidth * streakWidth));

    // Streak flows downward with undertow speed
    float streakFlow = snoise(vec2(dx * 5.0, uv.y * 4.0 + t * (1.0 + fi * 0.2)));
    streak *= (streakFlow * 0.5 + 0.5) * undertowMask;
    streaks += streak * (0.4 - fi * 0.04);
  }

  // Foam at the conflict boundary
  float foamNoise = snoise(vec2(uv.x * 15.0 + t * 2.0, uv.y * 15.0));
  float foam = turbZone * (foamNoise * 0.5 + 0.5);
  foam = pow(foam, 2.0) * (0.5 + u_treble * 0.5);

  // Colors — ocean blues with contrasting warm/cool for the two flows
  vec3 surfColor = palette(
    surfNoise * 0.4 + surfWaves * 0.2 + paletteShift,
    vec3(0.06, 0.15, 0.22),
    vec3(0.06, 0.15, 0.18),
    vec3(0.4, 0.7, 0.8),
    vec3(0.1, 0.2, 0.3)
  );

  vec3 underColor = palette(
    underNoise * 0.4 + paletteShift + 0.3,
    vec3(0.02, 0.06, 0.14),
    vec3(0.03, 0.08, 0.15),
    vec3(0.3, 0.5, 0.7),
    vec3(0.15, 0.25, 0.4)
  );

  vec3 streakColor = palette(
    streaks * 0.3 + paletteShift + 0.5,
    vec3(0.08, 0.15, 0.2),
    vec3(0.08, 0.12, 0.18),
    vec3(0.5, 0.6, 0.7),
    vec3(0.1, 0.15, 0.25)
  );

  // Compose
  vec3 color = mix(underColor, surfColor, surfaceMask);
  color = mix(color, streakColor, clamp(streaks, 0.0, 1.0) * 0.6);
  color += vec3(turb * 0.15, turb * 0.2, turb * 0.25) * u_mid;
  color += vec3(0.7, 0.75, 0.8) * foam * 0.4;

  // Bass: strengthens the undertow darkness
  color = mix(color, underColor * 0.5, u_bass * undertowMask * 0.25);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
