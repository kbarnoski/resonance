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

  // Sky base — warm blue looking up through canopy
  float skyGrad = 1.0 - length(uv) * 0.6;
  vec3 color = palette(
    skyGrad * 0.3 + t * 0.01,
    vec3(0.25, 0.35, 0.55),
    vec3(0.15, 0.2, 0.3),
    vec3(0.6, 0.7, 1.0),
    vec3(0.0, 0.1, 0.25)
  ) * skyGrad;

  // Leaf canopy layers — multiple voronoi scales for leaf clusters
  vec2 wind = vec2(t * 0.15, sin(t * 0.2) * 0.1);

  // Large branch structure
  vec3 v1 = voronoi(uv * 3.0 + wind * 0.3);
  float branches = smoothstep(0.12, 0.0, v1.y - v1.x);

  // Medium leaf clusters
  vec2 leafUV = uv + vec2(
    snoise(uv * 2.0 + t * 0.1) * 0.08,
    snoise(uv * 2.0 + t * 0.08 + 3.0) * 0.08
  );
  vec3 v2 = voronoi(leafUV * 7.0 + wind);
  float leafShape = smoothstep(0.5, 0.15, v2.x);

  // Fine leaf detail
  vec3 v3 = voronoi(leafUV * 18.0 + wind * 1.5);
  float fineLeaf = smoothstep(0.4, 0.1, v3.x);

  // Dappled sunlight — holes in canopy
  float gaps = fbm(uv * 4.0 + wind * 0.5);
  float sunlight = smoothstep(0.2, 0.5, gaps);
  sunlight *= smoothstep(0.6, 0.3, length(uv - vec2(0.15, 0.2))); // sun position bias

  // Sun rays through gaps — god rays
  float rayAngle = atan(uv.y - 0.2, uv.x - 0.15);
  float rays = sin(rayAngle * 8.0 + t * 0.3) * 0.5 + 0.5;
  rays = pow(rays, 3.0) * sunlight;

  // Dark branch color
  vec3 branchColor = palette(
    v1.x * 0.3 + t * 0.01,
    vec3(0.12, 0.08, 0.05),
    vec3(0.08, 0.05, 0.03),
    vec3(0.4, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Leaf greens — varying shades
  vec3 darkLeaf = palette(
    v2.x * 0.5 + t * 0.02,
    vec3(0.1, 0.22, 0.08),
    vec3(0.1, 0.18, 0.06),
    vec3(0.3, 0.7, 0.3),
    vec3(0.0, 0.1, 0.0)
  );
  vec3 brightLeaf = palette(
    v3.x * 0.6 + t * 0.03 + 0.2,
    vec3(0.2, 0.4, 0.1),
    vec3(0.2, 0.3, 0.1),
    vec3(0.5, 0.9, 0.3),
    vec3(0.0, 0.15, 0.0)
  );

  // Sunbeam color — warm gold
  vec3 sunColor = vec3(0.95, 0.85, 0.5);

  // Layer composition
  color = mix(color, darkLeaf, leafShape * 0.85);
  color = mix(color, brightLeaf, fineLeaf * 0.5 * leafShape);
  color = mix(color, branchColor, branches * 0.9);

  // Sunlight filtering through — bass opens gaps
  float gapIntensity = sunlight * (0.6 + u_bass * 0.6);
  color = mix(color, sunColor * 0.8, gapIntensity * 0.5);
  color += sunColor * rays * 0.15 * (0.5 + u_mid * 0.5);

  // Leaf shimmer — treble reactive
  float shimmer = pow(snoise(leafUV * 30.0 + t * 3.0) * 0.5 + 0.5, 10.0);
  color += brightLeaf * shimmer * u_treble * 0.4;

  // Wind sway brightness
  color *= 0.85 + u_amplitude * 0.25;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
