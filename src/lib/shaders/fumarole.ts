import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Fumarole — volcanic steam vent, hot gas emerging from cracks in the earth

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // Ground surface — cracked volcanic rock at the bottom
  float groundLevel = -0.25 + snoise(vec2(uv.x * 4.0, 0.0)) * 0.05;
  float isGround = smoothstep(groundLevel + 0.02, groundLevel - 0.04, uv.y);

  // Cracks in the ground — vent openings
  float groundCracks = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float crackX = (fi - 1.0) * 0.35 + snoise(vec2(fi * 5.0, t * 0.05)) * 0.05;
    float dx = uv.x - crackX;
    float crackWidth = 0.02 + snoise(vec2(uv.y * 10.0, fi * 3.0)) * 0.01;
    float crack = smoothstep(crackWidth, 0.0, abs(dx));
    crack *= isGround;
    groundCracks += crack;
  }

  // Steam plumes — rising from multiple vents
  float steam = 0.0;
  for (int v = 0; v < 3; v++) {
    float fv = float(v);
    vec2 ventPos = vec2((fv - 1.0) * 0.35, groundLevel);
    ventPos.x += snoise(vec2(fv * 5.0, t * 0.05)) * 0.05;
    vec2 fromVent = uv - ventPos;

    // Steam rises and expands
    float riseSpeed = 0.8 + u_bass * 0.3;
    float expansion = 0.8 + fromVent.y * 1.5; // widens with height
    float above = max(fromVent.y, 0.0);

    // Column mask — widens as it rises
    float colWidth = 0.06 + above * expansion * 0.2;
    float colMask = exp(-fromVent.x * fromVent.x / (colWidth * colWidth));
    colMask *= smoothstep(0.0, 0.05, above);

    // Turbulent steam noise — billowing upward
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 steamUV = vec2(fromVent.x * (3.0 - fi * 0.5) / (colWidth * 3.0),
                          above * (2.0 + fi) - t * riseSpeed * (1.0 + fi * 0.3));
      steamUV *= rot2(snoise(vec2(above * 2.0, t * 0.3 + fv)) * 0.3);
      float s = fbm(steamUV + fv * 7.0 + fi * 3.3) * 0.5 + 0.5;
      s = pow(s, 1.3);
      steam += s * colMask * (0.35 - fi * 0.06) * (1.0 - above * 0.8);
    }
  }
  steam = clamp(steam, 0.0, 1.0);

  // Mineral deposits around the vents — yellow/orange sulfur
  float minerals = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ventX = (fi - 1.0) * 0.35;
    float dx = uv.x - ventX;
    float mineralR = length(vec2(dx, uv.y - groundLevel));
    float mineral = smoothstep(0.15, 0.02, mineralR) * isGround;
    mineral *= fbm(uv * 10.0 + fi * 5.0) * 0.5 + 0.5;
    minerals += mineral * (0.5 - fi * 0.1);
  }

  // Heat distortion above vents
  float heatDist = snoise(vec2(uv.x * 8.0, uv.y * 3.0 - t * 2.0));
  heatDist *= smoothstep(groundLevel, groundLevel + 0.3, uv.y) * u_mid * 0.15;

  // Colors
  vec3 groundColor = palette(
    fbm(uv * 5.0) * 0.3 + paletteShift,
    vec3(0.1, 0.08, 0.06),
    vec3(0.06, 0.05, 0.04),
    vec3(0.5, 0.4, 0.3),
    vec3(0.05, 0.08, 0.1)
  );

  vec3 steamColor = palette(
    steam * 0.3 + paletteShift + 0.4,
    vec3(0.5, 0.48, 0.45),
    vec3(0.2, 0.18, 0.16),
    vec3(0.6, 0.55, 0.5),
    vec3(0.15, 0.15, 0.2)
  );

  vec3 mineralColor = palette(
    minerals * 0.4 + paletteShift + 0.15,
    vec3(0.45, 0.35, 0.1),
    vec3(0.3, 0.2, 0.05),
    vec3(0.9, 0.7, 0.2),
    vec3(0.0, 0.08, 0.15)
  );

  vec3 ventGlowColor = vec3(0.5, 0.2, 0.05);

  vec3 skyColor = palette(
    uv.y * 0.2 + heatDist + paletteShift + 0.6,
    vec3(0.15, 0.14, 0.16),
    vec3(0.08, 0.07, 0.09),
    vec3(0.4, 0.38, 0.45),
    vec3(0.12, 0.1, 0.18)
  );

  // Compose
  vec3 color = skyColor;
  color = mix(color, steamColor, steam * 0.8);
  color = mix(color, groundColor, isGround);
  color += mineralColor * minerals;
  color += ventGlowColor * groundCracks * (0.6 + u_bass * 0.5);

  // Treble: tiny hot particles in the steam
  float hotParticles = snoise(uv * 30.0 + vec2(0.0, -t * 3.0));
  hotParticles = pow(max(hotParticles, 0.0), 6.0) * steam * u_treble * 0.4;
  color += vec3(0.5, 0.3, 0.1) * hotParticles;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
