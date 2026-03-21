import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Concentric summoning rings
  float ring1 = abs(sdCircle(uv, 0.55 + u_bass * 0.04)) - 0.008;
  float ring2 = abs(sdCircle(uv, 0.4 + u_bass * 0.03)) - 0.006;
  float ring3 = abs(sdCircle(uv, 0.25 + u_bass * 0.02)) - 0.005;
  float ring4 = abs(sdCircle(uv, 0.12)) - 0.004;

  float r1Glow = smoothstep(0.012, 0.0, abs(ring1));
  float r2Glow = smoothstep(0.01, 0.0, abs(ring2));
  float r3Glow = smoothstep(0.008, 0.0, abs(ring3));
  float r4Glow = smoothstep(0.006, 0.0, abs(ring4));

  // Glyph-like symbols — simulated by angular patterning between rings
  // Outer ring: 12 glyphs
  float outerGlyph = 0.0;
  for (int i = 0; i < 12; i++) {
    float ga = float(i) * 0.5236 + t * 0.3;
    vec2 gp = vec2(cos(ga), sin(ga)) * 0.475;
    // Small cross-like symbol
    vec2 lp = rot2(ga + t * 0.2) * (uv - gp);
    float cross = min(
      sdBox(lp, vec2(0.015, 0.004)),
      sdBox(lp, vec2(0.004, 0.015))
    );
    outerGlyph += smoothstep(0.005, 0.0, abs(cross));
  }

  // Middle ring: 8 angular glyphs (triangular marks)
  float midGlyph = 0.0;
  for (int i = 0; i < 8; i++) {
    float ga = float(i) * 0.7854 - t * 0.4;
    vec2 gp = vec2(cos(ga), sin(ga)) * 0.325;
    vec2 lp = rot2(ga) * (uv - gp);
    float tri = sdTriangle(lp, 0.02);
    midGlyph += smoothstep(0.006, 0.0, abs(tri));
  }

  // Inner ring: 6 dot-circle glyphs
  float innerGlyph = 0.0;
  for (int i = 0; i < 6; i++) {
    float ga = float(i) * 1.0472 + t * 0.6;
    vec2 gp = vec2(cos(ga), sin(ga)) * 0.185;
    float dotCirc = abs(sdCircle(uv - gp, 0.012)) - 0.003;
    innerGlyph += smoothstep(0.005, 0.0, abs(dotCirc));
  }

  // Rotating connecting lines between rings (spoke pattern)
  float spokes = 0.0;
  for (int i = 0; i < 6; i++) {
    float sa = float(i) * 1.0472 + t * 0.15;
    vec2 inner = vec2(cos(sa), sin(sa)) * 0.12;
    vec2 outer = vec2(cos(sa), sin(sa)) * 0.55;
    float spoke = sdLine(uv, inner, outer) - 0.002;
    spokes += smoothstep(0.005, 0.0, abs(spoke)) * 0.3;
  }

  // Central pentagram
  float penta = 0.0;
  for (int i = 0; i < 5; i++) {
    float a1 = float(i) * 1.2566 - 1.5708 + t * 0.5;
    float a2 = float(i) * 1.2566 - 1.5708 + t * 0.5 + 2.5133;
    vec2 p1 = vec2(cos(a1), sin(a1)) * 0.1;
    vec2 p2 = vec2(cos(a2), sin(a2)) * 0.1;
    float line = sdLine(uv, p1, p2) - 0.002;
    penta += smoothstep(0.004, 0.0, abs(line));
  }

  // Energy rising from the circle — vertical streams
  float energy = 0.0;
  for (int i = 0; i < 5; i++) {
    float ea = float(i) * 1.2566 + t * 0.3;
    float ex = cos(ea) * 0.5;
    float streamDist = abs(uv.x - ex) - 0.008;
    float stream = smoothstep(0.01, 0.0, abs(streamDist));
    stream *= smoothstep(0.55, 0.6, abs(uv.y - sin(t + float(i)) * 0.1));
    stream *= smoothstep(1.0, 0.7, abs(uv.y));
    energy += stream * 0.3;
  }

  // FBM swirl within the circle
  vec2 swirlUV = rot2(t * 0.8 + r * 2.0) * uv;
  float swirl = fbm(swirlUV * 6.0 + t * 0.3);
  float swirlMask = smoothstep(0.55, 0.3, r);

  // Pulsing glow at center
  float centerPulse = sin(t * 3.0 + u_bass * 5.0) * 0.5 + 0.5;
  float centerGlow = exp(-r * 8.0) * (0.5 + centerPulse * 0.5);

  // Arcane violet / crimson palette
  vec3 col1 = palette(
    r * 2.0 + paletteShift,
    vec3(0.4, 0.2, 0.5),
    vec3(0.5, 0.4, 0.5),
    vec3(0.7, 0.3, 0.8),
    vec3(0.5, 0.1, 0.4)
  );

  // Inner gold
  vec3 col2 = palette(
    a / 6.28 + t * 0.2 + paletteShift + 0.3,
    vec3(0.6, 0.5, 0.3),
    vec3(0.4, 0.4, 0.2),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.1, 0.2)
  );

  // Electric blue for glyphs
  vec3 col3 = palette(
    swirl + t * 0.5 + paletteShift + 0.6,
    vec3(0.4, 0.5, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.6, 1.0),
    vec3(0.2, 0.3, 0.6)
  );

  vec3 color = vec3(0.0);

  // Concentric rings
  color += col1 * r1Glow * 1.5 * (0.8 + u_bass * 0.4);
  color += col1 * r2Glow * 1.2 * (0.7 + u_mid * 0.4);
  color += col2 * r3Glow * 1.0;
  color += col2 * r4Glow * 0.8;

  // Glyphs
  color += col3 * outerGlyph * 1.2 * (0.6 + u_treble * 0.6);
  color += col2 * midGlyph * 1.0 * (0.7 + u_mid * 0.5);
  color += col3 * innerGlyph * 0.8;

  // Spokes
  color += col1 * spokes * 0.6;

  // Pentagram
  color += col2 * penta * 1.5 * (0.5 + u_amplitude * 0.5);

  // Inner swirl
  color += col1 * swirlMask * abs(swirl) * 0.3;

  // Center glow
  color += vec3(1.2, 0.9, 1.4) * centerGlow * 1.0;

  // Emissive on ring-glyph intersections
  float interGlow = r1Glow * outerGlyph + r2Glow * midGlyph;
  color += vec3(1.4, 1.2, 1.5) * interGlow * 1.5;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
