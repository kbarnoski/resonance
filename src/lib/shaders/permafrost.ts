import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.04;
  float paletteShift = u_amplitude * 0.2;

  // Subtle refraction distortion — light bending through ice
  float refractStr = 0.02 + u_mid * 0.015;
  float refractAngle = fbm(uv * 4.0 + t * 0.3) * 6.28;
  vec2 refractOffset = vec2(cos(refractAngle), sin(refractAngle)) * refractStr;
  vec2 distUV = uv + refractOffset;

  // Deep ice base color — layered blue-white gradient
  float depthGrad = smoothstep(-0.5, 0.5, distUV.y);
  vec3 deepIce = palette(0.62 + paletteShift,
    vec3(0.05, 0.1, 0.2), vec3(0.1, 0.15, 0.25),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.6, 0.75));
  vec3 surfaceIce = palette(0.7 + paletteShift,
    vec3(0.3, 0.4, 0.5), vec3(0.2, 0.2, 0.25),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  vec3 color = mix(deepIce, surfaceIce, depthGrad);

  // Crystalline structure — large Voronoi cells for ice crystals
  vec2 crystalUV = distUV * 3.0 + vec2(t * 0.1, t * 0.05);
  vec3 crystal = voronoi(crystalUV);
  float crystalEdge = crystal.y - crystal.x;
  float crystalBorder = smoothstep(0.08, 0.0, crystalEdge);

  // Crystal edges catch light
  vec3 edgeLight = palette(0.72 + paletteShift,
    vec3(0.6, 0.7, 0.85), vec3(0.2, 0.15, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color += crystalBorder * edgeLight * 0.3;

  // Inner crystal variation — each crystal slightly different shade
  float crystalId = crystal.x * 5.0 + crystal.y * 3.0;
  float crystalTint = fract(sin(crystalId * 127.1) * 43758.5453);
  vec3 tintColor = palette(crystalTint * 0.3 + 0.6 + paletteShift,
    vec3(0.15, 0.2, 0.35), vec3(0.1, 0.12, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color = mix(color, tintColor, 0.15);

  // Finer crystal sub-structure
  vec2 subCrystalUV = distUV * 8.0 + vec2(-t * 0.05, t * 0.08);
  vec3 subCrystal = voronoi(subCrystalUV);
  float subEdge = smoothstep(0.04, 0.0, subCrystal.y - subCrystal.x);
  color += subEdge * edgeLight * 0.12;

  // Trapped air bubbles — scattered spherical highlights
  float bubbles = 0.0;
  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    float bSeed = fi * 17.31;
    vec2 bubblePos = vec2(
      fract(sin(bSeed) * 43758.5453) * 2.0 - 1.0,
      fract(sin(bSeed * 2.7) * 12345.6) * 2.0 - 1.0
    ) * 0.6;

    // Subtle floating motion
    bubblePos.y += sin(u_time * 0.3 + fi * 0.7) * 0.01;
    bubblePos.x += cos(u_time * 0.25 + fi * 1.1) * 0.008;

    float bSize = 0.01 + fract(sin(bSeed * 4.3) * 7777.7) * 0.025;
    float bDist = length(distUV - bubblePos);

    // Bubble ring and highlight
    float bubbleRing = smoothstep(bSize + 0.003, bSize, bDist) * smoothstep(bSize - 0.006, bSize, bDist);
    float bubbleHighlight = smoothstep(bSize, 0.0, bDist) * 0.15;
    float bubbleShine = smoothstep(bSize * 0.3, 0.0, length(distUV - bubblePos + vec2(bSize * 0.3, -bSize * 0.3)));

    bubbles += bubbleRing * 0.3 + bubbleHighlight + bubbleShine * 0.4;
  }
  vec3 bubbleColor = palette(0.75 + paletteShift,
    vec3(0.7, 0.8, 0.9), vec3(0.15, 0.1, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color += bubbles * bubbleColor * 0.25;

  // Caustic light patterns — refracted light dancing through ice
  float causticScale = 6.0 + u_treble * 2.0;
  vec2 causticUV1 = distUV * causticScale + vec2(t * 0.4, t * 0.3);
  vec2 causticUV2 = distUV * causticScale * 1.3 + vec2(-t * 0.3, t * 0.5);
  causticUV2 = rot2(0.4) * causticUV2;

  vec3 caust1 = voronoi(causticUV1);
  vec3 caust2 = voronoi(causticUV2);
  float caustic = caust1.x * caust2.x;
  caustic = smoothstep(0.0, 0.15, caustic);
  caustic = 1.0 - caustic;
  caustic *= caustic;

  vec3 causticColor = palette(caustic * 0.3 + 0.68 + paletteShift,
    vec3(0.4, 0.55, 0.7), vec3(0.3, 0.25, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color += caustic * causticColor * 0.2 * (0.7 + u_treble * 0.5);

  // Ice layers — horizontal strata with varying opacity
  for (int l = 0; l < 5; l++) {
    float fl = float(l);
    float layerY = -0.4 + fl * 0.2 + snoise(vec2(distUV.x * 3.0 + fl * 5.0, fl + t * 0.1)) * 0.04;
    float layerDist = abs(distUV.y - layerY);
    float layer = smoothstep(0.03, 0.0, layerDist) * 0.15;

    vec3 layerColor = palette(fl * 0.12 + 0.65 + paletteShift,
      vec3(0.5, 0.6, 0.75), vec3(0.15, 0.12, 0.1),
      vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.68));
    color = mix(color, layerColor, layer);
  }

  // Frost fractal patterns — dendritic ice crystals
  float frostNoise = fbm(distUV * 12.0 + t * 0.2);
  float frost2 = fbm(distUV * 20.0 - t * 0.15);
  float frostPattern = smoothstep(0.2, 0.5, frostNoise) * smoothstep(0.5, 0.2, frostNoise);
  frostPattern += smoothstep(0.3, 0.5, frost2) * smoothstep(0.5, 0.3, frost2) * 0.5;
  frostPattern *= smoothstep(0.3, 0.6, length(distUV)); // more frost at edges

  vec3 frostColor = palette(0.73 + paletteShift,
    vec3(0.6, 0.7, 0.8), vec3(0.15, 0.12, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color = mix(color, frostColor, frostPattern * 0.2);

  // Bass-reactive deep pulse — ice seems to breathe
  float deepPulse = sin(length(distUV) * 8.0 - u_time * 1.0) * 0.5 + 0.5;
  deepPulse *= u_bass * 0.08;
  vec3 pulseColor = palette(0.58 + paletteShift,
    vec3(0.1, 0.15, 0.3), vec3(0.1, 0.12, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.6, 0.75));
  color += deepPulse * pulseColor;

  // Internal light scattering — soft glow from within
  float scatter = smoothstep(0.6, 0.0, length(distUV - vec2(0.1, 0.1)));
  vec3 scatterColor = palette(0.67 + paletteShift,
    vec3(0.2, 0.3, 0.5), vec3(0.15, 0.15, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color += scatter * scatterColor * 0.1;

  // Mid-reactive shimmer — light dancing across surface
  float shimmer = snoise(distUV * 25.0 + u_time * 1.5);
  shimmer = smoothstep(0.6, 0.9, shimmer) * u_mid * 0.15;
  color += shimmer * edgeLight * 0.5;

  // Cold color correction — push toward blue
  color = mix(color, color * vec3(0.85, 0.92, 1.1), 0.25);

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.6;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
