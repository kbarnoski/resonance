import { U, VISIONARY_PALETTE, ROT2, SMOOTH_NOISE } from "./shared";

// Infinite scrolling columns of abstract glyph-like patterns receding into depth,
// like an infinite library wall. Domain-warped grid with perspective.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SMOOTH_NOISE + `
// Abstract glyph SDF — a random combination of lines and dots per cell
float glyphSDF(vec2 p, float seed) {
  // p is in [0,1] cell space, centered at 0.5
  vec2 cp = p - 0.5;
  float s1 = fract(seed * 7.3);
  float s2 = fract(seed * 13.7);
  float s3 = fract(seed * 3.1);
  float s4 = fract(seed * 19.1);

  // Vertical stroke
  float vStroke = smoothstep(0.04, 0.01, abs(cp.x - (s1 - 0.5) * 0.3)) *
                  smoothstep(0.0, 0.35, 0.4 - abs(cp.y));
  // Horizontal stroke
  float hStroke = smoothstep(0.04, 0.01, abs(cp.y - (s2 - 0.5) * 0.25)) *
                  smoothstep(0.0, 0.35, 0.4 - abs(cp.x));
  // Dot
  float dot_ = smoothstep(0.08, 0.02, length(cp - vec2(s3 - 0.5, s4 - 0.5) * 0.3));
  // Diagonal
  float diag = smoothstep(0.035, 0.005, abs((cp.x - cp.y) * 0.7 - (s1 - 0.5) * 0.2)) *
               smoothstep(0.0, 0.35, 0.38 - length(cp));

  return max(max(vStroke, hStroke), max(dot_, diag));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.28;

  // Perspective: view library wall head-on, columns recede left-right and into depth
  // y axis = height along wall, x = lateral position
  // Depth is encoded in a Z coordinate we project through
  // Screen x narrows toward center → simulate tunnel effect
  float wallDepth = 0.6 / (abs(uv.x) + 0.15 + u_bass * 0.02); // depth by x distance
  wallDepth = clamp(wallDepth, 0.1, 8.0);

  // World-space column grid
  float colSpacing = 0.22;
  float colX = uv.x * wallDepth;                    // perspective expand
  float colY = uv.y * wallDepth * 1.4 - t * 1.2;   // scrolling down (library receding up)
  colY += snoise(vec2(colX * 0.2, t * 0.15)) * 0.3 * u_mid; // slight organic drift

  // Column ID and position within column
  float colID = floor(colX / colSpacing);
  float colFrac = fract(colX / colSpacing);

  // Row ID and position within row
  float rowH = 0.18;
  float rowID = floor(colY / rowH);
  float rowFrac = fract(colY / rowH);

  // Each cell has a unique glyph seed
  float cellSeed = fract(sin(dot(vec2(colID, rowID), vec2(127.1, 311.7))) * 43758.5);

  // Glyph brightness
  vec2 glyphUV = vec2(colFrac, rowFrac);
  float glyph = glyphSDF(glyphUV, cellSeed);

  // Age: some glyphs are "revealed" by time, creating scrolling activation
  float revealPhase = fract(t * 0.15 + cellSeed * 0.4);
  float glyphAge = smoothstep(0.0, 0.3, revealPhase) * smoothstep(1.0, 0.7, revealPhase);
  glyph *= glyphAge;

  // Depth attenuation — far columns (toward center) are dimmer and denser
  float depthAtten = 1.0 / (1.0 + wallDepth * wallDepth * 0.08);
  float farFog = exp(-wallDepth * 0.25);

  // Column dividers — subtle vertical lines between columns
  float divider = 1.0 - smoothstep(0.0, 0.015, min(colFrac, 1.0 - colFrac));
  divider *= 0.15 * farFog;

  // Row dividers — hairlines between rows
  float rowDiv = 1.0 - smoothstep(0.0, 0.02, min(rowFrac, 1.0 - rowFrac));
  rowDiv *= 0.08 * farFog;

  // Treble: fine grain on active glyphs
  float grain = snoise(vec2(colX * 15.0, colY * 15.0) + t) * u_treble * 0.12 * glyph;

  // Palette
  vec3 c1 = palette(cellSeed * 0.4 + colID * 0.05 + paletteShift,
    vec3(0.4, 0.6, 0.5), vec3(0.4, 0.4, 0.3), vec3(1.0, 0.8, 1.2), vec3(0.0, 0.3, 0.5));
  vec3 c2 = palette(rowID * 0.03 + t * 0.05 + glyphAge * 0.3 + u_mid * 0.2 + paletteShift,
    vec3(0.6, 0.5, 0.8), vec3(0.4, 0.3, 0.4), vec3(0.8, 1.2, 0.9), vec3(0.3, 0.0, 0.2));
  vec3 c3 = palette(wallDepth * 0.08 + paletteShift * 0.5,
    vec3(0.1, 0.15, 0.2), vec3(0.2, 0.2, 0.3), vec3(1.0, 0.8, 1.0), vec3(0.4, 0.3, 0.0));

  vec3 color = c3 * 0.15; // background library wall
  color += c1 * glyph * depthAtten * (0.6 + u_amplitude * 0.5);
  color += c2 * (divider + rowDiv);
  color += vec3(1.0) * grain;

  // Vanishing point glow at center x
  float vanishGlow = exp(-uv.x * uv.x * 15.0) * exp(-abs(uv.y) * 3.0) * 0.15;
  color += c2 * vanishGlow * (0.4 + u_bass * 0.4);

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
