import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Order decaying to chaos — structured geometric patterns dissolving into noise.
// Left side: perfect grid. Right side: entropic dissolution. Boundary shifts.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;

  // ── Decay boundary — moves with time, bass pushes it ──
  float boundary = sin(t * 0.3) * 0.3 + u_bass * 0.2;
  float decay = smoothstep(boundary - 0.4, boundary + 0.4, uv.x);

  // ── Ordered structure — grid pattern ──
  vec2 gridUV = uv * 8.0 + vec2(t * 0.2, 0.0);
  vec2 gridCell = fract(gridUV) - 0.5;
  vec2 gridID = floor(gridUV);
  float gridLine = min(abs(gridCell.x), abs(gridCell.y));
  float grid = smoothstep(0.02, 0.04, gridLine);

  // ── Dissolving the grid — noise displaces grid coordinates ──
  float noiseStr = decay * 2.0;
  vec2 displacedUV = gridUV + vec2(
    fbm4(uv * 2.0 + vec2(t * 0.3, 0.0)),
    fbm4(uv * 2.0 + vec2(0.0, t * 0.3))
  ) * noiseStr;

  vec2 dCell = fract(displacedUV) - 0.5;
  float dGrid = min(abs(dCell.x), abs(dCell.y));
  float dissolvedGrid = smoothstep(0.02, 0.04 + decay * 0.1, dGrid);

  // Blend between ordered and dissolved
  float pattern = mix(grid, dissolvedGrid, decay);

  // ── Entropy particles — emerge where structure breaks down ──
  float entropyNoise = fbm4(uv * 5.0 * rot2(t * 0.2) + t * 0.5);
  float particles = smoothstep(0.3, 0.6, entropyNoise) * decay;

  // ── Colors ──
  // Ordered side — cold, precise blues
  vec3 orderColor = palette(
    gridLine * 3.0 + u_amplitude * 0.2,
    vec3(0.02, 0.03, 0.06),
    vec3(0.05, 0.06, 0.12),
    vec3(0.3, 0.5, 0.8),
    vec3(0.1, 0.15, 0.3)
  );

  // Chaotic side — hot reds and decay purples
  vec3 chaosColor = palette(
    entropyNoise * 2.0 + t * 0.3,
    vec3(0.08, 0.02, 0.02),
    vec3(0.15, 0.05, 0.08),
    vec3(0.7, 0.3, 0.5),
    vec3(0.0, 0.1, 0.2)
  );

  // Grid line glow
  vec3 lineColor = palette(
    t * 0.2 + decay * 2.0,
    vec3(0.1, 0.08, 0.15),
    vec3(0.15, 0.1, 0.2),
    vec3(0.6, 0.4, 0.9),
    vec3(0.15, 0.1, 0.25)
  );

  // ── Compositing ──
  vec3 baseColor = mix(orderColor, chaosColor, decay);
  vec3 color = baseColor;

  // Grid/dissolved grid lines
  float lineGlow = (1.0 - pattern) * (0.4 + u_mid * 0.3);
  color += lineColor * lineGlow;

  // Entropy particles glow hot
  color += vec3(0.6, 0.15, 0.1) * particles * 0.4 * (0.5 + u_treble * 0.5);

  // Dissolution sparks at the boundary
  float boundaryDist = abs(uv.x - boundary);
  float sparks = smoothstep(0.3, 0.0, boundaryDist) * pow(fract(entropyNoise * 5.0), 8.0);
  color += vec3(0.9, 0.5, 0.2) * sparks * 0.6;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
