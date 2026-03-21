import {
  U,
  SMOOTH_NOISE,
  VISIONARY_PALETTE,
  ROT2,
  SDF_PRIMITIVES,
  SMIN,
} from "./shared";

// Loop and cross: SDF cross-with-loop shape radiating energy,
// golden ratio proportions, orbital particles tracing the form.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  SMIN +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Golden ratio
  float phi = 1.618;

  // Ankh proportions: loop at top, vertical shaft below, horizontal cross-bar
  // The loop (top circle with hollow center)
  float loopR = 0.16;
  vec2 loopCenter = vec2(0.0, 0.22);
  float outerLoop = length(uv - loopCenter) - loopR;
  float innerLoop = length(uv - loopCenter) - loopR * 0.5;
  float loopSDF = max(outerLoop, -innerLoop); // hollow ring

  // Vertical shaft
  float shaft = sdBox(uv - vec2(0.0, -0.12), vec2(0.03 + 0.005 * u_bass, 0.28));

  // Horizontal cross-bar
  float crossBar = sdBox(uv - vec2(0.0, 0.06), vec2(0.16 / phi, 0.025));

  // Combine with smooth min for organic merging
  float ankhSDF = smin(loopSDF, shaft, 0.03);
  ankhSDF = smin(ankhSDF, crossBar, 0.025);

  // Edge lines
  float ankhEdge = smoothstep(0.008, 0.0, abs(ankhSDF));
  // Fill glow
  float ankhFill = smoothstep(0.04, -0.02, ankhSDF);
  // Inner glow gradient
  float ankhInner = smoothstep(0.0, -0.08, ankhSDF);

  // Main ankh colors
  vec3 goldCol = palette(
    paletteShift + 0.1,
    vec3(0.6, 0.5, 0.3),
    vec3(0.4, 0.4, 0.3),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.1, 0.15)
  );

  vec3 deepCol = palette(
    paletteShift + 0.4,
    vec3(0.3, 0.2, 0.4),
    vec3(0.4, 0.3, 0.5),
    vec3(0.8, 0.6, 1.0),
    vec3(0.1, 0.0, 0.3)
  );

  color += goldCol * ankhEdge * 2.5 * (0.7 + 0.4 * u_mid);
  color += mix(deepCol, goldCol, ankhInner) * ankhFill * 0.5;

  // Energy radiating outward from the ankh form
  float radiatePhase = fract(t * 0.6 + u_bass * 0.2);
  for (int wave = 0; wave < 4; wave++) {
    float fw = float(wave);
    float wavePhase = fract(radiatePhase + fw * 0.25);
    float waveDist = wavePhase * 0.5;
    float waveAnkhSDF = ankhSDF - waveDist;
    float waveLine = smoothstep(0.01, 0.0, abs(waveAnkhSDF)) * (1.0 - wavePhase);

    vec3 waveCol = palette(
      fw * 0.2 + wavePhase + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.4),
      vec3(1.0, 0.9, 0.5),
      vec3(0.0, 0.15, 0.3)
    );
    color += waveCol * waveLine * 0.7;
  }

  // Orbital particles tracing the ankh outline
  for (int p = 0; p < 8; p++) {
    float fp = float(p);
    float particleT = fract(t * (0.3 + fp * 0.05) + fp * 0.125);

    // Parametric path along ankh: loop path then shaft
    vec2 particlePos;
    if (particleT < 0.4) {
      // Trace the loop
      float loopAngle = particleT / 0.4 * 6.28318;
      float traceR = loopR * 0.75;
      particlePos = loopCenter + vec2(cos(loopAngle), sin(loopAngle)) * traceR;
    } else if (particleT < 0.6) {
      // Cross bar left to right
      float crossT = (particleT - 0.4) / 0.2;
      particlePos = vec2(mix(-0.16 / phi, 0.16 / phi, crossT), 0.06);
    } else {
      // Down the shaft
      float shaftT = (particleT - 0.6) / 0.4;
      particlePos = vec2(0.0, mix(0.06, -0.4, shaftT));
    }

    float particleDist = length(uv - particlePos);
    float particleGlow = smoothstep(0.025, 0.0, particleDist);
    float particleCore = smoothstep(0.008, 0.0, particleDist);

    vec3 pCol = palette(
      fp * 0.12 + t + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.9, 0.6),
      vec3(0.0, 0.2, 0.4)
    );

    color += pCol * particleGlow * 0.6;
    color += vec3(1.3, 1.2, 1.0) * particleCore * 0.8;
  }

  // Loop interior: sacred void with subtle pattern
  float loopInterior = smoothstep(0.01, -0.01, innerLoop);
  float voidPattern = snoise(uv * 15.0 + t * 0.5) * 0.5 + 0.5;
  voidPattern *= snoise(uv * 8.0 - t * 0.3) * 0.5 + 0.5;
  color += deepCol * loopInterior * voidPattern * 0.4 * (0.5 + 0.5 * u_bass);

  // FBM energy field surrounding the form
  float field = fbm(uv * 4.0 + t * 0.2);
  float fieldMask = smoothstep(-0.05, 0.15, ankhSDF) * smoothstep(0.6, 0.2, ankhSDF);
  color += goldCol * abs(field) * fieldMask * 0.2 * (0.6 + 0.4 * u_amplitude);

  // Treble shimmer on edges
  float shimmer = sin(ankhSDF * 100.0 + t * 6.0) * u_treble * 0.15;
  shimmer *= smoothstep(0.05, 0.0, abs(ankhSDF));
  color += vec3(1.2, 1.15, 1.0) * max(shimmer, 0.0);

  // Vignette
  color *= smoothstep(1.4, 0.3, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
