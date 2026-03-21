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

  // Background — warm parchment
  float bgN = fbm(uv * 1.5 + t * 0.01);
  vec3 color = palette(
    bgN * 0.2 + 0.1,
    vec3(0.12, 0.10, 0.07),
    vec3(0.06, 0.04, 0.03),
    vec3(0.5, 0.4, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Phylogenetic tree — concentric branching rings from center
  vec2 p = uv * rot2(t * 0.03);
  float r = length(p);
  float angle = atan(p.y, p.x);

  // Trunk grows outward — distance from center is evolutionary time
  float trunk = smoothstep(0.02, 0.0, abs(p.x)) * smoothstep(0.0, 0.15, p.y + 0.6);
  trunk *= step(p.y, 0.0);

  // Generate branching at different evolutionary epochs
  float branches = 0.0;
  float branchGlow = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float epoch = 0.1 + fi * 0.12;
    float spread = 0.3 + fi * 0.15 + u_bass * 0.08;

    // Two branches per split
    for (int side = 0; side < 2; side++) {
      float s = float(side) * 2.0 - 1.0;
      float branchAngle = s * spread * (0.8 + snoise(vec2(fi * 3.7, t * 0.1)) * 0.3);

      vec2 branchDir = rot2(branchAngle + 1.5708) * vec2(0.0, 1.0);
      vec2 branchOrigin = vec2(0.0, -0.6 + epoch * 2.5);

      // Branch as distance to ray from origin
      vec2 toP = p - branchOrigin;
      float along = dot(toP, branchDir);
      float perp = length(toP - branchDir * along);

      float branchLen = 0.2 + fi * 0.06 + u_mid * 0.05;
      float taper = smoothstep(branchLen, 0.0, along) * smoothstep(-0.01, 0.02, along);
      float thickness = (0.008 - fi * 0.0008) * taper;

      float b = smoothstep(thickness + 0.003, thickness, perp) * taper;
      branches += b;
      branchGlow += smoothstep(0.04, 0.0, perp) * taper * 0.3;
    }
  }

  // Branch color — earthy greens and browns
  vec3 branchColor = palette(
    r * 0.8 + angle * 0.1 + t * 0.02,
    vec3(0.3, 0.35, 0.2),
    vec3(0.25, 0.2, 0.15),
    vec3(0.7, 0.8, 0.4),
    vec3(0.0, 0.1, 0.05)
  );

  // Leaf/bud tips — bright green at endpoints
  vec3 leafColor = palette(
    r * 1.5 + t * 0.04,
    vec3(0.35, 0.5, 0.2),
    vec3(0.3, 0.35, 0.15),
    vec3(0.6, 1.0, 0.4),
    vec3(0.0, 0.15, 0.0)
  );

  // Trunk
  vec3 trunkColor = vec3(0.25, 0.18, 0.1);
  color += trunkColor * trunk * 0.8;

  // Branches
  color += branchColor * branches;
  color += leafColor * branchGlow * (0.5 + u_treble * 0.8);

  // Evolutionary time rings — faint concentric circles
  float rings = sin(r * 25.0 - t * 0.5) * 0.5 + 0.5;
  rings = pow(rings, 8.0);
  color += vec3(0.2, 0.25, 0.15) * rings * 0.08;

  // Speciation bursts — amplitude reactive
  float burst = pow(snoise(vec2(angle * 3.0, r * 5.0 - t)) * 0.5 + 0.5, 6.0);
  color += leafColor * burst * u_amplitude * 0.4;

  color *= 0.9 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
