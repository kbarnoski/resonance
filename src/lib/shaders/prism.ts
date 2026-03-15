import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.27;

  // Rotate gently
  float angle = t * 0.12 + u_mid * 0.2;
  vec2 uvR = rot2(angle) * uv;

  // Prism sits near center, slightly above
  vec2 prismCenter = vec2(0.0, 0.08);
  float prismSize   = 0.18 + u_bass * 0.04;
  vec2  prismUV     = uvR - prismCenter;

  // Draw the triangular prism silhouette
  float prismSDF = sdTriangle(prismUV, prismSize);

  // Prism outline glow
  float prismGlow = smoothstep(0.025, 0.0, abs(prismSDF));
  float prismCore = smoothstep(0.006, 0.0, abs(prismSDF));

  vec3 prismCol = palette(
    t * 0.4 + paletteShift,
    vec3(0.7, 0.7, 0.7),
    vec3(0.3, 0.3, 0.3),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.0, 0.0)
  );

  vec3 color = vec3(0.0);
  color += prismCol * prismGlow * 0.5;
  color += vec3(1.2, 1.2, 1.3) * prismCore * 1.5;

  // ----- Refraction rays -----
  // Light enters from top and exits as split rainbow rays below the prism

  // Input beam: single white ray coming from top-left
  float beamAngle  = -0.6 + u_bass * 0.1; // angle of incoming beam
  vec2  beamDir    = vec2(sin(beamAngle), -cos(beamAngle));
  // Distance from the beam ray
  float beamDist   = abs(dot(uvR - prismCenter + vec2(0.0, 0.35), vec2(-beamDir.y, beamDir.x)));
  float beamLen    = dot(uvR - prismCenter + vec2(0.0, 0.35), beamDir);
  float beamMask   = smoothstep(0.012, 0.0, beamDist) * step(0.0, beamLen) * step(beamLen, 0.55);
  color += vec3(1.1, 1.1, 1.2) * beamMask * (0.6 + u_treble * 0.4);

  // Outgoing rainbow rays: 7 spectral bands fanning out below prism
  // Each ray has a different exit angle (dispersion)
  int numRays = 14;
  float spreadBase  = 0.38 + u_bass * 0.08;
  float rayOriginY  = prismCenter.y - prismSize * 0.85;

  for (int r = 0; r < numRays; r++) {
    float fr = float(r) / float(numRays - 1); // 0..1 across spectrum

    // Exit angle: spread fan downward
    float exitAngle = -1.5708 + (fr - 0.5) * spreadBase;
    vec2 rayDir = vec2(sin(exitAngle), -cos(exitAngle));

    // Ray origin at bottom of prism
    vec2 rayOrigin = vec2(prismCenter.x, rayOriginY);

    // Point on the ray closest to uv
    vec2 toUV = uvR - rayOrigin;
    float along = dot(toUV, rayDir);
    float perp  = abs(dot(toUV, vec2(-rayDir.y, rayDir.x)));

    // Ray only extends forward (below prism)
    float rayMask = step(0.0, along);

    // Ray width grows slightly with distance (diverging beam)
    float rayWidth = 0.006 + along * 0.004 + u_treble * 0.003;
    float rayGlow  = smoothstep(rayWidth * 5.0, 0.0, perp) * rayMask;
    float rayCore  = smoothstep(rayWidth, 0.0, perp) * rayMask;

    // Depth fade: rays dim as they travel
    float rayFade = 1.0 / (1.0 + along * 0.9);

    // Infinite depth: add faint repetitions along the ray at increasing spacing
    float repPat = sin(along * (8.0 - fr * 4.0) - t * 2.0) * 0.5 + 0.5;
    repPat = pow(repPat, 4.0) * 0.3;

    // Spectrum color — palette maps fr across rainbow
    vec3 rayCol1 = palette(
      fr * 0.85 + t * 0.15 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.8, 0.6),
      vec3(0.0, 0.15, 0.4)
    );
    // Second palette for glow halo — slightly offset
    vec3 rayCol2 = palette(
      fr * 0.85 + 0.5 + t * 0.1 + paletteShift,
      vec3(0.5, 0.4, 0.5),
      vec3(0.5, 0.4, 0.5),
      vec3(0.8, 1.0, 0.5),
      vec3(0.1, 0.0, 0.3)
    );

    color += rayCol2 * rayGlow * 0.45 * rayFade;
    color += rayCol1 * rayCore * 1.2 * rayFade;
    color += rayCol1 * repPat * rayGlow * 0.5 * rayFade;
  }

  // Ambient background: subtle dark gradient with hint of spectrum
  float bgR = length(uv);
  vec3 bgCol = palette(
    bgR * 0.3 + t * 0.08 + paletteShift + 0.7,
    vec3(0.04, 0.03, 0.06),
    vec3(0.04, 0.03, 0.06),
    vec3(0.4, 0.6, 1.0),
    vec3(0.2, 0.1, 0.4)
  );
  color += bgCol * smoothstep(1.5, 0.0, bgR) * 0.06;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
