import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Hexagonal tiling — returns cell center, edge distance, and cell ID
vec3 hexTile(vec2 p) {
  // Hex grid constants
  float sqrt3 = 1.7320508;
  vec2 s = vec2(1.0, sqrt3);
  vec2 h = s * 0.5;

  // Two offset grids
  vec2 a = mod(p, s) - h;
  vec2 b = mod(p - h, s) - h;

  // Pick nearest center
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;

  // Edge distance (hexagonal)
  vec2 av = abs(gv);
  float edgeDist = max(dot(av, normalize(vec2(1.0, sqrt3))), av.x);
  float hexDist = 0.5 - edgeDist;

  return vec3(hexDist, id);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Subtle curvature — the exoskeleton isn't flat ──
  // Slight barrel distortion to suggest a curved surface
  float curvature = 1.0 + dot(uv, uv) * 0.15;
  vec2 curvedUV = uv * curvature;

  // Global slow rotation to show different facets
  float globalRot = t * 0.1;
  curvedUV = rot2(globalRot) * curvedUV;

  // ── Primary hexagonal armor plating ──
  float hexScale = 5.0 + u_bass * 0.5;
  vec3 hex1 = hexTile(curvedUV * hexScale);
  float hexEdge1 = hex1.x;
  vec2 hexId1 = hex1.yz;

  // Per-plate variation using noise on cell ID
  float plateVar = snoise(hexId1 * 0.5 + t * 0.1);
  float plateVar2 = snoise(hexId1 * 0.3 + vec2(t * 0.05, 3.0));

  // ── Plate surface: beveled edges ──
  float plateEdge = smoothstep(0.0, 0.04, hexEdge1);
  float plateRim = smoothstep(0.04, 0.01, hexEdge1);
  float plateCenter = smoothstep(0.02, 0.15, hexEdge1);

  // ── Secondary hex detail — finer structure within each plate ──
  float hex2Scale = hexScale * 3.0;
  vec3 hex2 = hexTile(curvedUV * hex2Scale + vec2(t * 0.2, 0.0));
  float hexEdge2 = hex2.x;
  vec2 hexId2 = hex2.yz;

  float microEdge = smoothstep(0.0, 0.03, hexEdge2);
  float microRim = smoothstep(0.03, 0.005, hexEdge2);

  // ── Iridescent structural coloration ──
  // View-angle dependent color shift (simulated with UV position)
  float viewAngle = atan(uv.y, uv.x);
  float viewDist = length(uv);

  // Thin-film interference simulation — color shifts with angle
  float iridPhase = viewAngle * 2.0 + viewDist * 3.0 + plateVar * 1.5 + t * 0.3;
  float iridShift = sin(iridPhase) * 0.3 + cos(iridPhase * 1.7) * 0.2;

  // ── Color palettes: dark chitin with iridescent sheen ──
  // Base chitin — deep brown-black
  vec3 chitinBase = palette(
    plateVar * 0.3 + paletteShift + 0.1,
    vec3(0.08, 0.06, 0.05),
    vec3(0.06, 0.05, 0.04),
    vec3(0.4, 0.35, 0.3),
    vec3(0.0, 0.1, 0.15)
  );

  // Iridescent layer — shifts through greens, purples, blues
  vec3 iridColor = palette(
    iridPhase * 0.5 + plateVar2 * 0.4 + paletteShift + 0.4,
    vec3(0.3, 0.35, 0.4),
    vec3(0.4, 0.35, 0.4),
    vec3(1.0, 0.8, 1.0),
    vec3(0.0, 0.33, 0.67)
  );

  // Second iridescent layer — complementary shift
  vec3 iridColor2 = palette(
    iridPhase * 0.5 + 0.5 + plateVar * 0.3 + paletteShift + 0.6,
    vec3(0.35, 0.4, 0.3),
    vec3(0.35, 0.4, 0.35),
    vec3(0.8, 1.0, 0.8),
    vec3(0.33, 0.67, 0.0)
  );

  // ── Edge glow color — warm amber in the gaps ──
  vec3 gapColor = palette(
    plateVar * 0.5 + t * 0.05 + paletteShift + 0.8,
    vec3(0.4, 0.3, 0.15),
    vec3(0.3, 0.2, 0.1),
    vec3(0.8, 0.6, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // ── Compose the chitin surface ──

  // Base dark chitin surface
  color = chitinBase * plateCenter;

  // Micro-structure within plates
  color *= 0.8 + microEdge * 0.2;
  color += chitinBase * microRim * 0.15;

  // Iridescent sheen — strongest at certain viewing angles
  float sheenFresnel = pow(1.0 - plateCenter * 0.8, 2.0); // stronger at edges
  sheenFresnel += pow(max(0.0, sin(viewAngle * 3.0 + viewDist * 5.0 + t)), 4.0) * 0.3;
  float iridIntensity = sheenFresnel * plateEdge;

  color += iridColor * iridIntensity * (0.3 + u_mid * 0.4);
  color += iridColor2 * iridIntensity * 0.15 * (1.0 + u_treble * 0.5);

  // ── Plate edge bevels — bright rim light ──
  vec3 rimColor = palette(
    hexEdge1 * 5.0 + iridPhase * 0.3 + paletteShift + 0.2,
    vec3(0.25, 0.22, 0.18),
    vec3(0.2, 0.18, 0.15),
    vec3(0.6, 0.55, 0.45),
    vec3(0.0, 0.1, 0.15)
  );
  color += rimColor * plateRim * 0.6;

  // ── Gap glow between plates — bass pulses through the joints ──
  float gapGlow = smoothstep(0.02, -0.01, hexEdge1);
  float gapPulse = sin(hexId1.x * 5.0 + hexId1.y * 3.0 - t * 4.0) * 0.5 + 0.5;
  gapPulse = pow(gapPulse, 3.0);
  color += gapColor * gapGlow * (0.4 + gapPulse * u_bass * 1.5);

  // ── Overlapping plates effect — parallax between layers ──
  // Slight offset between hex layers suggests depth/overlap
  vec2 overlapUV = curvedUV + vec2(0.08, 0.05) * (1.0 + u_amplitude * 0.2);
  vec3 hexOverlap = hexTile(overlapUV * hexScale * 0.95);
  float overlapEdge = smoothstep(0.0, 0.03, hexOverlap.x);
  float overlapShadow = (1.0 - overlapEdge) * 0.15;

  // Shadow from overlapping plates
  color *= 1.0 - overlapShadow;

  // ── Specular highlights — bright spots on plate surfaces ──
  float specAngle = viewAngle + t * 0.5;
  float specular = pow(max(0.0, sin(specAngle * 2.0 + viewDist * 4.0)), 12.0);
  specular *= plateCenter;
  vec3 specColor = palette(
    iridPhase * 0.3 + paletteShift + 0.5,
    vec3(0.6, 0.6, 0.6),
    vec3(0.3, 0.3, 0.3),
    vec3(0.8, 0.9, 1.0),
    vec3(0.1, 0.2, 0.3)
  );
  color += specColor * specular * (0.2 + u_treble * 0.4);

  // ── Surface scratches/wear — noise-based detail ──
  float scratch = fbm(curvedUV * 15.0 + plateVar * 3.0);
  float scratchMark = smoothstep(0.3, 0.5, scratch) * 0.1;
  color = mix(color, chitinBase * 0.5, scratchMark);

  // ── Bass impact ripple — shockwave across the surface ──
  float impactR = fract(t * 0.3) * 2.0;
  float impact = smoothstep(0.05, 0.0, abs(viewDist - impactR));
  impact *= 1.0 - impactR / 2.0;
  color += iridColor * impact * u_bass * 0.8;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
