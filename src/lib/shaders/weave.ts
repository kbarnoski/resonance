import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

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

  // Perspective projection for 3D depth
  vec2 p = uv;
  float perspY = p.y * 0.8 + 0.3;
  float perspScale = 1.0 / (perspY + 1.2);
  vec2 pp = vec2(p.x * perspScale, perspY * perspScale);

  // Scroll the weave
  pp.y += t * 0.5;
  pp.x += t * 0.15;

  vec3 color = vec3(0.0);

  // Multiple sine-wave ribbons
  int numRibbons = 8;
  float ribbonWidth = 0.06 + u_bass * 0.01;

  // Store z-depths for over/under sorting
  float ribbonZ[8];
  float ribbonDist[8];
  float ribbonPhase[8];

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float ribbonY = (fi - 3.5) * 0.18; // spread ribbons vertically

    // Sine wave path for each ribbon
    float freq = 2.5 + fi * 0.3;
    float phase = fi * 0.785 + t * (0.5 + fi * 0.1);
    float wave = sin(pp.x * freq + phase) * 0.12;

    // Z-depth oscillates (over/under pattern)
    float z = sin(pp.x * freq * 0.5 + phase * 0.5 + fi * 1.047) * 0.5 + 0.5;

    // Distance from pixel to ribbon center
    float d = abs(pp.y - ribbonY - wave) - ribbonWidth * 0.5;

    ribbonZ[i] = z;
    ribbonDist[i] = d;
    ribbonPhase[i] = phase;
  }

  // Sort-free approach: render back-to-front by checking z
  // Two passes: background ribbons (z < 0.5), then foreground (z >= 0.5)
  for (int pass = 0; pass < 2; pass++) {
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float z = ribbonZ[i];
      float d = ribbonDist[i];

      bool isBack = z < 0.5;
      if ((pass == 0 && !isBack) || (pass == 1 && isBack)) continue;

      // Ribbon glow and core
      float glow = exp(-max(d, 0.0) * 25.0);
      float core = smoothstep(0.005, -0.01, d);

      // Edge highlight
      float edgeDist = abs(d + ribbonWidth * 0.5);
      float edge = smoothstep(0.01, 0.0, edgeDist);

      // Depth shading
      float depthShade = isBack ? 0.4 : 1.0;

      // Color per ribbon
      vec3 ribCol = palette(
        fi * 0.12 + t * 0.2 + paletteShift + pp.x * 0.1,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.4, 0.6),
        vec3(0.7 + fi * 0.04, 1.0, 0.5),
        vec3(0.0 + fi * 0.02, 0.1, 0.4)
      );

      vec3 edgeColor = palette(
        fi * 0.15 + t * 0.3 + paletteShift + 0.5,
        vec3(0.7, 0.7, 0.7),
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.9, 1.0),
        vec3(0.0, 0.05, 0.25)
      );

      // Sheen: light reflecting off curved ribbon surface
      float sheen = pow(max(1.0 - abs(d + ribbonWidth * 0.25) / (ribbonWidth * 0.5), 0.0), 3.0);

      color = mix(color, ribCol * depthShade * 0.3, core * depthShade);
      color += ribCol * glow * 0.15 * depthShade;
      color += edgeColor * edge * 0.5 * depthShade;
      color += ribCol * sheen * core * 0.4 * depthShade;

      // Crossing highlight: where ribbons overlap, emphasize the weave
      if (pass == 1 && core > 0.5) {
        // Check if a back ribbon is also here
        for (int j = 0; j < 8; j++) {
          if (ribbonZ[j] < 0.5 && ribbonDist[j] < 0.01) {
            vec3 crossCol = palette(
              (fi + float(j)) * 0.1 + t * 0.4 + paletteShift + 0.3,
              vec3(0.6, 0.6, 0.6),
              vec3(0.5, 0.5, 0.5),
              vec3(0.5, 0.9, 1.0),
              vec3(0.0, 0.05, 0.25)
            );
            color += crossCol * 0.15;
            break;
          }
        }
      }
    }
  }

  // Audio: treble adds shimmer
  float shimmer = snoise(pp * 20.0 + t * 3.0) * u_treble * 0.08;
  color += vec3(shimmer * 0.5, shimmer * 0.3, shimmer);

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
