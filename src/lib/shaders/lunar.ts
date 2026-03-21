import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Lunar — moon surface with craters and gentle silver light.
// Voronoi-based craters pockmark a terrain of fbm highlands,
// with subtle silver-blue illumination from an unseen sun.

float crater(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center);
  float rim = smoothstep(radius, radius - 0.01, d) - smoothstep(radius - 0.01, radius - 0.04, d);
  float floor_depth = smoothstep(radius * 0.7, 0.0, d) * 0.3;
  return rim * 0.5 - floor_depth;
}

float highlands(vec2 uv, float t) {
  float n = fbm(uv * 4.0 + t * 0.02);
  n += snoise(uv * 12.0 + t * 0.01) * 0.15;
  return n * 0.5 + 0.5;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  float r = length(uv);

  // Lunar disk
  float disk = smoothstep(0.52, 0.48, r);

  // Surface coordinates — slowly rotating
  vec2 surfUv = uv * rot2(t * 0.03) * 2.5;

  // Highland terrain
  float terrain = highlands(surfUv, t);

  // Voronoi craters at multiple scales
  vec3 v1 = voronoi(surfUv * 3.0 + vec2(10.0));
  vec3 v2 = voronoi(surfUv * 6.0 + vec2(30.0, 15.0));
  vec3 v3 = voronoi(surfUv * 12.0 + vec2(50.0, 40.0));

  // Crater shapes from voronoi edges
  float craters = smoothstep(0.05, 0.15, v1.x) * 0.4;
  craters += smoothstep(0.03, 0.1, v2.x) * 0.25;
  craters += smoothstep(0.02, 0.06, v3.x) * 0.15;

  // Maria (dark flat regions)
  float maria = fbm(surfUv * 0.8 + vec2(5.0, 3.0));
  maria = smoothstep(0.1, 0.5, maria * 0.5 + 0.5) * 0.35;

  // Directional lighting — sun from upper-right
  vec2 lightDir = normalize(vec2(0.6, 0.5));
  float lighting = dot(normalize(uv), lightDir) * 0.3 + 0.7;

  // Normal approximation from terrain for surface shading
  float dx = highlands(surfUv + vec2(0.01, 0.0), t) - highlands(surfUv - vec2(0.01, 0.0), t);
  float dy = highlands(surfUv + vec2(0.0, 0.01), t) - highlands(surfUv - vec2(0.0, 0.01), t);
  float normalLight = dot(normalize(vec2(dx, dy)), lightDir) * 0.5 + 0.5;

  // Limb — subtle brightening at edge (lunar limb)
  float limb = smoothstep(0.3, 0.5, r) * 0.15;

  float paletteShift = u_amplitude * 0.2;

  // Silver-grey surface
  vec3 surfCol = palette(
    terrain * 0.3 + craters * 0.2 + paletteShift,
    vec3(0.55, 0.55, 0.58),
    vec3(0.08, 0.08, 0.1),
    vec3(0.4, 0.4, 0.5),
    vec3(0.0, 0.0, 0.05)
  );

  // Maria — slightly warmer, darker
  vec3 mariaCol = palette(
    maria + t * 0.02 + paletteShift + 0.3,
    vec3(0.3, 0.3, 0.35),
    vec3(0.05, 0.05, 0.08),
    vec3(0.3, 0.3, 0.4),
    vec3(0.1, 0.1, 0.15)
  );

  // Earthshine — faint blue illumination on dark side
  vec3 earthshine = vec3(0.05, 0.08, 0.15) * (1.0 - lighting) * 0.3;

  vec3 color = vec3(0.0);

  // Compose surface
  vec3 surface = mix(surfCol, mariaCol, maria);
  surface *= (terrain * 0.4 + 0.6);
  surface *= (craters * 0.5 + 0.5);
  surface *= lighting;
  surface *= (normalLight * 0.4 + 0.6);
  surface += earthshine;

  // Audio reactivity — bass subtly brightens highlands
  surface += surfCol * u_bass * 0.08;
  surface += vec3(0.1, 0.12, 0.15) * u_treble * 0.05 * terrain;

  color += surface * disk;

  // Subtle halo — atmosphere-free but artistic glow
  float halo = exp(-(r - 0.49) * 12.0) * smoothstep(0.47, 0.55, r);
  color += vec3(0.25, 0.25, 0.35) * halo * (0.3 + u_mid * 0.3);

  // Background stars
  vec2 starUv = uv * 50.0;
  vec2 starId = floor(starUv);
  vec2 starF = fract(starUv) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float star = (starH > 0.97) ? smoothstep(0.03, 0.0, length(starF)) * 0.5 : 0.0;
  color += vec3(star) * (1.0 - disk);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
