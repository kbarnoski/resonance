import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

// Sacred geometry grid: interlocking triangles (Sri Yantra-inspired),
// nested within circles, pulsing energy lines along edges.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Outer bounding square (bhupura)
  float outerBox = abs(sdBox(uv, vec2(0.7 + 0.02 * u_bass)));
  float outerBoxLine = smoothstep(0.008, 0.0, outerBox);
  // Second concentric square
  float innerBox = abs(sdBox(uv, vec2(0.65 + 0.015 * u_bass)));
  float innerBoxLine = smoothstep(0.006, 0.0, innerBox);
  // Third (innermost) square
  float thirdBox = abs(sdBox(uv, vec2(0.6 + 0.01 * u_bass)));
  float thirdBoxLine = smoothstep(0.005, 0.0, thirdBox);

  vec3 frameCol = palette(
    paletteShift + 0.1,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.3),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.1, 0.2)
  );
  color += frameCol * (outerBoxLine + innerBoxLine * 0.8 + thirdBoxLine * 0.6) * (0.7 + 0.3 * u_mid);

  // Gate protrusions on four sides
  for (int g = 0; g < 4; g++) {
    vec2 guv = rot2(float(g) * 1.5708) * uv;
    float gate = sdBox(guv - vec2(0.0, 0.72), vec2(0.08, 0.04));
    float gateLine = smoothstep(0.005, 0.0, abs(gate));
    color += frameCol * gateLine * 0.8;
  }

  // Concentric circles (3 rings)
  for (int ci = 0; ci < 3; ci++) {
    float crad = 0.52 - float(ci) * 0.06 + 0.01 * u_mid;
    float circle = smoothstep(0.005, 0.0, abs(r - crad));
    color += frameCol * circle * (0.9 - float(ci) * 0.2);
  }

  // Interlocking triangles: 4 upward, 5 downward (Sri Yantra pattern)
  // Upward triangles at different scales
  float triAccum = 0.0;
  for (int ti = 0; ti < 4; ti++) {
    float fi = float(ti);
    float scale = 0.42 - fi * 0.08;
    float yOff = -0.03 * fi + 0.05;
    vec2 tp = uv - vec2(0.0, yOff);
    float tri = sdTriangle(tp, scale + 0.01 * sin(t * 1.5 + fi * 1.2) * u_bass);
    float triLine = smoothstep(0.006, 0.0, abs(tri));

    // Energy pulse traveling along edges
    float edgePhase = fract(t * 0.5 + fi * 0.25 + u_bass * 0.3);
    float energy = smoothstep(0.01, 0.0, abs(tri)) * smoothstep(0.0, 0.1, sin(a * 3.0 + r * 20.0 - edgePhase * 18.0));

    vec3 triCol = palette(
      fi * 0.18 + paletteShift + 0.2,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.6, 0.3),
      vec3(0.0, 0.2, 0.4)
    );

    color += triCol * triLine * (0.8 + 0.3 * u_amplitude);
    color += triCol * energy * 0.4 * u_treble;
    triAccum += triLine;
  }

  // Downward triangles (inverted)
  for (int ti = 0; ti < 5; ti++) {
    float fi = float(ti);
    float scale = 0.45 - fi * 0.07;
    float yOff = 0.04 * fi - 0.06;
    vec2 tp = vec2(uv.x, -(uv.y - yOff));
    float tri = sdTriangle(tp, scale + 0.01 * cos(t * 1.3 + fi * 0.9) * u_bass);
    float triLine = smoothstep(0.006, 0.0, abs(tri));

    float edgePhase = fract(t * 0.4 + fi * 0.2 + u_mid * 0.2);
    float energy = smoothstep(0.01, 0.0, abs(tri)) * smoothstep(0.0, 0.1, sin(-a * 3.0 + r * 20.0 + edgePhase * 18.0));

    vec3 triCol = palette(
      fi * 0.15 + paletteShift + 0.5,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.4),
      vec3(0.6, 0.9, 1.2),
      vec3(0.3, 0.1, 0.0)
    );

    color += triCol * triLine * (0.8 + 0.3 * u_amplitude);
    color += triCol * energy * 0.4 * u_treble;
    triAccum += triLine;
  }

  // Central bindu point
  float bindu = smoothstep(0.025, 0.0, r) * (1.5 + u_bass);
  vec3 binduCol = palette(
    t * 0.3 + paletteShift,
    vec3(0.7, 0.5, 0.4),
    vec3(0.3, 0.3, 0.4),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.1, 0.2)
  );
  color += binduCol * bindu;

  // Intersection glow: where triangles overlap, emit extra light
  float interGlow = smoothstep(1.5, 3.0, triAccum) * 0.5;
  color += vec3(1.3, 1.2, 1.0) * interGlow * (0.5 + 0.5 * u_mid);

  // FBM energy field between the geometric forms
  float field = fbm(uv * 5.0 + t * 0.3);
  float fieldMask = smoothstep(0.55, 0.1, r) * 0.15;
  color += binduCol * field * fieldMask * (0.5 + 0.5 * u_amplitude);

  // Lotus petal hints around outer circle (16 petals)
  float petalAngle = mod(a + t * 0.15, 6.28318 / 16.0) - 3.14159 / 16.0;
  float petal = smoothstep(0.02, 0.0, abs(petalAngle) * r - 0.01) * smoothstep(0.5, 0.46, r) * smoothstep(0.4, 0.44, r);
  color += frameCol * petal * 0.6;

  // Vignette
  color *= smoothstep(1.3, 0.3, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
