import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Perihelion — Close solar approach: extreme heat distortion,
// solar wind particles streaming outward in radial rivers.

// Solar wind particles streaming outward
float solarWind(vec2 uv, float t, float bass) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float particles = 0.0;

  // Radial streams — particles accelerating outward
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float streamAngle = fi * 0.785 + sin(fi * 2.3 + t * 0.08) * 0.3;
    float angleDist = abs(mod(a - streamAngle + 3.14159, 6.28318) - 3.14159);

    // Stream width narrows with distance
    float streamWidth = 0.15 * exp(-r * 2.0);
    float inStream = smoothstep(streamWidth, 0.0, angleDist);

    // Particle clumps moving outward
    float speed = 3.0 + fi * 0.5 + bass * 2.0;
    float phase = fi * 5.0;
    float clumps = sin(r * 20.0 - t * speed + phase) * 0.5 + 0.5;
    clumps *= sin(r * 35.0 - t * speed * 1.3 + phase + 2.0) * 0.5 + 0.5;

    // Fade with distance
    float radFade = exp(-r * 1.5) * smoothstep(0.15, 0.25, r);

    particles += inStream * clumps * radFade;
  }

  return particles;
}

// Heat distortion field
vec2 heatDistortion(vec2 uv, float t) {
  float r = length(uv);
  float intensity = exp(-r * 2.0);
  float dx = snoise(uv * 8.0 + vec2(t * 0.8, 0.0)) * 0.015 * intensity;
  float dy = snoise(uv * 8.0 + vec2(0.0, t * 0.7)) * 0.015 * intensity;
  return vec2(dx, dy);
}

// Coronal mass ejection — large blob of plasma
float cme(vec2 uv, float angle, float dist, float size, float t) {
  vec2 center = vec2(cos(angle), sin(angle)) * dist;
  // Expand over time
  center *= (1.0 + sin(t * 0.3) * 0.1);
  float r = length(uv - center);

  // Irregular blob shape
  float blobAngle = atan(uv.y - center.y, uv.x - center.x);
  float irregularity = snoise(vec2(blobAngle * 3.0, t * 0.2)) * 0.3;
  float blobR = size * (1.0 + irregularity);

  float blob = smoothstep(blobR, blobR * 0.3, r);
  float glow = exp(-r / (size * 2.5)) * 0.5;

  return blob + glow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.3;

  // Apply heat distortion
  vec2 distortion = heatDistortion(uv, t) * (0.5 + u_treble * 1.5);
  vec2 distUV = uv + distortion;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // ── Solar surface visible at extreme proximity ──
  // Granulation via voronoi
  vec3 vor = voronoi(distUV * 5.0 + vec2(sin(t * 0.05) * 0.3, cos(t * 0.04) * 0.2));
  float gran = smoothstep(0.35, 0.0, vor.x);
  float darkLanes = smoothstep(0.04, 0.0, vor.x) * 0.5;

  // Supergranulation overlay
  vec3 vorLarge = voronoi(distUV * 1.5 + vec2(t * 0.01, t * 0.008));
  float superGran = smoothstep(0.3, 0.0, vorLarge.x) * 0.25;

  // ── Solar wind ──
  float wind = solarWind(uv, t, u_bass);

  // ── Coronal mass ejections ──
  float cme1 = cme(uv, t * 0.15, 0.35, 0.08, t);
  float cme2 = cme(uv, t * 0.12 + 2.5, 0.28, 0.06, t * 0.8);

  // ── Radiation pressure halo ──
  float radiation = exp(-r * 1.8) * 0.25 * (1.0 + u_amplitude * 0.5);

  // ── Colors ──
  // Surface — intense yellow-orange-white
  vec3 surfCol = palette(
    gran + superGran + t * 0.01 + paletteShift,
    vec3(0.7, 0.58, 0.35),
    vec3(0.35, 0.28, 0.18),
    vec3(0.25, 0.15, 0.05),
    vec3(0.02, 0.0, 0.0)
  );

  // Hot white for cell centers
  vec3 hotCol = palette(
    gran * 2.0 + t * 0.02 + paletteShift + 0.1,
    vec3(0.9, 0.82, 0.65),
    vec3(0.12, 0.1, 0.08),
    vec3(0.2, 0.12, 0.05),
    vec3(0.0, 0.0, 0.0)
  );

  // Dark lanes
  vec3 laneCol = palette(
    (1.0 - gran) + t * 0.008 + paletteShift + 0.25,
    vec3(0.42, 0.28, 0.15),
    vec3(0.28, 0.14, 0.08),
    vec3(0.3, 0.1, 0.05),
    vec3(0.05, 0.0, 0.0)
  );

  // Solar wind — hot streaming particles
  vec3 windCol = palette(
    wind + r * 0.5 + t * 0.04 + paletteShift + 0.4,
    vec3(0.85, 0.65, 0.35),
    vec3(0.25, 0.2, 0.12),
    vec3(0.4, 0.25, 0.1),
    vec3(0.03, 0.02, 0.0)
  );

  // CME color — brilliant eruption
  vec3 cmeCol = palette(
    (cme1 + cme2) * 0.5 + t * 0.03 + paletteShift + 0.5,
    vec3(0.75, 0.5, 0.3),
    vec3(0.3, 0.22, 0.15),
    vec3(0.4, 0.2, 0.08),
    vec3(0.05, 0.02, 0.0)
  );

  // Build surface
  vec3 surface = mix(laneCol, surfCol, gran);
  surface = mix(surface, hotCol, pow(gran, 3.0));
  surface *= (1.0 - darkLanes * 0.5);
  surface += surfCol * superGran * 0.3;

  vec3 color = surface;

  // Solar wind overlay
  color += windCol * wind * (0.6 + u_bass * 0.8);

  // CME
  color += cmeCol * (cme1 + cme2) * (0.7 + u_mid * 0.6);

  // Radiation halo
  color += hotCol * radiation;

  // Heat wash
  color += vec3(0.12, 0.06, 0.02) * (0.3 + u_amplitude * 0.2);

  // Treble — fine magnetic shimmer
  float shimmer = snoise(distUV * 25.0 + t * 0.8) * 0.5 + 0.5;
  shimmer = pow(shimmer, 3.0);
  color += vec3(1.0, 0.9, 0.7) * shimmer * u_treble * 0.08;

  // Vignette — bathed in light, subtle
  float vignette = 1.0 - smoothstep(0.6, 1.4, r);
  color *= (0.8 + 0.2 * vignette);

  // Tonemap
  color = color / (color + 0.45);
  color = pow(color, vec3(0.88));

  gl_FragColor = vec4(color, 1.0);
}
`;
