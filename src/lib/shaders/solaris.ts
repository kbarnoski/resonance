import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Solaris — sun surface with plasma convection cells and prominences.
// Voronoi cells simulate granulation, fbm plasma flows churn across
// the disk, and prominences arc off the limb.

float prominence(vec2 uv, float angle, float height, float t) {
  vec2 base = vec2(cos(angle), sin(angle)) * 0.48;
  vec2 tip = base + vec2(cos(angle + 0.3), sin(angle + 0.3)) * height;
  vec2 mid = (base + tip) * 0.5 + vec2(sin(t * 2.0 + angle) * 0.05, cos(t * 1.5) * 0.04);
  vec2 p = uv - base;
  vec2 d = tip - base;
  float proj = clamp(dot(p, d) / dot(d, d), 0.0, 1.0);
  vec2 closest = base + d * proj + vec2(sin(proj * 6.28 + t) * 0.03, cos(proj * 4.0 + t) * 0.02);
  float dist = length(uv - closest);
  return smoothstep(0.04, 0.0, dist) * (1.0 - proj * 0.5);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Solar disk
  float disk = smoothstep(0.5, 0.47, r);

  // Granulation — voronoi convection cells
  vec2 granUv = uv * 8.0 + vec2(t * 0.2, t * 0.15);
  vec3 vor = voronoi(granUv);
  float granulation = vor.y - vor.x;
  granulation = smoothstep(0.0, 0.3, granulation);

  // Plasma flow — large-scale churning
  float plasma = fbm(uv * 3.0 + vec2(sin(t * 0.3) * 0.5, cos(t * 0.25) * 0.4));
  float plasma2 = fbm(uv * 5.0 * rot2(t * 0.05) + vec2(t * 0.1, 0.0));

  // Sunspots — dark cool regions
  float spot1 = smoothstep(0.12, 0.06, length(uv - vec2(-0.15, 0.1) + vec2(sin(t * 0.1) * 0.05)));
  float spot2 = smoothstep(0.08, 0.03, length(uv - vec2(0.2, -0.05) + vec2(cos(t * 0.12) * 0.04)));
  float spots = max(spot1, spot2) * 0.6;

  // Prominences arcing off the limb
  float prom = 0.0;
  prom += prominence(uv, t * 0.2, 0.15 + u_bass * 0.1, t);
  prom += prominence(uv, t * 0.15 + 2.0, 0.12 + u_bass * 0.08, t * 0.8);
  prom += prominence(uv, t * 0.1 + 4.5, 0.18 + u_bass * 0.12, t * 1.2);

  // Limb darkening — natural solar effect
  float limbDark = 1.0 - pow(r / 0.5, 2.0) * 0.4;

  // Corona — faint outer atmosphere
  float corona = exp(-(r - 0.48) * 5.0) * smoothstep(0.45, 0.55, r);
  corona += snoise(vec2(angle * 5.0, r * 8.0 - t * 0.5)) * 0.15 * smoothstep(0.45, 0.6, r);

  float paletteShift = u_amplitude * 0.2;

  // Surface — incandescent yellow-white
  vec3 surfCol = palette(
    granulation * 0.3 + plasma * 0.2 + t * 0.03 + paletteShift,
    vec3(0.9, 0.7, 0.3),
    vec3(0.15, 0.15, 0.1),
    vec3(0.6, 0.4, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Prominence color — hot red-orange plasma
  vec3 promCol = palette(
    t * 0.1 + paletteShift + 0.3,
    vec3(0.8, 0.3, 0.1),
    vec3(0.3, 0.2, 0.1),
    vec3(0.5, 0.3, 0.2),
    vec3(0.0, 0.0, 0.05)
  );

  // Corona color — pearly white-gold
  vec3 coronaCol = palette(
    angle * 0.1 + t * 0.04 + paletteShift + 0.7,
    vec3(0.8, 0.75, 0.6),
    vec3(0.2, 0.15, 0.1),
    vec3(0.4, 0.3, 0.2),
    vec3(0.05, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);

  // Solar surface
  vec3 surface = surfCol * (0.8 + granulation * 0.3 + plasma2 * 0.15 * u_mid);
  surface *= limbDark;
  surface *= (1.0 - spots);
  color += surface * disk;

  // Prominences
  color += promCol * prom * (0.8 + u_bass * 0.6);

  // Corona
  color += coronaCol * corona * (0.4 + u_treble * 0.6);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
