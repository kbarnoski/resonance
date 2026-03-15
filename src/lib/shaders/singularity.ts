import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Singularity — a black hole you cannot see, only its gravity.
// Spacetime curves around an invisible infinite-density point.
// Light from the background galaxy is bent, stretched, duplicated.
// Everything falls inward — there is no escape.

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Gravitational lensing deflection — general relativistic approximation
// Returns warped UV for the background texture at this screen position
vec2 gravitationalLens(vec2 uv, float mass, float t) {
  float r = length(uv);
  float rs = mass * 0.04; // Schwarzschild radius in screen coords

  // Deflection angle ~ 1/r (weak field), diverges near rs
  float deflection = mass / (r * r + rs * rs * 0.5);

  // Deflect UV toward center — more extreme close in
  vec2 toCenter = -normalize(uv + vec2(0.0001));
  vec2 lensedUV = uv + toCenter * deflection * r * 0.3;

  // Photon sphere — light orbits here (at 1.5 Rs)
  // UV gets rotated near this radius
  float photonR = rs * 1.5;
  float photonZone = exp(-pow((r - photonR) * 20.0 / rs, 2.0));
  float orbitAngle = photonZone * 2.0 * t * 0.5;
  lensedUV = rot2(orbitAngle) * lensedUV;

  return lensedUV;
}

// Background galactic field — what we see THROUGH the lens
float backgroundField(vec2 uv, float t) {
  // Distant galaxy structure — large-scale fbm
  float galactic = fbm(uv * 0.8 + t * 0.005) * 0.5 + 0.5;
  // Fine star-forming regions
  float fine = snoise(uv * 3.0 + t * 0.01) * 0.5 + 0.5;
  return galactic * 0.7 + fine * 0.3;
}

// Star field behind the lens — stationary, gets duplicated by lensing
float stars(vec2 uv) {
  vec2 id = floor(uv * 40.0);
  vec2 f = fract(uv * 40.0) - 0.5;
  float h = hash(id);
  if (h < 0.96) return 0.0;
  float radius = 0.03 + 0.04 * fract(h * 11.3);
  return smoothstep(radius, 0.0, length(f));
}

// Accretion glow — any gas that falls in glows before crossing the horizon
float accretionGlow(vec2 uv, float t, float bass) {
  float r = length(uv);
  float rs = 0.04; // horizon radius

  if (r < rs) return 0.0;

  // Infalling gas spirals — gets wound up
  float spiralAngle = atan(uv.y, uv.x) + log(r / rs + 1.0) * 3.0 - t * 1.5;
  float spiral = sin(spiralAngle * 5.0) * 0.5 + 0.5;

  // Radial falloff — brightness rises steeply near horizon
  float brightness = pow(rs / (r + rs * 0.1), 2.5);
  brightness *= smoothstep(rs * 0.9, rs * 1.5, r); // zero inside horizon

  // Turbulence
  float turb = snoise(uv * 8.0 + t * 0.3) * 0.5 + 0.5;

  return brightness * (0.5 + spiral * 0.5) * (0.6 + turb * 0.4) * (0.8 + bass * 0.8);
}

// Event horizon — absolute black disk
float eventHorizon(vec2 uv) {
  float r = length(uv);
  return smoothstep(0.042, 0.036, r); // sharp black circle
}

// Hawking radiation — quantum tunneling glow just outside horizon (artistic)
float hawkingGlow(vec2 uv, float t, float amplitude) {
  float r = length(uv);
  float rs = 0.04;
  float glow = exp(-pow((r - rs * 1.08) * 30.0, 2.0));
  glow *= (0.3 + amplitude * 0.7);
  return glow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.3;

  // Mass pulsation — bass makes gravity well breathe
  float mass = 1.0 + u_bass * 0.5;

  // ── Gravitational lensing ──
  vec2 lensedUV = gravitationalLens(uv, mass, t);

  // ── Background through lens ──
  float bg = backgroundField(lensedUV * 1.5, t);
  float starField = stars(lensedUV * 1.2 + vec2(7.3, 2.1));
  starField += stars(lensedUV * 0.7 + vec2(30.0, 15.0)) * 0.7; // Einstein ring copies

  // ── Accretion glow ──
  float accretion = accretionGlow(uv, t, u_bass);

  // ── Event horizon ──
  float horizon = eventHorizon(uv);

  // ── Hawking glow ──
  float hawking = hawkingGlow(uv, t, u_amplitude);

  // ── Tidal stretching effect ──
  // Background features are radially stretched toward center (spaghettification)
  float r = length(uv);
  float stretch = 1.0 + 0.3 / (r * r * 4.0 + 0.2);

  // ── Colors ──
  // Lensed background — cool deep-space colors
  vec3 bgCol = palette(
    bg * 1.2 + lensedUV.x * 0.3 + t * 0.02 + paletteShift,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.4),
    vec3(0.4, 0.6, 0.9),
    vec3(0.1, 0.2, 0.4)
  );

  // Accretion — scorching hot plasma: orange-yellow inner, violet outer
  vec3 accretionCol = palette(
    r * 3.0 + t * 0.08 + paletteShift + 0.1,
    vec3(0.5, 0.5, 0.4),
    vec3(0.5, 0.4, 0.3),
    vec3(0.4, 0.2, 0.0),
    vec3(0.0, 0.05, 0.15)
  );

  // Mid — redshift coloring near horizon (gravitational red shift)
  vec3 redshiftCol = palette(
    r * 1.5 + paletteShift + 0.45,
    vec3(0.5, 0.3, 0.2),
    vec3(0.4, 0.2, 0.1),
    vec3(0.6, 0.2, 0.0),
    vec3(0.05, 0.0, 0.0)
  );

  // Hawking — faint quantum blue
  vec3 hawkingCol = palette(
    t * 0.3 + paletteShift + 0.7,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.5),
    vec3(0.2, 0.5, 0.9),
    vec3(0.1, 0.1, 0.3)
  );

  vec3 color = vec3(0.0);

  // Lensed background — foundation
  color += bgCol * bg * (0.4 + u_mid * 0.3);
  color += vec3(1.0, 1.1, 1.3) * starField;

  // Accreting plasma
  color += accretionCol * accretion * 1.5;

  // Gravitational redshift tint near horizon
  float redshiftZone = smoothstep(0.3, 0.05, r);
  color = mix(color, color * redshiftCol, redshiftZone * 0.5);

  // Hawking radiation ring
  color += hawkingCol * hawking * 0.6;

  // Event horizon — absolute void
  color *= (1.0 - horizon);

  // Treble — light caustics from lensing shimmering
  float causticShimmer = snoise(lensedUV * 10.0 + t * 0.5) * 0.5 + 0.5;
  color += vec3(1.0, 1.1, 1.4) * causticShimmer * redshiftZone * u_treble * 0.2;

  // Einstein ring highlight — bright ring where light orbits
  float photonSphere = exp(-pow((r - 0.06 * mass) * 18.0, 2.0)) * 0.25;
  color += palette(
    t * 0.1 + paletteShift + 0.9,
    vec3(0.8, 0.8, 0.9),
    vec3(0.2, 0.2, 0.3),
    vec3(0.4, 0.3, 0.6),
    vec3(0.1, 0.1, 0.2)
  ) * photonSphere;

  // Vignette — infinite depth at edges, everything falling inward
  float vignette = 1.0 - smoothstep(0.4, 1.3, r);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
