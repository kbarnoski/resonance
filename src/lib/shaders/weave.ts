import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Perspective: treat UV as view rays, pull grid toward vanishing point
  // Simulate a receding woven floor/wall by using a projective mapping
  float perspStrength = 1.2 + u_bass * 0.3;
  // Distance from center scales grid frequency
  float dist = length(uv);

  // Flying speed through the weave
  float speed = 0.5 + u_bass * 0.2;
  float camZ = t * speed;

  // Project uv through a perspective grid:
  // grid coordinates grow denser toward center (vanishing point)
  vec2 perspUV = uv * perspStrength / (dist * 0.4 + 0.3);

  // Also add gentle rotation drift
  perspUV = rot2(t * 0.04 + u_mid * 0.1) * perspUV;

  // Scroll the grid forward (depth scroll)
  perspUV.y += camZ * 2.0;
  perspUV.x += camZ * 0.3;

  // Warp factor driven by audio for waviness
  perspUV.x += sin(perspUV.y * 0.5 + t * 1.5) * u_mid * 0.08;
  perspUV.y += cos(perspUV.x * 0.5 + t * 1.2) * u_mid * 0.06;

  // ---- Weave logic ----
  // Over/under determined by floor parity
  vec2 cell  = floor(perspUV);
  vec2 cellF = fract(perspUV);

  // Alternating strand direction based on cell parity
  float parityX = mod(cell.x, 2.0);
  float parityY = mod(cell.y, 2.0);

  // Strand thickness reacts to bass
  float strandW = 0.38 + u_bass * 0.06;
  float gapW    = 1.0 - strandW;

  // Horizontal and vertical strands
  float hStrand = step(gapW * 0.5, cellF.y) * step(cellF.y, 1.0 - gapW * 0.5);
  float vStrand = step(gapW * 0.5, cellF.x) * step(cellF.x, 1.0 - gapW * 0.5);

  // Over/under crossing: when both strands overlap, one goes on top
  float crossing = hStrand * vStrand;
  // Alternating cells determine which strand is on top
  float hOnTop = step(0.5, mod(cell.x + cell.y, 2.0));

  // Shadow: strand going underneath gets a shadow at crossing
  float shadowH = crossing * (1.0 - hOnTop) * 0.6;
  float shadowV = crossing * hOnTop * 0.6;

  // Edge highlight at strand boundaries (gives woven thread look)
  float edgeH = smoothstep(0.0, 0.08, cellF.y - gapW * 0.5) *
                smoothstep(0.0, 0.08, (1.0 - gapW * 0.5) - cellF.y);
  float edgeV = smoothstep(0.0, 0.08, cellF.x - gapW * 0.5) *
                smoothstep(0.0, 0.08, (1.0 - gapW * 0.5) - cellF.x);

  // Depth fade: things far from center (large perspUV) fade
  float depthFade = 1.0 / (1.0 + dist * 0.6);
  depthFade = clamp(depthFade, 0.0, 1.0);

  // Color each set of strands differently using palette
  float colorPhaseH = cell.x * 0.15 + cell.y * 0.07 + t * 0.3 + paletteShift;
  float colorPhaseV = cell.x * 0.07 + cell.y * 0.15 + t * 0.3 + paletteShift + 0.5;

  vec3 colH = palette(
    colorPhaseH,
    vec3(0.5, 0.4, 0.3),
    vec3(0.5, 0.4, 0.4),
    vec3(0.8, 1.0, 0.5),
    vec3(0.0, 0.2, 0.4)
  );
  vec3 colV = palette(
    colorPhaseV,
    vec3(0.4, 0.5, 0.5),
    vec3(0.4, 0.4, 0.5),
    vec3(0.6, 0.8, 1.0),
    vec3(0.3, 0.1, 0.0)
  );

  // Highlight color at crossings — third palette lookup
  vec3 colCross = palette(
    (cell.x + cell.y) * 0.1 + t * 0.5 + paletteShift + 0.25,
    vec3(0.6, 0.6, 0.5),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.8, 0.4),
    vec3(0.1, 0.1, 0.2)
  );

  vec3 color = vec3(0.0);

  // Horizontal strand layer
  color += colH * hStrand * (1.0 - shadowH) * edgeH * depthFade;
  // Vertical strand layer
  color += colV * vStrand * (1.0 - shadowV) * edgeV * depthFade;
  // Crossing highlight (treble shimmer)
  color += colCross * crossing * (edgeH * edgeV) * (0.4 + u_treble * 0.8) * depthFade;

  // Treble sparkle along strand edges
  float sparkle = (1.0 - edgeH) * hStrand * u_treble + (1.0 - edgeV) * vStrand * u_treble;
  color += vec3(1.1, 1.1, 1.3) * sparkle * 0.15 * depthFade;

  // Background glow
  float bg = smoothstep(1.4, 0.0, dist) * 0.04;
  vec3 bgCol = palette(
    t * 0.1 + paletteShift + 0.6,
    vec3(0.05, 0.05, 0.1),
    vec3(0.05, 0.05, 0.15),
    vec3(0.5, 0.5, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += bgCol * bg;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, dist);
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
