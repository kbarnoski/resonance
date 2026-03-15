import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Corona — the solar surface seen from orbit.
// Granulation cells (convection) tile the disc via Voronoi.
// Plasma arcs erupt from the limb and rise into infinite space.
// The corona itself — million-degree atmosphere — glows above.

// Solar granule structure via Voronoi — convection cells
float granulation(vec2 uv, float t, float bass) {
  // Scale and animate — cells evolve slowly (solar granules ~8 min lifetime)
  float cellScale = 6.0 + bass * 1.0;
  vec2 p = uv * cellScale;

  // Slow turbulent drift of the whole granulation pattern
  p += vec2(sin(t * 0.08) * 0.5, cos(t * 0.06) * 0.4);

  vec3 vor = voronoi(p);
  float F1 = vor.x;
  float F2 = vor.y;

  // Cell interior — bright hot center, dark cool edges (granule structure)
  float cellBrightness = smoothstep(0.4, 0.0, F1); // bright at cell center

  // Cell borders — dark intergranular lanes
  float border = 1.0 - smoothstep(0.0, 0.06, F1);
  float darkLane = border * 0.7;

  // Supergranules — larger second-order voronoi structure
  vec3 superVor = voronoi(uv * 1.5 + vec2(t * 0.01));
  float superGran = smoothstep(0.3, 0.0, superVor.x) * 0.3;

  return (cellBrightness + superGran) * (1.0 - darkLane) + darkLane * 0.1;
}

// Plasma arc — magnetic field loop erupting from limb
// p: uv space, base: footpoint position, height: apex height
float plasmaArc(vec2 uv, vec2 foot1, vec2 foot2, float height, float t, float phase) {
  // Parametric arc from foot1 to foot2 with height
  vec2 mid = (foot1 + foot2) * 0.5 + vec2(0.0, height);

  float minD = 1e6;
  // Sample the Bezier-like arc at multiple points
  for (int i = 0; i <= 16; i++) {
    float s = float(i) / 16.0;
    // Quadratic Bezier
    vec2 q0 = mix(foot1, mid, s);
    vec2 q1 = mix(mid, foot2, s);
    vec2 arcP = mix(q0, q1, s);

    // Animate — arc rises and falls
    float rise = sin(t * 0.5 + phase) * 0.5 + 0.5;
    arcP.y += rise * height * 0.3;

    float d = length(uv - arcP);
    minD = min(minD, d);
  }

  // Arc thickness — bright filament
  float thickness = 0.008 + u_bass * 0.004;
  float arc = smoothstep(thickness * 2.0, 0.0, minD);

  // Prominence — wider glowing envelope around the filament
  float prominence = exp(-minD * 20.0) * 0.4;

  return arc + prominence;
}

// Coronal streamer — diffuse magnetic structure reaching into infinite space
float coronalStreamer(vec2 uv, float angle, float t) {
  // Rotate uv to align with streamer direction
  vec2 p = rot2(angle) * uv;

  float x = abs(p.x);
  float y = p.y;

  // Only above limb
  if (y < 0.0) return 0.0;

  // Streamer width expands with height (Parker spiral)
  float width = 0.04 + y * 0.08;

  // Brightness falls as 1/r^2 receding to infinity
  float brightness = 1.0 / (y * y * 5.0 + 0.5);

  // Fine structure — ray-like substructure
  float rays = sin(x / (width + 0.001) * 8.0 + t * 0.3) * 0.5 + 0.5;

  return smoothstep(width, 0.0, x) * brightness * (0.5 + rays * 0.5);
}

// Solar limb darkening — center of disc is brighter than edge
float limbDarkening(vec2 uv, float discRadius) {
  float r = length(uv);
  float mu = sqrt(max(0.0, 1.0 - (r / discRadius) * (r / discRadius)));
  // Eddington limb darkening law
  return (0.4 + 0.6 * mu);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.3;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float discRadius = 0.45 + u_bass * 0.02;

  // ── Solar disc ──
  float discMask = smoothstep(discRadius + 0.01, discRadius - 0.01, r);

  // Granulation — only on the disc
  float gran = granulation(uv, t, u_bass);
  float limb = limbDarkening(uv, discRadius);
  float surface = gran * limb;

  // ── Plasma arcs — erupt from disc edge ──
  // Multiple arcs at different positions and heights
  float arc1 = plasmaArc(uv,
    vec2(-0.12, discRadius - 0.01),
    vec2( 0.08, discRadius - 0.01),
    0.25 + u_bass * 0.1, t, 0.0);

  float arc2 = plasmaArc(uv,
    vec2( 0.18, discRadius - 0.01),
    vec2( 0.32, discRadius - 0.01),
    0.18 + u_bass * 0.08, t, 2.1);

  float arc3 = plasmaArc(uv,
    vec2(-0.3,  discRadius - 0.01),
    vec2(-0.18, discRadius - 0.01),
    0.12 + u_mid * 0.06, t, 4.3);

  float arcTotal = arc1 + arc2 + arc3;
  // Arcs only above disc
  arcTotal *= (1.0 - discMask);

  // ── Coronal streamers — rising into infinite space ──
  float str1 = coronalStreamer(uv - vec2(0.0, discRadius), 0.0,     t);
  float str2 = coronalStreamer(uv - vec2(0.0, discRadius), 0.4,     t);
  float str3 = coronalStreamer(uv - vec2(0.0, discRadius), -0.35,   t);

  float streamers = (str1 * 0.5 + str2 * 0.3 + str3 * 0.4) * (1.0 - discMask);

  // ── Coronal halo — the million-degree atmosphere ──
  float coronaR = r - discRadius;
  float corona = smoothstep(0.6, 0.0, coronaR) * step(0.0, coronaR);
  corona *= (1.0 / (coronaR * 8.0 + 0.5)) * 0.15;
  corona *= (0.7 + u_mid * 0.5);

  // ── Colors ──
  // Solar surface — orange-yellow thermal radiation
  vec3 surfaceCol = palette(
    surface + gran * 0.3 + t * 0.01 + paletteShift,
    vec3(0.5, 0.45, 0.35),
    vec3(0.5, 0.35, 0.2),
    vec3(0.3, 0.2, 0.0),
    vec3(0.02, 0.0, 0.0)
  );

  // Hot spots — peak temperature at granule centers
  vec3 hotGranCol = palette(
    gran * 0.5 + t * 0.02 + paletteShift + 0.1,
    vec3(0.6, 0.5, 0.4),
    vec3(0.4, 0.3, 0.2),
    vec3(0.2, 0.1, 0.0),
    vec3(0.02, 0.01, 0.0)
  );

  // Plasma arc — cooler magnetized plasma: red-pink
  vec3 arcCol = palette(
    arcTotal * 0.4 + t * 0.04 + paletteShift + 0.35,
    vec3(0.5, 0.4, 0.4),
    vec3(0.5, 0.3, 0.3),
    vec3(0.5, 0.1, 0.2),
    vec3(0.05, 0.0, 0.05)
  );

  // Streamer — hot coronal plasma: yellow-white
  vec3 streamerCol = palette(
    streamers * 0.3 + t * 0.03 + paletteShift + 0.55,
    vec3(0.6, 0.55, 0.45),
    vec3(0.4, 0.35, 0.25),
    vec3(0.3, 0.2, 0.05),
    vec3(0.0, 0.01, 0.02)
  );

  // Corona — million-degree diffuse glow: blue-white
  vec3 coronaCol = palette(
    corona * 2.0 + t * 0.05 + paletteShift + 0.7,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.5),
    vec3(0.2, 0.4, 0.8),
    vec3(0.1, 0.15, 0.35)
  );

  // Deep space behind
  vec3 color = vec3(0.001, 0.001, 0.003);

  // Corona — outermost, rendered first
  color += coronaCol * corona;
  color += streamerCol * streamers * (0.6 + u_mid * 0.5);
  color += arcCol * arcTotal * (0.8 + u_bass * 0.8);

  // Solar disc
  color += surfaceCol * surface * discMask * 0.8;
  color += hotGranCol * pow(gran, 2.0) * limb * discMask * 0.6;

  // Emissive — brightest granule centers blow out to white
  color += vec3(1.5, 1.3, 1.0) * pow(surface, 3.0) * discMask * 0.5;

  // Treble — arc shimmer and spicule tips
  float spicules = snoise(uv * 20.0 + t * 0.5) * 0.5 + 0.5;
  spicules *= smoothstep(discRadius + 0.04, discRadius, r) * step(discRadius, r);
  color += arcCol * spicules * u_treble * 0.3;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, r);
  color *= vignette;

  // Exposure
  color = color / (color + 0.5);
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`;
