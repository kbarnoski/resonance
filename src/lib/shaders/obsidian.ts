import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Volcanic glass surface — deep internal reflections, prismatic edge light.
// Obsidian is nearly opaque but refracts trapped light at fracture boundaries.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // ── Glass surface — layered noise for conchoidal fracture patterns ──
  vec2 p1 = uv * 3.0 + vec2(t * 0.2, t * 0.15);
  vec2 p2 = uv * 5.0 * rot2(0.4) - vec2(t * 0.1, t * 0.25);
  float fracture1 = fbm3(p1);
  float fracture2 = fbm3(p2);

  // Edge detection on fractures — where light refracts
  float edge1 = abs(fracture1);
  float edge2 = abs(fracture2);
  float edges = smoothstep(0.15, 0.0, edge1) + smoothstep(0.12, 0.0, edge2) * 0.6;

  // ── Internal reflection layers ──
  vec2 deepUV = uv * 2.0 * rot2(t * 0.1) + vec2(fracture1 * 0.2, fracture2 * 0.15);
  float deepNoise = fbm3(deepUV + vec2(t * 0.3, 0.0));
  float deepGlow = smoothstep(-0.1, 0.4, deepNoise) * 0.3;

  // ── Prismatic edge refraction ──
  float prismShift = edges * 3.0 + t * 0.5 + u_amplitude * 0.3;
  vec3 prismColor = palette(
    prismShift,
    vec3(0.2, 0.1, 0.15),
    vec3(0.3, 0.2, 0.35),
    vec3(0.8, 0.6, 1.0),
    vec3(0.0, 0.15, 0.3)
  );

  // ── Base obsidian surface ──
  vec3 baseColor = palette(
    fracture1 * 0.5 + fracture2 * 0.3 + u_amplitude * 0.15,
    vec3(0.01, 0.01, 0.02),
    vec3(0.03, 0.02, 0.04),
    vec3(0.4, 0.3, 0.5),
    vec3(0.1, 0.05, 0.15)
  );

  // ── Deep internal glow — bruise purples and cold blues ──
  vec3 innerColor = palette(
    deepNoise * 2.0 + t * 0.2,
    vec3(0.08, 0.02, 0.05),
    vec3(0.12, 0.05, 0.1),
    vec3(0.5, 0.3, 0.7),
    vec3(0.15, 0.1, 0.25)
  );

  // ── Compositing ──
  vec3 color = baseColor;
  color += innerColor * deepGlow * (0.6 + u_bass * 0.4);
  color += prismColor * edges * 0.6 * (0.7 + u_treble * 0.3);

  // Specular highlights on fracture ridges
  float specular = pow(edges, 3.0) * 0.8;
  color += vec3(0.7, 0.6, 0.9) * specular * (0.5 + u_mid * 0.5);

  // Surface sheen
  float sheen = smoothstep(0.3, -0.1, uv.y) * 0.04;
  color += vec3(0.3, 0.25, 0.4) * sheen;

  // Vignette
  float vignette = 1.0 - smoothstep(0.3, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
