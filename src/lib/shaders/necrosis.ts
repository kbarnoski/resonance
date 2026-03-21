import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + VORONOI + `
// Tissue death/decay — cells darkening from center outward

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Cellular structure via voronoi at multiple scales
  vec3 v1 = voronoi(uv * 5.0 + t * 0.05);
  vec3 v2 = voronoi(uv * 12.0 + vec2(3.0, 7.0) + t * 0.03);

  // Cell walls — the membrane between cells
  float cellWall = smoothstep(0.02, 0.08, v1.y - v1.x);
  float fineWall = smoothstep(0.03, 0.1, v2.y - v2.x);

  // Necrosis front — spreads from center outward with organic irregularity
  float distFromCenter = length(uv);
  float necrosisNoise = fbm(uv * 3.0 + t * 0.1) * 0.3;
  float necrosisFront = distFromCenter - (0.1 + t * 0.06 + necrosisNoise);
  float necrosed = smoothstep(0.1, -0.05, necrosisFront);

  // Dying cells: transitional zone
  float dying = smoothstep(0.2, 0.0, necrosisFront) - smoothstep(0.0, -0.1, necrosisFront);

  // Healthy tissue — still very dark, just slightly more luminous
  float healthGlow = (1.0 - necrosed) * 0.06;
  healthGlow *= (v1.x * 0.5 + 0.5);

  vec3 healthColor = palette(v1.x + u_mid * 0.1,
    vec3(0.02, 0.015, 0.02),
    vec3(0.03, 0.02, 0.03),
    vec3(1.0, 1.0, 1.0),
    vec3(0.3, 0.2, 0.4));

  // Necrosed tissue — near black with faint bruise tones
  vec3 deadColor = palette(0.7 + u_amplitude * 0.15,
    vec3(0.005, 0.003, 0.005),
    vec3(0.015, 0.008, 0.012),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.15, 0.3));

  // Dying zone — sickly transition
  vec3 dyingColor = palette(0.45 + u_bass * 0.12,
    vec3(0.015, 0.012, 0.008),
    vec3(0.03, 0.02, 0.015),
    vec3(1.0, 1.0, 1.0),
    vec3(0.2, 0.3, 0.15));

  // Cell membrane color
  vec3 membraneColor = palette(0.6,
    vec3(0.01, 0.008, 0.012),
    vec3(0.02, 0.015, 0.025),
    vec3(1.0, 1.0, 1.0),
    vec3(0.35, 0.25, 0.45));

  // Compose
  vec3 color = healthColor * healthGlow;
  color = mix(color, deadColor, necrosed);
  color = mix(color, dyingColor * 0.06, dying);

  // Cell walls — visible as faint lines
  float wallVis = cellWall * 0.04 * (1.0 - necrosed * 0.7);
  color += membraneColor * wallVis;
  color += membraneColor * fineWall * 0.015 * (1.0 - necrosed * 0.5);

  // Bass: necrosis pulses deeper
  color *= 1.0 - necrosed * u_bass * 0.25;

  // Treble: flickering in dying cells
  float flicker = snoise(uv * 15.0 + t * 4.0);
  color += dyingColor * smoothstep(0.6, 0.9, flicker) * dying * u_treble * 0.06;

  // Faint internal glow in healthy cells reacting to mid
  float cellGlow = exp(-v1.x * 6.0) * (1.0 - necrosed) * u_mid * 0.03;
  color += healthColor * cellGlow;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
