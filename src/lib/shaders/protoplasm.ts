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
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Cell membrane boundary ──
  float membraneR = 0.55 + sin(t * 0.4) * 0.02 + u_bass * 0.04;
  float membraneWave = snoise(vec2(atan(uv.y, uv.x) * 3.0, t * 0.5)) * 0.03;
  float cellDist = length(uv) - membraneR - membraneWave;
  float cellInterior = smoothstep(0.01, -0.01, cellDist);
  float membraneEdge = smoothstep(0.012, 0.0, abs(cellDist));
  float membraneGlow = smoothstep(0.06, 0.0, abs(cellDist));

  vec3 membraneColor = palette(
    atan(uv.y, uv.x) * 0.15 + t * 0.03 + paletteShift,
    vec3(0.35, 0.3, 0.4),
    vec3(0.3, 0.25, 0.35),
    vec3(0.7, 0.6, 0.8),
    vec3(0.0, 0.15, 0.3)
  );

  // Background outside cell — dark void
  float bgN = fbm(uv * 2.0 + vec2(t * 0.03, -t * 0.02));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.5,
    vec3(0.01, 0.01, 0.02),
    vec3(0.015, 0.015, 0.025),
    vec3(0.3, 0.3, 0.5),
    vec3(0.0, 0.1, 0.25)
  );
  color = bgColor * (bgN * 0.06 + 0.02);

  // Membrane rendering
  color += membraneColor * (membraneEdge * 1.0 + membraneGlow * 0.2);

  // ── Flowing protoplasm — domain-warped noise for viscous fluid ──
  // Double domain warp for thick, flowing feel
  vec2 warp1 = vec2(
    snoise(uv * 3.0 + vec2(t * 0.25, 0.0)),
    snoise(uv * 3.0 + vec2(0.0, t * 0.2) + 5.0)
  );
  vec2 warped1 = uv + warp1 * 0.15;

  vec2 warp2 = vec2(
    snoise(warped1 * 2.5 + vec2(-t * 0.15, t * 0.1)),
    snoise(warped1 * 2.5 + vec2(t * 0.1, t * 0.18) + 8.0)
  );
  vec2 warped2 = warped1 + warp2 * 0.1;

  // Protoplasm flow visualization
  float flow1 = fbm(warped2 * 3.0 + t * 0.2);
  float flow2 = fbm(warped2 * 5.0 - t * 0.15 + 3.0);
  float flowPattern = flow1 * 0.6 + flow2 * 0.4;

  // Viscous streaking — directional flow
  float flowAngle = atan(warp2.y, warp2.x);
  float streaks = sin(dot(warped2, vec2(cos(flowAngle), sin(flowAngle))) * 15.0 + t * 1.5) * 0.5 + 0.5;
  streaks = pow(streaks, 3.0);

  vec3 plasmaColor = palette(
    flowPattern * 0.5 + t * 0.03 + paletteShift + 0.2,
    vec3(0.25, 0.22, 0.3),
    vec3(0.2, 0.18, 0.25),
    vec3(0.6, 0.55, 0.75),
    vec3(0.0, 0.12, 0.28)
  );

  vec3 streakColor = palette(
    flowPattern * 0.3 + streaks * 0.2 + paletteShift + 0.4,
    vec3(0.3, 0.28, 0.35),
    vec3(0.25, 0.23, 0.3),
    vec3(0.65, 0.6, 0.8),
    vec3(0.0, 0.15, 0.3)
  );

  color += plasmaColor * (flowPattern * 0.2 + 0.08) * cellInterior;
  color += streakColor * streaks * 0.1 * cellInterior;

  // ── Organelles drifting in the protoplasm ──
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.31);
    float seed2 = hash1(fi * 13.17 + 2.0);
    float seed3 = hash1(fi * 19.41 + 5.0);

    // Drift with the protoplasm flow
    vec2 orgBase = vec2(
      (seed - 0.5) * 0.7,
      (seed2 - 0.5) * 0.7
    );

    // Apply flow-field advection
    vec2 flowOffset = warp1 * 0.1 + warp2 * 0.05;
    orgBase += flowOffset;

    // Individual wobble
    orgBase += vec2(
      sin(t * 0.6 + fi * 2.3) * 0.04,
      cos(t * 0.5 + fi * 3.1) * 0.05
    );

    float orgDist = length(uv - orgBase);

    // Different organelle types
    float orgType = seed3;
    if (orgType < 0.3) {
      // Nucleus — large, round, prominent
      float nucleusDist = orgDist - 0.06;
      float nucleusGlow = smoothstep(0.03, 0.0, nucleusDist) * cellInterior;
      float nucleusFill = smoothstep(0.005, -0.005, nucleusDist) * cellInterior;

      vec3 nucleusColor = palette(
        fi * 0.1 + paletteShift + 0.5,
        vec3(0.4, 0.3, 0.5),
        vec3(0.35, 0.25, 0.45),
        vec3(0.8, 0.6, 1.0),
        vec3(0.0, 0.12, 0.35)
      );
      color += nucleusColor * (nucleusGlow * 0.4 + nucleusFill * 0.3);

      // Nucleolus
      float nuclDist = length(uv - orgBase - vec2(0.01, -0.01)) - 0.02;
      float nuclGlow = smoothstep(0.01, 0.0, nuclDist) * cellInterior;
      color += nucleusColor * nuclGlow * 0.5;

    } else if (orgType < 0.6) {
      // ER — elongated wavy shape
      vec2 erUV = rot2(seed * 3.14) * (uv - orgBase);
      float erDist = abs(erUV.y + sin(erUV.x * 12.0 + t) * 0.008) - 0.003;
      float erLen = smoothstep(0.05, 0.03, abs(erUV.x));
      float erGlow = smoothstep(0.008, 0.0, erDist) * erLen * cellInterior;

      vec3 erColor = palette(
        fi * 0.12 + paletteShift + 0.35,
        vec3(0.3, 0.35, 0.4),
        vec3(0.25, 0.3, 0.35),
        vec3(0.6, 0.75, 0.9),
        vec3(0.0, 0.15, 0.3)
      );
      color += erColor * erGlow * 0.5;

    } else {
      // Vesicles — tiny round bodies
      float vesDist = orgDist - 0.012;
      float vesGlow = smoothstep(0.01, 0.0, vesDist) * cellInterior;
      float vesPulse = 0.6 + 0.4 * sin(t * 2.0 + fi * 1.7);

      vec3 vesColor = palette(
        fi * 0.15 + paletteShift + 0.6,
        vec3(0.35, 0.4, 0.3),
        vec3(0.3, 0.35, 0.25),
        vec3(0.7, 0.9, 0.6),
        vec3(0.0, 0.18, 0.22)
      );
      color += vesColor * vesGlow * vesPulse * 0.4;
    }
  }

  // ── Cytoplasmic streaming current lines ──
  float streamLines = sin(dot(warped2, vec2(3.0, 5.0)) * 8.0 - t * 2.5) * 0.5 + 0.5;
  streamLines = pow(streamLines, 5.0) * cellInterior;
  color += plasmaColor * streamLines * u_mid * 0.2;

  // ── Bass: whole cell breathing/pulsing ──
  float cellPulse = exp(-dot(uv, uv) / (0.15 + u_bass * 0.05));
  color += plasmaColor * cellPulse * u_bass * 0.15 * cellInterior;

  // ── Treble: molecular sparkle ──
  float sparkle = snoise(uv * 30.0 + t * 3.0);
  sparkle = smoothstep(0.8, 1.0, sparkle) * u_treble * cellInterior;
  color += membraneColor * sparkle * 0.25;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
