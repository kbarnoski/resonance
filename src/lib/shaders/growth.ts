import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.28;

  // ── Perspective: looking straight down from above an infinite forest ──
  // Tree rings radiate from a point infinitely far below
  // To simulate the infinite field: use a log-polar mapping
  // As radius increases, rings get tighter (representing looking across more trees)

  // Radial coordinate — distance from nadir point (center = directly below)
  float radius = length(uv);
  float angle = atan(uv.y, uv.x);

  // Log-polar mapping: rings at equal intervals in log(r) space
  // This simulates looking across an infinite forest where ring spacing
  // decreases proportional to 1/r (perspective compression)
  float logR = log(max(radius, 0.001));

  // ── Ring system ──
  // Ring frequency in log-space — constant spacing = expanding rings in world space
  float ringFreq = 6.0 + u_bass * 2.0;

  // Time causes rings to slowly drift outward (tree growth propagating)
  float ringPhase = logR * ringFreq - t * 1.2;

  // Noise deformation — rings aren't perfectly circular (real tree rings)
  // Higher frequency angular modulation with FBM
  float noiseScale = 2.5;
  float deformNoise = fbm(vec2(angle * noiseScale + t * 0.08, logR * 1.5 + t * 0.06));
  float deformNoise2 = fbm(vec2(angle * noiseScale * 2.0 - t * 0.05, logR * 2.0) + deformNoise * 0.4);

  // Deform the ring phase by noise — organic irregular rings
  float deformStrength = 1.8 + u_mid * 1.0;
  float deformedPhase = ringPhase + deformNoise * deformStrength + deformNoise2 * 0.8;

  // Ring signal — smooth oscillation
  float ringSignal = sin(deformedPhase);

  // Multiple ring harmonics for more complex annular pattern
  float ringSignal2 = sin(deformedPhase * 2.1 + t * 0.5) * 0.4;
  float ringSignal3 = sin(deformedPhase * 3.3 - t * 0.3) * 0.2;
  float combinedRing = ringSignal + ringSignal2 + ringSignal3;
  combinedRing = combinedRing / 1.6; // normalize

  // Extract distinct ring bands
  float ringBand = smoothstep(-0.05, 0.30, combinedRing) - smoothstep(0.30, 0.65, combinedRing);

  // Hard ring edge — the growth boundary (darkwood vs lightwood in real trees)
  float ringEdge = smoothstep(0.25, 0.35, combinedRing) * (1.0 - smoothstep(0.35, 0.50, combinedRing));
  ringEdge = pow(ringEdge, 1.5);

  // ── Secondary growth features ──
  // Ray cells (radial lines in real wood) — emanate outward from center
  float raySpacing = 18.0 + u_treble * 6.0;
  float ray = 0.5 + 0.5 * sin(angle * raySpacing + t * 0.2);
  ray = pow(ray, 8.0); // sparse bright rays

  // Knots — where branches were — circular distortions at hash positions
  float knotField = 0.0;
  // 3 knot positions determined by stable hashes
  vec2 knot1 = vec2(0.25, 0.18);
  vec2 knot2 = vec2(-0.31, -0.22);
  vec2 knot3 = vec2(0.10, -0.35);

  float k1Dist = length(uv - knot1);
  float k2Dist = length(uv - knot2);
  float k3Dist = length(uv - knot3);

  // Knot: rings warp around the knot center
  float knotWarp1 = sin(k1Dist * ringFreq * 1.2 - t * 1.0) * exp(-k1Dist * 5.0);
  float knotWarp2 = sin(k2Dist * ringFreq * 1.1 - t * 1.2) * exp(-k2Dist * 5.0);
  float knotWarp3 = sin(k3Dist * ringFreq * 1.3 - t * 0.8) * exp(-k3Dist * 5.0);
  knotField = (knotWarp1 + knotWarp2 + knotWarp3) * 0.4;

  // Combine knot field with main rings
  float finalRing = clamp(ringBand + knotField * 0.5, 0.0, 1.0);
  float finalEdge = clamp(ringEdge + abs(knotField) * 0.3, 0.0, 1.0);

  // ── Depth: center = deepest tree, edge = most distant / bird's-eye ──
  // Near center: very tight rings (we're right above that tree)
  // Near edge: rings become smooth haze (many trees blurring together)
  float depthFog = smoothstep(0.3, 1.0, radius);

  // ── Color palettes ──
  // Light wood — wide growth ring (spring/summer wood)
  vec3 lightWood = palette(
    finalRing * 0.5 + deformNoise * 0.3 + t * 0.02 + paletteShift,
    vec3(0.45, 0.35, 0.22),
    vec3(0.25, 0.18, 0.10),
    vec3(0.9, 0.75, 0.5),
    vec3(0.0, 0.08, 0.15)
  );

  // Dark wood — narrow ring boundary (autumn/winter wood)
  vec3 darkWood = palette(
    deformNoise2 * 0.4 + logR * 0.1 + paletteShift + 0.5,
    vec3(0.22, 0.16, 0.10),
    vec3(0.12, 0.08, 0.05),
    vec3(0.7, 0.55, 0.35),
    vec3(0.02, 0.06, 0.10)
  );

  // Knot / resin pockets — warm amber
  vec3 knotColor = palette(
    knotField * 0.8 + t * 0.03 + paletteShift + 0.3,
    vec3(0.5, 0.35, 0.15),
    vec3(0.3, 0.20, 0.08),
    vec3(1.0, 0.75, 0.4),
    vec3(0.05, 0.05, 0.15)
  );

  // Ray cell color — slightly lighter than lightwood
  vec3 rayColor = palette(
    angle * 0.05 + t * 0.01 + paletteShift + 0.15,
    vec3(0.55, 0.42, 0.28),
    vec3(0.20, 0.14, 0.08),
    vec3(0.85, 0.70, 0.45),
    vec3(0.0, 0.06, 0.12)
  );

  // Distant haze — forest canopy green
  vec3 canopyColor = palette(
    depthFog * 0.5 + t * 0.02 + paletteShift + 0.65,
    vec3(0.15, 0.22, 0.12),
    vec3(0.10, 0.15, 0.08),
    vec3(0.6, 0.9, 0.4),
    vec3(0.05, 0.20, 0.08)
  );

  // ── Compose ──
  vec3 col = mix(darkWood, lightWood, finalRing);
  col = mix(col, darkWood * 0.7, finalEdge);
  col += knotColor * (abs(knotField) * 0.5);

  // Ray cells visible in lightwood bands
  float rayMask = finalRing * ray;
  col = mix(col, rayColor, rayMask * 0.35);

  // Treble activates shimmering resin glow in knot regions
  float trebleAct = smoothstep(0.05, 0.5, u_treble);
  col += knotColor * abs(knotField) * trebleAct * 0.4;

  // Mid frequency — growth pulses ripple outward like a time-lapse
  float growthPulse = sin(logR * ringFreq + t * 3.0) * 0.5 + 0.5;
  growthPulse = pow(growthPulse, 6.0) * u_mid * finalRing;
  col += lightWood * growthPulse * 0.5;

  // Bass — strong ring contrast surge
  col = mix(col, col * (1.0 + u_bass * 0.6), 0.5);

  // Depth fog — edge of viewport becomes distant canopy
  col = mix(col, canopyColor * 0.5, depthFog * 0.7);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, radius);
  col *= vignette;

  gl_FragColor = vec4(col, 1.0);
}
`;
