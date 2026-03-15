import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Single rotated line grid: returns intensity of lines at angle a and spacing freq
float lineGrid(vec2 uv, float angle, float freq, float lineWidth) {
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 perp = vec2(-dir.y, dir.x);
  float proj = dot(uv, perp) * freq;
  float stripe = abs(fract(proj) - 0.5);
  return smoothstep(lineWidth, 0.0, stripe);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // ---- Perspective warp for infinite depth ----
  // Simulate looking down onto a receding plane of lines.
  // Apply a projective distortion: lines get denser toward center.
  float perspStrength = 0.5 + u_bass * 0.15;
  float dist = length(uv);
  // Perspective UV: scales more at center (vanishing point)
  vec2 uvPersp = uv / (dist * perspStrength + 0.25);

  vec3 color = vec3(0.0);

  // ---- 5 overlapping rotated line grids ----
  // Base frequency — bass pulses it
  float baseFreq = 5.5 + u_bass * 1.5;

  // Slow drift of each grid at different rates (creates evolving interference)
  float angDrift = t * 0.08;

  // Grid 1: horizontal reference
  float a1 = angDrift * 0.7;
  float g1 = lineGrid(uvPersp, a1, baseFreq, 0.04 + u_treble * 0.02);

  // Grid 2: slightly rotated — classic moiré pair
  float a2 = a1 + 0.08 + u_mid * 0.04;
  float g2 = lineGrid(uvPersp, a2, baseFreq * 1.01, 0.04 + u_treble * 0.02);

  // Grid 3: orthogonal set, slightly different frequency
  float a3 = a1 + 1.5708; // 90 degrees
  float g3 = lineGrid(uvPersp, a3, baseFreq * 0.99, 0.04);

  // Grid 4: diagonal, slower drift
  float a4 = a1 + 0.7854 + t * 0.02; // 45 degrees + slow drift
  float g4 = lineGrid(uvPersp, a4, baseFreq * 1.03, 0.035);

  // Grid 5: fine detail grid (treble)
  float a5 = a1 + 0.4 + t * 0.05;
  float g5 = lineGrid(uvPersp, a5, baseFreq * 2.0, 0.025) * u_treble;

  // ---- Interference patterns ----
  // The moiré appears where two grids both have lines: multiply
  float moire12 = g1 * g2;
  float moire34 = g3 * g4;
  float moire13 = g1 * g3;
  float moire_all = moire12 * g3;

  // ---- Depth illusion: radial fade from center ----
  // Near the center vanishing point things are denser — infinite depth feeling
  float radialFade  = 1.0 / (dist * 2.5 + 0.3);
  radialFade = clamp(radialFade, 0.0, 3.0);

  // ---- Color ----
  // Palette 1: cool lines
  vec3 col1 = palette(
    g1 * 0.5 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.7, 1.0, 0.5),
    vec3(0.0, 0.1, 0.4)
  );
  // Palette 2: warm lines
  vec3 col2 = palette(
    g2 * 0.5 + t * 0.25 + paletteShift + 0.5,
    vec3(0.5, 0.4, 0.3),
    vec3(0.5, 0.35, 0.2),
    vec3(1.0, 0.7, 0.3),
    vec3(0.05, 0.1, 0.0)
  );
  // Palette 3: moiré intersections — bright glow
  vec3 col3 = palette(
    moire12 + t * 0.4 + paletteShift + 0.25,
    vec3(0.6, 0.6, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.25)
  );

  // Layer the grids
  color += col1 * g1 * 0.35;
  color += col2 * g2 * 0.35;
  color += col1 * g3 * 0.25;
  color += col2 * g4 * 0.25;
  color += col3 * g5 * 0.2;

  // Moiré intersections glow brighter
  color += col3 * moire12 * 0.8;
  color += col3 * moire34 * 0.5;
  color += col3 * moire13 * 0.4;

  // Triple intersection: very bright sparkle
  color += vec3(1.3, 1.2, 1.1) * moire_all * (0.5 + u_treble * 1.0);

  // Apply depth perspective brightness
  color *= radialFade * 0.5;

  // ---- Radial rings: interference between grids and radial frequency ----
  // Creates concentric ring moiré — extra depth layer
  float radialFreq = baseFreq * 0.4;
  float radialStripe = abs(fract(dist * radialFreq - t * 1.5) - 0.5);
  float radialGlow   = smoothstep(0.07, 0.0, radialStripe);
  vec3 radialCol = palette(
    dist * 0.5 + t * 0.2 + paletteShift + 0.6,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += radialCol * radialGlow * 0.25 * (0.5 / (dist + 0.3));

  // Audio: mid-frequency warps the pattern
  float warpAmt = u_mid * 0.06;
  float warpPat = sin(uvPersp.x * 8.0 + t * 2.0) * cos(uvPersp.y * 8.0 + t * 1.5) * warpAmt;
  color += palette(
    warpPat + t * 0.1 + paletteShift + 0.4,
    vec3(0.3, 0.3, 0.35),
    vec3(0.2, 0.2, 0.3),
    vec3(0.5, 0.7, 1.0),
    vec3(0.15, 0.1, 0.3)
  ) * abs(warpPat) * 0.3;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, dist);
  color *= vign;

  // Faint background glow
  vec3 bgCol = palette(
    t * 0.08 + paletteShift + 0.7,
    vec3(0.03, 0.03, 0.05),
    vec3(0.03, 0.03, 0.07),
    vec3(0.4, 0.5, 1.0),
    vec3(0.2, 0.1, 0.3)
  );
  color += bgCol * smoothstep(1.3, 0.0, dist) * 0.03;

  gl_FragColor = vec4(color, 1.0);
}
`;
