import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Deep ocean background — dark blue-green gradient
  float depthGrad = uv.y * 0.5 + 0.5;
  vec3 color = palette(
    depthGrad * 0.4 + t * 0.01,
    vec3(0.02, 0.06, 0.1),
    vec3(0.02, 0.05, 0.08),
    vec3(0.15, 0.35, 0.5),
    vec3(0.0, 0.15, 0.25)
  );

  // Underwater caustics — light filtering from surface
  vec2 causticP = uv * 4.0 + vec2(t * 0.1, 0.0);
  float caustic1 = snoise(causticP);
  float caustic2 = snoise(causticP * 1.7 + 3.5);
  float caustics = pow(abs(caustic1 + caustic2) * 0.5, 2.0);
  float surfaceLight = smoothstep(-0.5, 0.8, uv.y);
  color += vec3(0.1, 0.2, 0.15) * caustics * surfaceLight * 0.4;

  // Kelp strands — multiple vertical ribbons swaying
  float totalKelp = 0.0;
  float kelpDepth = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float xBase = -0.6 + fi * 0.17 + sin(fi * 2.7) * 0.08;

    // Sway with current — bass drives stronger sway
    float sway = sin(uv.y * 3.0 + t * 0.8 + fi * 1.3) * (0.06 + u_bass * 0.04);
    sway += sin(uv.y * 7.0 + t * 1.2 + fi * 0.7) * 0.02;
    sway += snoise(vec2(uv.y * 2.0 + fi * 5.0, t * 0.3)) * 0.03;

    float xPos = xBase + sway;
    float dist = abs(uv.x - xPos);

    // Ribbon width varies along length — wider near base
    float width = 0.025 + (1.0 - uv.y * 0.5 - 0.25) * 0.012;
    width *= 0.8 + snoise(vec2(uv.y * 8.0 + fi * 3.0, t * 0.1)) * 0.3;

    // Kelp grows from bottom
    float growth = smoothstep(-0.8, -0.7, uv.y - 0.2 + fi * 0.08);
    float topTaper = smoothstep(0.7 - fi * 0.03, 0.4 - fi * 0.03, uv.y);

    float strand = smoothstep(width + 0.005, width - 0.002, dist) * growth * topTaper;
    float strandGlow = smoothstep(width + 0.04, width, dist) * growth * topTaper;

    // Depth layering — farther strands dimmer
    float depthFade = 0.5 + 0.5 * (1.0 - fi / 8.0);
    totalKelp += strand * depthFade;
    kelpDepth = max(kelpDepth, strandGlow * depthFade);
  }
  totalKelp = clamp(totalKelp, 0.0, 1.0);

  // Kelp color — green-brown with depth variation
  vec3 kelpDark = palette(
    uv.y * 0.3 + t * 0.02,
    vec3(0.1, 0.18, 0.05),
    vec3(0.1, 0.15, 0.05),
    vec3(0.3, 0.5, 0.15),
    vec3(0.0, 0.1, 0.0)
  );

  vec3 kelpBright = palette(
    uv.y * 0.4 + t * 0.03 + 0.15,
    vec3(0.2, 0.32, 0.08),
    vec3(0.15, 0.25, 0.06),
    vec3(0.5, 0.8, 0.25),
    vec3(0.0, 0.12, 0.0)
  );

  // Compose kelp
  vec3 kelpColor = mix(kelpDark, kelpBright, surfaceLight);
  color = mix(color, kelpColor, totalKelp * 0.85);
  color += kelpBright * kelpDepth * 0.15;

  // Midrib highlight on strands
  color += vec3(0.15, 0.25, 0.05) * totalKelp * 0.1;

  // Floating particles / plankton — treble reactive
  float particles = 0.0;
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    vec2 pp = uv * (8.0 + fj * 4.0) + vec2(t * 0.1 * (fj + 1.0), t * -0.15);
    float p1 = pow(snoise(pp) * 0.5 + 0.5, 10.0);
    particles += p1 * (0.4 - fj * 0.1);
  }
  color += vec3(0.3, 0.5, 0.35) * particles * (0.3 + u_treble * 0.5);

  // Current flow — mid reactive shimmer
  float current = sin(uv.y * 15.0 + uv.x * 5.0 + t * 2.0) * 0.5 + 0.5;
  current = pow(current, 6.0);
  color += vec3(0.05, 0.12, 0.08) * current * u_mid * 0.3;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
