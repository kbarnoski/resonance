import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Two counter-rotating triangles forming the star tetrahedron
  float scale = 0.5 + u_bass * 0.08;

  // Upward triangle — rotates clockwise
  vec2 p1 = rot2(t * 0.7) * uv;
  float tri1 = abs(sdTriangle(p1, scale)) - 0.006;

  // Downward triangle — rotates counter-clockwise
  vec2 p2 = rot2(-t * 0.7) * vec2(uv.x, -uv.y);
  float tri2 = abs(sdTriangle(p2, scale)) - 0.006;

  // Inner star at half-scale, opposite rotation
  vec2 p3 = rot2(-t * 1.2) * uv;
  float tri3 = abs(sdTriangle(p3, scale * 0.45)) - 0.004;

  vec2 p4 = rot2(t * 1.2) * vec2(uv.x, -uv.y);
  float tri4 = abs(sdTriangle(p4, scale * 0.45)) - 0.004;

  // Micro inner star
  vec2 p5 = rot2(t * 2.0) * uv;
  float tri5 = abs(sdTriangle(p5, scale * 0.2)) - 0.003;
  vec2 p6 = rot2(-t * 2.0) * vec2(uv.x, -uv.y);
  float tri6 = abs(sdTriangle(p6, scale * 0.2)) - 0.003;

  // Edge glows for each layer
  float edge1 = smoothstep(0.012, 0.0, abs(tri1));
  float edge2 = smoothstep(0.012, 0.0, abs(tri2));
  float edge3 = smoothstep(0.008, 0.0, abs(tri3));
  float edge4 = smoothstep(0.008, 0.0, abs(tri4));
  float edge5 = smoothstep(0.006, 0.0, abs(tri5));
  float edge6 = smoothstep(0.006, 0.0, abs(tri6));

  // Intersection of the two main triangles — the hexagonal center
  float inside1 = smoothstep(0.01, -0.02, tri1);
  float inside2 = smoothstep(0.01, -0.02, tri2);
  float hexCenter = inside1 * inside2;

  // Rotating energy field in the center
  vec2 rotUV = rot2(t * 3.0) * uv;
  float energy = fbm(rotUV * 8.0 + t * 0.5);
  float energyMask = hexCenter * smoothstep(0.3, 0.0, r);

  // Concentric rings — sacred geometry halos
  float rings = sin(r * 40.0 - t * 2.0 + u_mid * 3.0);
  rings = smoothstep(0.7, 1.0, rings) * smoothstep(0.7, 0.15, r);

  // Radial rays from vertices
  float rays = pow(abs(sin(a * 3.0 + t * 0.5)), 20.0);
  rays *= smoothstep(0.0, 0.3, r) * smoothstep(1.0, 0.3, r);

  // Palette: electric indigo / gold
  vec3 col1 = palette(
    r * 2.0 + paletteShift,
    vec3(0.5, 0.4, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.6, 0.5, 1.0),
    vec3(0.7, 0.2, 0.0)
  );

  // Warm gold for second triangle
  vec3 col2 = palette(
    r * 2.0 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.3),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.1, 0.2)
  );

  // Bright center energy
  vec3 col3 = palette(
    energy * 2.0 + t * 0.5 + paletteShift,
    vec3(0.7, 0.7, 0.9),
    vec3(0.4, 0.4, 0.4),
    vec3(0.8, 0.9, 1.0),
    vec3(0.1, 0.2, 0.4)
  );

  vec3 color = vec3(0.0);

  // Outer triangle edges
  color += col1 * edge1 * 1.5 * (0.8 + u_bass * 0.5);
  color += col2 * edge2 * 1.5 * (0.8 + u_bass * 0.5);

  // Inner triangle edges
  color += col1 * edge3 * 1.0 * (0.7 + u_mid * 0.5);
  color += col2 * edge4 * 1.0 * (0.7 + u_mid * 0.5);

  // Micro inner
  color += col3 * (edge5 + edge6) * 0.8 * (0.6 + u_treble * 0.6);

  // Hexagonal center energy
  color += col3 * energyMask * (0.5 + energy * 0.5) * (0.8 + u_amplitude * 0.5);

  // Concentric rings
  color += col1 * rings * 0.3 * (0.6 + u_mid * 0.4);

  // Radial rays
  color += col2 * rays * 0.4 * u_treble;

  // Intersection glow — bright emissive
  float interGlow = edge1 * edge2;
  color += vec3(1.4, 1.3, 1.6) * interGlow * 3.0;

  // Central core
  float core = exp(-r * 6.0);
  color += vec3(1.2, 1.1, 1.5) * core * 0.6 * (1.0 + u_amplitude * 0.4);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
