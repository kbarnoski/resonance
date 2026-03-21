import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

// Transmutation circles: rotating nested geometric containers
// (triangle in circle in square in circle), elemental energy flowing between layers.
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

  // Layer 1 (outermost): Circle
  float c1 = abs(sdCircle(uv, 0.65 + 0.02 * sin(t * 1.5) + 0.02 * u_bass));
  float c1Line = smoothstep(0.007, 0.0, c1);

  // Layer 2: Square, slowly rotating
  vec2 sqUv = rot2(t * 0.3) * uv;
  float s1 = abs(sdBox(sqUv, vec2(0.48 + 0.01 * u_mid)));
  float s1Line = smoothstep(0.006, 0.0, s1);

  // Layer 3: Circle
  float c2 = abs(sdCircle(uv, 0.38 + 0.015 * sin(t * 1.8 + 1.0)));
  float c2Line = smoothstep(0.006, 0.0, c2);

  // Layer 4: Triangle, rotating opposite direction
  vec2 triUv = rot2(-t * 0.5 + 0.5) * uv;
  float t1 = abs(sdTriangle(triUv, 0.3 + 0.01 * u_bass));
  float t1Line = smoothstep(0.006, 0.0, t1);

  // Layer 5: Circle
  float c3 = abs(sdCircle(uv, 0.22 + 0.01 * sin(t * 2.0 + 2.0)));
  float c3Line = smoothstep(0.005, 0.0, c3);

  // Layer 6: Inverted triangle
  vec2 triUv2 = rot2(t * 0.4 + 1.0) * vec2(uv.x, -uv.y);
  float t2 = abs(sdTriangle(triUv2, 0.16 + 0.008 * u_mid));
  float t2Line = smoothstep(0.005, 0.0, t2);

  // Layer 7 (innermost): Small circle
  float c4 = abs(sdCircle(uv, 0.09 + 0.008 * sin(t * 2.5)));
  float c4Line = smoothstep(0.005, 0.0, c4);

  // Color each geometric layer differently
  vec3 col1 = palette(paletteShift, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.4), vec3(1.0, 0.7, 0.3), vec3(0.0, 0.15, 0.25));
  vec3 col2 = palette(paletteShift + 0.15, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.4, 0.5), vec3(0.8, 1.0, 0.6), vec3(0.1, 0.2, 0.0));
  vec3 col3 = palette(paletteShift + 0.3, vec3(0.5, 0.5, 0.5), vec3(0.4, 0.5, 0.5), vec3(0.6, 0.8, 1.2), vec3(0.2, 0.0, 0.3));
  vec3 col4 = palette(paletteShift + 0.45, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.3), vec3(1.0, 0.5, 0.8), vec3(0.0, 0.3, 0.2));

  color += col1 * c1Line * (0.8 + 0.3 * u_amplitude);
  color += col2 * s1Line * (0.8 + 0.3 * u_amplitude);
  color += col1 * c2Line * 0.9;
  color += col3 * t1Line * (0.8 + 0.3 * u_amplitude);
  color += col2 * c3Line * 0.9;
  color += col4 * t2Line * (0.8 + 0.3 * u_amplitude);
  color += col3 * c4Line * 0.9;

  // Elemental energy flowing between layers
  // Energy streams between circle1 and square
  float stream1Zone = smoothstep(0.67, 0.63, r) * smoothstep(0.46, 0.5, length(sqUv * vec2(1.0, 1.0)));
  float stream1 = fbm(vec2(a * 3.0 + t * 2.0, r * 10.0));
  stream1 = smoothstep(0.0, 0.5, stream1) * stream1Zone;

  // Energy between square and triangle
  float e2inner = smoothstep(0.4, 0.36, r);
  float e2outer = smoothstep(0.46, 0.5, r);
  float stream2 = fbm(vec2(a * 4.0 - t * 1.5, r * 12.0 + t));
  stream2 = smoothstep(0.0, 0.5, stream2) * e2inner * e2outer;

  // Energy between inner triangle and center
  float e3zone = smoothstep(0.24, 0.18, r) * smoothstep(0.07, 0.11, r);
  float stream3 = fbm(vec2(a * 5.0 + t * 3.0, r * 15.0 - t * 0.5));
  stream3 = smoothstep(0.0, 0.5, stream3) * e3zone;

  color += col2 * stream1 * 0.35 * (0.6 + 0.5 * u_bass);
  color += col3 * stream2 * 0.3 * (0.6 + 0.5 * u_mid);
  color += col4 * stream3 * 0.35 * (0.6 + 0.5 * u_treble);

  // Alchemical symbols at cardinal points between layers
  for (int sym = 0; sym < 4; sym++) {
    float symAngle = float(sym) * 1.5708 + t * 0.2;
    float symR = 0.53;
    vec2 symPos = vec2(cos(symAngle), sin(symAngle)) * symR;
    float symDist = length(uv - symPos);

    // Small geometric mark
    vec2 symLocal = rot2(-symAngle) * (uv - symPos);
    float mark = sdTriangle(symLocal, 0.025 + 0.005 * u_treble);
    float markLine = smoothstep(0.004, 0.0, abs(mark));
    float markGlow = smoothstep(0.04, 0.0, symDist);

    float pulse = 0.6 + 0.5 * sin(t * 3.0 + float(sym) * 1.5708 + u_bass * 4.0);
    color += col4 * markLine * pulse * 1.5;
    color += col4 * markGlow * 0.15 * pulse;
  }

  // Rotating inscription ring between layers 1 and 2
  float inscR = 0.56;
  float inscMask = smoothstep(0.01, 0.0, abs(r - inscR));
  float inscAngle = a + t * 0.8;
  float inscPattern = sin(inscAngle * 24.0) * sin(inscAngle * 13.0 + t);
  inscPattern = smoothstep(0.3, 0.8, inscPattern);
  color += col1 * inscMask * inscPattern * 0.5 * (0.5 + 0.5 * u_mid);

  // Central core
  float core = smoothstep(0.05, 0.0, r) * (1.0 + 0.8 * u_bass);
  color += col1 * core * 1.5;

  // Vignette
  color *= smoothstep(1.4, 0.3, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
