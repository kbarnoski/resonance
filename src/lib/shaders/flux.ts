import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite energy flux — field lines converging on poles, stretching to
// infinite space. Magnetic dipole vector field with depth layering.

// Dipole field direction at point p, given pole positions
vec2 dipoleField(vec2 p, vec2 pole1, vec2 pole2) {
  vec2 d1 = p - pole1;
  vec2 d2 = p - pole2;
  float r1sq = dot(d1, d1) + 0.001;
  float r2sq = dot(d2, d2) + 0.001;
  // +charge at pole1, -charge at pole2 (dipole)
  vec2 field = d1 / (r1sq * sqrt(r1sq)) - d2 / (r2sq * sqrt(r2sq));
  return field;
}

// Field line density at p — how close is p to a field line
float fieldLineDensity(vec2 p, vec2 pole1, vec2 pole2, float lineFreq) {
  vec2 field = dipoleField(p, pole1, pole2);
  float magnitude = length(field);
  field = field / max(magnitude, 0.001);

  // Perpendicular to field direction
  vec2 perp = vec2(-field.y, field.x);

  // Stream function — integral along field lines
  // Approximated by: dot(position, perpendicular to field)
  // Modulated to create discrete lines
  float streamVal = dot(p, perp) * lineFreq;
  float line = sin(streamVal) * 0.5 + 0.5;
  line = pow(line, 5.0);

  return line;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.30;

  // ── Moving pole positions — drift slowly, breathing with bass ──
  float poleGap = 0.28 + u_bass * 0.12;
  vec2 pole1 = vec2(-poleGap + sin(t * 0.3) * 0.05, sin(t * 0.2) * 0.08);
  vec2 pole2 = vec2( poleGap + cos(t * 0.25) * 0.05, cos(t * 0.18) * 0.08);

  // ── Depth layers — three planes at different z-distances ──
  // Each layer has its own scaled coordinate, creating depth parallax.
  // Near layer: coarse lines, strong
  // Far layers: finer lines, faint

  // Layer 1 — foreground
  float lines1 = fieldLineDensity(uv * 1.0, pole1, pole2, 12.0);
  float mag1   = length(dipoleField(uv * 1.0, pole1, pole2));

  // Layer 2 — mid (slightly scaled / offset in depth)
  vec2 uv2 = uv * 1.6 + vec2(0.0, t * 0.1);
  float lines2 = fieldLineDensity(uv2, pole1 * 1.6, pole2 * 1.6, 18.0);
  float mag2   = length(dipoleField(uv2, pole1 * 1.6, pole2 * 1.6));

  // Layer 3 — background (deep space, very fine lines)
  vec2 uv3 = uv * 2.8 + vec2(t * 0.07, t * 0.05);
  float lines3 = fieldLineDensity(uv3, pole1 * 2.8, pole2 * 2.8, 28.0);
  float mag3   = length(dipoleField(uv3, pole1 * 2.8, pole2 * 2.8));

  // ── Field magnitude — strength glow near poles ──
  float fieldGlow1 = 1.0 / (1.0 + length(uv - pole1) * 8.0);
  float fieldGlow2 = 1.0 / (1.0 + length(uv - pole2) * 8.0);
  float poleGlow   = fieldGlow1 + fieldGlow2;
  poleGlow *= (0.5 + u_bass * 0.5);

  // Turbulent perturbation of field lines — mid audio adds noise
  float turbulence = fbm(uv * 3.0 + vec2(t * 0.5, 0.0)) * u_mid * 0.3;

  // Final line composite — weighted by depth
  float totalLines = lines1 * 0.60
                   + lines2 * 0.30
                   + lines3 * 0.15
                   + turbulence;
  totalLines = clamp(totalLines, 0.0, 1.0);

  // ── Depth fog — far field fades ──
  // Far lines (layer3) are faint; near (layer1) are vivid
  float depthMix = 1.0 - lines3 * 0.5;  // far lines dim the color

  // ── Color — three palette lookups ──
  // Background space — deep indigo/black
  vec3 bgCol = palette(
    t * 0.04 + paletteShift + 0.6,
    vec3(0.02, 0.02, 0.06),
    vec3(0.04, 0.03, 0.10),
    vec3(0.4, 0.3, 0.7),
    vec3(0.08, 0.05, 0.25)
  );

  // Field lines — energetic, shifting with mid
  vec3 lineCol = palette(
    totalLines * 0.5 + u_mid * 0.3 + paletteShift + 0.1,
    vec3(0.35, 0.45, 0.70),
    vec3(0.30, 0.35, 0.55),
    vec3(0.6, 0.7, 1.0),
    vec3(0.1, 0.15, 0.35)
  );

  // Pole glow — hot, bright
  vec3 poleCol = palette(
    poleGlow * 0.4 + paletteShift + 0.0,
    vec3(0.8, 0.7, 0.9),
    vec3(0.2, 0.15, 0.3),
    vec3(0.7, 0.5, 0.9),
    vec3(0.0, 0.05, 0.2)
  );

  // Build scene
  vec3 color = bgCol;
  color = mix(color, lineCol, totalLines * 0.8);
  color += poleCol * poleGlow * 0.6;

  // Treble: fine particle discharge — sparks along field lines
  float spark = snoise(uv * 20.0 + vec2(t * 4.0, 0.0));
  spark = pow(max(spark, 0.0), 7.0) * totalLines * u_treble * 0.5;
  color += lineCol * spark;

  // Dim far layers — feel of infinite receding lines
  vec3 farLines = palette(
    lines3 * 0.4 + paletteShift + 0.4,
    vec3(0.10, 0.12, 0.22),
    vec3(0.08, 0.08, 0.18),
    vec3(0.3, 0.3, 0.6),
    vec3(0.05, 0.05, 0.15)
  );
  color += farLines * lines3 * 0.2;

  // Vignette — draws the eye to the poles at center
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
