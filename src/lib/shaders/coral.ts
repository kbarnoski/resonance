import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: deep ocean water ──
  float bgN = fbm(uv * 1.5 + vec2(t * 0.04, t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.4 + paletteShift + 0.6,
    vec3(0.01, 0.02, 0.05),
    vec3(0.02, 0.03, 0.06),
    vec3(0.3, 0.4, 0.7),
    vec3(0.0, 0.15, 0.4)
  );
  color = bgColor * (bgN * 0.15 + 0.06);

  // ── Water caustics overlay — light filtering through water ──
  vec2 caustUV = uv * 4.0 + vec2(t * 0.3, t * 0.2);
  float caust1 = snoise(caustUV);
  float caust2 = snoise(caustUV * 1.7 + 3.0);
  float caustics = pow(max(caust1 + caust2, 0.0) * 0.5, 2.0);
  color += vec3(0.05, 0.08, 0.12) * caustics * 0.3;

  // ── Coral colony base — organic mound shape ──
  float moundDist = length(uv * vec2(1.0, 1.5) + vec2(0.0, 0.15));
  float moundShape = smoothstep(0.6, 0.2, moundDist);

  // Textured coral surface
  float coralTex = fbm(uv * 6.0 + vec2(t * 0.05, -t * 0.03));
  float coralBump = fbm(uv * 12.0 + coralTex * 0.5);

  vec3 coralBaseColor = palette(
    coralTex * 0.4 + coralBump * 0.2 + paletteShift + 0.1,
    vec3(0.4, 0.2, 0.25),
    vec3(0.35, 0.2, 0.3),
    vec3(0.9, 0.6, 0.7),
    vec3(0.0, 0.1, 0.2)
  );
  color += coralBaseColor * moundShape * (coralBump * 0.3 + 0.2);

  // ── Coral polyps — extending and retracting tentacles ──
  float polypAccum = 0.0;
  float tentacleAccum = 0.0;
  float tipAccum = 0.0;

  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.13);
    float seed2 = hash1(fi * 13.37 + 3.0);

    // Polyp position on the coral mound
    float pAngle = seed * 6.28;
    float pRadius = seed2 * 0.35;
    vec2 polypPos = vec2(cos(pAngle), sin(pAngle) * 0.7 - 0.1) * pRadius;

    // Only show polyps on the mound surface
    float onMound = smoothstep(0.55, 0.25, length(polypPos * vec2(1.0, 1.5) + vec2(0.0, 0.15)));
    if (onMound < 0.01) continue;

    // Polyp cup — small circle
    float cupDist = length(uv - polypPos);
    float cupGlow = smoothstep(0.025, 0.0, cupDist) * onMound;
    polypAccum += cupGlow;

    // Extension cycle — each polyp has its own rhythm
    float extendPhase = sin(t * 1.5 + fi * 0.97) * 0.5 + 0.5;
    extendPhase = smoothstep(0.2, 0.8, extendPhase); // sharpen
    float extension = extendPhase * (0.7 + u_bass * 0.3);

    // Tentacles — 5-8 per polyp, radiating outward
    int numTentacles = 5 + int(seed * 3.0);
    for (int tn = 0; tn < 8; tn++) {
      if (tn >= numTentacles) break;
      float tf = float(tn);
      float tAngle = tf * 6.28 / float(numTentacles) + fi * 1.3;
      float tLen = (0.03 + seed2 * 0.02) * extension;

      // Tentacle curves outward with gentle wave
      vec2 tentDir = vec2(cos(tAngle), sin(tAngle));
      vec2 tentTip = polypPos + tentDir * tLen;

      // Sway in water current
      float sway = sin(t * 2.0 + fi * 0.7 + tf * 1.1) * 0.01 * extension;
      tentTip += vec2(-tentDir.y, tentDir.x) * sway;

      // Distance to tentacle line
      vec2 pa = uv - polypPos;
      vec2 ba = tentTip - polypPos;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
      float tentDist = length(pa - ba * h);

      float tentWidth = mix(0.004, 0.001, h);
      float tentGlow = smoothstep(tentWidth + 0.005, tentWidth, tentDist);
      tentGlow *= onMound * extension;

      tentacleAccum += tentGlow * 0.4;

      // Bioluminescent tips
      float tipDist = length(uv - tentTip);
      float tipGlw = exp(-tipDist * tipDist / 0.0003) * extension * onMound;
      tipAccum += tipGlw;
    }
  }

  // ── Polyp colors — warm coral pinks and oranges ──
  vec3 polypColor = palette(
    polypAccum * 0.3 + t * 0.04 + paletteShift + 0.15,
    vec3(0.5, 0.3, 0.35),
    vec3(0.45, 0.25, 0.3),
    vec3(1.0, 0.7, 0.8),
    vec3(0.0, 0.1, 0.2)
  );
  color += polypColor * polypAccum * 0.8;

  // Tentacle color — translucent with bioluminescence
  vec3 tentColor = palette(
    tentacleAccum * 0.5 + t * 0.03 + paletteShift + 0.4,
    vec3(0.4, 0.35, 0.45),
    vec3(0.35, 0.3, 0.4),
    vec3(0.8, 0.7, 1.0),
    vec3(0.0, 0.15, 0.35)
  );
  color += tentColor * tentacleAccum;

  // Tip glow — bright bioluminescent points
  vec3 tipColor = palette(
    t * 0.08 + paletteShift + 0.7,
    vec3(0.5, 0.6, 0.4),
    vec3(0.45, 0.5, 0.35),
    vec3(0.8, 1.0, 0.7),
    vec3(0.0, 0.2, 0.3)
  );
  color += tipColor * tipAccum * (0.8 + u_treble * 1.0);

  // ── Mid frequencies cause gentle polyp swaying ──
  float swayOverlay = sin(uv.x * 15.0 + t * 2.5 + uv.y * 8.0) * 0.5 + 0.5;
  swayOverlay = pow(swayOverlay, 6.0) * moundShape;
  color += polypColor * swayOverlay * u_mid * 0.15;

  // ── Floating particles — plankton in the water ──
  for (int p = 0; p < 10; p++) {
    float pf = float(p);
    vec2 partPos = vec2(
      sin(t * 0.4 + pf * 3.7) * 0.7,
      cos(t * 0.3 + pf * 5.1) * 0.5
    );
    float partDist = length(uv - partPos);
    float partGlow = exp(-partDist * partDist / 0.0005);
    float partPulse = 0.5 + 0.5 * sin(t * 3.0 + pf * 2.3);
    color += vec3(0.3, 0.5, 0.6) * partGlow * partPulse * 0.15;
  }

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
