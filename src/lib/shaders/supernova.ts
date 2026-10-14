import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";
import { withAngleSeamBlend } from "./angle-seam";
import { RS_WRAP_ENV } from "./time-wrap";

// Angle seam-blended (atan branch cut — see ./angle-seam).
export const FRAG = withAngleSeamBlend(
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  RS_WRAP_ENV +
  `
// Supernova — the most violent death in the universe.
// Multiple shock wavefronts racing outward at 10% light speed.
// Debris shell receding toward infinite distance.
// At center: the remnant neutron star, cooling.

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Expanding shock ring — distance from an annulus of radius r
float shockRing(vec2 uv, float radius, float thickness, float wobble, float t) {
  // PERF (2026-10-13, the 120 fps law): the ring is exactly 0 farther than
  // its thickness + the noise warp's reach (|snoise| <= 1 -> r x 0.08 x
  // wobble) from its radius — the angle + noise only run where it can show
  float r0 = length(uv);
  if (abs(r0 - radius) >= thickness + r0 * wobble * 0.08) return 0.0;
  float angle = atan(uv.y, uv.x);
  float warp = 1.0 + wobble * snoise(vec2(angle * 2.0, t * 0.3)) * 0.08;
  float r = length(uv) * warp;

  float dist = abs(r - radius);
  return smoothstep(thickness, 0.0, dist);
}

// Filamentary debris — Rayleigh-Taylor instabilities create finger structures
float debris(vec2 uv, float expansionAge, float t) {
  float r = length(uv);
  // (the shell's gaussian is < 1e-4 beyond 0.61 of it — 0.03 of an 8-bit
  // step after the tone map: the filament fbm is skipped there)
  if (abs(r - expansionAge * 0.22) > 0.61) return 0.0;
  float angle = atan(uv.y, uv.x);

  // Radial filaments from noise-perturbed angle
  float n = fbm(vec2(angle * 4.0, r * 3.0 - expansionAge * 0.5));
  float filament = pow(max(0.0, n), 2.5);

  // Bound to expanding debris shell
  float shellRadius = expansionAge * 0.22;
  float shellMask = exp(-pow((r - shellRadius) * 5.0, 2.0));
  shellMask *= smoothstep(0.0, 0.05, r); // exclude center

  return filament * shellMask;
}

// Debris particle spray — discrete ejecta fragments
float ejectaParticles(vec2 uv, float age, float t) {
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float ejAngle = hash1(fi * 7.31) * 6.28318;
    float ejSpeed = 0.08 + hash1(fi * 13.7) * 0.18;
    // Ejecta travel radially outward
    float ejR = ejSpeed * age;
    vec2 ejPos = vec2(cos(ejAngle), sin(ejAngle)) * ejR;

    float d = length(uv - ejPos);
    float size = 0.006 + hash1(fi * 3.19) * 0.012;
    // Brightness fades as ejecta cools and expands
    float brightness = exp(-age * 0.4) * (1.0 + u_bass * 0.5);

    total += (size * size) / (d * d + size * 0.3) * brightness;
  }
  return total;
}

// Central remnant — neutron star cooling from white-hot
float remnantStar(vec2 uv, float t, float amplitude) {
  float r = length(uv);
  float core = 0.0012 / (r * r + 0.00015);
  float hotGlow = exp(-r * 25.0) * 0.3;
  // Pulsing — could become a pulsar
  float pulse = 1.0 + amplitude * 0.6 * sin(t * 5.0);
  return (core + hotGlow) * pulse;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.25;
  float paletteShift = u_amplitude * 0.3;

  // Age of explosion — slowly expands over session
  // Loops on a long period so we always see active expansion
  float age = mod(t * 1.2, 5.0) + 0.3;
  // Wrap envelope: the whole explosion (shocks, debris, ejecta, interior
  // glow) fades out before age wraps and back in after — the big ring used
  // to vanish in one frame while a tiny new one appeared (kiosk 2026-10-10).
  float cycleEnv = rsWrapEnv((age - 0.3) / 5.0);

  // ── Shock wavefronts ──
  // Primary blast wave — outermost, fastest
  float blastRadius   = age * 0.22;
  float shock1 = shockRing(uv, blastRadius, 0.018 + u_bass * 0.008, 1.0, t);
  // Secondary reverse shock — inward-facing
  float shock2 = shockRing(uv, blastRadius * 0.72, 0.012, 0.6, t + 1.5);
  // Tertiary inner shock — contact discontinuity
  float shock3 = shockRing(uv, blastRadius * 0.48, 0.008, 0.4, t + 3.0);

  // Bass amplifies shock brightness
  float shockTotal = shock1 * 1.0 + shock2 * 0.65 + shock3 * 0.4;
  shockTotal *= (1.0 + u_bass * 1.2);

  // ── Debris and filaments ──
  float deb = debris(uv, age, t);
  float ejecta = ejectaParticles(uv, age, t);

  // ── Remnant core ──
  float remnant = remnantStar(uv, t, u_amplitude);

  // ── Interior hot gas — shocked interstellar medium ──
  float r = length(uv);
  float interiorMask = smoothstep(blastRadius, blastRadius * 0.85, r);
  // (the interior is exactly 0 outside the blast — skip its noise there)
  float interiorNoise = r < blastRadius ? fbm(uv * 3.0 + t * 0.1) * 0.5 + 0.5 : 0.0;
  float interior = interiorMask * interiorNoise * 0.15;

  // ── Colors ──
  // Shock — hot ionized gas: red-orange outer, blue-white inner
  vec3 shockCol = palette(
    r / (blastRadius + 0.01) + t * 0.03 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.3),
    vec3(0.5, 0.3, 0.1),
    vec3(0.05, 0.1, 0.2)
  );

  // Treble makes outer edge shimmer blue-violet
  vec3 shockRimCol = palette(
    r * 2.0 + t * 0.06 + paletteShift + 0.3,
    vec3(0.5, 0.5, 0.5),
    vec3(0.3, 0.4, 0.5),
    vec3(0.2, 0.5, 0.9),
    vec3(0.1, 0.1, 0.3)
  );

  // Debris — cooling, reddish
  vec3 debrisCol = palette(
    atan(uv.y, uv.x) / 6.28318 + age * 0.1 + paletteShift + 0.55,
    vec3(0.5, 0.4, 0.3),
    vec3(0.4, 0.3, 0.2),
    vec3(0.8, 0.5, 0.2),
    vec3(0.05, 0.0, 0.05)
  );

  // Interior — softer emission nebula greens
  vec3 interiorCol = palette(
    interiorNoise + t * 0.02 + paletteShift + 0.7,
    vec3(0.4, 0.5, 0.4),
    vec3(0.3, 0.4, 0.3),
    vec3(0.3, 0.7, 0.5),
    vec3(0.1, 0.2, 0.15)
  );

  // Remnant — blue-white neutronium
  vec3 remnantCol = palette(
    t * 0.3 + paletteShift,
    vec3(0.85, 0.9, 1.0),
    vec3(0.15, 0.1, 0.2),
    vec3(0.4, 0.2, 0.6),
    vec3(0.0, 0.0, 0.1)
  );

  // Deep space void
  vec3 color = vec3(0.002, 0.002, 0.005);

  // Build scene
  color += interiorCol * interior * (0.5 + u_mid * 0.5) * cycleEnv;
  color += shockCol * shockTotal * 0.7 * cycleEnv;
  color += shockRimCol * shock1 * u_treble * 0.4 * cycleEnv;
  color += debrisCol * (deb * 0.3 + ejecta * 0.12) * (0.6 + u_mid * 0.4) * cycleEnv;
  color += remnantCol * remnant * (1.0 + u_amplitude);

  // Hot white emissive on strongest shock
  color += vec3(1.2, 1.1, 1.0) * pow(shock1, 3.0) * u_bass * 1.5 * cycleEnv;

  // Vignette — infinity at edges
  float vignette = 1.0 - smoothstep(0.5, 1.4, r);
  color *= vignette;

  // Reinhard tone map
  color = color / (color + 0.6);
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`);
