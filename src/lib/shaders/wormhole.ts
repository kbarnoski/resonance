import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Wormhole — Gravitational lensing ring with light bending
// around a central void, accretion disc of spiraling matter.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Gravitational lensing — bends UV coordinates around center
vec2 gravLens(vec2 uv, float mass) {
  float r = length(uv);
  float deflection = mass / (r * r + 0.01);
  vec2 dir = normalize(uv);
  return uv + dir * deflection;
}

// Accretion disc — ring of spiraling matter
float accretionDisc(vec2 uv, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Disc is a thin ring
  float ringCenter = 0.32;
  float ringWidth = 0.12;
  float ring = exp(-pow((r - ringCenter) / ringWidth, 2.0));

  // Spiral structure in the disc
  float spiral = sin(a * 3.0 - r * 20.0 + t * 2.0) * 0.5 + 0.5;
  spiral += sin(a * 5.0 - r * 30.0 + t * 3.0) * 0.3;
  spiral = spiral * 0.5 + 0.5;

  // Turbulence in the disc
  float turb = snoise(vec2(a * 2.0 + t * 0.5, r * 8.0)) * 0.3 + 0.7;

  // Doppler brightening — one side brighter (approaching), one dimmer (receding)
  float doppler = 0.6 + 0.4 * sin(a + t * 0.3);

  return ring * spiral * turb * doppler;
}

// Photon ring — ultra-bright thin ring at the photon sphere
float photonRing(vec2 uv, float t) {
  float r = length(uv);
  float ringR = 0.16;
  float ring = exp(-pow((r - ringR) / 0.008, 2.0));

  // Flickering from chaotic photon orbits
  float a = atan(uv.y, uv.x);
  float flicker = 0.7 + 0.3 * sin(a * 20.0 + t * 5.0);
  flicker *= 0.8 + 0.2 * sin(a * 7.0 - t * 3.0);

  return ring * flicker * 3.0;
}

// Einstein ring — lensed background distortion
float einsteinRing(vec2 uv, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float ringR = 0.45;
  float ring = exp(-pow((r - ringR) / 0.03, 2.0));

  // Distorted starlight forming the ring
  float distortion = snoise(vec2(a * 4.0 + t * 0.1, r * 3.0)) * 0.5 + 0.5;
  return ring * distortion * 0.5;
}

// Background star field — distorted by gravity
float stars(vec2 uv) {
  vec2 id = floor(uv * 60.0);
  vec2 f = fract(uv * 60.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.93, h);
  float radius = 0.025 + 0.04 * fract(h * 23.0);
  float twinkle = 0.5 + 0.5 * sin(u_time * (1.5 + h * 6.0) + h * 80.0);
  return star * smoothstep(radius, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float paletteShift = u_amplitude * 0.2;

  // ── Lensed background stars ──
  vec2 lensedUV = gravLens(uv, 0.02 + u_bass * 0.005);
  float s = stars(lensedUV);

  vec3 color = vec3(0.01, 0.01, 0.02);
  color += vec3(0.8, 0.85, 1.1) * s * 0.7;

  // ── Einstein ring — lensed background light ──
  float eRing = einsteinRing(uv, t);
  vec3 eRingCol = palette(
    eRing + a * 0.1 + t * 0.02 + paletteShift,
    vec3(0.6, 0.6, 0.7),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.4, 0.9),
    vec3(0.1, 0.15, 0.3)
  );
  color += eRingCol * eRing;

  // ── Accretion disc ──
  // Tilt the disc — view it at an angle
  vec2 discUV = uv;
  discUV.y *= 2.5; // compress vertically = viewed at angle
  discUV = discUV * rot2(0.3 + sin(t * 0.05) * 0.1);

  float disc = accretionDisc(discUV, t);
  disc *= (0.7 + u_mid * 0.8);

  // Disc color — hot orange-white inner to cooler red outer
  float discR = length(discUV);
  vec3 discCol = palette(
    disc + discR * 2.0 + t * 0.03 + paletteShift + 0.15,
    vec3(0.8, 0.6, 0.3),
    vec3(0.3, 0.2, 0.15),
    vec3(0.5, 0.3, 0.1),
    vec3(0.0, 0.05, 0.1)
  );

  // Inner disc is hotter/whiter
  vec3 hotDisc = vec3(1.2, 1.1, 0.9) * smoothstep(0.4, 0.2, discR);
  discCol = mix(discCol, hotDisc, smoothstep(0.35, 0.2, discR) * 0.5);

  color += discCol * disc;

  // ── Photon ring ──
  float pRing = photonRing(discUV, t);
  pRing *= (1.0 + u_treble * 1.5);
  vec3 pRingCol = palette(
    pRing * 0.2 + t * 0.04 + paletteShift + 0.4,
    vec3(0.95, 0.9, 0.8),
    vec3(0.1, 0.08, 0.05),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.02, 0.05)
  );
  color += pRingCol * pRing * 0.4;

  // ── Central void — true black ──
  float voidMask = smoothstep(0.14, 0.10, length(discUV));
  color *= (1.0 - voidMask * 0.98);

  // ── Frame dragging glow — faint twist near the void ──
  float frameDrag = smoothstep(0.22, 0.12, r);
  float twistAngle = a + t * 0.5 + r * 3.0;
  float twist = sin(twistAngle * 6.0) * 0.5 + 0.5;
  vec3 dragCol = palette(
    twist + t * 0.03 + paletteShift + 0.7,
    vec3(0.4, 0.35, 0.5),
    vec3(0.2, 0.15, 0.3),
    vec3(0.6, 0.3, 0.8),
    vec3(0.1, 0.05, 0.25)
  );
  color += dragCol * frameDrag * twist * 0.15;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.3, r);
  color *= (0.75 + 0.25 * vignette);

  // Tonemap to avoid blowout near the photon ring
  color = color / (color + 0.6);

  gl_FragColor = vec4(color, 1.0);
}
`;
