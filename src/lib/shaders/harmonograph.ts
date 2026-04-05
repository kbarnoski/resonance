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

  vec3 color = vec3(0.0);

  // Harmonograph: sum of damped pendulums
  // Three independent curves drawn simultaneously
  for (int curve = 0; curve < 3; curve++) {
    float fc = float(curve);

    // Each curve has different frequency ratios for its pendulums
    // creating distinct Lissajous-like figures
    float f1x = 2.0 + fc * 1.0;
    float f1y = 3.0 + fc * 0.7;
    float f2x = 3.0 - fc * 0.5;
    float f2y = 2.0 + fc * 1.3;

    // Phase evolves with time for slow morphing
    float p1 = t * (0.3 + fc * 0.1);
    float p2 = t * (0.2 - fc * 0.05) + fc * 2.094;

    // Audio modulates frequency ratios slightly
    f1x += u_bass * 0.2;
    f2y += u_mid * 0.15;

    // Find minimum distance from this pixel to the curve
    // Sample the curve at many points
    float minDist = 100.0;
    float bestParam = 0.0;

    for (int i = 0; i < 40; i++) {
      float s = float(i) / 40.0 * 12.566; // 0 to 4*PI

      // Damping
      float decay = exp(-s * 0.02);

      // Harmonograph position: sum of two pendulums
      float x = sin(s * f1x + p1) * decay * 0.45
              + sin(s * f2x + p2) * decay * 0.35;
      float y = sin(s * f1y + p1 + 1.57) * decay * 0.45
              + cos(s * f2y + p2) * decay * 0.35;

      vec2 curveP = vec2(x, y);
      float d = length(uv - curveP);

      if (d < minDist) {
        minDist = d;
        bestParam = s;
      }
    }

    // Glow and core
    float lineWidth = 0.005 + u_treble * 0.002;
    float glow = exp(-minDist / (lineWidth * 8.0)) * 0.5;
    float core = smoothstep(lineWidth * 2.0, 0.0, minDist);

    // Color varies along the curve parameter
    vec3 curveCol = palette(
      bestParam * 0.08 + fc * 0.33 + t * 0.25 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.7 + fc * 0.1, 1.0, 0.5),
      vec3(0.0, 0.1 + fc * 0.1, 0.4)
    );

    // Decay fades the intensity along the curve
    float decayVis = exp(-bestParam * 0.04);
    float intensity = (glow * 0.5 + core * 1.2) * (0.4 + decayVis * 0.6);

    color += curveCol * intensity;
  }

  // Central pivot glow
  float pivotGlow = exp(-length(uv) * 8.0) * 0.15;
  vec3 pivotCol = palette(
    t * 0.4 + paletteShift + 0.5,
    vec3(0.6, 0.6, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.25)
  );
  color += pivotCol * pivotGlow;

  // Faint noise texture for depth
  float n = snoise(uv * 8.0 + t) * 0.02;
  color += vec3(n * 0.3, n * 0.2, n * 0.5) * 0.5;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
