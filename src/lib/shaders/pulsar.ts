import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Pulsar — rotating lighthouse beam from an infinitely distant neutron star.
// Concentric diffraction rings propagate outward from the point source at infinity.
// The star itself sits at z = +infinity; we see only its projected light cone.

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Diffraction ring intensity at radius r, time t
float diffractionRing(float r, float t, float bass) {
  // Logarithmic ring spacing — rings compress toward center (perspective from infinity)
  float logR = log(r * 30.0 + 1.0);
  float wave = sin(logR * 12.0 - t * 4.0);
  float envelope = exp(-r * (1.8 - bass * 0.6));
  return pow(max(0.0, wave), 4.0) * envelope;
}

// Beam sweep — rotating collimated beam from distant pulsar
float pulsarBeam(vec2 uv, float t, float bass) {
  float angle = atan(uv.y, uv.x);
  float beamAngle1 = mod(t * (1.0 + bass * 0.4), 6.28318);
  float beamAngle2 = mod(t * (1.0 + bass * 0.4) + 3.14159, 6.28318);

  // Angular width narrows with depth — beam from infinity is nearly parallel
  float beamWidth = 0.08 + bass * 0.04;

  float a1 = abs(mod(angle - beamAngle1 + 3.14159, 6.28318) - 3.14159);
  float a2 = abs(mod(angle - beamAngle2 + 3.14159, 6.28318) - 3.14159);

  float b1 = smoothstep(beamWidth, 0.0, a1);
  float b2 = smoothstep(beamWidth, 0.0, a2);

  float r = length(uv);
  // Beam brightness falls off as 1/r^2 (inverse square from point source)
  float falloff = 1.0 / (r * r * 8.0 + 0.2);

  return (b1 + b2) * falloff;
}

// Star field at infinite depth — stationary background
float stars(vec2 uv) {
  vec2 id = floor(uv * 60.0);
  vec2 f = fract(uv * 60.0) - 0.5;
  float h = hash(id);
  if (h < 0.97) return 0.0;
  float r = 0.02 + 0.03 * fract(h * 13.7);
  return smoothstep(r, 0.0, length(f));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.3;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // ── Infinite star at center — blinding pinpoint at z=+inf ──
  // Logarithmic glow: the closer you look, the brighter it is, never resolving
  float starCore = 0.003 / (r * r + 0.0003);
  float starHalo = exp(-r * 12.0) * 0.4;

  // ── Diffraction rings — rippling outward at light speed ──
  float rings = 0.0;
  rings += diffractionRing(r, t, u_bass) * 1.2;
  rings += diffractionRing(r, t + 0.4, u_bass) * 0.6;  // secondary echo
  rings += diffractionRing(r * 0.7, t * 1.3, u_bass) * 0.4; // inner harmonic

  // Treble adds fine high-frequency diffraction detail
  float fineRings = sin(r * 80.0 - t * 10.0) * 0.5 + 0.5;
  fineRings *= exp(-r * 4.0) * u_treble * 0.3;
  rings += fineRings;

  // ── Rotating beam sweeping from the pulsar ──
  float beam = pulsarBeam(uv, t, u_bass);

  // ── Perspective depth fog — rings dim at distance ──
  // Simulates the light having traveled infinite distance through thin ISM
  float depthFog = exp(-r * 0.8);

  // ── Color composition via palette ──
  // Beam color — hot blue-white at peak, shifting through spectrum
  vec3 beamCol = palette(
    angle / 6.28318 + t * 0.1 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // Ring color — cold interferometric blues and greens
  vec3 ringCol = palette(
    r * 0.8 + t * 0.05 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.5, 0.5),
    vec3(0.3, 0.7, 1.0),
    vec3(0.1, 0.2, 0.4)
  );

  // Deep space background — faintest violet
  vec3 bgCol = palette(
    r * 0.3 + paletteShift + 0.5,
    vec3(0.03, 0.03, 0.06),
    vec3(0.05, 0.03, 0.08),
    vec3(0.5, 0.3, 0.8),
    vec3(0.2, 0.1, 0.3)
  );

  vec3 color = bgCol;

  // Stars — infinite background at rest
  float s = stars(uv * 0.8 + vec2(13.7, 5.3));
  s += stars(uv * 1.4 + vec2(27.1, 41.0)) * 0.6;
  color += vec3(0.9, 0.95, 1.0) * s * 0.8;

  // Rings layered over background
  color += ringCol * rings * depthFog * (0.6 + u_mid * 0.6);

  // Rotating beam
  color += beamCol * beam * (0.8 + u_bass * 1.0);

  // Star core — infinitely bright point, clamped by HDR tonemapping
  vec3 coreCol = palette(
    t * 0.2 + paletteShift,
    vec3(0.9, 0.9, 1.0),
    vec3(0.1, 0.1, 0.2),
    vec3(0.5, 0.3, 0.1),
    vec3(0.0, 0.05, 0.1)
  );
  color += coreCol * (starCore + starHalo) * (1.0 + u_amplitude * 1.5);

  // Emissive bloom at very center
  color += vec3(1.2, 1.3, 1.5) * exp(-r * 30.0) * 2.0;

  // Vignette — infinite space swallows edges
  float vignette = 1.0 - smoothstep(0.5, 1.4, r);
  color *= vignette;

  // Tone map to prevent harsh clipping
  color = color / (color + 0.8);
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`;
