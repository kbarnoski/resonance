import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + VISIONARY_PALETTE + ROT2 + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Continuous logarithmic zoom — smoothly zooms in forever
  float zoomSpeed = 0.15 + u_bass * 0.05;
  float zoom = exp(-mod(u_time * zoomSpeed, 20.0));
  // Slow rotation of the view
  float viewAngle = u_time * 0.03 + u_amplitude * 0.5;
  uv = rot2(viewAngle) * uv;
  uv *= zoom;

  // Zoom center — a visually interesting Julia region
  vec2 center = vec2(-0.745, 0.186);
  uv += center;

  // Julia C parameter — bass controls modulation speed
  float cSpeed = 0.2 + u_bass * 0.15;
  vec2 c = vec2(
    -0.7269 + 0.08 * sin(u_time * cSpeed),
    0.1889 + 0.08 * cos(u_time * cSpeed * 0.7)
  );

  // Orbit trap variables
  float trapCircle = 1e10;   // circle trap at origin
  float trapCrossX = 1e10;   // cross trap along X axis
  float trapCrossY = 1e10;   // cross trap along Y axis

  vec2 z = uv;
  float iter = 0.0;
  int maxIter = 128;

  // Treble drives detail sensitivity — adjusts escape radius
  float escapeR = 4.0 + u_treble * 8.0;

  for (int i = 0; i < 128; i++) {
    // z = z^2 + c
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;

    // Update orbit traps
    float distCircle = length(z);
    float distX = abs(z.y);
    float distY = abs(z.x);

    trapCircle = min(trapCircle, distCircle);
    trapCrossX = min(trapCrossX, distX);
    trapCrossY = min(trapCrossY, distY);

    if (dot(z, z) > escapeR) break;
    iter += 1.0;
  }

  // Smooth iteration count
  float sl = iter - log2(log2(dot(z, z))) + 4.0;
  float t1 = sl / float(maxIter);

  // Palette offset rotates slowly with amplitude
  float paletteShift = u_amplitude * 0.3 + u_time * 0.02;

  // Color from smooth iteration count
  vec3 col1 = palette(
    t1 * 3.0 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.33, 0.67)
  );

  // Color from circle orbit trap distance
  vec3 col2 = palette(
    trapCircle * 2.0 + paletteShift + 0.5,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.20)
  );

  // Color from cross trap — warm tones
  float trapCross = min(trapCrossX, trapCrossY);
  vec3 col3 = palette(
    trapCross * 4.0 + paletteShift + 1.0,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(2.0, 1.0, 0.0),
    vec3(0.50, 0.20, 0.25)
  );

  // Blend orbit trap colors
  float circleWeight = exp(-trapCircle * 3.0);
  float crossWeight = exp(-trapCross * 6.0);
  float iterWeight = 1.0 - circleWeight - crossWeight;
  iterWeight = max(iterWeight, 0.0);

  vec3 color = col1 * iterWeight + col2 * circleWeight + col3 * crossWeight;

  // Interior points — use trap coloring with deep rich tones
  if (iter >= float(maxIter) - 0.5) {
    vec3 interiorCol = palette(
      trapCircle * 5.0 + paletteShift,
      vec3(0.02, 0.01, 0.03),
      vec3(0.2, 0.15, 0.3),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.1, 0.2)
    );
    color = interiorCol * 0.5;
  }

  // Emissive highlights at orbit trap minima — warm white tint
  float emissive = exp(-trapCircle * 10.0) * 1.8;
  emissive += exp(-trapCross * 15.0) * 1.4;
  // Warm white: slight amber tint, never pure vec3(1.0)
  color += emissive * vec3(1.3, 1.15, 0.95);

  // Boundary glow — cool white tint
  float boundary = exp(-abs(iter - float(maxIter) * 0.5) * 0.05);
  color += boundary * 0.3 * vec3(0.85, 0.95, 1.2);

  // Black background for escaped/diverged regions far from traps
  float fadeToBlack = smoothstep(0.95, 1.0, t1);
  color *= (1.0 - fadeToBlack);

  gl_FragColor = vec4(color, 1.0);
}
`;
