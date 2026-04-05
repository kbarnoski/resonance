import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Sacred geometric diagram: nested triangles and circles with pulsing energy,
// Sri Yantra-inspired interlocking geometry radiating from center.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// SDF for an equilateral triangle
float sdTriEq(vec2 p, float size) {
  float k = sqrt(3.0);
  p.x = abs(p.x) - size;
  p.y = p.y + size / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * size, 0.0);
  return -length(p) * sign(p.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 color = vec3(0.0);

  // Outer bounding square — gate of the yantra
  float gate = smoothstep(0.008, 0.0, abs(max(abs(uv.x) - 0.55, abs(uv.y) - 0.55)));
  float gateInner = smoothstep(0.006, 0.0, abs(max(abs(uv.x) - 0.5, abs(uv.y) - 0.5)));

  // Concentric circles
  for (int c = 0; c < 3; c++) {
    float fc = float(c);
    float circR = 0.45 - fc * 0.08 + 0.01 * sin(t * 2.0 + fc);
    float circ = smoothstep(0.006, 0.0, abs(length(uv) - circR));
    vec3 circCol = palette(
      fc * 0.2 + paletteShift,
      vec3(0.5, 0.45, 0.35),
      vec3(0.4, 0.35, 0.3),
      vec3(1.0, 0.85, 0.55),
      vec3(0.05, 0.1, 0.25)
    );
    color += circCol * circ * 0.7;
  }

  // Nested triangles — upward and downward pointing, interlocking
  float pulse = 0.02 * sin(t * 2.5) + u_bass * 0.01;

  for (int tri = 0; tri < 5; tri++) {
    float ft = float(tri);
    float size = 0.35 - ft * 0.06 + pulse;

    // Upward triangle
    vec2 upUV = rot2(t * 0.1 + ft * 0.05) * uv;
    float upTri = sdTriEq(upUV + vec2(0.0, size * 0.15), size);
    float upEdge = smoothstep(0.006, 0.0, abs(upTri));

    // Downward triangle (inverted)
    vec2 dnUV = rot2(-t * 0.1 - ft * 0.05) * uv;
    float dnTri = sdTriEq(vec2(dnUV.x, -dnUV.y) + vec2(0.0, size * 0.15), size);
    float dnEdge = smoothstep(0.006, 0.0, abs(dnTri));

    // Intersection zones glow brighter
    float intersection = step(upTri, 0.0) * step(dnTri, 0.0);
    float interGlow = intersection * exp(-r * 5.0) * 0.15;

    // Energy pulse along triangle edges
    float upPulse = sin(upTri * 80.0 - t * 5.0) * 0.5 + 0.5;
    upPulse = pow(upPulse, 4.0) * smoothstep(0.02, 0.0, abs(upTri)) * 0.3;

    vec3 triCol = palette(
      ft * 0.18 + paletteShift + 0.1,
      vec3(0.65, 0.55, 0.35),
      vec3(0.4, 0.35, 0.3),
      vec3(1.0, 0.9, 0.6),
      vec3(0.0, 0.1, 0.2)
    );

    vec3 interCol = palette(
      ft * 0.18 + paletteShift + 0.5,
      vec3(0.5, 0.4, 0.55),
      vec3(0.4, 0.3, 0.4),
      vec3(0.8, 1.0, 0.9),
      vec3(0.2, 0.05, 0.35)
    );

    float fade = 1.0 / (1.0 + ft * 0.3);
    color += triCol * (upEdge + dnEdge) * fade * (0.6 + 0.4 * u_mid);
    color += triCol * upPulse * fade;
    color += interCol * interGlow * fade;
  }

  // Gate edges
  vec3 gateCol = palette(
    paletteShift + 0.7,
    vec3(0.4, 0.35, 0.5),
    vec3(0.3, 0.25, 0.3),
    vec3(0.7, 0.8, 1.0),
    vec3(0.25, 0.15, 0.4)
  );
  color += gateCol * (gate + gateInner * 0.5) * 0.5;

  // Central bindu — the seed point
  float bindu = exp(-r * r * 200.0) * (1.0 + u_bass * 0.6);
  vec3 binduCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.9, 0.8, 0.6),
    vec3(0.15, 0.15, 0.1),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.08)
  );
  color += binduCol * bindu;

  // Treble energy shimmer in intersection regions
  float shimmer = snoise(uv * 20.0 + t * 2.0) * u_treble * 0.2;
  shimmer = max(shimmer, 0.0) * smoothstep(0.4, 0.1, r);
  color += vec3(1.0, 0.95, 0.85) * shimmer;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
