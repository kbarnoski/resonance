import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Molten veins — glowing cracks across a dark cooling surface.
// Simple 3x3 voronoi for edge detection. Veins pulse with bass.

// 3-octave fbm
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Simple voronoi — returns vec3(f1, f2, cellId hash)
float hash1(float n) { return fract(sin(n) * 43758.5453); }
vec2 hashCell(vec2 cell) {
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  return vec2(h, h2);
}

vec3 simpleVoronoi(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  float cellHash = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cell = n + g;
      vec2 o = hashCell(cell);
      // Animate cell centers slowly
      o = 0.5 + 0.45 * sin(time * 0.4 + 6.28 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) {
        md2 = md1;
        md1 = d;
        cellHash = fract(sin(dot(cell, vec2(41.7, 89.3))) * 2745.3);
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  return vec3(sqrt(md1), sqrt(md2), cellHash);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.2;

  // ── Slow domain warp for organic crack shapes ──
  float wx = fbm3(uv * 1.5 + vec2(t * 0.2, 0.0));
  float wy = fbm3(uv * 1.5 + vec2(0.0, t * 0.15) + vec2(5.0, 3.0));
  vec2 warped = uv + vec2(wx, wy) * 0.15;

  // ── Primary voronoi network — large cracks ──
  vec3 vor = simpleVoronoi(warped * 3.5, t);
  float f1 = vor.x;
  float f2 = vor.y;
  float cellId = vor.z;
  float edgeDist = f2 - f1;

  // ── Secondary finer crack network ──
  vec3 vor2 = simpleVoronoi(warped * 7.0 + vec2(10.0, 5.0), t * 0.8);
  float edgeDist2 = vor2.y - vor2.x;

  // ── Vein intensity — edge glow ──
  // Primary veins — wider, hotter
  float bassPulse = 0.7 + u_bass * 0.6;
  float veinWidth = 0.06 + u_bass * 0.04;
  float vein = smoothstep(veinWidth, 0.0, edgeDist) * bassPulse;

  // Secondary veins — thinner, dimmer
  float vein2 = smoothstep(0.03, 0.0, edgeDist2) * 0.4 * bassPulse;

  // Combined vein intensity
  float veinTotal = vein + vein2 * (1.0 - vein * 0.5);
  veinTotal = clamp(veinTotal, 0.0, 1.5);

  // ── Dark surface — cooling lava rock ──
  float surfNoise = fbm3(warped * 6.0 + t * 0.05);
  float surfTex = surfNoise * 0.5 + 0.5;

  vec3 darkSurface = palette(
    surfTex * 0.15 + cellId * 0.1 + paletteShift,
    vec3(0.02, 0.015, 0.01),
    vec3(0.015, 0.01, 0.008),
    vec3(0.5, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Per-cell temperature variation — some cells slightly warmer
  float cellWarmth = smoothstep(0.3, 0.7, cellId) * 0.03;
  darkSurface += vec3(cellWarmth, cellWarmth * 0.3, 0.0);

  // ── Vein colors — hot core to cooler edges ──
  // White-hot core of the crack
  float coreIntensity = smoothstep(0.4, 1.0, veinTotal);
  vec3 veinCore = palette(
    0.08 + paletteShift,
    vec3(0.5, 0.35, 0.15),
    vec3(0.3, 0.2, 0.08),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.04, 0.08)
  );

  // Orange-red outer vein
  vec3 veinOuter = palette(
    0.04 + paletteShift + u_mid * 0.03,
    vec3(0.3, 0.08, 0.02),
    vec3(0.3, 0.1, 0.02),
    vec3(1.0, 0.5, 0.15),
    vec3(0.0, 0.06, 0.12)
  );

  vec3 veinColor = mix(veinOuter, veinCore, coreIntensity);

  // ── Emissive glow bleeding out from veins ──
  float glowSpread = smoothstep(veinWidth + 0.2, 0.0, edgeDist);
  float glowSpread2 = smoothstep(0.1, 0.0, edgeDist2) * 0.4;
  float glow = (glowSpread + glowSpread2) * 0.15;

  vec3 glowColor = palette(
    0.06 + paletteShift,
    vec3(0.15, 0.04, 0.01),
    vec3(0.12, 0.05, 0.01),
    vec3(1.0, 0.5, 0.2),
    vec3(0.0, 0.06, 0.12)
  );

  // ── Compositing ──
  vec3 color = darkSurface;

  // Add the emissive glow halo first (behind the veins)
  color += glowColor * glow * (0.6 + u_bass * 0.5);

  // Add the veins themselves
  color = mix(color, veinColor, clamp(veinTotal, 0.0, 1.0));

  // ── Subtle surface cracks — very fine detail ──
  float microCrack = snoise(warped * 25.0 + t * 0.3);
  microCrack = smoothstep(0.6, 0.8, abs(microCrack)) * 0.015;
  color += vec3(0.08, 0.03, 0.01) * microCrack * (1.0 - veinTotal);

  // ── Treble-reactive hot spots — small bright pulses on veins ──
  float hotSpot = snoise(warped * 10.0 + vec2(u_time * 0.8, 0.0));
  hotSpot = smoothstep(0.6, 0.9, hotSpot) * vein * u_treble;
  color += vec3(0.15, 0.08, 0.02) * hotSpot;

  // Vignette
  float vd = length(uv * vec2(0.95, 0.9));
  float vignette = 1.0 - smoothstep(0.4, 1.3, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
