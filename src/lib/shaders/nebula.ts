import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Nebula — flying INSIDE a dense emission nebula.
// You are immersed in ionized gas, not observing from outside.
// fbm domain-warped gas clouds with parallax layering give
// the sensation of movement through infinite glowing mist.

// Cheaper 4-octave fbm for inner detail without 6-octave cost
float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Domain-warped gas density — the signature nebula look
float gasDensity(vec2 p, float t) {
  // Two levels of domain warp — creates the characteristic billowing
  vec2 q = vec2(
    fbm4(p + vec2(0.0, 0.0) + t * 0.02),
    fbm4(p + vec2(5.2, 1.3) + t * 0.018)
  );
  vec2 r = vec2(
    fbm4(p + q * 2.2 + vec2(1.7, 9.2) + t * 0.015),
    fbm4(p + q * 2.2 + vec2(8.3, 2.8) + t * 0.012)
  );
  float density = fbm4(p + r * 2.8);
  return density;
}

// Emission pillar structures — tall dense columns
float pillar(vec2 uv, float t) {
  float n = fbm(uv * vec2(2.0, 0.5) + vec2(t * 0.01, 0.0));
  n = n * 0.5 + 0.5;
  // Pillars are vertically elongated structures
  float vertMask = smoothstep(0.3, 0.6, n);
  return vertMask * smoothstep(0.7, -0.6, uv.y); // rise from bottom
}

// Star field — seen through thin patches of nebula
float stars(vec2 uv, float seed) {
  vec2 id = floor(uv * 50.0);
  vec2 f = fract(uv * 50.0) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  if (h < 0.96) return 0.0;
  float radius = 0.025 + 0.02 * fract(h * 19.3);
  float twinkle = 0.7 + 0.3 * sin(u_time * (2.0 + h * 6.0) + h * 100.0) * u_treble;
  return smoothstep(radius, 0.0, length(f)) * twinkle;
}

// Protostellar hot spots — newborn stars forming inside pillars
float hotSpot(vec2 uv, vec2 center, float t, float phase) {
  float r = length(uv - center);
  float pulse = 1.0 + 0.4 * sin(t * 3.0 + phase);
  return exp(-r * 12.0) * pulse * (0.5 + u_bass * 0.8);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.28;

  // ── Camera flying through — parallax at multiple depth scales ──
  vec2 flyOffset = vec2(sin(t * 0.4) * 0.3, cos(t * 0.3) * 0.2) + t * vec2(0.15, 0.07);

  // Three parallax layers at different depths
  // Near layer — dense, large features, fast parallax
  vec2 uvNear = uv * 1.2 + flyOffset * 1.4;
  // Mid layer — medium density, medium scale
  vec2 uvMid = uv * 0.8 + flyOffset * 0.9 + vec2(30.0, 15.0);
  // Far layer — thin wisps, slow parallax (nearly infinite distance)
  vec2 uvFar = uv * 0.4 + flyOffset * 0.4 + vec2(70.0, 50.0);

  float densNear = gasDensity(uvNear, t) * 0.5 + 0.5;
  float densMid  = gasDensity(uvMid, t * 0.8) * 0.5 + 0.5;
  float densFar  = gasDensity(uvFar, t * 0.5) * 0.5 + 0.5;

  // Threshold — nebula is not uniform, it has voids
  densNear = smoothstep(0.35, 0.85, densNear);
  densMid  = smoothstep(0.25, 0.75, densMid) * 0.7;
  densFar  = smoothstep(0.15, 0.65, densFar) * 0.4;

  // Bass inflates all cloud density
  densNear *= (0.7 + u_bass * 0.8);
  densMid  *= (0.5 + u_bass * 0.5);

  // ── Pillar structures — near layer only ──
  float pillars = pillar(uvNear * 0.6, t) * 0.3;

  // ── Hot spots — protostellar cores, bass-driven ──
  float hs1 = hotSpot(uv, vec2(-0.25, 0.1), t, 0.0);
  float hs2 = hotSpot(uv, vec2(0.3, -0.2), t, 2.1);
  float hs3 = hotSpot(uv, vec2(0.05, 0.35), t, 4.3);

  // ── Stars visible through voids ──
  float voidMask = 1.0 - densNear;
  float s1 = stars(uv + flyOffset * 0.2, 0.0) * voidMask;
  float s2 = stars(uv * 1.8 + flyOffset * 0.1 + vec2(17.0), 50.0) * voidMask * 0.7;

  // ── Colors ──
  // Near gas — rich emission nebula: classic rose-red hydrogen-alpha
  vec3 nearCol = palette(
    densNear + uvNear.x * 0.1 + t * 0.03 + paletteShift,
    vec3(0.5, 0.4, 0.5),
    vec3(0.5, 0.3, 0.4),
    vec3(0.8, 0.3, 0.6),
    vec3(0.1, 0.0, 0.2)
  );

  // Mid gas — cooler, bluer — oxygen [OIII] emission
  vec3 midCol = palette(
    densMid + uvMid.y * 0.1 + t * 0.02 + paletteShift + 0.25,
    vec3(0.4, 0.5, 0.5),
    vec3(0.3, 0.4, 0.5),
    vec3(0.2, 0.7, 0.9),
    vec3(0.1, 0.2, 0.4)
  );

  // Far wisps — deep purple sulfur [SII]
  vec3 farCol = palette(
    densFar + t * 0.01 + paletteShift + 0.55,
    vec3(0.3, 0.3, 0.5),
    vec3(0.2, 0.2, 0.4),
    vec3(0.5, 0.2, 0.8),
    vec3(0.15, 0.05, 0.3)
  );

  // Hot spot color — brilliant yellow-white new stars
  vec3 hotCol = palette(
    t * 0.2 + paletteShift + 0.8,
    vec3(0.9, 0.85, 0.8),
    vec3(0.1, 0.1, 0.2),
    vec3(0.5, 0.4, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);

  // Compose layers: far first, then mid, then near (painter's algorithm in fog space)
  color += farCol  * densFar;
  color += midCol  * densMid  * (0.8 + u_mid * 0.4);
  color += nearCol * (densNear + pillars) * (0.7 + u_mid * 0.5);

  // Protostellar hot spots
  float hotTotal = hs1 + hs2 + hs3;
  color += hotCol * hotTotal * (1.0 + u_bass * 0.8);
  color += vec3(1.4, 1.3, 1.1) * hotTotal * u_treble * 0.5;

  // Stars through voids
  color += vec3(1.0, 1.1, 1.3) * s1 + vec3(1.2, 1.05, 0.9) * s2;

  // Ambient scatter — you're inside the cloud, light comes from all directions
  vec3 ambientCol = palette(
    t * 0.04 + paletteShift + 0.4,
    vec3(0.15, 0.1, 0.2),
    vec3(0.1, 0.08, 0.15),
    vec3(0.6, 0.3, 0.8),
    vec3(0.1, 0.1, 0.3)
  );
  color += ambientCol * 0.06;

  // Vignette — being inside a cloud dims the periphery (forward scatter)
  float vignette = 1.0 - smoothstep(0.3, 1.1, length(uv));
  color *= (0.7 + 0.3 * vignette);

  // Soft filament glow — treble creates fine lit edges on gas pillars
  float edgeGlow = snoise(uvNear * 6.0 + t * 0.2) * 0.5 + 0.5;
  edgeGlow *= densNear * u_treble * 0.15;
  color += nearCol * edgeGlow;

  gl_FragColor = vec4(color, 1.0);
}
`;
