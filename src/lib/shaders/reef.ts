import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Underwater coral reef — abstract flowing coral branches, sea fans waving,
// plankton particles drifting through shafts of surface light.
// Warm coral oranges and pinks against deep blue-green water.

// Branching coral structure via domain-warped fbm
float coralShape(vec2 p, float t) {
  // Vertical bias — corals grow upward
  vec2 q = p * vec2(1.5, 2.5);
  q.y -= t * 0.02;
  // Domain warp to create branching look
  float warp1 = fbm(q * 0.8 + vec2(t * 0.01, 0.0));
  float warp2 = fbm(q * 1.2 + vec2(5.3, t * 0.015));
  vec2 warped = q + vec2(warp1, warp2) * 0.8;
  float shape = fbm(warped * 1.5);
  // Threshold to get branch-like structures
  return smoothstep(0.05, 0.45, shape * 0.5 + 0.5);
}

// Sea fan — thin oscillating sheet-like coral
float seaFan(vec2 p, vec2 anchor, float t, float phase) {
  vec2 lp = p - anchor;
  // Fans wave side to side in current
  float sway = sin(t * 0.3 + phase + lp.y * 3.0) * 0.08 * (lp.y + 0.5);
  lp.x += sway;
  lp.x += u_bass * 0.02 * sin(t * 0.8 + lp.y * 5.0);
  // Fan shape: narrow at base, wider at top
  float width = 0.04 + max(lp.y + 0.3, 0.0) * 0.25;
  float fan = smoothstep(width, width - 0.02, abs(lp.x));
  fan *= smoothstep(-0.35, -0.1, lp.y) * smoothstep(0.35, 0.15, lp.y);
  // Internal vein pattern
  float veins = sin(lp.x * 60.0 + lp.y * 8.0) * 0.5 + 0.5;
  veins = smoothstep(0.3, 0.7, veins);
  return fan * (0.7 + veins * 0.3);
}

// Plankton / particle field
float plankton(vec2 uv, float t, float seed) {
  float total = 0.0;
  for (int i = 0; i < 30; i++) {
    float fi = float(i) + seed;
    float hx = fract(sin(fi * 127.1) * 43758.5453);
    float hy = fract(sin(fi * 311.7) * 43758.5453);
    float ht = fract(sin(fi * 78.233) * 43758.5453);
    // Drift with current — mostly upward and rightward
    vec2 pos = vec2(
      hx * 2.0 - 1.0 + sin(t * 0.2 * (0.5 + ht) + fi) * 0.3,
      mod(hy * 2.0 - 1.0 + t * 0.03 * (0.3 + ht), 2.0) - 1.0
    );
    float size = 0.002 + ht * 0.003;
    float d = length(uv - pos);
    float brightness = smoothstep(size, 0.0, d);
    // Twinkle
    brightness *= 0.5 + 0.5 * sin(t * 2.0 * (0.5 + ht) + fi * 10.0);
    total += brightness;
  }
  return total;
}

// Caustic light rays from above
float lightRay(vec2 uv, float t) {
  float rays = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float offset = sin(t * 0.15 + fi * 1.7) * 0.3;
    float width = 0.08 + 0.04 * sin(t * 0.2 + fi * 2.5);
    float ray = exp(-pow((uv.x - offset) / width, 2.0) * 2.0);
    // Rays are strongest at top, fade toward bottom
    ray *= smoothstep(-0.5, 0.5, uv.y);
    // Undulate with time
    ray *= 0.6 + 0.4 * sin(t * 0.4 + fi * 3.0 + uv.y * 2.0);
    rays += ray;
  }
  return rays * 0.3;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // ── Water current — gentle global sway ──
  vec2 current = vec2(sin(t * 0.3) * 0.05, cos(t * 0.2) * 0.03);
  vec2 swayUV = uv + current;

  // ── Deep water background ──
  float waterNoise = fbm(swayUV * 1.5 + vec2(t * 0.05, t * 0.03));
  vec3 deepWater = palette(
    waterNoise * 0.3 + uv.y * 0.2 + paletteShift + 0.5,
    vec3(0.02, 0.08, 0.15),
    vec3(0.03, 0.08, 0.12),
    vec3(0.3, 0.5, 0.7),
    vec3(0.05, 0.15, 0.30)
  );
  // Darken at bottom, lighter near top
  deepWater *= 0.6 + 0.4 * smoothstep(-0.5, 0.5, uv.y);

  // ── Coral reef structures ──
  float coral1 = coralShape(swayUV * 1.0 + vec2(0.2, -0.3), t);
  float coral2 = coralShape(swayUV * 1.3 + vec2(-0.5, -0.2), t * 0.9);
  float coral3 = coralShape(swayUV * 0.7 + vec2(0.7, -0.4), t * 1.1);

  // Only show coral in lower portion of view (reef grows from below)
  float reefMask = smoothstep(0.1, -0.3, uv.y);
  coral1 *= reefMask;
  coral2 *= reefMask * smoothstep(0.0, -0.25, uv.y);
  coral3 *= reefMask;

  // Coral colors — warm oranges, pinks, magentas
  vec3 coralCol1 = palette(
    coral1 * 0.5 + paletteShift + 0.0,
    vec3(0.6, 0.35, 0.25),
    vec3(0.35, 0.2, 0.15),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.05, 0.15)
  );
  vec3 coralCol2 = palette(
    coral2 * 0.5 + paletteShift + 0.33,
    vec3(0.55, 0.25, 0.35),
    vec3(0.3, 0.2, 0.25),
    vec3(0.7, 0.3, 0.6),
    vec3(0.05, 0.0, 0.1)
  );
  vec3 coralCol3 = palette(
    coral3 * 0.5 + paletteShift + 0.66,
    vec3(0.5, 0.4, 0.2),
    vec3(0.25, 0.2, 0.1),
    vec3(0.9, 0.6, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // ── Sea fans ──
  float fan1 = seaFan(uv, vec2(-0.3, -0.35), t, 0.0);
  float fan2 = seaFan(uv, vec2(0.25, -0.4), t, 2.0);
  float fan3 = seaFan(uv, vec2(0.0, -0.3), t, 4.5);

  // Bass makes fans wave more
  vec3 fanCol = palette(
    fan1 * 0.5 + paletteShift + 0.15,
    vec3(0.55, 0.2, 0.35),
    vec3(0.3, 0.15, 0.2),
    vec3(0.6, 0.4, 0.7),
    vec3(0.05, 0.0, 0.2)
  );

  // ── Light rays from surface ──
  float rays = lightRay(uv, t);
  rays *= (0.5 + u_mid * 0.5);
  vec3 rayCol = vec3(0.6, 0.8, 0.9) * rays;

  // ── Plankton particles ──
  float particles = plankton(uv, t, 0.0);
  particles *= (0.3 + u_treble * 0.7);
  vec3 particleCol = vec3(0.8, 0.9, 1.0) * particles * 0.4;

  // ── Compose scene ──
  vec3 color = deepWater;

  // Add coral layers
  color = mix(color, coralCol1 * (0.7 + u_bass * 0.3), coral1 * 0.7);
  color = mix(color, coralCol2 * (0.7 + u_mid * 0.3), coral2 * 0.6);
  color = mix(color, coralCol3 * (0.7 + u_bass * 0.3), coral3 * 0.5);

  // Add sea fans
  float fanTotal = max(max(fan1, fan2), fan3);
  color = mix(color, fanCol, fanTotal * 0.6);

  // Light rays overlay
  color += rayCol;

  // Surface caustic shimmer on coral
  float causticN = snoise(swayUV * 6.0 + vec2(t * 0.8, t * 0.5));
  causticN = pow(max(causticN, 0.0), 3.0);
  float causticMask = reefMask * (coral1 + coral2 + coral3) * 0.3;
  color += vec3(0.7, 0.85, 0.95) * causticN * causticMask * (0.4 + u_treble * 0.6);

  // Plankton
  color += particleCol;

  // Underwater haze — slight blue fog
  float haze = 1.0 - smoothstep(0.0, 1.5, length(uv));
  color = mix(vec3(0.03, 0.08, 0.14), color, 0.7 + 0.3 * haze);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
