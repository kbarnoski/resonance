import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Event Horizon — Edge of a black hole: extreme time dilation
// visualized as stretched light, spaghettification of infalling matter.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Time dilation field — stretches UVs radially near the center
vec2 timeDilation(vec2 uv, float strength) {
  float r = length(uv);
  // Extreme stretching near the event horizon
  float horizonR = 0.15;
  float dilation = 1.0 + strength / max(r - horizonR, 0.01);
  dilation = min(dilation, 20.0); // clamp
  // Stretch radially
  return normalize(uv) * r * (1.0 + (dilation - 1.0) * 0.02);
}

// Spaghettified matter — objects stretched into thin filaments
float spaghetti(vec2 uv, float inAngle, float t, float seed) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Infalling trajectory — spiraling in
  float spiralAngle = a + log(max(r, 0.001)) * 4.0 + t * 0.8 + seed;
  float angleDist = abs(sin(spiralAngle * 1.5 + inAngle));

  // Width decreases as it approaches horizon (stretching)
  float width = 0.15 * r;
  float filament = smoothstep(width, 0.0, angleDist);

  // Brightness increases as it stretches (energy concentration)
  float brightness = smoothstep(0.6, 0.15, r);

  // Only the infalling portion
  float inMask = smoothstep(0.6, 0.2, r);

  return filament * brightness * inMask;
}

// Hawking radiation — faint particle pairs at the horizon
float hawkingRadiation(vec2 uv, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Very close to the horizon
  float horizonDist = abs(r - 0.16);
  float nearHorizon = exp(-horizonDist * 60.0);

  // Flickering pairs
  float pairs = sin(a * 30.0 + t * 8.0) * 0.5 + 0.5;
  pairs *= sin(a * 17.0 - t * 5.0) * 0.5 + 0.5;
  pairs = pow(pairs, 4.0);

  return nearHorizon * pairs * 0.5;
}

// Gravitational redshift — color shift near the horizon
float redshift(vec2 uv) {
  float r = length(uv);
  float horizonR = 0.15;
  // Redshift increases toward horizon
  return smoothstep(0.6, horizonR + 0.02, r);
}

// Star field
float stars(vec2 uv) {
  vec2 id = floor(uv * 70.0);
  vec2 f = fract(uv * 70.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.93, h);
  float twinkle = 0.5 + 0.5 * sin(u_time * (2.0 + h * 6.0) + h * 80.0);
  return star * smoothstep(0.03, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float paletteShift = u_amplitude * 0.2;

  float horizonR = 0.15;

  // ── Time-dilated background ──
  vec2 dilatedUV = timeDilation(uv, 0.3 + u_bass * 0.1);

  vec3 color = vec3(0.003, 0.003, 0.01);

  // Stars — distorted by gravity
  float s = stars(dilatedUV);
  // Apply gravitational redshift to star colors
  float rs = redshift(uv);
  vec3 starCol = mix(vec3(0.8, 0.85, 1.2), vec3(1.3, 0.6, 0.2), rs);
  color += starCol * s * 0.6 * (1.0 - smoothstep(horizonR - 0.02, horizonR + 0.05, r));

  // ── Accretion ring — thin hot ring at last stable orbit ──
  float lastOrbitR = 0.25;
  float ringDist = abs(r - lastOrbitR);
  float ring = exp(-ringDist * ringDist * 1500.0);

  // Ring has spiral structure
  float ringSpiral = sin(a * 5.0 - r * 30.0 + t * 3.0) * 0.5 + 0.5;
  ring *= (0.5 + ringSpiral * 0.5);
  ring *= (0.7 + u_mid * 0.6);

  // Doppler brightening
  float doppler = 0.5 + 0.5 * sin(a + t * 0.5);
  ring *= (0.6 + doppler * 0.6);

  vec3 ringCol = palette(
    ring + rs * 0.3 + t * 0.03 + paletteShift,
    vec3(0.9, 0.65, 0.3),
    vec3(0.2, 0.15, 0.1),
    vec3(0.4, 0.25, 0.1),
    vec3(0.0, 0.05, 0.1)
  );
  color += ringCol * ring;

  // ── Photon sphere ──
  float photonR = horizonR * 1.1;
  float photonRing = exp(-pow((r - photonR) / 0.005, 2.0));
  color += vec3(1.0, 0.95, 0.85) * photonRing * 0.5 * (0.5 + u_treble * 1.0);

  // ── Spaghettified matter — infalling objects ──
  float spag1 = spaghetti(uv, 0.0, t, 0.0);
  float spag2 = spaghetti(uv, 2.0, t, 5.0);
  float spag3 = spaghetti(uv, 4.5, t * 0.8, 10.0);

  float totalSpag = spag1 + spag2 * 0.7 + spag3 * 0.5;
  totalSpag *= (0.5 + u_bass * 1.0);

  // Spaghetti color — redshifted as it falls in
  vec3 spagCol = palette(
    totalSpag * 0.3 + rs * 0.5 + t * 0.04 + paletteShift + 0.3,
    vec3(0.7, 0.5, 0.3),
    vec3(0.3, 0.2, 0.15),
    vec3(0.5, 0.3, 0.15),
    vec3(0.05, 0.03, 0.08)
  );
  color += spagCol * totalSpag * 0.6;

  // ── Hawking radiation ──
  float hawking = hawkingRadiation(uv, t);
  hawking *= (0.3 + u_treble * 0.7);
  color += vec3(0.5, 0.6, 0.9) * hawking;

  // ── Frame dragging — spacetime twisting near horizon ──
  float frameDrag = smoothstep(0.3, horizonR + 0.02, r);
  float twistPattern = sin(a * 8.0 + t * 1.5 + r * 20.0) * 0.5 + 0.5;
  twistPattern *= frameDrag;

  vec3 dragCol = palette(
    twistPattern + t * 0.02 + paletteShift + 0.6,
    vec3(0.3, 0.25, 0.4),
    vec3(0.15, 0.12, 0.25),
    vec3(0.4, 0.25, 0.7),
    vec3(0.1, 0.08, 0.25)
  );
  color += dragCol * twistPattern * 0.1;

  // ── Event horizon — absolute black ──
  float horizonMask = smoothstep(horizonR + 0.01, horizonR - 0.01, r);
  color *= (1.0 - horizonMask);

  // ── Horizon edge glow — last photons escaping ──
  float edgeGlow = exp(-pow((r - horizonR) / 0.01, 2.0)) * step(horizonR, r);
  vec3 edgeCol = palette(
    edgeGlow + a * 0.1 + t * 0.05 + paletteShift + 0.15,
    vec3(0.9, 0.7, 0.4),
    vec3(0.15, 0.1, 0.08),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.05, 0.1)
  );
  color += edgeCol * edgeGlow * 1.5;

  // ── Gravitational lensing ring — Einstein ring of stretched background ──
  float einsteinR = 0.35;
  float eRing = exp(-pow((r - einsteinR) / 0.02, 2.0));
  float eRingDetail = snoise(vec2(a * 5.0 + t * 0.1, r * 10.0)) * 0.5 + 0.5;
  vec3 eRingCol = palette(
    eRing * 0.5 + t * 0.015 + paletteShift + 0.45,
    vec3(0.5, 0.5, 0.6),
    vec3(0.2, 0.18, 0.25),
    vec3(0.3, 0.3, 0.5),
    vec3(0.1, 0.1, 0.25)
  );
  color += eRingCol * eRing * eRingDetail * 0.25;

  // ── Time dilation visual — everything redder and dimmer near horizon ──
  color = mix(color, color * vec3(1.2, 0.6, 0.3), rs * 0.3);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, r);
  color *= (0.75 + 0.25 * vignette);

  // Tonemap
  color = color / (color + 0.55);

  gl_FragColor = vec4(color, 1.0);
}
`;
