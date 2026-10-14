import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";
import { deriveFrag, tiledStages, LIGHT_PRE } from "./prepass-pack";

// PERF (the 120 fps law): the 30 distant galaxies are a per-frame light table
// (PRE, the identical math: position, brightness x bass, colour) binned into
// 64 px screen tiles (prepass-pack tiledStages, pass 4 2026-10-14): a pixel
// sums only the dots within 0.32 of its tile — beyond that a dot adds
// < 2e-6. The faint background glow (it adds at most 0.015) rides the far
// grid's spare channel. Galaxies skip their arm/palette math where they are
// exactly 0. ORIG is the reference and the no-float fallback.
export const ORIG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Hubble — deep field, thousands of tiny galaxy clusters.
// A recreation of the Hubble Deep Field, where every speck
// of light is an entire galaxy at unimaginable distance.

float spiralGalaxy(vec2 uv, vec2 pos, float size, float tilt, float spin, float t) {
  vec2 p = (uv - pos) / size;
  p *= rot2(tilt);
  p /= vec2(1.0, 0.5); // perspective tilt
  float r = length(p);
  float angle = atan(p.y, p.x);
  float arms = sin(angle * 2.0 - r * 8.0 + t * spin) * 0.5 + 0.5;
  float core = exp(-r * 4.0);
  float disk = exp(-r * 1.5) * (arms * 0.5 + 0.5);
  return (core + disk * 0.4) * smoothstep(1.5, 0.0, r);
}

float ellipticalGalaxy(vec2 uv, vec2 pos, float size, float ratio, float angle) {
  vec2 p = (uv - pos) * rot2(angle) / size;
  p /= vec2(1.0, ratio);
  float r = length(p);
  return exp(-r * 3.0) * smoothstep(1.0, 0.0, r);
}

float lensFlare(vec2 uv, vec2 pos, float intensity) {
  float d = length(uv - pos);
  return intensity * exp(-d * 100.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  vec3 color = vec3(0.0);
  float paletteShift = u_amplitude * 0.2;

  // Background — faint unresolved galaxy light
  float bgGlow = fbm(uv * 3.0 + t * 0.02) * 0.5 + 0.5;
  color += vec3(0.01, 0.008, 0.015) * bgGlow;

  // Spiral galaxies — larger, recognizable shapes
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = fi * 13.71;
    vec2 pos = vec2(
      sin(seed * 3.1) * 0.5,
      cos(seed * 4.7) * 0.4
    );
    float size = 0.04 + fract(seed * 0.37) * 0.04;
    float tilt = seed * 2.3;
    float spin = 0.3 + fract(seed * 0.53) * 0.3;
    float gal = spiralGalaxy(uv, pos, size, tilt, spin, t);

    vec3 galCol = palette(
      fi * 0.15 + gal * 0.3 + paletteShift,
      vec3(0.5, 0.45, 0.5),
      vec3(0.2, 0.2, 0.3),
      vec3(0.6 + fi * 0.05, 0.4, 0.5 + fi * 0.05),
      vec3(0.1, 0.05 + fi * 0.03, 0.2)
    );
    color += galCol * gal * (0.4 + u_mid * 0.3);
  }

  // Elliptical galaxies — red blobs
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = fi * 7.93 + 100.0;
    vec2 pos = vec2(
      sin(seed * 2.3) * 0.55,
      cos(seed * 3.1) * 0.45
    );
    float size = 0.015 + fract(seed * 0.29) * 0.025;
    float ratio = 0.5 + fract(seed * 0.43) * 0.5;
    float ang = seed * 1.7;
    float gal = ellipticalGalaxy(uv, pos, size, ratio, ang);

    vec3 galCol = palette(
      fi * 0.12 + paletteShift + 0.4,
      vec3(0.6, 0.4, 0.3),
      vec3(0.15, 0.1, 0.08),
      vec3(0.5, 0.3, 0.2),
      vec3(0.05, 0.05, 0.1)
    );
    color += galCol * gal * 0.5;
  }

  // Tiny distant galaxies — just points of light with color
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float seed = fi * 5.37 + 200.0;
    vec2 pos = vec2(
      fract(sin(seed * 127.1) * 43758.5) * 1.4 - 0.7,
      fract(sin(seed * 311.7) * 43758.5) * 1.0 - 0.5
    );
    float brightness = 0.1 + fract(seed * 0.71) * 0.2;
    float glow = exp(-length(uv - pos) * (40.0 + fi * 2.0)) * brightness;

    // Color by redshift — distant = redder
    float redshift = fract(seed * 0.31);
    vec3 dotCol = palette(
      redshift + paletteShift + 0.5,
      vec3(0.5, 0.4, 0.4),
      vec3(0.2, 0.15, 0.2),
      vec3(0.5, 0.3, 0.4),
      vec3(0.1 + redshift * 0.3, 0.05, 0.1)
    );
    color += dotCol * glow * (0.6 + u_bass * 0.2);
  }

  // Foreground star spikes — a few bright stars with diffraction
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float seed = fi * 11.3 + 500.0;
    vec2 pos = vec2(sin(seed * 3.7) * 0.4, cos(seed * 5.1) * 0.35);

    float d = length(uv - pos);
    float starCore = exp(-d * 60.0) * 0.8;

    // Diffraction spikes
    vec2 sp = uv - pos;
    float spike1 = exp(-abs(sp.x) * 80.0) * exp(-abs(sp.y) * 8.0) * 0.2;
    float spike2 = exp(-abs(sp.y) * 80.0) * exp(-abs(sp.x) * 8.0) * 0.2;
    float spikes = spike1 + spike2;

    float twinkle = 0.7 + 0.3 * sin(u_time * 1.5 + seed);
    color += vec3(1.0, 0.95, 0.85) * (starCore + spikes) * twinkle * (0.5 + u_treble * 0.3);
  }

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Light table (LIGHT_PRE layout): dot i = (x, y, brightness x bass drive,
 *  falloff 40 + 2i), colour = its redshift palette. */
const LIGHT = `
    float t = u_time * 0.1;
    float paletteShift = u_amplitude * 0.2;
    float seed = fi * 5.37 + 200.0;
    lp = vec2(
      fract(sin(seed * 127.1) * 43758.5) * 1.4 - 0.7,
      fract(sin(seed * 311.7) * 43758.5) * 1.0 - 0.5
    );
    float brightness = 0.1 + fract(seed * 0.71) * 0.2;
    lw = brightness * (0.6 + u_bass * 0.2);
    le = 40.0 + fi * 2.0;
    float redshift = fract(seed * 0.31);
    lt = palette(
      redshift + paletteShift + 0.5,
      vec3(0.5, 0.4, 0.4),
      vec3(0.2, 0.15, 0.2),
      vec3(0.5, 0.3, 0.4),
      vec3(0.1 + redshift * 0.3, 0.05, 0.1)
    );
`;
const N = 30;
export const PRE = LIGHT_PRE(VISIONARY_PALETTE, LIGHT, "0.0");
export const PRE_SIZE = [N, 2] as const;
const TILED = tiledStages(N, {
  px: 64, k: 32, r1: 0.3, r2: 0.32, far: 8, uv: "half",
  glow: "a.z * exp(-sqrt(d2) * a.w)",
  farHeader: SMOOTH_NOISE,
  farA: "fbm(uv * 3.0 + u_time * 0.1 * 0.02) * 0.5 + 0.5",
});
export const PRE_THEN = TILED.THEN;

export const FRAG = deriveFrag(ORIG, [
  ["void main() {", TILED.SUM + "\nvoid main() {"],
  [`  float r = length(p);
  float angle = atan(p.y, p.x);
  float arms = sin(angle * 2.0 - r * 8.0 + t * spin) * 0.5 + 0.5;`, `  float r = length(p);
  if (r >= 1.5) return 0.0; // smoothstep(1.5, 0.0, r) is exactly 0 — skip the arms
  float angle = atan(p.y, p.x);
  float arms = sin(angle * 2.0 - r * 8.0 + t * spin) * 0.5 + 0.5;`],
  [`  float r = length(p);
  return exp(-r * 3.0) * smoothstep(1.0, 0.0, r);`, `  float r = length(p);
  if (r >= 1.0) return 0.0; // exactly 0 outside
  return exp(-r * 3.0) * smoothstep(1.0, 0.0, r);`],
  ["float bgGlow = fbm(uv * 3.0 + t * 0.02) * 0.5 + 0.5;", "float bgGlow = plFarA();"],
  // a galaxy that is exactly 0 here adds nothing — skip its palette
  [`    float gal = spiralGalaxy(uv, pos, size, tilt, spin, t);
`, `    float gal = spiralGalaxy(uv, pos, size, tilt, spin, t);
    if (gal <= 0.0) continue;
`],
  [`    float gal = ellipticalGalaxy(uv, pos, size, ratio, ang);
`, `    float gal = ellipticalGalaxy(uv, pos, size, ratio, ang);
    if (gal <= 0.0) continue;
`],
  [`  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float seed = fi * 5.37 + 200.0;
    vec2 pos = vec2(
      fract(sin(seed * 127.1) * 43758.5) * 1.4 - 0.7,
      fract(sin(seed * 311.7) * 43758.5) * 1.0 - 0.5
    );
    float brightness = 0.1 + fract(seed * 0.71) * 0.2;
    float glow = exp(-length(uv - pos) * (40.0 + fi * 2.0)) * brightness;

    // Color by redshift — distant = redder
    float redshift = fract(seed * 0.31);
    vec3 dotCol = palette(
      redshift + paletteShift + 0.5,
      vec3(0.5, 0.4, 0.4),
      vec3(0.2, 0.15, 0.2),
      vec3(0.5, 0.3, 0.4),
      vec3(0.1 + redshift * 0.3, 0.05, 0.1)
    );
    color += dotCol * glow * (0.6 + u_bass * 0.2);
  }
`, `  color += plSum(uv); // the 30 distant galaxies — tiled (PRE)
`],
], "hubble");
