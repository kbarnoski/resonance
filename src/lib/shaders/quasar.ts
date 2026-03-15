import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Quasar — active galactic nucleus blinding the universe.
// Relativistic jets blast from the poles into infinite distance.
// Accretion disc spins in the equatorial plane, Doppler-shifted.
// The nucleus at center is brighter than a trillion suns.

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Accretion disc — rotating torus projected onto screen plane
float accretionDisc(vec2 uv, float t, float bass) {
  float r = length(uv);
  // Disc inner/outer radius — warped by bass
  float innerR = 0.05 + bass * 0.02;
  float outerR = 0.32 + bass * 0.08;

  // Disc density profile — sharply bounded
  float discMask = smoothstep(innerR - 0.01, innerR, r) * smoothstep(outerR + 0.02, outerR, r);

  // Rotation — fast inner, slow outer (Keplerian)
  float angularVel = 1.0 / (r * r + 0.01);
  float angle = atan(uv.y, uv.x) + t * angularVel * 0.5;

  // Spiral density waves
  float spiral = sin(angle * 3.0 + log(r * 20.0 + 1.0) * 4.0 - t * 2.0);
  spiral = spiral * 0.5 + 0.5;

  // Turbulence from noise
  float turb = fbm(uv * 5.0 + vec2(t * 0.3, t * 0.2)) * 0.5 + 0.5;

  // Doppler shift — approaching side (left) brighter, receding side (right) dimmer
  float doppler = 1.0 + uv.x / (r + 0.001) * 0.6;
  doppler = max(0.1, doppler);

  return discMask * (0.4 + spiral * 0.4 + turb * 0.2) * doppler;
}

// Relativistic jet — bipolar column stretching to infinity along Y axis
float jet(vec2 uv, float t, float treble, float bass) {
  // Jets along vertical axis (polar direction)
  float x = abs(uv.x);
  float y = uv.y;

  // Jet half-angle — extremely narrow, collimated beam
  float jetHalfAngle = 0.04 + bass * 0.02;

  // Jet width expands very slightly with distance (relativistic collimation)
  float jetWidth = jetHalfAngle * (1.0 + abs(y) * 0.05);

  float jetMask = smoothstep(jetWidth, 0.0, x - jetHalfAngle * 0.2);
  jetMask *= step(0.05, abs(y)); // exclude nucleus core

  // Jet brightness — inverse square from nucleus, jets recede to infinity
  float brightness = 1.0 / (abs(y) * abs(y) * 3.0 + 0.15);

  // Knots — discrete plasma blobs ejected at intervals
  float knotFreq = 5.0;
  float knotPhase = mod(abs(y) * knotFreq - t * 1.5 * sign(y), 1.0);
  float knot = exp(-knotPhase * knotPhase * 20.0);
  knot += exp(-(1.0 - knotPhase) * (1.0 - knotPhase) * 20.0);

  // Treble drives knot scintillation
  float scintillation = 1.0 + treble * 0.4 * sin(abs(y) * 30.0 - t * 8.0);

  return jetMask * (brightness + knot * 0.8) * scintillation;
}

// Nucleus — blinding core of the AGN
float nucleus(vec2 uv, float t, float amplitude) {
  float r = length(uv);
  // Power-law brightness: I ~ r^(-2.5) at the very center
  float core = 0.002 / (r * r + 0.0002);
  float halo = exp(-r * 18.0) * 0.5;
  float variability = 1.0 + amplitude * 0.5 * sin(t * 7.3 + 0.4);
  return (core + halo) * variability;
}

// Background quasar host galaxy — faint haze
float hostGalaxy(vec2 uv, float t) {
  float r = length(uv);
  float n = fbm(uv * 1.5 + t * 0.01);
  return smoothstep(0.8, 0.1, r) * (n * 0.5 + 0.5) * 0.04;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.4;
  float paletteShift = u_amplitude * 0.28;

  float r = length(uv);

  // ── Components ──
  float disc    = accretionDisc(uv, t, u_bass);
  float jetVal  = jet(uv, t, u_treble, u_bass);
  float nuc     = nucleus(uv, t, u_amplitude);
  float galaxy  = hostGalaxy(uv, t);

  // ── Colors ──
  // Disc — hot thermal gradient: inner is blue-white, outer is orange-red
  float discAngle = atan(uv.y, uv.x);
  vec3 discCol = palette(
    r * 1.5 + discAngle * 0.1 + t * 0.05 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.3),
    vec3(0.6, 0.4, 0.2),
    vec3(0.0, 0.1, 0.3)
  );

  // Jet — high-energy synchrotron: brilliant blue-violet
  float jetSign = sign(uv.y);
  vec3 jetCol = palette(
    abs(uv.y) * 0.3 + t * 0.04 + paletteShift + 0.35,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.5),
    vec3(0.4, 0.6, 1.0),
    vec3(0.1, 0.0, 0.2)
  );

  // Galaxy halo — dusty red-amber
  vec3 galaxyCol = palette(
    r * 0.5 + paletteShift + 0.6,
    vec3(0.4, 0.3, 0.2),
    vec3(0.3, 0.2, 0.2),
    vec3(0.7, 0.4, 0.3),
    vec3(0.05, 0.0, 0.1)
  );

  // Nucleus — pure white-blue blaze
  vec3 nucCol = palette(
    t * 0.15 + paletteShift,
    vec3(0.9, 0.92, 1.0),
    vec3(0.1, 0.08, 0.2),
    vec3(0.4, 0.2, 0.7),
    vec3(0.0, 0.05, 0.1)
  );

  // Deep space
  vec3 color = galaxyCol * galaxy;

  // Build up scene
  color += discCol * disc * (0.5 + u_mid * 0.6);
  color += jetCol * jetVal * (0.7 + u_treble * 0.8);
  color += nucCol * nuc * (1.0 + u_amplitude * 1.2);

  // Emissive overbloom at nucleus
  color += vec3(1.4, 1.3, 1.6) * exp(-r * 40.0) * 3.0;

  // Gravitational lensing ring — faint Einstein ring at disc boundary
  float einsteinR = 0.06 + u_bass * 0.01;
  float einsteinRing = exp(-pow((r - einsteinR) * 40.0, 2.0)) * 0.3;
  color += vec3(1.0, 1.1, 1.3) * einsteinRing;

  // Depth fog — distant jets fade into void
  float vignette = 1.0 - smoothstep(0.45, 1.5, r);
  color *= vignette;

  // Tone compress highlights
  color = color / (color + 0.7);
  color = pow(color, vec3(0.88));

  gl_FragColor = vec4(color, 1.0);
}
`;
