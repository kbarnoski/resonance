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
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: cellular interior ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.04, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.3,
    vec3(0.02, 0.02, 0.03),
    vec3(0.03, 0.02, 0.04),
    vec3(0.4, 0.35, 0.5),
    vec3(0.0, 0.1, 0.25)
  );
  color = bgColor * (bgN * 0.12 + 0.05);

  // ── Outer membrane — bean/ellipsoid shape ──
  // Slowly rotating and breathing
  float breathe = 1.0 + sin(t * 0.6) * 0.05 + u_bass * 0.08;
  float rotAngle = t * 0.15;
  vec2 muv = rot2(rotAngle) * uv;

  // Bean shape: ellipse with slight indent
  float ellipse = length(muv * vec2(1.0, 1.8)) - 0.35 * breathe;
  float indent = smoothstep(0.1, 0.0, abs(muv.y + 0.05)) * 0.04;
  float outerMembrane = ellipse + indent;

  float outerEdge = smoothstep(0.015, 0.0, abs(outerMembrane));
  float outerGlow = smoothstep(0.06, 0.0, abs(outerMembrane));
  float interior = smoothstep(0.01, -0.01, outerMembrane);

  vec3 outerColor = palette(
    outerMembrane * 3.0 + t * 0.05 + paletteShift,
    vec3(0.4, 0.3, 0.2),
    vec3(0.35, 0.25, 0.2),
    vec3(0.8, 0.7, 0.5),
    vec3(0.0, 0.12, 0.2)
  );
  color += outerColor * (outerEdge * 1.2 + outerGlow * 0.3);

  // ── Inner membrane — cristae folds ──
  // Wavy folded structures inside the mitochondrion
  float cristaAccum = 0.0;
  float energyAccum = 0.0;

  for (int c = 0; c < 8; c++) {
    float cf = float(c);
    float cristaY = (cf / 7.0 - 0.5) * 0.5;

    // Each crista is a horizontal fold that waves
    float waveAmp = 0.04 + sin(t * 0.8 + cf * 1.3) * 0.015;
    float waveFreq = 6.0 + cf * 1.5;
    float fold = sin(muv.x * waveFreq + t * 1.2 + cf * 0.9) * waveAmp;

    float cristaDist = abs(muv.y - cristaY - fold);
    float cristaWidth = 0.005;

    // Only show inside the mitochondrion
    float cristaGlow = smoothstep(cristaWidth + 0.015, cristaWidth, cristaDist);
    float cristaEdge = smoothstep(cristaWidth + 0.003, cristaWidth, cristaDist);
    cristaGlow *= interior;
    cristaEdge *= interior;

    // Fade toward edges of the organelle
    float xFade = smoothstep(0.33, 0.2, abs(muv.x)) * breathe;
    cristaGlow *= xFade;
    cristaEdge *= xFade;

    cristaAccum += cristaGlow * 0.5 + cristaEdge * 0.3;

    // ── Energy particles flowing along cristae ──
    float energySpeed = 3.0 + u_bass * 2.0;
    float energyPhase = fract(t * 0.3 + cf * 0.17);
    float energyX = mix(-0.3, 0.3, energyPhase);
    vec2 energyPos = vec2(energyX, cristaY + fold);
    float energyDist = length(muv - energyPos);
    float energyGlow = exp(-energyDist * energyDist / 0.001) * interior * xFade;
    energyAccum += energyGlow;
  }

  // Cristae color — amber and gold tones (energy-rich)
  vec3 cristaColor = palette(
    cristaAccum * 0.3 + t * 0.04 + paletteShift + 0.2,
    vec3(0.45, 0.35, 0.2),
    vec3(0.4, 0.3, 0.15),
    vec3(0.9, 0.75, 0.4),
    vec3(0.0, 0.1, 0.18)
  );
  color += cristaColor * cristaAccum * 0.7;

  // Energy particles — bright ATP-like glow
  vec3 energyColor = palette(
    t * 0.1 + paletteShift + 0.6,
    vec3(0.6, 0.5, 0.2),
    vec3(0.5, 0.45, 0.2),
    vec3(1.0, 0.9, 0.4),
    vec3(0.0, 0.08, 0.15)
  );
  color += energyColor * energyAccum * (1.5 + u_mid * 1.0);

  // ── Matrix interior — soft granular glow ──
  float matrixN = snoise(muv * 15.0 + t * 0.5);
  float matrixGlow = smoothstep(0.3, 0.7, matrixN) * interior;

  vec3 matrixColor = palette(
    matrixN * 0.3 + paletteShift + 0.4,
    vec3(0.25, 0.2, 0.15),
    vec3(0.2, 0.15, 0.1),
    vec3(0.6, 0.5, 0.4),
    vec3(0.0, 0.1, 0.2)
  );
  color += matrixColor * matrixGlow * 0.15;

  // ── DNA rings — mitochondrial DNA floating in matrix ──
  for (int d = 0; d < 3; d++) {
    float df = float(d);
    vec2 dnaPos = vec2(
      sin(t * 0.4 + df * 2.1) * 0.08,
      cos(t * 0.3 + df * 3.7) * 0.06
    );
    float dnaAngle = t * 0.5 + df * 2.09;
    float dnaRingDist = abs(length(muv - dnaPos) - 0.025);
    float dnaGlow = smoothstep(0.006, 0.0, dnaRingDist) * interior;

    vec3 dnaColor = palette(
      df * 0.33 + t * 0.06 + paletteShift + 0.5,
      vec3(0.4, 0.5, 0.3),
      vec3(0.3, 0.4, 0.25),
      vec3(0.8, 1.0, 0.6),
      vec3(0.0, 0.15, 0.25)
    );
    color += dnaColor * dnaGlow * 0.6;
  }

  // ── Proton gradient shimmer on inner membrane ──
  float protonShimmer = sin(muv.x * 40.0 - t * 5.0 + muv.y * 20.0) * 0.5 + 0.5;
  protonShimmer = pow(protonShimmer, 6.0) * interior;
  protonShimmer *= smoothstep(0.0, 0.04, -outerMembrane); // near inner surface
  color += energyColor * protonShimmer * u_treble * 0.3;

  // ── Central glow — powerhouse energy ──
  float centerGlow = exp(-dot(muv, muv) / (0.02 * breathe));
  color += energyColor * centerGlow * interior * (0.2 + u_bass * 0.3);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
