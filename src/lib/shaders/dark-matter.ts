import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark Matter — Invisible force field visualization:
// gravitational lensing distortions warping a starfield,
// the unseen mass betrayed only by bent light.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Dark matter halo — invisible mass concentration
// Returns a lensing displacement vector
vec2 darkHalo(vec2 uv, vec2 center, float mass, float radius) {
  vec2 delta = uv - center;
  float r = length(delta);
  // NFW-like profile: deflection peaks at radius, drops off outside
  float deflection = mass / (r + 0.02) * exp(-r / radius);
  return normalize(delta) * deflection;
}

// Star field — dense, to make lensing visible
float starField(vec2 uv, float density, float seed) {
  vec2 id = floor(uv * density);
  vec2 f = fract(uv * density) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.88, h);
  float radius = 0.02 + 0.05 * fract(h * 29.0);
  float brightness = smoothstep(radius, 0.0, length(f));
  float twinkle = 0.6 + 0.4 * sin(u_time * (1.5 + h * 6.0) + h * 70.0);
  // Star color temperature
  return star * brightness * twinkle;
}

// Star color based on position hash
vec3 starColor(vec2 uv, float density, float seed) {
  vec2 id = floor(uv * density);
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  float temp = fract(h * 7.3);
  // Hot blue to cool red
  return mix(
    mix(vec3(1.0, 0.8, 0.6), vec3(1.0, 1.0, 0.9), temp),
    vec3(0.7, 0.8, 1.3),
    smoothstep(0.5, 1.0, temp)
  );
}

// Gravitational arc — lensed background galaxy
float gravArc(vec2 uv, vec2 lensCenter, float arcR, float arcAngle, float arcSpan, float t) {
  float r = length(uv - lensCenter);
  float a = atan(uv.y - lensCenter.y, uv.x - lensCenter.x);

  float ringDist = abs(r - arcR);
  float ring = exp(-ringDist * ringDist * 3000.0);

  // Arc is only a portion of the ring
  float angleDiff = abs(mod(a - arcAngle + 3.14159, 6.28318) - 3.14159);
  float arcMask = smoothstep(arcSpan, arcSpan * 0.7, angleDiff);

  // Brightness variation along the arc
  float brightness = 0.6 + 0.4 * sin(angleDiff * 8.0 + t * 0.5);

  return ring * arcMask * brightness;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  float paletteShift = u_amplitude * 0.15;

  // ── Dark matter halos — multiple concentrations ──
  // Moving slowly, invisibly
  vec2 halo1Pos = vec2(sin(t * 0.15) * 0.25, cos(t * 0.12) * 0.2);
  vec2 halo2Pos = vec2(cos(t * 0.1) * 0.3 - 0.1, sin(t * 0.13) * 0.25 + 0.1);
  vec2 halo3Pos = vec2(sin(t * 0.08 + 2.0) * 0.2 + 0.15, cos(t * 0.09 + 1.0) * 0.15 - 0.15);

  // Compute total lensing displacement
  float lensStrength = 0.03 + u_bass * 0.015;
  vec2 totalLens = vec2(0.0);
  totalLens += darkHalo(uv, halo1Pos, lensStrength * 1.2, 0.25);
  totalLens += darkHalo(uv, halo2Pos, lensStrength * 0.8, 0.2);
  totalLens += darkHalo(uv, halo3Pos, lensStrength * 0.6, 0.18);

  // Lensed UV
  vec2 lensedUV = uv + totalLens;

  // ── Star field — unlensed and lensed ──
  vec3 color = vec3(0.005, 0.005, 0.015);

  // Layer 1 — distant, dense
  float s1 = starField(lensedUV, 60.0, 0.0);
  vec3 sCol1 = starColor(lensedUV, 60.0, 0.0);
  color += sCol1 * s1 * 0.8;

  // Layer 2 — mid
  float s2 = starField(lensedUV * 1.3, 100.0, 42.0);
  vec3 sCol2 = starColor(lensedUV * 1.3, 100.0, 42.0);
  color += sCol2 * s2 * 0.5;

  // Layer 3 — very distant, faint
  float s3 = starField(lensedUV * 0.7, 150.0, 91.0);
  color += vec3(0.6, 0.65, 0.8) * s3 * 0.3;

  // ── Gravitational arcs — lensed background galaxies ──
  float arc1 = gravArc(uv, halo1Pos, 0.2, 0.5 + t * 0.02, 0.8, t);
  float arc2 = gravArc(uv, halo1Pos, 0.22, 2.5 + t * 0.015, 0.6, t);
  float arc3 = gravArc(uv, halo2Pos, 0.15, 1.0 + t * 0.025, 0.7, t);

  vec3 arcCol1 = palette(
    arc1 + t * 0.03 + paletteShift,
    vec3(0.4, 0.5, 0.7),
    vec3(0.2, 0.2, 0.35),
    vec3(0.3, 0.4, 0.8),
    vec3(0.1, 0.15, 0.35)
  );

  vec3 arcCol2 = palette(
    arc3 + t * 0.025 + paletteShift + 0.4,
    vec3(0.5, 0.4, 0.55),
    vec3(0.2, 0.15, 0.25),
    vec3(0.4, 0.3, 0.7),
    vec3(0.1, 0.1, 0.3)
  );

  color += arcCol1 * (arc1 + arc2) * (0.4 + u_mid * 0.5);
  color += arcCol2 * arc3 * (0.3 + u_mid * 0.4);

  // ── Dark matter visualization — the invisible made visible ──
  // Show the lensing strength as a faint ghostly field
  float lensStrengthVis = length(totalLens) * 15.0;
  float fieldVis = smoothstep(0.0, 1.0, lensStrengthVis);

  vec3 dmCol = palette(
    fieldVis + t * 0.02 + paletteShift + 0.7,
    vec3(0.15, 0.12, 0.25),
    vec3(0.1, 0.08, 0.18),
    vec3(0.3, 0.2, 0.5),
    vec3(0.1, 0.08, 0.25)
  );
  color += dmCol * fieldVis * 0.08 * (0.5 + u_bass * 0.5);

  // ── Caustic network — bright lines where light is magnified ──
  // Divergence of the lens field creates caustics
  float dx = length(darkHalo(uv + vec2(0.001, 0.0), halo1Pos, lensStrength * 1.2, 0.25)) -
             length(darkHalo(uv - vec2(0.001, 0.0), halo1Pos, lensStrength * 1.2, 0.25));
  float dy = length(darkHalo(uv + vec2(0.0, 0.001), halo1Pos, lensStrength * 1.2, 0.25)) -
             length(darkHalo(uv - vec2(0.0, 0.001), halo1Pos, lensStrength * 1.2, 0.25));
  float caustic = abs(dx + dy) * 300.0;
  caustic = smoothstep(0.5, 2.0, caustic) * 0.15;

  color += vec3(0.4, 0.45, 0.7) * caustic * (0.5 + u_treble * 1.0);

  // ── Faint nebula background — gives the lensing something to distort ──
  float nebula = fbm4(lensedUV * 2.0 + t * 0.02);
  nebula = smoothstep(0.0, 0.6, nebula) * 0.03;
  vec3 nebCol = palette(
    nebula * 3.0 + t * 0.01 + paletteShift + 0.3,
    vec3(0.3, 0.25, 0.4),
    vec3(0.15, 0.12, 0.25),
    vec3(0.4, 0.3, 0.7),
    vec3(0.1, 0.1, 0.3)
  );
  color += nebCol * nebula;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= (0.75 + 0.25 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;
