import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Cocoon centered — oval form
  vec2 p = uv;
  p.x *= 1.4; // elongate slightly
  float r = length(p);
  float angle = atan(p.y, p.x);

  // Silk thread wrapping — layered concentric spirals
  // Each layer is a slightly offset spiral
  float silkAccum = 0.0;
  float silkHighlight = 0.0;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float layerR = r * (3.0 + fi * 0.8);
    float layerA = angle + fi * 0.5 + t * 0.05 * (1.0 + fi * 0.2);

    // Spiral thread — parametric curve as sine of radius+angle
    float spiral = sin(layerR * 12.0 + layerA * 3.0 + snoise(vec2(layerR, fi * 2.0 + t * 0.08)) * 2.0);
    float thread = smoothstep(0.3, 0.0, abs(spiral) - 0.1);

    // Layer opacity decreases with depth
    float layerAlpha = 0.8 - fi * 0.1;

    // Breath-like expansion of threads — bass reactive
    float breathe = sin(t * 0.4 + fi * 0.5) * u_bass * 0.15;
    thread *= smoothstep(0.7 + breathe, 0.3, r);

    silkAccum += thread * layerAlpha;
    silkHighlight += pow(thread, 3.0) * layerAlpha * 0.3;
  }
  silkAccum = clamp(silkAccum, 0.0, 1.0);

  // Cross-hatching pattern where threads overlap
  float crossHatch = sin(angle * 20.0 + r * 30.0 + t * 0.2) * 0.5 + 0.5;
  crossHatch *= sin(angle * 15.0 - r * 25.0 + t * 0.15) * 0.5 + 0.5;
  float weave = pow(crossHatch, 2.0);

  // Translucency — inner form visible through silk
  float innerForm = fbm(p * 4.0 + vec2(t * 0.05, 0.0));
  float innerGlow = smoothstep(0.4, 0.0, r) * (innerForm * 0.5 + 0.5);

  // Colors
  // Silk — warm cream/ivory with golden tones
  vec3 silkColor = palette(
    silkAccum * 0.3 + angle * 0.05 + t * 0.02,
    vec3(0.6, 0.55, 0.45),
    vec3(0.15, 0.12, 0.08),
    vec3(0.8, 0.7, 0.5),
    vec3(0.0, 0.05, 0.08)
  );

  // Deeper silk layers — slightly amber
  vec3 deepSilk = palette(
    r * 0.5 + t * 0.01 + 0.2,
    vec3(0.5, 0.42, 0.3),
    vec3(0.12, 0.1, 0.06),
    vec3(0.7, 0.55, 0.35),
    vec3(0.0, 0.08, 0.1)
  );

  // Inner being — warm amber-green, living thing inside
  vec3 innerColor = palette(
    innerForm * 0.4 + t * 0.03,
    vec3(0.35, 0.3, 0.15),
    vec3(0.2, 0.18, 0.08),
    vec3(0.6, 0.5, 0.25),
    vec3(0.0, 0.1, 0.05)
  );

  // Background — dark warm
  vec3 bgColor = palette(
    fbm(uv * 2.0) * 0.2 + 0.8,
    vec3(0.06, 0.05, 0.03),
    vec3(0.03, 0.02, 0.02),
    vec3(0.2, 0.15, 0.1),
    vec3(0.0, 0.05, 0.1)
  );

  // Compose
  vec3 color = bgColor;

  // Inner glow showing through
  color = mix(color, innerColor, innerGlow * 0.6);

  // Silk layers
  color = mix(color, deepSilk, silkAccum * 0.5);
  color = mix(color, silkColor, silkAccum * 0.4);

  // Thread weave texture
  color += silkColor * weave * silkAccum * 0.12;

  // Silk sheen highlights
  color += vec3(0.7, 0.65, 0.5) * silkHighlight * 0.4;

  // Inner movement — the creature stirs, mid reactive
  float stir = sin(r * 20.0 - t * 3.0 + angle * 2.0) * 0.5 + 0.5;
  stir = pow(stir, 6.0) * innerGlow;
  color += innerColor * stir * u_mid * 0.4;

  // Silk luminance — bass breathe
  color += silkColor * 0.08 * u_bass * smoothstep(0.5, 0.2, r);

  // Fine fiber shimmer — treble
  float fiberShimmer = pow(snoise(vec2(angle * 20.0, r * 40.0) + t * 2.0) * 0.5 + 0.5, 10.0);
  color += vec3(0.7, 0.6, 0.45) * fiberShimmer * u_treble * 0.3 * silkAccum;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
