import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Domain warp for organic irregularity
  vec2 warp = vec2(
    snoise(uv * 2.0 + vec2(t * 0.08, 0.0)),
    snoise(uv * 2.0 + vec2(0.0, t * 0.06) + 3.7)
  );
  vec2 p = uv + warp * 0.15;

  // Bone trabecular structure — large-scale voronoi
  vec3 v1 = voronoi(p * 4.0 + t * 0.03);
  float trabeculae = smoothstep(0.2, 0.0, v1.y - v1.x);
  float cellSpace = v1.x;

  // Marrow cells — smaller voronoi in the spaces
  vec3 v2 = voronoi(p * 12.0 + vec2(t * 0.05, 0.0));
  float cells = v2.x;
  float cellEdge = smoothstep(0.15, 0.0, v2.y - v2.x);

  // Tiny cell nuclei
  vec3 v3 = voronoi(p * 25.0 + vec2(0.0, t * 0.04));
  float nuclei = smoothstep(0.12, 0.05, v3.x);

  // Fat cells — larger rounded gaps (white marrow component)
  float fatCells = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 center = vec2(
      snoise(vec2(fi * 4.7, t * 0.05)) * 0.6,
      snoise(vec2(fi * 3.1 + 10.0, t * 0.04)) * 0.6
    );
    float radius = 0.08 + snoise(vec2(fi * 2.3, 0.0)) * 0.03;
    float d = length(p - center) - radius;
    fatCells += smoothstep(0.01, -0.01, d);
  }
  fatCells = clamp(fatCells, 0.0, 1.0);

  // Colors
  // Bone — pale ivory/yellow
  vec3 boneColor = palette(
    trabeculae * 0.3 + t * 0.01,
    vec3(0.6, 0.55, 0.45),
    vec3(0.15, 0.12, 0.08),
    vec3(0.8, 0.7, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  // Red marrow — deep crimson cellular
  vec3 redMarrow = palette(
    cells * 0.5 + t * 0.02,
    vec3(0.45, 0.1, 0.1),
    vec3(0.3, 0.08, 0.08),
    vec3(0.9, 0.2, 0.15),
    vec3(0.0, 0.1, 0.05)
  );

  // Darker cell edges
  vec3 cellBorder = palette(
    v2.y * 0.4 + t * 0.01 + 0.3,
    vec3(0.25, 0.05, 0.08),
    vec3(0.15, 0.03, 0.05),
    vec3(0.5, 0.15, 0.1),
    vec3(0.0, 0.08, 0.15)
  );

  // White fat cells
  vec3 fatColor = vec3(0.75, 0.7, 0.6);

  // Compose
  vec3 color = redMarrow;
  color = mix(color, cellBorder, cellEdge * 0.6);
  color += vec3(0.25, 0.05, 0.05) * nuclei * 0.5;
  color = mix(color, boneColor, trabeculae * 0.9);
  color = mix(color, fatColor, fatCells * 0.7);

  // Blood flow pulsing — bass reactive
  float pulse = sin(cells * 15.0 - t * 4.0) * 0.5 + 0.5;
  pulse = pow(pulse, 4.0) * u_bass;
  color += vec3(0.4, 0.05, 0.02) * pulse * 0.4;

  // Cell production glow — mid reactive
  float production = pow(1.0 - cells, 5.0) * u_mid;
  color += vec3(0.5, 0.15, 0.1) * production * 0.3;

  // Treble sparkle — emerging blood cells
  float sparkle = pow(snoise(p * 40.0 + t * 2.0) * 0.5 + 0.5, 12.0);
  color += vec3(0.8, 0.3, 0.2) * sparkle * u_treble * 0.5;

  color *= 0.85 + u_amplitude * 0.25;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
