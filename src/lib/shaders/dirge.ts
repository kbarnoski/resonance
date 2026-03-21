import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Dirge — mournful waves, slow heavy undulations

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;

  // Multiple heavy wave layers — low frequency, slow motion
  float wave1 = sin(uv.x * 3.0 + t * 0.5 + fbm(uv * 2.0 + t * 0.1) * 2.0);
  float wave2 = sin(uv.x * 2.0 - t * 0.3 + uv.y * 1.5 + fbm(uv * 1.5 + t * 0.08 + 3.0) * 1.5);
  float wave3 = sin(uv.x * 4.0 + t * 0.4 + uv.y * 0.8 + fbm(uv * 3.0 + t * 0.06 + 7.0) * 1.0);

  // Combine into heavy undulation field
  float field = wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25;

  // Audio modulation — bass deepens the waves
  field += u_bass * sin(uv.y * 2.0 + t) * 0.3;

  // Wave crests and troughs
  float crest = smoothstep(0.3, 0.8, field);
  float trough = smoothstep(-0.3, -0.8, field);
  float mid = 1.0 - crest - trough;

  // Slow rotation of the wave field
  vec2 rotUV = rot2(t * 0.05) * uv;
  float secondaryWave = sin(rotUV.x * 5.0 + rotUV.y * 3.0 + t * 0.2);
  float interference = secondaryWave * 0.15;

  // Colors: deep ocean-dark, mournful blues and purples
  vec3 troughColor = palette(0.7 + u_amplitude * 0.12,
    vec3(0.003, 0.003, 0.008),
    vec3(0.008, 0.006, 0.018),
    vec3(1.0, 1.0, 1.0),
    vec3(0.55, 0.6, 0.8));

  vec3 midColor = palette(0.5 + u_mid * 0.1,
    vec3(0.008, 0.007, 0.015),
    vec3(0.015, 0.012, 0.03),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.55, 0.75));

  vec3 crestColor = palette(0.3 + u_treble * 0.08,
    vec3(0.015, 0.012, 0.025),
    vec3(0.025, 0.02, 0.05),
    vec3(1.0, 1.0, 1.0),
    vec3(0.45, 0.5, 0.7));

  // Compose
  vec3 color = troughColor * trough;
  color += midColor * mid * 0.5;
  color += crestColor * crest;
  color += midColor * interference;

  // Surface texture — fine ripples
  float ripple = snoise(uv * 15.0 + t * 0.5 + field * 2.0);
  ripple = smoothstep(0.3, 0.5, ripple) * 0.02;
  color += crestColor * ripple * (1.0 + u_treble * 0.5);

  // Depth gradient — darker toward bottom, as if looking into abyss
  float depth = smoothstep(0.5, -0.8, uv.y);
  color *= 0.6 + (1.0 - depth) * 0.4;

  // Heavy bass throb — entire field darkens and lightens slowly
  float throb = sin(t * 1.5) * 0.5 + 0.5;
  color *= 0.85 + throb * 0.15 * u_bass;

  // Faint foam on wave crests
  float foam = snoise(uv * 20.0 + t * 0.8) * crest;
  foam = smoothstep(0.5, 0.8, foam) * 0.02;
  color += vec3(foam * 0.5, foam * 0.4, foam * 0.6);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
