import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Expanse — the hardest thing to render: almost nothing.
// Vast empty deep space. The between-spaces. The void between galaxy clusters.
// A rare star. The faintest wisps of intergalactic medium.
// Infinite scale expressed through near-absolute silence.

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Ultra-sparse star field — very few stars, each important
float rareStar(vec2 uv, float scale, vec2 drift, float seed) {
  vec2 p = uv * scale + drift;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;

  float h = hash(id + seed);
  // Only 3% of cells have a star — vast distances between each
  if (h > 0.97) {
    float size = 0.02 + hash1(h * 11.3) * 0.04;
    float d = length(f);
    float b = smoothstep(size, 0.0, d);
    // Faint glow halo
    b += smoothstep(size * 5.0, 0.0, d) * 0.06;
    // Very slow twinkle
    float tw = 0.85 + 0.15 * sin(u_time * (0.2 + hash1(h * 7.1) * 0.5) + h * 50.0);
    return b * tw;
  }
  return 0.0;
}

// Intergalactic medium filament — barely visible thread of gas
// connecting galactic voids (cosmic web, artistic)
float igmFilament(vec2 uv, float t) {
  // Very large scale, very slow
  vec2 p = uv * 0.5 + vec2(t * 0.004, t * 0.003);
  // Two octaves only — this should be nearly invisible
  float n = snoise(p) * 0.5 + snoise(p * 2.3 + vec2(5.1, 3.7)) * 0.25;
  n = n * 0.5 + 0.375; // remap to [0, 0.75]
  // Only the faintest filaments visible
  return smoothstep(0.48, 0.58, n) * 0.08;
}

// Distant galaxy — a tiny smear of light
float distantGalaxy(vec2 uv, vec2 center, float size, float angle, float t) {
  vec2 p = uv - center;
  // Rotate to orientation angle
  float ca = cos(angle), sa = sin(angle);
  p = vec2(p.x * ca + p.y * sa, -p.x * sa + p.y * ca);

  // Elliptical shape (disc galaxy seen at inclination)
  p.y *= 2.5;
  float r = length(p);

  // Sersic profile — exponential disc
  float gal = exp(-r / size) * (size * size * 0.003);

  // Very slow rotation shimmer
  float shimmer = 1.0 + 0.05 * sin(t * 0.05 + angle * 3.0);

  return gal * shimmer;
}

// Lone wandering star at specific position
float wanderingStar(vec2 uv, vec2 pos, float brightness, float t, float phase) {
  float r = length(uv - pos);
  float core = 0.0006 / (r * r + 0.00008);
  float glow = exp(-r * 15.0) * 0.08;
  float pulse = 1.0 + 0.08 * sin(t * 0.8 + phase);
  return (core + glow) * brightness * pulse;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.08; // very slow
  float paletteShift = u_amplitude * 0.25;

  // ── Intergalactic medium — barely there ──
  float igm = igmFilament(uv, t);

  // ── Sparse star layers — near nothing ──
  // Three depth layers, all very sparse
  vec2 drift0 = vec2(t * 0.05, t * 0.03);
  vec2 drift1 = vec2(t * 0.02, t * 0.04) + vec2(20.0);
  vec2 drift2 = vec2(t * 0.008, t * 0.012) + vec2(50.0);

  float stars0 = rareStar(uv, 5.0,  drift0, 0.0);   // nearest: visible stars
  float stars1 = rareStar(uv, 12.0, drift1, 31.7);  // mid distance
  float stars2 = rareStar(uv, 25.0, drift2, 73.3);  // far: barely visible

  // ── A few fixed landmark stars — rare but real ──
  float ws1 = wanderingStar(uv, vec2(-0.35, 0.22), 0.4, t, 0.0);
  float ws2 = wanderingStar(uv, vec2(0.28, -0.31), 0.25, t, 2.3);
  float ws3 = wanderingStar(uv, vec2(0.05, 0.41), 0.18, t, 4.7); // very faint

  // ── Distant galaxies — smears at the edge of sight ──
  float gal1 = distantGalaxy(uv, vec2(-0.48, 0.15), 0.06, 0.7, t);
  float gal2 = distantGalaxy(uv, vec2(0.41, -0.38), 0.04, 1.9, t);
  float gal3 = distantGalaxy(uv, vec2(0.22, 0.48), 0.03, 0.3, t); // barely there

  // ── Colors — desaturated, austere, vast ──
  // IGM — ghostly blue-white
  vec3 igmCol = palette(
    igm * 3.0 + t * 0.01 + paletteShift,
    vec3(0.3, 0.35, 0.42),
    vec3(0.08, 0.1, 0.15),
    vec3(0.3, 0.5, 0.8),
    vec3(0.1, 0.15, 0.3)
  );

  // Near stars — blue-white, cold
  vec3 starCol0 = palette(
    stars0 * 0.3 + paletteShift + 0.1,
    vec3(0.6, 0.65, 0.75),
    vec3(0.25, 0.25, 0.35),
    vec3(0.3, 0.4, 0.7),
    vec3(0.05, 0.08, 0.2)
  );

  // Mid stars — neutral white
  vec3 starCol1 = palette(
    stars1 * 0.3 + paletteShift + 0.3,
    vec3(0.65, 0.65, 0.65),
    vec3(0.2, 0.2, 0.22),
    vec3(0.4, 0.4, 0.5),
    vec3(0.03, 0.04, 0.08)
  );

  // Far stars — red-shifted, faintest
  vec3 starCol2 = palette(
    stars2 * 0.3 + paletteShift + 0.6,
    vec3(0.4, 0.35, 0.38),
    vec3(0.15, 0.12, 0.15),
    vec3(0.5, 0.3, 0.4),
    vec3(0.06, 0.04, 0.08)
  );

  // Galaxy color — ancient amber-white
  vec3 galCol = palette(
    t * 0.005 + paletteShift + 0.45,
    vec3(0.55, 0.52, 0.48),
    vec3(0.2, 0.18, 0.14),
    vec3(0.4, 0.35, 0.2),
    vec3(0.02, 0.01, 0.0)
  );

  // ── Pure void background — not quite black ──
  // The CMB gives space an almost imperceptible warmth
  vec3 color = vec3(0.003, 0.003, 0.006);

  // A very faint radial gradient — the universe is slightly "warm" at center of view
  float warmth = exp(-length(uv) * 1.5) * 0.008;
  color += vec3(0.015, 0.012, 0.025) * warmth;

  // IGM wisps
  color += igmCol * igm * (0.5 + u_mid * 0.3);

  // Stars — additive, far first
  color += starCol2 * stars2 * 0.35;
  color += starCol1 * stars1 * 0.6;
  color += starCol0 * stars0 * 1.0;

  // Landmark stars
  float wsTotal = ws1 + ws2 + ws3;
  color += starCol0 * wsTotal;

  // Pulse on bass — stars slightly brighten with music
  color += starCol0 * stars0 * u_bass * 0.5;
  color += starCol0 * wsTotal * u_bass * 0.3;

  // Distant galaxies — barely perceptible
  float galTotal = gal1 + gal2 + gal3;
  color += galCol * galTotal * (0.7 + u_amplitude * 0.3);

  // Treble — the faintest scintillation in the IGM
  float scint = snoise(uv * 8.0 + t * 0.3) * 0.5 + 0.5;
  color += igmCol * scint * igm * u_treble * 0.15;

  // The vignette here is very gentle — the void continues beyond frame
  float vignette = 1.0 - smoothstep(0.65, 1.5, length(uv));
  color *= (0.85 + 0.15 * vignette);

  // No tone mapping needed — this is naturally dark
  gl_FragColor = vec4(color, 1.0);
}
`;
