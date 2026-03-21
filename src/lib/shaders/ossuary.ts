import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + VORONOI + ROT2 + `
// Ossuary — bone-like lattice patterns, calcium white on dark

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;

  // Bone lattice: voronoi edges create an organic skeletal network
  vec2 latticeUV = uv * 4.0 + t * 0.05;
  latticeUV = rot2(t * 0.03) * latticeUV;
  vec3 v1 = voronoi(latticeUV);

  // Secondary finer lattice
  vec2 fineUV = uv * 8.0 + vec2(3.0, 5.0) + t * 0.03;
  vec3 v2 = voronoi(fineUV);

  // Bone edges — the lattice walls (where F2-F1 is small)
  float boneEdge1 = smoothstep(0.15, 0.05, v1.y - v1.x);
  float boneEdge2 = smoothstep(0.12, 0.04, v2.y - v2.x);

  // Combined bone structure
  float bone = max(boneEdge1, boneEdge2 * 0.6);

  // Bone surface texture — porous, calcium-like
  float porosity = snoise(uv * 30.0 + t * 0.1);
  porosity = smoothstep(0.2, 0.5, porosity) * bone;

  // Joint nodes — thicker at voronoi vertices
  float joints = exp(-v1.x * 8.0) * 0.3;

  // Slow breathing — lattice subtly expands and contracts
  float breath = sin(t * 0.6 + u_bass * 1.5) * 0.02;

  // Deep cavity interiors — the dark spaces between bones
  float cavity = 1.0 - bone;
  float cavityDepth = v1.x * cavity;

  // Colors: calcium white-grey on deep black
  vec3 boneColor = palette(0.1 + porosity * 0.2,
    vec3(0.04, 0.038, 0.035),
    vec3(0.05, 0.045, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.1, 0.12, 0.15));

  vec3 jointColor = palette(0.2 + u_mid * 0.08,
    vec3(0.05, 0.045, 0.04),
    vec3(0.06, 0.055, 0.045),
    vec3(1.0, 1.0, 1.0),
    vec3(0.08, 0.1, 0.13));

  vec3 cavityColor = palette(0.7,
    vec3(0.003, 0.003, 0.004),
    vec3(0.005, 0.004, 0.006),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.35, 0.5));

  vec3 marrowColor = palette(0.45 + u_amplitude * 0.12,
    vec3(0.01, 0.005, 0.005),
    vec3(0.02, 0.01, 0.008),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.2));

  // Compose
  vec3 color = cavityColor;
  color += cavityColor * cavityDepth * 0.02;

  // Bone structure
  color = mix(color, boneColor, bone * 0.7);
  color -= boneColor * porosity * 0.15; // pores darken the bone
  color += jointColor * joints;

  // Faint marrow glow deep in cavities
  float marrowGlow = exp(-v1.x * 3.0) * cavity * 0.04 * (1.0 + u_bass * 0.6);
  color += marrowColor * marrowGlow;

  // Bass: structure creaks — subtle displacement
  float creak = snoise(uv * 4.0 + t * u_bass * 2.0) * u_bass * 0.01;
  color += boneColor * creak * bone;

  // Treble: dust motes in the cavities
  float dust = snoise(uv * 25.0 + t * 3.0);
  dust = smoothstep(0.8, 0.95, dust) * cavity;
  color += boneColor * dust * u_treble * 0.04;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
