import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Ancient inscriptions: glowing linear marks appearing and fading,
// angular geometric strokes arranged in circular patterns, each mark pulses with bass.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Multiple concentric rings of rune marks
  for (int ring = 0; ring < 5; ring++) {
    float ringR = 0.15 + float(ring) * 0.18;
    float ringWidth = 0.005 + 0.003 * u_mid;

    // Draw the carrier ring faintly
    float carrier = smoothstep(ringWidth, 0.0, abs(r - ringR));

    // Number of marks increases with ring
    float nMarks = 8.0 + float(ring) * 4.0;
    float sector = 6.28318 / nMarks;

    // Rotate each ring at different speeds
    float ringAngle = a + t * (0.3 + 0.15 * float(ring)) * (mod(float(ring), 2.0) < 0.5 ? 1.0 : -1.0);

    // Fold into sector
    float sa = mod(ringAngle, sector) - sector * 0.5;

    // Local coords within the sector at ring radius
    vec2 lp = vec2(r - ringR, sa * ringR);

    // Rune stroke: vertical tick marks
    float tickHeight = 0.06 + 0.03 * sin(floor(ringAngle / sector) * 7.13 + float(ring) * 3.7);
    float tickW = 0.003 + 0.001 * u_treble;
    float tick = smoothstep(tickW, 0.0, abs(lp.y)) * smoothstep(0.0, 0.005, lp.x + tickHeight * 0.5) * smoothstep(0.0, 0.005, tickHeight * 0.5 - lp.x);

    // Angled cross-strokes on some marks
    float markID = floor(ringAngle / sector);
    float hasStroke = step(0.4, fract(markID * 0.618 + float(ring) * 0.33));
    vec2 rotLP = rot2(0.7 + 0.3 * sin(markID * 2.31)) * lp;
    float crossStroke = smoothstep(tickW, 0.0, abs(rotLP.y)) * smoothstep(0.0, 0.004, rotLP.x + 0.02) * smoothstep(0.0, 0.004, 0.02 - rotLP.x);
    tick += crossStroke * hasStroke;

    // Diagonal accent strokes
    float hasDiag = step(0.6, fract(markID * 0.371 + float(ring) * 0.17));
    vec2 diagLP = rot2(-0.5) * lp;
    float diagStroke = smoothstep(tickW * 0.8, 0.0, abs(diagLP.y)) * smoothstep(0.0, 0.004, diagLP.x + 0.015) * smoothstep(0.0, 0.004, 0.025 - diagLP.x);
    tick += diagStroke * hasDiag * 0.7;

    // Bass pulse: each mark fades in/out based on bass and position
    float pulse = 0.4 + 0.6 * smoothstep(0.2, 0.8, u_bass + 0.3 * sin(markID * 1.73 + t * 2.5));

    // FBM noise modulation on mark brightness
    float nz = snoise(vec2(markID * 0.5 + float(ring), t * 0.8));
    float fadePhase = smoothstep(-0.3, 0.3, sin(markID * 0.87 + t * 1.5 + float(ring) * 2.0 + nz));

    // Color per ring layer
    vec3 ringCol = palette(
      float(ring) * 0.2 + markID * 0.03 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.4),
      vec3(1.0, 0.8, 0.5),
      vec3(0.0, 0.1, 0.25)
    );

    vec3 glowCol = palette(
      float(ring) * 0.15 + paletteShift + 0.5,
      vec3(0.6, 0.5, 0.4),
      vec3(0.5, 0.5, 0.5),
      vec3(0.8, 1.0, 1.2),
      vec3(0.2, 0.1, 0.0)
    );

    // Emissive glow around marks
    float markGlow = smoothstep(0.025, 0.0, abs(r - ringR)) * smoothstep(0.015, 0.0, abs(sa) - 0.005);

    color += ringCol * tick * pulse * fadePhase * 2.5;
    color += ringCol * carrier * 0.15 * (0.5 + 0.5 * u_mid);
    color += glowCol * markGlow * 0.15 * fadePhase;
  }

  // Central glow - ancient light source
  float core = smoothstep(0.12, 0.0, r) * (0.6 + 0.5 * u_bass);
  vec3 coreCol = palette(
    t * 0.2 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.3),
    vec3(1.0, 0.6, 0.3),
    vec3(0.0, 0.05, 0.15)
  );
  color += coreCol * core;

  // Outer haze with fbm
  float haze = fbm(uv * 3.0 + t * 0.3) * 0.12 * smoothstep(1.0, 0.3, r);
  color += coreCol * haze * (0.5 + 0.5 * u_amplitude);

  // Treble sparkle on marks
  float sparkle = u_treble * 0.3 * smoothstep(0.0, 0.1, sin(a * 30.0 + t * 8.0)) * smoothstep(0.8, 0.2, r);
  color += vec3(1.2, 1.1, 1.0) * sparkle * smoothstep(0.05, 0.0, abs(fract(r * 15.0) - 0.5) - 0.45);

  // Vignette
  color *= smoothstep(1.4, 0.4, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
