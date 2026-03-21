import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Bass drives eruption power
  float eruptionPower = 0.3 + u_bass * 0.7;

  // Dark atmospheric background
  vec3 bgTop = palette(0.7 + paletteShift, vec3(0.03, 0.05, 0.1), vec3(0.05, 0.08, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.6, 0.7));
  vec3 bgBottom = palette(0.2 + paletteShift, vec3(0.08, 0.06, 0.04), vec3(0.1, 0.08, 0.05),
    vec3(1.0, 0.8, 0.6), vec3(0.0, 0.1, 0.2));
  float skyGrad = smoothstep(-0.5, 0.5, uv.y);
  vec3 color = mix(bgBottom, bgTop, skyGrad);

  // Rocky terrain at bottom
  float terrainNoise = fbm(vec2(uv.x * 5.0, 0.0) + t * 0.1) * 0.08;
  float terrainLine = -0.35 + terrainNoise;
  float terrain = smoothstep(terrainLine + 0.02, terrainLine, uv.y);
  vec3 rockColor = palette(0.1 + paletteShift, vec3(0.12, 0.1, 0.08), vec3(0.08, 0.06, 0.04),
    vec3(1.0, 0.8, 0.6), vec3(0.0, 0.05, 0.15));
  color = mix(color, rockColor, terrain);

  // Central eruption column
  float columnWidth = 0.08 + eruptionPower * 0.06;
  float columnSpread = abs(uv.x) / (columnWidth + abs(uv.y - terrainLine) * 0.3);
  float column = smoothstep(1.2, 0.0, columnSpread);
  column *= smoothstep(terrainLine - 0.05, terrainLine + 0.05, uv.y); // starts from terrain

  // Column turbulence
  float turbX = snoise(vec2(uv.y * 8.0 - u_time * 4.0, t)) * 0.05 * eruptionPower;
  float turbColumn = smoothstep(1.2, 0.0, abs(uv.x - turbX) / (columnWidth + abs(uv.y - terrainLine) * 0.25));
  turbColumn *= smoothstep(terrainLine - 0.05, terrainLine + 0.05, uv.y);
  column = max(column, turbColumn * 0.8);

  // Column inner noise — roiling water texture
  float columnNoise = fbm(vec2(uv.x * 15.0 + t, uv.y * 10.0 - u_time * 6.0));
  float columnDetail = fbm(vec2(uv.x * 25.0 - t * 0.5, uv.y * 15.0 - u_time * 8.0));
  float columnTex = columnNoise * 0.6 + columnDetail * 0.4;

  vec3 waterBright = palette(0.6 + paletteShift + columnTex * 0.2,
    vec3(0.5, 0.6, 0.7), vec3(0.3, 0.3, 0.3),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.6, 0.75));
  vec3 waterDark = palette(0.45 + paletteShift,
    vec3(0.15, 0.25, 0.4), vec3(0.15, 0.2, 0.3),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  vec3 columnColor = mix(waterDark, waterBright, columnTex * 0.5 + 0.5);
  color = mix(color, columnColor, column * eruptionPower);

  // Bright core of the column
  float core = smoothstep(0.6, 0.0, abs(uv.x - turbX * 0.5) / (columnWidth * 0.3));
  core *= smoothstep(terrainLine, terrainLine + 0.3, uv.y);
  core *= smoothstep(0.6, 0.2, uv.y); // fades at top
  vec3 coreColor = palette(0.65 + paletteShift, vec3(0.8, 0.85, 0.9), vec3(0.2, 0.15, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color += core * coreColor * eruptionPower * 0.5;

  // Spray particles flying outward
  float spray = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float pSeed = fi * 7.31;
    float pTime = fract(u_time * 0.8 + fract(sin(pSeed) * 43758.5453));
    float pAngle = (fract(sin(pSeed * 1.7) * 12345.6) - 0.5) * 1.8;
    pAngle += sin(u_time * 0.5 + fi) * 0.2;

    // Parabolic trajectory
    float pVelY = 1.2 + fract(sin(pSeed * 3.1) * 9876.5) * 0.8;
    float pVelX = sin(pAngle) * (0.5 + u_mid * 0.3);
    float gravity = 1.5;

    float px = pVelX * pTime;
    float py = terrainLine + 0.05 + pVelY * pTime - gravity * pTime * pTime;

    float pDist = length(uv - vec2(px, py));
    float pSize = 0.008 + fract(sin(pSeed * 5.3) * 5555.5) * 0.008;
    pSize *= (1.0 - pTime); // shrink over lifetime
    float particle = smoothstep(pSize, 0.0, pDist) * eruptionPower;
    particle *= step(0.0, py - terrainLine); // only above terrain
    spray += particle;
  }
  vec3 sprayColor = palette(0.55 + paletteShift, vec3(0.6, 0.7, 0.8), vec3(0.3, 0.25, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.45, 0.55, 0.7));
  color += spray * sprayColor * 0.8;

  // Steam clouds billowing outward from the top
  float steamBase = max(0.0, uv.y - 0.1);
  for (int s = 0; s < 3; s++) {
    float fs = float(s);
    vec2 steamUV = uv;
    steamUV.x *= 1.5 - fs * 0.15;
    steamUV += vec2(t * (0.3 + fs * 0.2) * sign(uv.x), -t * 0.1);

    float steam = fbm(steamUV * (3.0 + fs * 1.0) + vec2(fs * 5.0, t));
    steam = smoothstep(0.0, 0.5, steam);
    steam *= smoothstep(0.0, 0.15, uv.y); // only above eruption
    steam *= smoothstep(0.8, 0.3, uv.y);  // fade at top

    // Steam expands sideways
    float expand = smoothstep(0.0, 0.4, uv.y) * 0.5;
    steam *= smoothstep(0.5 + expand, 0.1, abs(uv.x));

    vec3 steamColor = palette(0.3 + fs * 0.1 + paletteShift,
      vec3(0.4, 0.45, 0.5), vec3(0.15, 0.15, 0.2),
      vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
    float steamOpacity = 0.15 - fs * 0.03;
    color = mix(color, steamColor, steam * steamOpacity * eruptionPower);
  }

  // Pool splash rings at the base
  float poolZone = smoothstep(terrainLine + 0.05, terrainLine - 0.05, uv.y);
  float poolRipple = 0.0;
  for (int r = 0; r < 4; r++) {
    float fr = float(r);
    float rippleAge = fract(u_time * 1.5 + fr * 0.25);
    float rippleRadius = rippleAge * 0.3 * eruptionPower;
    float ripple = abs(length(vec2(uv.x, (uv.y - terrainLine) * 4.0)) - rippleRadius);
    ripple = smoothstep(0.02, 0.0, ripple) * (1.0 - rippleAge);
    poolRipple += ripple;
  }
  color += poolRipple * sprayColor * 0.3 * poolZone;

  // Glow around eruption base
  float baseGlow = smoothstep(0.4, 0.0, length(uv - vec2(0.0, terrainLine)));
  vec3 glowColor = palette(0.5 + paletteShift, vec3(0.4, 0.5, 0.6), vec3(0.2, 0.2, 0.25),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color += baseGlow * glowColor * eruptionPower * 0.15;

  // Treble adds fine mist sparkle
  float mist = snoise(uv * 30.0 + u_time * 2.0);
  mist = smoothstep(0.7, 0.95, mist) * u_treble * 0.2;
  mist *= column * 0.5 + smoothstep(0.3, 0.0, length(uv - vec2(0.0, 0.1)));
  color += mist * coreColor * 0.5;

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.8;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
