import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Perihelion — closest approach to a star. Intense solar proximity, heat
// and radiation, surface granulation seen up close, convection cells,
// solar prominences erupting across the view.

// Close-up granulation — large convection cells filling the view
float closeGranulation(vec2 uv, float t, float bass) {
  float cellScale = 4.0 + bass * 0.5;
  vec2 p = uv * cellScale;
  // Slow turbulent evolution
  p += vec2(sin(t * 0.06) * 0.3, cos(t * 0.04) * 0.2);

  vec3 vor = voronoi(p);
  float F1 = vor.x;
  float F2 = vor.y;

  // Cell interior — hot bright center
  float cellBright = smoothstep(0.35, 0.0, F1);
  // Dark intergranular lanes
  float darkLane = 1.0 - smoothstep(0.0, 0.05, F1);

  // Cell edge detail — turbulent downflow lanes
  float edgeDetail = smoothstep(0.08, 0.03, F1) * (1.0 - smoothstep(0.0, 0.03, F1));
  float edgeNoise = snoise(p * 4.0 + t * 0.1) * 0.5 + 0.5;
  edgeDetail *= edgeNoise;

  return (cellBright * 0.7 + edgeDetail * 0.2) * (1.0 - darkLane * 0.6);
}

// Supergranulation — larger scale pattern overlaid
float superGranulation(vec2 uv, float t) {
  vec3 vor = voronoi(uv * 1.2 + vec2(t * 0.008, t * 0.005));
  return smoothstep(0.3, 0.0, vor.x) * 0.3;
}

// Solar prominences — magnetic loops rising from the surface
float prominence(vec2 uv, vec2 foot1, vec2 foot2, float height, float t, float phase) {
  vec2 mid = (foot1 + foot2) * 0.5 + vec2(0.0, height);
  float minD = 1e6;

  for (int i = 0; i <= 20; i++) {
    float s = float(i) / 20.0;
    vec2 q0 = mix(foot1, mid, s);
    vec2 q1 = mix(mid, foot2, s);
    vec2 arcP = mix(q0, q1, s);

    // Breathing animation
    float breath = sin(t * 0.4 + phase) * 0.5 + 0.5;
    arcP.y += breath * height * 0.2;

    // Magnetic field threading
    float thread = sin(s * 12.0 + t * 1.5 + phase) * 0.01;
    arcP.x += thread;

    float d = length(uv - arcP);
    minD = min(minD, d);
  }

  float thickness = 0.006;
  float filament = smoothstep(thickness * 2.5, 0.0, minD);
  float glow = exp(-minD * 15.0) * 0.5;

  return filament + glow;
}

// Plasma plume — erupting material
float plasmaPlume(vec2 uv, float t, float bass) {
  float total = 0.0;

  // Large eruption
  float plumeAngle = t * 0.1;
  vec2 plumeBase = vec2(cos(plumeAngle) * 0.3, sin(plumeAngle) * 0.3 - 0.3);
  vec2 plumeDir = vec2(sin(plumeAngle), cos(plumeAngle));

  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    float progress = fi / 15.0;
    vec2 plumePos = plumeBase + plumeDir * progress * (0.4 + bass * 0.2);
    // Spread as it rises
    plumePos += vec2(
      snoise(vec2(fi * 2.0, t * 0.3)) * progress * 0.1,
      snoise(vec2(fi * 3.0 + 5.0, t * 0.25)) * progress * 0.08
    );

    float dist = length(uv - plumePos);
    float size = 0.01 + progress * 0.03;
    total += smoothstep(size, 0.0, dist) * (1.0 - progress * 0.7);
  }

  return total;
}

// Heat shimmer — atmospheric distortion from extreme proximity
vec2 heatShimmer(vec2 uv, float t) {
  float shimmerX = snoise(uv * 8.0 + vec2(t * 0.5, 0.0)) * 0.008;
  float shimmerY = snoise(uv * 8.0 + vec2(0.0, t * 0.4)) * 0.008;
  return vec2(shimmerX, shimmerY);
}

// Sunspot — dark cooler region
float sunspot(vec2 uv, vec2 center, float size, float t) {
  float dist = length(uv - center);
  // Umbra — darkest center
  float umbra = smoothstep(size * 0.4, size * 0.2, dist);
  // Penumbra — lighter surrounding
  float penumbra = smoothstep(size, size * 0.4, dist) * (1.0 - umbra);
  // Penumbral filaments
  float angle = atan(uv.y - center.y, uv.x - center.x);
  float filaments = sin(angle * 20.0 + t * 0.2) * 0.5 + 0.5;
  penumbra *= (0.5 + filaments * 0.5);

  return umbra * 0.8 + penumbra * 0.4;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.3;

  // Apply heat shimmer distortion
  vec2 shimmer = heatShimmer(uv, t) * (0.5 + u_treble * 1.5);
  vec2 distortedUV = uv + shimmer;

  float r = length(uv);

  // ── Surface granulation — we are so close the surface fills the view ──
  float gran = closeGranulation(distortedUV, t, u_bass);
  float superGran = superGranulation(distortedUV, t);

  // ── Sunspots ──
  vec2 spot1Pos = vec2(sin(t * 0.03) * 0.2, cos(t * 0.02) * 0.15);
  float spot1 = sunspot(distortedUV, spot1Pos, 0.12, t);
  vec2 spot2Pos = vec2(cos(t * 0.025) * 0.3 - 0.1, sin(t * 0.035) * 0.2 + 0.1);
  float spot2 = sunspot(distortedUV, spot2Pos, 0.08, t);
  float spots = spot1 + spot2;

  // ── Prominences erupting from edges ──
  float prom1 = prominence(uv,
    vec2(-0.5, -0.45), vec2(-0.3, -0.45),
    0.3 + u_bass * 0.12, t, 0.0);
  float prom2 = prominence(uv,
    vec2(0.2, -0.45), vec2(0.45, -0.45),
    0.25 + u_bass * 0.1, t, 2.0);
  float prom3 = prominence(uv,
    vec2(-0.45, 0.4), vec2(-0.2, 0.4),
    0.2 + u_mid * 0.08, t, 4.2);
  float proms = prom1 + prom2 + prom3;

  // ── Plasma plume ──
  float plume = plasmaPlume(uv, t, u_bass);

  // ── Radiation pressure — bright central overglow from extreme proximity ──
  float radiation = exp(-r * 1.5) * 0.2 * (1.0 + u_amplitude * 0.5);

  // ── Colors ──
  // Granule surface — intense yellow-orange-white
  vec3 granCol = palette(
    gran + superGran + t * 0.01 + paletteShift,
    vec3(0.65, 0.55, 0.35),
    vec3(0.35, 0.3, 0.2),
    vec3(0.25, 0.15, 0.05),
    vec3(0.02, 0.0, 0.0)
  );

  // Hot center of cells — near white
  vec3 hotCol = palette(
    gran * 2.0 + t * 0.02 + paletteShift + 0.1,
    vec3(0.85, 0.78, 0.6),
    vec3(0.15, 0.12, 0.1),
    vec3(0.2, 0.1, 0.05),
    vec3(0.0, 0.0, 0.0)
  );

  // Intergranular lanes — darker orange-red
  vec3 laneCol = palette(
    (1.0 - gran) + t * 0.008 + paletteShift + 0.25,
    vec3(0.4, 0.25, 0.15),
    vec3(0.3, 0.15, 0.1),
    vec3(0.3, 0.1, 0.05),
    vec3(0.05, 0.0, 0.0)
  );

  // Prominence — hot pink-red chromospheric plasma
  vec3 promCol = palette(
    proms * 0.5 + t * 0.03 + paletteShift + 0.4,
    vec3(0.6, 0.35, 0.3),
    vec3(0.4, 0.25, 0.2),
    vec3(0.4, 0.15, 0.1),
    vec3(0.08, 0.0, 0.0)
  );

  // Plume — bright ejected material
  vec3 plumeCol = palette(
    plume + t * 0.04 + paletteShift + 0.5,
    vec3(0.7, 0.5, 0.3),
    vec3(0.3, 0.3, 0.2),
    vec3(0.3, 0.15, 0.05),
    vec3(0.05, 0.02, 0.0)
  );

  // Build surface color
  vec3 surfaceColor = mix(laneCol, granCol, gran);
  surfaceColor = mix(surfaceColor, hotCol, pow(gran, 3.0));

  // Apply sunspots — darken
  surfaceColor *= (1.0 - spots * 0.7);

  vec3 color = surfaceColor;

  // Supergranulation overlay
  color += granCol * superGran * 0.4;

  // Prominences
  color += promCol * proms * (0.8 + u_bass * 0.8);

  // Plasma plume
  color += plumeCol * plume * (0.6 + u_mid * 0.6);

  // Radiation overglow
  color += hotCol * radiation;

  // Treble — chromospheric spicules and fine magnetic structure
  float spicules = snoise(distortedUV * 20.0 + t * 0.6) * 0.5 + 0.5;
  color += promCol * spicules * u_treble * 0.12;

  // Overall heat wash — everything tinted warm
  color += vec3(0.15, 0.08, 0.02) * (0.3 + u_amplitude * 0.2);

  // Vignette — slight, we are bathed in light
  float vignette = 1.0 - smoothstep(0.6, 1.4, r);
  color *= (0.8 + 0.2 * vignette);

  // Tonemap — prevent blowout but keep intensity
  color = color / (color + 0.45);
  color = pow(color, vec3(0.85));

  gl_FragColor = vec4(color, 1.0);
}
`;
