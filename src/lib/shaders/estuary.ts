import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Estuary — Where river meets ocean: mixing currents of different colors/densities

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

  // Two water bodies — river flows from left, ocean from right
  // The meeting line curves and shifts

  // Meeting boundary — a flowing organic line
  float meetLine = sin(uv.y * 3.0 + t * 1.5) * 0.12
                 + sin(uv.y * 7.0 + t * 2.3) * 0.05;
  meetLine += fbm3(vec2(uv.y * 1.5 + t * 0.4, t * 0.2)) * 0.15;
  meetLine *= (1.0 + u_bass * 0.3);

  // Distance from meeting line
  float dist = uv.x - meetLine;

  // River current — flows downward (in screen space, from top)
  vec2 riverUV = uv + vec2(-t * 0.5, -t * 1.5);
  float riverFlow = fbm3(riverUV * 2.5);
  float riverTurb = fbm3(riverUV * 4.0 + vec2(30.0));

  // Ocean current — flows horizontally, slower
  vec2 oceanUV = uv + vec2(t * 0.8, t * 0.2);
  float oceanFlow = fbm3(oceanUV * 1.8);
  float oceanSwell = sin(oceanUV.x * 3.0 + oceanUV.y * 1.5 + t * 2.0) * 0.5 + 0.5;

  // Mixing zone — turbulent where waters meet
  float mixZone = smoothstep(0.2, 0.0, abs(dist));
  float mixing = fbm3(uv * 4.0 + vec2(t * 1.0, t * 0.6));
  mixing = abs(mixing) * mixZone;
  mixing *= (0.6 + u_mid * 0.5);

  // Sediment plume — river carries sediment into the ocean
  float sediment = smoothstep(0.0, -0.3, dist); // more on river side
  sediment *= (0.5 + 0.5 * riverTurb);
  // Sediment spreads into ocean near the boundary
  float sedimentSpread = smoothstep(0.3, 0.0, dist) * smoothstep(-0.4, -0.1, dist);
  sedimentSpread *= mixing;

  // Eddies at the confluence — circular mixing patterns
  vec2 eddyCenter = vec2(meetLine + 0.05, sin(t * 0.5) * 0.15);
  vec2 toEddy = uv - eddyCenter;
  float eddyR = length(toEddy);
  float eddyAngle = atan(toEddy.y, toEddy.x) + t * 1.5;
  float eddy = sin(eddyAngle * 3.0 + eddyR * 15.0) * 0.5 + 0.5;
  eddy *= smoothstep(0.3, 0.05, eddyR) * 0.3;
  eddy *= (0.4 + u_treble * 0.4);

  // Surface ripples
  float ripple = snoise(uv * 12.0 + vec2(t * 2.0, t * 1.5));
  ripple = abs(ripple) * 0.1;

  // Foam at convergence
  float foam = pow(mixZone, 2.0) * smoothstep(0.1, 0.4, mixing);
  foam *= 0.3 * (0.5 + u_treble * 0.4);

  // ── Color ──
  // River water — warm brown/amber with sediment
  vec3 riverColor = palette(
    riverFlow * 0.3 + sediment * 0.2 + t * 0.05 + u_amplitude * 0.1,
    vec3(0.12, 0.08, 0.04),
    vec3(0.18, 0.12, 0.06),
    vec3(0.7, 0.5, 0.3),
    vec3(0.05, 0.12, 0.22)
  );

  // Ocean water — deep blue/teal
  vec3 oceanColor = palette(
    oceanFlow * 0.3 + oceanSwell * 0.15 + t * 0.04,
    vec3(0.03, 0.10, 0.18),
    vec3(0.04, 0.14, 0.22),
    vec3(0.3, 0.6, 0.8),
    vec3(0.06, 0.18, 0.35)
  );

  // Mixing zone — unique intermediate hues
  vec3 mixColor = palette(
    mixing * 0.5 + eddy * 0.3 + t * 0.07,
    vec3(0.10, 0.12, 0.12),
    vec3(0.15, 0.14, 0.12),
    vec3(0.6, 0.5, 0.5),
    vec3(0.08, 0.18, 0.28)
  );

  // Sediment color — turbid golden brown
  vec3 sedimentColor = palette(
    sedimentSpread * 0.4 + t * 0.06,
    vec3(0.18, 0.12, 0.05),
    vec3(0.20, 0.15, 0.06),
    vec3(0.6, 0.45, 0.25),
    vec3(0.04, 0.10, 0.18)
  );

  // Water body blend — based on position relative to meeting line
  float waterBlend = smoothstep(-0.2, 0.2, dist + mixing * 0.15 * (snoise(uv * 3.0 + vec2(t)) > 0.0 ? 1.0 : -1.0));
  vec3 color = mix(riverColor, oceanColor, waterBlend);

  // Mixing zone overlay
  color = mix(color, mixColor, mixing * 0.4);

  // Sediment plume
  color = mix(color, sedimentColor, sedimentSpread * 0.4);

  // Eddies
  color += mixColor * eddy;

  // Foam
  color += vec3(0.5, 0.55, 0.5) * foam;

  // Surface ripples
  color += (waterBlend > 0.5 ? oceanColor : riverColor) * ripple;

  // Subtle depth variation
  float depthVar = fbm3(uv * 0.8 + vec2(t * 0.1));
  color *= 0.9 + depthVar * 0.15;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
