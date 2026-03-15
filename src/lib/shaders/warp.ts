import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + VISIONARY_PALETTE + ROT2 + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Interesting Mandelbrot coordinates to zoom into
  // Seahorse valley, elephant valley, spiral
  vec2 target0 = vec2(-0.743643887037151, 0.131825904205330);
  vec2 target1 = vec2(-0.16070135, 1.0375665);
  vec2 target2 = vec2(-1.25066, 0.02012);

  // Smooth transitions between targets
  float cycleTime = 45.0;
  float t = mod(u_time * 0.08, 3.0);
  float seg = floor(t);
  float frac = fract(t);
  // Smooth interpolation
  float s = frac * frac * (3.0 - 2.0 * frac);

  vec2 target;
  if (seg < 1.0) {
    target = mix(target0, target1, s);
  } else if (seg < 2.0) {
    target = mix(target1, target2, s);
  } else {
    target = mix(target2, target0, s);
  }

  // Deep zoom — continuous logarithmic
  float zoomSpeed = 0.12 + u_bass * 0.04;
  float zoom = exp(-mod(u_time * zoomSpeed, 25.0));

  // Slow view rotation
  float viewAngle = u_time * 0.015 + u_amplitude * 0.4;
  uv = rot2(viewAngle) * uv;
  uv = uv * zoom + target;

  // Mandelbrot iteration with orbit traps
  vec2 c = uv;
  vec2 z = vec2(0.0);

  float trapCircle = 1e10;   // circle trap
  float trapCrossX = 1e10;   // cross trap X
  float trapCrossY = 1e10;   // cross trap Y
  float trapPoint = 1e10;    // point trap at (0, 0)
  vec2 trapPointPos = vec2(0.0);

  float iter = 0.0;
  int maxIter = 150;

  // Treble modulates escape radius for detail enhancement
  float escapeR = 4.0 + u_treble * 12.0;

  for (int i = 0; i < 150; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;

    float dCircle = length(z);
    float dCrossX = abs(z.y);
    float dCrossY = abs(z.x);
    float dPoint = length(z - vec2(0.0, 0.0));

    if (dCircle < trapCircle) {
      trapCircle = dCircle;
      trapPointPos = z;
    }
    trapCrossX = min(trapCrossX, dCrossX);
    trapCrossY = min(trapCrossY, dCrossY);
    trapPoint = min(trapPoint, dPoint);

    if (dot(z, z) > escapeR) break;
    iter += 1.0;
  }

  // Smooth iteration count
  float sl = iter - log2(log2(dot(z, z))) + 4.0;
  float normIter = sl / float(maxIter);

  // Palette offset — amplitude slowly rotates
  float paletteShift = u_amplitude * 0.25 + u_time * 0.015;

  // Channel 1: iteration-based color — deep blue to violet spectrum
  vec3 col1 = palette(
    normIter * 4.0 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 1.0),
    vec3(0.00, 0.10, 0.20)
  );

  // Channel 2: circle trap — warm amber/magenta
  vec3 col2 = palette(
    trapCircle * 3.0 + paletteShift + 0.33,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.00, 0.15, 0.20)
  );

  // Channel 3: cross trap — electric cyan/green
  float trapCross = min(trapCrossX, trapCrossY);
  vec3 col3 = palette(
    trapCross * 5.0 + paletteShift + 0.67,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 0.5),
    vec3(0.30, 0.20, 0.20)
  );

  // Channel 4: point trap — deep violet emissive
  vec3 col4 = palette(
    trapPoint * 2.0 + paletteShift + 1.0,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.7, 1.0, 1.0),
    vec3(0.80, 0.90, 0.30)
  );

  // Blend channels using exponential falloff of trap distances
  float wCircle = exp(-trapCircle * 4.0);
  float wCross = exp(-trapCross * 8.0);
  float wPoint = exp(-trapPoint * 5.0);
  float wIter = max(1.0 - wCircle - wCross - wPoint, 0.0);

  vec3 color = col1 * wIter + col2 * wCircle + col3 * wCross + col4 * wPoint;

  // u_mid shifts overall color intensity
  color *= 0.8 + u_mid * 0.4;

  // Interior — deep dark trap-colored
  if (iter >= float(maxIter) - 0.5) {
    vec3 interiorCol = palette(
      trapCircle * 6.0 + atan(trapPointPos.y, trapPointPos.x) * 0.5 + paletteShift,
      vec3(0.02, 0.01, 0.04),
      vec3(0.15, 0.1, 0.25),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.05, 0.15)
    );
    color = interiorCol * 0.4;
  }

  // Emissive highlights — warm white near circle trap minima
  float emCircle = exp(-trapCircle * 12.0) * 2.0;
  color += emCircle * vec3(1.3, 1.1, 0.9);

  // Emissive highlights — cool white near cross trap minima
  float emCross = exp(-trapCross * 18.0) * 1.5;
  color += emCross * vec3(0.9, 1.05, 1.3);

  // Point trap emissive — pale violet
  float emPoint = exp(-trapPoint * 14.0) * 1.2;
  color += emPoint * vec3(1.1, 0.9, 1.3);

  // Boundary glow
  float boundary = exp(-abs(iter - float(maxIter) * 0.3) * 0.04);
  color += boundary * 0.2 * vec3(0.9, 0.95, 1.15);

  // Fade far-escaped to black
  float fadeToBlack = smoothstep(0.92, 1.0, normIter);
  color *= (1.0 - fadeToBlack);

  gl_FragColor = vec4(color, 1.0);
}
`;
