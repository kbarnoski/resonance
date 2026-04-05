import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: fluid medium ──
  float bgN = fbm(uv * 2.5 + vec2(t * 0.04, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.5,
    vec3(0.015, 0.02, 0.03),
    vec3(0.02, 0.03, 0.04),
    vec3(0.3, 0.45, 0.6),
    vec3(0.0, 0.15, 0.35)
  );
  color = bgColor * (bgN * 0.1 + 0.04);

  // ── Semi-permeable membrane — undulating vertical barrier ──
  float membraneX = snoise(vec2(uv.y * 4.0, t * 0.5)) * 0.06;
  membraneX += snoise(vec2(uv.y * 8.0, t * 0.3 + 3.0)) * 0.03;

  float membraneDist = abs(uv.x - membraneX);

  // Membrane has pores — periodic gaps
  float porePattern = sin(uv.y * 20.0 + t * 0.8) * 0.5 + 0.5;
  porePattern *= sin(uv.y * 13.0 - t * 0.5) * 0.5 + 0.5;
  float poreOpen = smoothstep(0.6, 0.8, porePattern);

  // Membrane thickness varies with pores
  float membraneThickness = mix(0.008, 0.002, poreOpen);
  float membraneEdge = smoothstep(membraneThickness + 0.005, membraneThickness, membraneDist);
  float membraneGlow = smoothstep(membraneThickness + 0.04, membraneThickness, membraneDist);

  // Pore highlight
  float poreGlow = poreOpen * smoothstep(0.03, 0.0, membraneDist);

  vec3 membraneColor = palette(
    uv.y * 0.3 + t * 0.04 + paletteShift,
    vec3(0.35, 0.4, 0.5),
    vec3(0.3, 0.35, 0.45),
    vec3(0.7, 0.8, 1.0),
    vec3(0.0, 0.15, 0.35)
  );

  color += membraneColor * (membraneEdge * 0.8 + membraneGlow * 0.15);
  color += vec3(0.5, 0.7, 0.9) * poreGlow * 0.3;

  // ── Concentration gradient — left side dense, right side sparse ──
  // This creates visual asymmetry showing osmotic pressure

  // ── Solute particles — larger, can't cross membrane ──
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.3);
    float seed2 = hash1(fi * 11.1 + 2.0);

    // Solutes stay on the left (hypertonic) side
    vec2 solutePos = vec2(
      -0.15 - seed * 0.4,
      (seed2 - 0.5) * 0.8
    );

    // Brownian motion
    solutePos += vec2(
      sin(t * 1.5 + fi * 2.3) * 0.03,
      cos(t * 1.2 + fi * 3.1) * 0.04
    );

    // Bounce off membrane
    if (solutePos.x > membraneX - 0.03) {
      solutePos.x = membraneX - 0.03 - abs(sin(t + fi)) * 0.02;
    }

    float soluteDist = length(uv - solutePos) - 0.018;
    float soluteGlow = smoothstep(0.015, 0.0, soluteDist);
    float soluteFill = smoothstep(0.003, -0.003, soluteDist);

    vec3 soluteColor = palette(
      fi * 0.08 + t * 0.03 + paletteShift + 0.2,
      vec3(0.5, 0.3, 0.4),
      vec3(0.4, 0.25, 0.35),
      vec3(0.9, 0.6, 0.8),
      vec3(0.05, 0.1, 0.25)
    );

    color += soluteColor * (soluteGlow * 0.3 + soluteFill * 0.5);
  }

  // ── Solvent particles (water) — small, can cross membrane ──
  for (int i = 0; i < 35; i++) {
    float fi = float(i);
    float seed = hash1(fi * 9.17 + 50.0);
    float seed2 = hash1(fi * 5.31 + 54.0);

    // Solvent particles on both sides, moving toward hypertonic side
    float side = seed > 0.5 ? 1.0 : -1.0;
    float xBase = side * (0.1 + seed2 * 0.35);

    // Drift toward left (hypertonic) side — osmotic flow
    float flowSpeed = 0.08 + u_bass * 0.05;
    float xDrift = -flowSpeed * t;

    // Periodic position with drift
    float xPos = mod(xBase + xDrift + 1.0, 1.2) - 0.6;
    float yPos = (hash1(fi * 3.7 + 8.0) - 0.5) * 0.8;

    // Brownian wiggle
    vec2 waterPos = vec2(
      xPos + sin(t * 2.0 + fi * 1.7) * 0.015,
      yPos + cos(t * 1.8 + fi * 2.3) * 0.02
    );

    // Check if crossing membrane — squeeze through pores
    float nearMembrane = smoothstep(0.05, 0.01, abs(waterPos.x - membraneX));
    float canPass = poreOpen * nearMembrane;

    float waterDist = length(uv - waterPos);
    float waterGlow = exp(-waterDist * waterDist / 0.0003);

    // Brighter when passing through pore
    float passingBrightness = 1.0 + canPass * 2.0;

    vec3 waterColor = palette(
      fi * 0.05 + paletteShift + 0.6,
      vec3(0.3, 0.45, 0.5),
      vec3(0.25, 0.4, 0.45),
      vec3(0.6, 0.9, 1.0),
      vec3(0.0, 0.2, 0.4)
    );

    color += waterColor * waterGlow * 0.5 * passingBrightness;
  }

  // ── Osmotic pressure visualization — gradient on left side ──
  float pressureGrad = smoothstep(0.1, -0.5, uv.x - membraneX);
  float pressureN = snoise(uv * 6.0 - vec2(t * 0.3, 0.0));
  vec3 pressureColor = palette(
    pressureN * 0.3 + paletteShift + 0.35,
    vec3(0.08, 0.06, 0.1),
    vec3(0.06, 0.05, 0.08),
    vec3(0.5, 0.4, 0.7),
    vec3(0.0, 0.1, 0.3)
  );
  color += pressureColor * pressureGrad * (pressureN * 0.15 + 0.05);

  // ── Flow lines through pores — mid frequency driven ──
  float flowVis = smoothstep(0.04, 0.0, membraneDist) * poreOpen;
  float flowLines = sin(uv.y * 30.0 - t * 4.0) * 0.5 + 0.5;
  flowLines = pow(flowLines, 4.0);
  color += membraneColor * flowVis * flowLines * u_mid * 0.6;

  // ── Treble: molecular vibration sparkle ──
  float vibration = snoise(uv * 25.0 + t * 3.0);
  vibration = smoothstep(0.8, 1.0, vibration) * u_treble;
  color += vec3(0.5, 0.7, 0.9) * vibration * 0.2;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
