import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
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
  float wallTexture = fbm4(distortedUV * 5.0 + 10.0) * 0.5 + 0.5;

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
