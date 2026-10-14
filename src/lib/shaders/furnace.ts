import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";
import { deriveFrag, fieldGrid } from "./prepass-pack";

// PERF (2026-10-14, the 120 fps law, pass 3): the heat field (a 4-octave
// fbm, smooth on a ~90 px scale) is computed once per 3x3 pixels in a float
// prepass (PRE, the same code at the same points) and interpolated. The
// convection warp stays per pixel: the sparks are fract() of a noise of it,
// and flip under any sub-pixel change of the warp (measured: a 2e-6
// perturbation of the original moves ~300 spark pixels). ORIG
// is the reference and the no-float fallback. A/B: scripts/perf/shader-ab.mjs.
export const ORIG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Industrial furnace — deep inside, everything is hot pressure and red-black.
// Convection currents, radiant heat, the weight of extreme temperature.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // ── Convection currents — hot air rising, distorting everything ──
  vec2 convUV = uv + vec2(0.0, t * 0.3);
  float conv1 = fbm4(convUV * 2.0 + vec2(t * 0.2, -t * 0.5));
  float conv2 = fbm4(convUV * 3.0 * rot2(0.3) + vec2(-t * 0.15, -t * 0.4));

  // Distortion from heat shimmer
  vec2 heatDistort = vec2(conv1, conv2) * 0.15;
  vec2 distortedUV = uv + heatDistort;

  // ── Radiant heat field — temperature map ──
  float heatField = fbm4(distortedUV * 1.5 + vec2(t * 0.1, -t * 0.2));
  float temperature = smoothstep(-0.4, 0.5, heatField);

  // Bass pumps up the temperature
  temperature += u_bass * 0.3;
  temperature = clamp(temperature, 0.0, 1.2);

  // ── Furnace walls — dark refractory material visible at edges ──
  float wallDist = max(abs(uv.x), abs(uv.y * 0.7));
  float walls = smoothstep(0.5, 0.7, wallDist);
  // (only seen through walls, exactly 0 inside 0.5 — PERF 2026-10-13: skipped there)
  float wallTexture = walls > 0.0 ? fbm4(distortedUV * 5.0 + 10.0) * 0.5 + 0.5 : 0.0;

  // ── Hot spots — concentrated heat zones ──
  float hotspot1 = exp(-length(distortedUV - vec2(0.15, -0.2)) * 4.0);
  float hotspot2 = exp(-length(distortedUV - vec2(-0.2, 0.1)) * 3.0);
  float hotspots = (hotspot1 + hotspot2) * (0.5 + u_mid * 0.5);

  // ── Rising heat streaks ──
  float streaks = sin(distortedUV.x * 12.0 + conv1 * 5.0) * 0.5 + 0.5;
  streaks *= smoothstep(0.3, 0.7, streaks);
  streaks *= smoothstep(-0.5, 0.3, distortedUV.y); // only in upper portion
  streaks *= 0.2;

  // ── Colors ──
  // Base heat — dark red to bright orange based on temperature
  vec3 heatColor = palette(
    temperature * 1.5 + u_amplitude * 0.15,
    vec3(0.15, 0.03, 0.01),
    vec3(0.35, 0.12, 0.03),
    vec3(0.8, 0.4, 0.2),
    vec3(0.0, 0.05, 0.02)
  );

  // White-hot zones
  vec3 whiteHot = mix(heatColor, vec3(1.3, 1.1, 0.8), smoothstep(0.7, 1.1, temperature));

  // Furnace wall — dark sooty refractory
  vec3 wallColor = palette(
    wallTexture * 2.0 + t * 0.05,
    vec3(0.02, 0.015, 0.01),
    vec3(0.03, 0.02, 0.015),
    vec3(0.3, 0.2, 0.15),
    vec3(0.05, 0.03, 0.02)
  );

  // Streak color — luminous orange
  vec3 streakColor = palette(
    streaks * 3.0 + t * 0.3,
    vec3(0.3, 0.1, 0.03),
    vec3(0.3, 0.15, 0.05),
    vec3(0.8, 0.5, 0.2),
    vec3(0.0, 0.05, 0.05)
  );

  // ── Compositing ──
  vec3 color = whiteHot * (0.3 + temperature * 0.5);
  color += streakColor * streaks;
  color += heatColor * hotspots * 0.5;

  // Blend in furnace walls
  color = mix(color, wallColor, walls * 0.8);

  // Wall glow from reflected heat
  color += heatColor * walls * 0.05 * temperature;

  // Treble — sparks
  float sparks = pow(fract(snoise(distortedUV * 15.0 + t * 5.0) * 3.0), 15.0);
  color += vec3(1.2, 0.9, 0.4) * sparks * 0.3 * u_treble;

  // Overall pressure darkness — ambient is very dark
  color *= 0.7;

  // Vignette — furnace interior framing
  float vignette = 1.0 - smoothstep(0.3, 1.1, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;

const GRID = fieldGrid(1, 0);
export const PRE_SCALE = 1 / 3;

/** Field = (-, -, heatField). */
export const PRE =
  U +
  SMOOTH_NOISE +
  ROT2 +
  `
// Industrial furnace — deep inside, everything is hot pressure and red-black.
// Convection currents, radiant heat, the weight of extreme temperature.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}
` +
  GRID.pre +
  `
void main() {
  float block, row;
  vec2 fc = preTexel(block, row);
  vec2 uv = (fc - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  vec2 convUV = uv + vec2(0.0, t * 0.3);
  float conv1 = fbm4(convUV * 2.0 + vec2(t * 0.2, -t * 0.5));
  float conv2 = fbm4(convUV * 3.0 * rot2(0.3) + vec2(-t * 0.15, -t * 0.4));
  vec2 heatDistort = vec2(conv1, conv2) * 0.15;
  vec2 distortedUV = uv + heatDistort;
  float heatField = fbm4(distortedUV * 1.5 + vec2(t * 0.1, -t * 0.2));
  gl_FragColor = vec4(conv1, conv2, heatField, 1.0);
}
`;

export const FRAG = deriveFrag(ORIG, [
  ["void main() {", GRID.main + `
void main() {
  vec4 field = preField(0.0);`],
  [`  float heatField = fbm4(distortedUV * 1.5 + vec2(t * 0.1, -t * 0.2));`, "  float heatField = field.z;"],
  // (pass 4, exact) the wall and streak colours are only ever multiplied by
  // walls / streaks — skip their palettes where those are exactly 0
  [`  vec3 wallColor = palette(`, `  vec3 wallColor = walls <= 0.0 ? vec3(0.0) : palette(`],
  [`  vec3 streakColor = palette(`, `  vec3 streakColor = streaks <= 0.0 ? vec3(0.0) : palette(`],
], "furnace");
