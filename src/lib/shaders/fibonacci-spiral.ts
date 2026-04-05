import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Golden angle in radians
const float GOLDEN_ANGLE = 2.39996323;
const float PHI = 1.61803398875;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Slow rotation
  vec2 p = rot2(t * 0.08) * uv;

  vec3 color = vec3(0.0);

  // Polar coordinates
  float r = length(p);
  float angle = atan(p.y, p.x);

  // --- Golden spiral ---
  // Logarithmic spiral: r = a * exp(b * theta)
  // b = ln(PHI) / (PI/2) for golden spiral
  float spiralB = log(PHI) / 1.5707963;
  float spiralA = 0.02;

  // Find closest spiral arm
  // theta = ln(r/a) / b, then check angular distance
  float spiralTheta = log(max(r, 0.001) / spiralA) / spiralB;
  float spiralAngle = mod(angle - spiralTheta + t * 2.0, 6.28318);
  // Multiple arms
  float numArms = 3.0;
  float armDist = abs(fract(spiralAngle / 6.28318 * numArms) - 0.5) / numArms;
  float spiralGlow = smoothstep(0.08, 0.0, armDist * r);
  float spiralCore = smoothstep(0.03, 0.0, armDist * r);

  vec3 spiralCol = palette(
    spiralTheta * 0.05 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 1.0, 0.5),
    vec3(0.0, 0.1, 0.4)
  );

  color += spiralCol * spiralGlow * 0.4;
  color += spiralCol * spiralCore * 0.8;

  // --- Phyllotaxis dots (sunflower pattern) ---
  // Each seed at angle = n * golden_angle, radius = sqrt(n) * scale
  float dotScale = 0.06 + u_bass * 0.005;
  float minDotDist = 100.0;
  float bestDotN = 0.0;

  for (int i = 1; i < 40; i++) {
    float n = float(i);
    float seedAngle = n * GOLDEN_ANGLE + t * 0.5;
    float seedR = sqrt(n) * dotScale;

    vec2 seedPos = vec2(cos(seedAngle), sin(seedAngle)) * seedR;
    float d = length(p - seedPos);

    // Pulsing radius per seed
    float pulse = sin(t * 2.0 + n * 0.3) * 0.003;
    float seedSize = 0.012 + pulse + u_treble * 0.003;

    if (d < minDotDist) {
      minDotDist = d;
      bestDotN = n;
    }

    // Dot glow
    float dotGlow = exp(-d * d / (seedSize * seedSize * 8.0));
    float dotCore = smoothstep(seedSize, seedSize * 0.3, d);

    vec3 dotCol = palette(
      n * 0.05 + t * 0.2 + paletteShift + 0.3,
      vec3(0.6, 0.5, 0.5),
      vec3(0.5, 0.5, 0.4),
      vec3(1.0, 0.8, 0.4),
      vec3(0.05, 0.1, 0.2)
    );

    color += dotCol * dotGlow * 0.15;
    color += dotCol * dotCore * 0.6;
  }

  // Fibonacci number rings (at radii sqrt(fib_n))
  // fib: 1,1,2,3,5,8,13,21
  float fibs[8];
  fibs[0] = 1.0; fibs[1] = 1.0; fibs[2] = 2.0; fibs[3] = 3.0;
  fibs[4] = 5.0; fibs[5] = 8.0; fibs[6] = 13.0; fibs[7] = 21.0;

  for (int i = 0; i < 8; i++) {
    float fibR = sqrt(fibs[i]) * dotScale;
    float ringDist = abs(r - fibR);
    float ringGlow = smoothstep(0.01, 0.0, ringDist) * 0.3;

    vec3 ringCol = palette(
      float(i) * 0.15 + t * 0.25 + paletteShift + 0.6,
      vec3(0.5, 0.5, 0.6),
      vec3(0.4, 0.4, 0.5),
      vec3(0.6, 0.8, 1.0),
      vec3(0.1, 0.1, 0.3)
    );

    color += ringCol * ringGlow;
  }

  // Center golden ratio glow
  float centerGlow = exp(-r * 15.0) * 0.3;
  vec3 centerCol = palette(
    t * 0.4 + paletteShift + 0.5,
    vec3(0.7, 0.7, 0.6),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.05, 0.15)
  );
  color += centerCol * centerGlow;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
