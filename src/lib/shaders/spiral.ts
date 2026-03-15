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

  // Polar coordinates
  float r     = length(uv);
  float theta = atan(uv.y, uv.x);

  // Golden ratio: phi = (1 + sqrt(5)) / 2
  float phi   = 1.61803398875;
  float logPhi = log(phi);

  // --- Infinite zoom: time continuously reduces scale ---
  // The spiral appears to zoom inward forever by logarithmically cycling scale
  float zoomCycle = mod(t * 0.5, logPhi); // cycles over one golden-ratio zoom period
  float logR = log(r) - zoomCycle;

  // --- Logarithmic spiral arm distance ---
  // For a golden spiral: r = e^(logPhi * theta / (pi/2))
  // => log(r) = logPhi * theta / (pi/2)
  // We want to find the nearest arm:
  // arm index n: log(r) - logPhi * (theta + 2*pi*n) / (pi/2) = 0
  // => n = (log(r) * (pi/2) / logPhi - theta) / (2*pi)
  float spiralPhase = (logR * 1.5708 / logPhi - theta) / 6.28318;
  float nearestArm  = round(spiralPhase);
  float distToArm   = abs(spiralPhase - nearestArm);

  // Arms get thinner as we approach center (smaller r => infinite arms)
  float armThick = 0.06 + u_bass * 0.02;
  float armGlow  = smoothstep(armThick, 0.0, distToArm);
  float armCore  = smoothstep(armThick * 0.3, 0.0, distToArm);

  // Color: vary along angle and depth
  float colorT = theta / 6.28318 + logR * 0.25 + t * 0.3 + paletteShift;
  vec3 col1 = palette(
    colorT,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 1.0, 0.4),
    vec3(0.0, 0.15, 0.4)
  );
  vec3 col2 = palette(
    colorT + 0.5,
    vec3(0.5, 0.4, 0.3),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.7, 0.3),
    vec3(0.05, 0.2, 0.0)
  );

  vec3 color = vec3(0.0);
  color += col1 * armGlow * 0.5;
  color += mix(col1, col2, 0.4) * armCore * 1.3;

  // --- Fibonacci dots along spiral arms ---
  // Distribute points at golden-ratio angles (sunflower phyllotaxis),
  // placed on the spiral at those radii.
  int numDots = 80;
  for (int i = 1; i <= numDots; i++) {
    float fi   = float(i);
    // Golden angle: 2*pi*(1 - 1/phi) = 2.39996 rad
    float dotTheta = fi * 2.39996 - t * 0.4;
    // Corresponding radius on the log spiral
    float dotLogR  = dotTheta * logPhi / 1.5708 + zoomCycle;
    float dotR     = exp(dotLogR);

    // Skip dots outside visible range
    if (dotR > 1.6 || dotR < 0.005) continue;

    vec2 dotPos = vec2(dotR * cos(dotTheta), dotR * sin(dotTheta));
    float dotDist = length(uv - dotPos);

    // Dot radius scales with spiral radius (log-uniform spacing)
    float dotSize  = dotR * 0.025 + u_treble * 0.008;
    float dotGlow  = smoothstep(dotSize * 3.5, 0.0, dotDist);
    float dotCore  = smoothstep(dotSize, 0.0, dotDist);

    // Palette for dots: warm gold
    vec3 dotCol = palette(
      fi * 0.05 + t * 0.5 + paletteShift + 0.2,
      vec3(0.6, 0.55, 0.4),
      vec3(0.5, 0.4, 0.3),
      vec3(1.0, 0.8, 0.3),
      vec3(0.0, 0.1, 0.2)
    );
    color += dotCol * dotGlow * 0.6;
    color += vec3(1.2, 1.1, 0.9) * dotCore * 1.4;
  }

  // Center singularity glow — infinite convergence point
  float singularity = smoothstep(0.15, 0.0, r);
  vec3 singCol = palette(
    t * 0.3 + paletteShift + 0.1,
    vec3(0.6, 0.5, 0.4),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.05, 0.1)
  );
  color += singCol * singularity * 0.5;

  // Background: faint gradient
  vec3 bgCol = palette(
    r * 0.3 + t * 0.08 + paletteShift + 0.6,
    vec3(0.03, 0.03, 0.05),
    vec3(0.03, 0.03, 0.07),
    vec3(0.4, 0.6, 1.0),
    vec3(0.2, 0.1, 0.3)
  );
  color += bgCol * smoothstep(1.3, 0.0, r) * 0.04;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, r);
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
