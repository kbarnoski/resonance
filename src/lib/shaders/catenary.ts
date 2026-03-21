import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// WebGL 1 polyfill — cosh is WebGL 2 only
float cosh_poly(float x) { return (exp(x) + exp(-x)) * 0.5; }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Gentle rotation
  vec2 uvR = rot2(t * 0.04) * uv;

  // Multiple catenary curves draped between anchor points
  // catenary: y = a * cosh_poly((x - x0) / a) + y0
  // The hanging curve of minimum potential energy

  float totalGlow = 0.0;
  float nearestDist = 999.0;
  float nearestIdx = 0.0;

  // 8 catenary chains at different heights and sag amounts
  for (int i = 0; i < 8; i++) {
    float fi = float(i);

    // Anchor points drift slowly
    float leftX = -0.8 + sin(t * 0.3 + fi * 1.1) * 0.15;
    float rightX = 0.8 + sin(t * 0.25 + fi * 1.7) * 0.15;
    float anchorY = 0.4 - fi * 0.12 + sin(t * 0.2 + fi * 0.9) * 0.08;

    // Sag parameter: smaller a = deeper sag. Bass makes chains heavier
    float a = 0.3 + fi * 0.06 - u_bass * 0.08;
    a = max(a, 0.08); // prevent collapse

    // Center of the catenary
    float midX = (leftX + rightX) * 0.5;
    float span = rightX - leftX;

    // Parametric evaluation: for the current x, what y does the catenary give?
    float localX = uvR.x - midX;

    // Only evaluate within span
    float normX = localX / (span * 0.5);
    float inSpan = smoothstep(1.1, 0.95, abs(normX));

    if (inSpan > 0.001) {
      // Catenary curve
      float catenaryY = a * (cosh_poly(localX / a) - cosh_poly(span * 0.5 / a)) + anchorY;

      // Gravity wave: chains swing slightly with mid frequencies
      catenaryY += sin(localX * 6.0 + t * 3.0 + fi * 1.5) * u_mid * 0.015;

      // Distance from pixel to the curve
      float d = abs(uvR.y - catenaryY);

      // Chain link effect: periodic brightness along the curve
      float chainPhase = fract(localX * 15.0 + t * 0.5 + fi * 0.3);
      float linkBright = 0.7 + 0.3 * smoothstep(0.3, 0.5, chainPhase) * smoothstep(0.7, 0.5, chainPhase);

      // Thickness varies: thicker at bottom of sag (more weight)
      float sagDepth = cosh_poly(localX / a) - cosh_poly(span * 0.5 / a);
      float thick = 0.005 + abs(sagDepth) * 0.003 + u_amplitude * 0.003;

      float glow = smoothstep(thick * 8.0, 0.0, d) * inSpan;
      float core = smoothstep(thick, 0.0, d) * inSpan;

      // Chain color
      vec3 chainCol = palette(
        fi * 0.12 + localX * 0.5 + t * 0.3 + paletteShift,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.4, 0.5),
        vec3(1.0, 0.8, 0.5),
        vec3(0.0, 0.1, 0.25)
      );

      color += chainCol * glow * 0.3 * linkBright;
      color += chainCol * core * 1.2 * linkBright;

      // Treble sparkle on chain links
      color += vec3(1.0, 0.95, 0.85) * core * u_treble * 0.4 * linkBright;

      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = fi;
      }
      totalGlow += glow;
    }

    // Draw anchor points as bright nodes
    vec2 leftAnchor = vec2(leftX, anchorY);
    vec2 rightAnchor = vec2(rightX, anchorY);
    float dLeft = length(uvR - leftAnchor);
    float dRight = length(uvR - rightAnchor);

    float anchorSize = 0.012 + u_bass * 0.005;
    float anchorGlowL = smoothstep(anchorSize * 4.0, 0.0, dLeft);
    float anchorGlowR = smoothstep(anchorSize * 4.0, 0.0, dRight);
    float anchorCoreL = smoothstep(anchorSize, 0.0, dLeft);
    float anchorCoreR = smoothstep(anchorSize, 0.0, dRight);

    vec3 anchorCol = palette(
      fi * 0.2 + t * 0.5 + paletteShift + 0.3,
      vec3(0.8, 0.8, 0.8),
      vec3(0.4, 0.3, 0.5),
      vec3(0.8, 0.6, 1.0),
      vec3(0.0, 0.05, 0.2)
    );

    color += anchorCol * (anchorGlowL + anchorGlowR) * 0.5;
    color += vec3(1.0, 0.97, 0.9) * (anchorCoreL + anchorCoreR) * 1.2;
  }

  // Gravity field: subtle vertical gradient showing the force
  float gravity = smoothstep(0.5, -0.8, uvR.y) * 0.08;
  vec3 gravCol = palette(
    uvR.y * 1.5 + t * 0.1 + paletteShift + 0.6,
    vec3(0.03, 0.03, 0.06),
    vec3(0.04, 0.03, 0.07),
    vec3(0.3, 0.5, 0.9),
    vec3(0.1, 0.1, 0.3)
  );
  color += gravCol * gravity;

  // Energy lines: faint vertical threads showing potential energy
  float energyLines = sin(uvR.x * 40.0 + t * 0.5) * 0.5 + 0.5;
  energyLines *= smoothstep(0.0, 0.5, totalGlow);
  color += vec3(0.15, 0.12, 0.2) * energyLines * 0.05;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
