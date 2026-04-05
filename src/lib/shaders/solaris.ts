import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Solaris — Binary star system: two bright cores orbiting each
// other trailing luminous arcs, tidal streams of matter exchanged.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Stellar core with pulsating surface
float stellarCore(vec2 uv, vec2 center, float radius, float t, float phase) {
  float r = length(uv - center);

  // Core surface
  float surface = smoothstep(radius, radius * 0.8, r);

  // Surface granulation
  vec2 surfUV = (uv - center) * 12.0;
  float gran = snoise(surfUV + t * 0.3 + phase) * 0.5 + 0.5;

  // Pulsation
  float pulse = 1.0 + 0.05 * sin(t * 2.5 + phase);
  surface *= pulse;

  // Limb darkening
  float limb = 1.0 - pow(r / radius, 2.0);
  limb = max(limb, 0.0);

  // Hot glow around core
  float glow = exp(-(r - radius) * 12.0) * step(radius, r);

  return surface * (0.7 + gran * 0.3) * limb + glow;
}

// Orbital trail — luminous arc left behind
float orbitalTrail(vec2 uv, vec2 center, float orbitR, float currentAngle, float t) {
  float r = length(uv - center);
  float a = atan(uv.y - center.y, uv.x - center.x);

  // Ring at orbit radius
  float ring = exp(-pow((r - orbitR) / 0.015, 2.0));

  // Trail fades behind the star
  float angleDiff = mod(currentAngle - a + 3.14159, 6.28318) - 3.14159;
  float trail = smoothstep(0.0, 3.0, angleDiff) * smoothstep(5.5, 3.0, angleDiff);

  return ring * trail;
}

// Tidal stream — matter flowing between the two stars
float tidalStream(vec2 uv, vec2 pos1, vec2 pos2, float t) {
  // Bezier curve between stars with sag
  vec2 mid = (pos1 + pos2) * 0.5;
  mid += vec2(sin(t * 0.7) * 0.05, cos(t * 0.5) * 0.08);

  float minD = 1e6;
  for (int i = 0; i <= 20; i++) {
    float s = float(i) / 20.0;
    vec2 q0 = mix(pos1, mid, s);
    vec2 q1 = mix(mid, pos2, s);
    vec2 pt = mix(q0, q1, s);

    // Wobble the stream
    float wobble = sin(s * 15.0 + t * 3.0) * 0.008;
    pt += vec2(wobble, wobble * 0.7);

    minD = min(minD, length(uv - pt));
  }

  float stream = exp(-minD * 80.0);

  // Brightness varies — clumpy
  float clumps = sin(minD * 200.0 + t * 4.0) * 0.5 + 0.5;

  return stream * (0.5 + clumps * 0.5);
}

// Background stars
float stars(vec2 uv) {
  vec2 id = floor(uv * 70.0);
  vec2 f = fract(uv * 70.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.94, h);
  float twinkle = 0.5 + 0.5 * sin(u_time * (2.0 + h * 7.0) + h * 90.0);
  return star * smoothstep(0.03, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;

  float paletteShift = u_amplitude * 0.2;

  // ── Binary orbit calculation ──
  float orbitR = 0.22;
  float orbitSpeed = t * 0.6;

  vec2 center = vec2(0.0);
  vec2 star1Pos = center + vec2(cos(orbitSpeed), sin(orbitSpeed)) * orbitR;
  vec2 star2Pos = center + vec2(cos(orbitSpeed + 3.14159), sin(orbitSpeed + 3.14159)) * orbitR;

  // ── Background ──
  vec3 color = vec3(0.01, 0.01, 0.02);
  float s = stars(uv);
  color += vec3(0.7, 0.75, 1.0) * s * 0.5;

  // ── Orbital trails ──
  float trail1 = orbitalTrail(uv, center, orbitR, orbitSpeed, t);
  float trail2 = orbitalTrail(uv, center, orbitR, orbitSpeed + 3.14159, t);

  // Trail colors
  vec3 trail1Col = palette(
    trail1 + t * 0.03 + paletteShift,
    vec3(0.6, 0.4, 0.2),
    vec3(0.3, 0.2, 0.15),
    vec3(0.5, 0.3, 0.1),
    vec3(0.0, 0.05, 0.1)
  );
  vec3 trail2Col = palette(
    trail2 + t * 0.03 + paletteShift + 0.5,
    vec3(0.3, 0.4, 0.7),
    vec3(0.15, 0.2, 0.35),
    vec3(0.2, 0.4, 0.9),
    vec3(0.1, 0.1, 0.3)
  );

  color += trail1Col * trail1 * (0.3 + u_mid * 0.3);
  color += trail2Col * trail2 * (0.3 + u_mid * 0.3);

  // ── Tidal stream between stars ──
  float tidal = tidalStream(uv, star1Pos, star2Pos, t);
  tidal *= (0.5 + u_bass * 1.0);
  vec3 tidalCol = palette(
    tidal + t * 0.05 + paletteShift + 0.3,
    vec3(0.7, 0.55, 0.4),
    vec3(0.25, 0.2, 0.15),
    vec3(0.4, 0.3, 0.2),
    vec3(0.05, 0.05, 0.1)
  );
  color += tidalCol * tidal * 0.8;

  // ── Star 1 — hot blue-white ──
  float core1 = stellarCore(uv, star1Pos, 0.06, t, 0.0);
  core1 *= (0.8 + u_bass * 0.5);
  vec3 star1Col = palette(
    core1 * 0.3 + t * 0.02 + paletteShift + 0.1,
    vec3(0.7, 0.75, 0.95),
    vec3(0.15, 0.12, 0.1),
    vec3(0.3, 0.3, 0.5),
    vec3(0.1, 0.1, 0.25)
  );
  // Diffuse glow
  float glow1 = exp(-length(uv - star1Pos) * 5.0) * 0.3;
  color += star1Col * core1 * 1.5;
  color += vec3(0.4, 0.5, 0.8) * glow1;

  // ── Star 2 — warm gold-orange ──
  float core2 = stellarCore(uv, star2Pos, 0.045, t, 3.0);
  core2 *= (0.8 + u_bass * 0.5);
  vec3 star2Col = palette(
    core2 * 0.3 + t * 0.02 + paletteShift + 0.6,
    vec3(0.9, 0.7, 0.4),
    vec3(0.15, 0.1, 0.05),
    vec3(0.35, 0.25, 0.1),
    vec3(0.0, 0.05, 0.08)
  );
  float glow2 = exp(-length(uv - star2Pos) * 6.0) * 0.25;
  color += star2Col * core2 * 1.5;
  color += vec3(0.6, 0.4, 0.2) * glow2;

  // ── Gravitational glow at center ──
  float centerGlow = exp(-length(uv) * 4.0) * 0.1;
  color += vec3(0.3, 0.25, 0.35) * centerGlow * (0.5 + u_amplitude * 0.5);

  // ── Treble — sparkle on tidal stream ──
  float sparkle = snoise(uv * 30.0 + t * 2.0) * 0.5 + 0.5;
  sparkle = pow(sparkle, 6.0);
  color += vec3(1.0, 0.95, 0.85) * sparkle * tidal * u_treble * 0.5;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= (0.75 + 0.25 * vignette);

  // Tonemap
  color = color / (color + 0.5);

  gl_FragColor = vec4(color, 1.0);
}
`;
