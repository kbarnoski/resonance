import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Aphelion — maximum orbital distance. Lonely orbit far from warmth.
// A faint distant star, cold blue-shifted light, sparse particle field,
// the loneliness of deep space.

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

// Distant star — just a pinpoint, barely warming anything
float distantStar(vec2 uv, vec2 starPos, float t) {
  float dist = length(uv - starPos);

  // Tiny distant star — cannot resolve its disk
  float point = 0.0003 / (dist * dist + 0.00005);

  // Feeble halo — barely visible
  float halo = exp(-dist * 15.0) * 0.1;

  // Diffraction spikes — four-point star artifact from optics
  vec2 rel = uv - starPos;
  float relAngle = atan(rel.y, rel.x);
  float spike = pow(abs(cos(relAngle * 2.0)), 40.0);
  spike *= exp(-dist * 8.0) * 0.15;

  // Very slow subtle pulsation — not energetic, just faint variation
  float pulse = 1.0 + sin(t * 0.3) * 0.05;

  return (point + halo + spike) * pulse;
}

// Sparse particle field — cold debris far from any heat source
float sparseParticles(vec2 uv, float t) {
  float total = 0.0;

  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    // Particles drift slowly — no energy, no urgency
    float px = hash1(fi * 7.3) * 2.0 - 1.0;
    float py = hash1(fi * 13.1) * 2.0 - 1.0;

    // Very slow drift
    px += sin(t * 0.02 + fi * 1.7) * 0.1;
    py += cos(t * 0.015 + fi * 2.3) * 0.08;

    float dist = length(uv - vec2(px, py));
    float size = 0.002 + hash1(fi * 19.7) * 0.003;

    // Dim, cold particles
    float brightness = 0.15 + hash1(fi * 31.1) * 0.15;
    total += smoothstep(size, 0.0, dist) * brightness;

    // Faint glow around larger particles
    if (hash1(fi * 23.7) > 0.7) {
      total += exp(-dist * dist * 2000.0) * 0.03;
    }
  }
  return total;
}

// Cold gas wisps — nearly invisible interplanetary medium
float coldWisps(vec2 uv, float t) {
  float w1 = fbm(uv * 1.5 + t * 0.008) * 0.5 + 0.5;
  float w2 = fbm(uv * 2.5 + vec2(10.0, 5.0) + t * 0.005) * 0.5 + 0.5;

  // Only the faintest wisps — this is deep space, almost nothing here
  float wisps = w1 * w2;
  wisps = smoothstep(0.4, 0.7, wisps) * 0.06;

  return wisps;
}

// Distant galaxy — tiny smudge of light, infinitely far away
float distantGalaxy(vec2 uv, vec2 center, float size, float angle) {
  vec2 rel = rot2(angle) * (uv - center);
  rel.y *= 2.5; // elliptical
  float dist = length(rel);
  return smoothstep(size, 0.0, dist) * 0.15;
}

// Orbital path hint — very faint curve showing the lonely orbit
float orbitalPath(vec2 uv, float t) {
  // Elliptical orbit path — we are at the far end
  float orbitA = 0.8; // semi-major axis
  float orbitB = 0.5; // semi-minor axis

  float minDist = 1e6;
  for (int i = 0; i < 60; i++) {
    float s = float(i) / 60.0 * 6.28318;
    vec2 orbitPos = vec2(cos(s) * orbitA, sin(s) * orbitB);
    float d = length(uv - orbitPos);
    minDist = min(minDist, d);
  }

  // Very faint line — just a suggestion of the orbital path
  return smoothstep(0.005, 0.0, minDist) * 0.1;
}

// Cold star field — distant, sharp, indifferent
float coldStars(vec2 uv, float seed, float scale) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  if (h < 0.965) return 0.0;
  float brightness = fract(h * 37.3);
  float r = 0.015 + 0.02 * brightness;
  // Minimal twinkle — atmosphere-free deep space, steady light
  float twinkle = 0.9 + 0.1 * sin(u_time * 0.3 + h * 30.0);
  return smoothstep(r, 0.0, length(f)) * twinkle * brightness * 0.4;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.08; // Everything moves slowly — far from energy
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);

  // ── The distant star — far away, faint but present ──
  vec2 starPos = vec2(-0.4, 0.25);
  float star = distantStar(uv, starPos, t);
  star *= (0.6 + u_amplitude * 0.5);

  // ── Faint light cone from distant star ──
  vec2 lightDir = normalize(uv - starPos);
  float lightAngle = atan(uv.y - starPos.y, uv.x - starPos.x);
  float starDist = length(uv - starPos);
  float lightCone = exp(-starDist * 1.5) * 0.03;

  // ── Sparse particle field ──
  float particles = sparseParticles(uv, t);
  particles *= (0.4 + u_mid * 0.4);

  // ── Cold wisps ──
  float wisps = coldWisps(uv, t);
  wisps *= (0.3 + u_treble * 0.3);

  // ── Distant galaxies — faint smudges ──
  float gal1 = distantGalaxy(uv, vec2(0.35, -0.3), 0.03, 0.5);
  float gal2 = distantGalaxy(uv, vec2(-0.2, -0.4), 0.02, -0.3);
  float gal3 = distantGalaxy(uv, vec2(0.5, 0.35), 0.025, 0.8);

  // ── Orbital path ──
  float orbit = orbitalPath(rot2(0.3) * uv, t);

  // ── Star field — cold indifferent universe ──
  float s1 = coldStars(uv, 0.0, 45.0);
  float s2 = coldStars(uv, 30.0, 65.0);
  float s3 = coldStars(uv, 70.0, 85.0);

  // ── Very faint zodiacal light — dust near the orbital plane ──
  float zodiacal = exp(-abs(uv.y) * 4.0) * exp(-abs(uv.x - starPos.x) * 1.0) * 0.02;

  // ── Colors — cold, blue-shifted, lonely ──
  // Background — near-absolute dark blue-black
  vec3 bgCol = palette(
    r * 0.1 + paletteShift + 0.7,
    vec3(0.008, 0.01, 0.018),
    vec3(0.005, 0.008, 0.015),
    vec3(0.3, 0.35, 0.5),
    vec3(0.1, 0.15, 0.25)
  );

  // Star color — cold yellow-white (blue-shifted from distance)
  vec3 starCol = palette(
    star + t * 0.03 + paletteShift,
    vec3(0.7, 0.72, 0.75),
    vec3(0.2, 0.18, 0.15),
    vec3(0.3, 0.25, 0.2),
    vec3(0.0, 0.02, 0.05)
  );

  // Light cone — barely tinted
  vec3 lightCol = palette(
    lightCone * 5.0 + paletteShift + 0.2,
    vec3(0.12, 0.12, 0.15),
    vec3(0.08, 0.08, 0.1),
    vec3(0.3, 0.3, 0.4),
    vec3(0.1, 0.1, 0.15)
  );

  // Particle color — cold blue-grey
  vec3 particleCol = palette(
    particles * 3.0 + paletteShift + 0.5,
    vec3(0.15, 0.18, 0.22),
    vec3(0.1, 0.12, 0.15),
    vec3(0.3, 0.35, 0.5),
    vec3(0.1, 0.12, 0.2)
  );

  // Wisp color — cold blue
  vec3 wispCol = palette(
    wisps * 5.0 + paletteShift + 0.6,
    vec3(0.06, 0.08, 0.12),
    vec3(0.04, 0.05, 0.08),
    vec3(0.3, 0.4, 0.6),
    vec3(0.1, 0.15, 0.25)
  );

  // Galaxy smudge color
  vec3 galCol = palette(
    t * 0.01 + paletteShift + 0.4,
    vec3(0.12, 0.12, 0.15),
    vec3(0.08, 0.08, 0.1),
    vec3(0.3, 0.3, 0.4),
    vec3(0.1, 0.1, 0.2)
  );

  // Orbit line color — barely visible grey
  vec3 orbitCol = vec3(0.05, 0.06, 0.08);

  vec3 color = bgCol;

  // Star field (deepest layer)
  vec3 coldStarTint = vec3(0.6, 0.65, 0.8);
  color += coldStarTint * s1;
  color += coldStarTint * s2;
  color += coldStarTint * s3;

  // Distant galaxies
  color += galCol * (gal1 + gal2 + gal3);

  // Zodiacal light
  color += lightCol * zodiacal;

  // Cold wisps
  color += wispCol * wisps;

  // Orbital path
  color += orbitCol * orbit;

  // Sparse particles
  color += particleCol * particles;

  // Light cone from distant star
  color += lightCol * lightCone;

  // The distant star itself
  color += starCol * star;

  // Bass — very subtle pulse of warmth from the distant star
  float warmPulse = exp(-starDist * 3.0) * u_bass * 0.04;
  color += vec3(0.15, 0.1, 0.05) * warmPulse;

  // Treble — faint crystalline shimmer in the particle field
  float shimmer = snoise(uv * 25.0 + t * 0.4) * 0.5 + 0.5;
  color += particleCol * shimmer * u_treble * 0.03;

  // Blue-shift tint — everything shifts cold blue at max distance
  color = mix(color, color * vec3(0.85, 0.9, 1.15), 0.2);

  // Vignette — deep and dark, emphasizing cosmic loneliness
  float vignette = 1.0 - smoothstep(0.3, 1.1, r);
  color *= (0.4 + 0.6 * vignette);

  // Minimal tonemap — keep the darkness
  color = pow(color, vec3(0.95));

  gl_FragColor = vec4(color, 1.0);
}
`;
