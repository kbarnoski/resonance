import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
// Segment SDF for spindle fibers and chromosomes
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Division cycle phase — loops continuously ──
  // phase 0.0-0.3: prophase (condensing), 0.3-0.5: metaphase (aligned)
  // 0.5-0.8: anaphase (separating), 0.8-1.0: telophase (splitting)
  float cycle = fract(t * 0.15);
  float separation = smoothstep(0.3, 0.9, cycle); // 0 = together, 1 = fully apart
  float splitting = smoothstep(0.7, 1.0, cycle);

  // Bass accelerates the division feeling
  float bassBoost = 1.0 + u_bass * 0.5;
  separation = clamp(separation * bassBoost, 0.0, 1.0);

  // ── Background: cytoplasm ──
  float bgN = fbm(uv * 3.0 + vec2(t * 0.1, t * 0.08));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.5,
    vec3(0.03, 0.04, 0.06),
    vec3(0.04, 0.05, 0.07),
    vec3(0.5, 0.6, 0.8),
    vec3(0.0, 0.2, 0.35)
  );
  color = bgColor * (bgN * 0.15 + 0.07);

  // ── Two poles — cell centers pulling apart ──
  float poleDist = separation * 0.5;
  vec2 poleL = vec2(-poleDist, 0.0);
  vec2 poleR = vec2(poleDist, 0.0);

  // ── Cell membrane — two circles merging/splitting ──
  float baseR = 0.35 + u_amplitude * 0.05;
  float membraneR = baseR;

  // During splitting, cells become two distinct circles
  float dL = length(uv - poleL) - membraneR;
  float dR = length(uv - poleR) - membraneR;

  // Smooth blend between single cell and two cells
  float blendK = 0.3 - splitting * 0.25;
  blendK = max(blendK, 0.02);
  float cellSDF = smin(dL, dR, blendK);

  // Membrane rendering
  float membraneEdge = smoothstep(0.015, 0.0, abs(cellSDF));
  float membraneGlow = smoothstep(0.06, 0.0, abs(cellSDF));
  float cellInterior = smoothstep(0.02, -0.02, cellSDF);

  vec3 membraneColor = palette(
    cellSDF * 3.0 + t * 0.1 + paletteShift,
    vec3(0.3, 0.5, 0.4),
    vec3(0.3, 0.4, 0.3),
    vec3(0.7, 1.0, 0.8),
    vec3(0.0, 0.2, 0.3)
  );

  color += membraneColor * membraneEdge * 1.5;
  color += membraneColor * membraneGlow * 0.3;

  // ── Interior cytoplasm glow ──
  vec3 cytoColor = palette(
    bgN * 0.4 + paletteShift + 0.2,
    vec3(0.06, 0.08, 0.10),
    vec3(0.05, 0.07, 0.08),
    vec3(0.5, 0.7, 0.6),
    vec3(0.0, 0.15, 0.25)
  );
  color += cytoColor * cellInterior * 0.15;

  // ── Spindle fibers — connecting poles to center (metaphase plate) ──
  float spindleIntensity = smoothstep(0.1, 0.4, cycle) * (1.0 - smoothstep(0.85, 1.0, cycle));
  if (spindleIntensity > 0.01) {
    float spindleAccum = 0.0;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float yOff = (fi / 15.0 - 0.5) * 0.5;
      vec2 midPoint = vec2(0.0, yOff);

      // Fibers from left pole to center
      float fiberL = sdSeg(uv, poleL, midPoint);
      // Fibers from right pole to center
      float fiberR = sdSeg(uv, poleR, midPoint);

      float fiber = min(fiberL, fiberR);
      float fiberGlow = smoothstep(0.008, 0.0, fiber);

      // Pulsing along fibers
      float fiberPulse = sin(fiber * 60.0 - t * 6.0 + fi) * 0.5 + 0.5;
      fiberPulse = pow(fiberPulse, 4.0);

      spindleAccum += fiberGlow * (0.3 + fiberPulse * 0.4);
    }

    vec3 spindleColor = palette(
      t * 0.08 + paletteShift + 0.6,
      vec3(0.3, 0.4, 0.5),
      vec3(0.3, 0.3, 0.4),
      vec3(0.6, 0.8, 1.0),
      vec3(0.0, 0.15, 0.4)
    );
    color += spindleColor * spindleAccum * spindleIntensity * cellInterior * 0.3;
  }

  // ── Chromosomes — line shapes migrating to poles ──
  float chromoAccum = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.7);
    float seed2 = hash1(fi * 13.1 + 3.0);

    // During metaphase: aligned at center. During anaphase: migrating to poles
    float side = fi < 6.0 ? -1.0 : 1.0;
    float yBase = (seed - 0.5) * 0.35;

    // X position: center during metaphase, pole during anaphase
    float xTarget = side * poleDist * 0.6;
    float xPos = mix(seed2 * 0.05 - 0.025, xTarget, separation);

    // Chromosome shape: small thick line segment
    vec2 chromoCenter = vec2(xPos, yBase + sin(t * 2.0 + fi) * 0.02);
    float chromoAngle = seed * 3.14 + t * 0.3;
    float chromoLen = 0.03 + seed2 * 0.02;
    vec2 chromoDir = vec2(cos(chromoAngle), sin(chromoAngle)) * chromoLen;
    vec2 chromoA = chromoCenter - chromoDir;
    vec2 chromoB = chromoCenter + chromoDir;

    float chromoDist = sdSeg(uv, chromoA, chromoB);
    float chromoGlow = smoothstep(0.012, 0.0, chromoDist);
    float chromoCore = smoothstep(0.006, 0.0, chromoDist);

    vec3 chromoColor = palette(
      fi * 0.08 + t * 0.05 + paletteShift + 0.35,
      vec3(0.5, 0.35, 0.4),
      vec3(0.4, 0.3, 0.35),
      vec3(1.0, 0.7, 0.8),
      vec3(0.05, 0.15, 0.3)
    );

    float vis = cellInterior;
    color += chromoColor * (chromoCore * 1.0 + chromoGlow * 0.4) * vis;
    chromoAccum += chromoGlow * vis;
  }

  // ── Cleavage furrow — the pinching moment ──
  float furrowIntensity = smoothstep(0.5, 0.8, cycle) * (1.0 - smoothstep(0.95, 1.0, cycle));
  float furrowDepth = furrowIntensity * 0.15;
  float furrowDist = abs(uv.x);
  float furrow = smoothstep(furrowDepth + 0.02, furrowDepth, furrowDist);
  furrow *= smoothstep(0.4, 0.0, abs(uv.y)); // only at equator

  vec3 furrowColor = palette(
    t * 0.12 + paletteShift + 0.8,
    vec3(0.5, 0.6, 0.4),
    vec3(0.4, 0.5, 0.3),
    vec3(0.8, 1.0, 0.7),
    vec3(0.0, 0.2, 0.25)
  );
  color += furrowColor * furrow * furrowIntensity * u_mid * 2.0;

  // ── Pole glow — centrosomes ──
  float poleGlowL = exp(-dot(uv - poleL, uv - poleL) / 0.008);
  float poleGlowR = exp(-dot(uv - poleR, uv - poleR) / 0.008);
  vec3 poleColor = palette(
    t * 0.1 + paletteShift + 0.15,
    vec3(0.4, 0.5, 0.6),
    vec3(0.3, 0.4, 0.5),
    vec3(0.8, 1.0, 0.9),
    vec3(0.0, 0.2, 0.4)
  );
  color += poleColor * (poleGlowL + poleGlowR) * (0.5 + u_bass * 1.0) * cellInterior;

  // ── Treble: fine organelle scatter inside cell ──
  float organelle = snoise(uv * 25.0 + t * 1.5);
  organelle = smoothstep(0.7, 0.95, organelle) * u_treble * cellInterior;
  color += membraneColor * organelle * 0.5;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.55, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
