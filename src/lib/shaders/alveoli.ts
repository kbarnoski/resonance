import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Animated voronoi for alveolar sacs
vec3 voronoiAlv(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  vec2 mg;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cellId = n + g;
      vec2 rnd = vec2(
        dot(cellId, vec2(127.1, 311.7)),
        dot(cellId, vec2(269.5, 183.3))
      );
      vec2 o = 0.5 + 0.5 * sin(rnd + time * 0.6);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) { md2 = md1; md1 = d; mg = r; }
      else if (d < md2) { md2 = d; }
    }
  }
  return vec3(sqrt(md1), sqrt(md2), 0.0);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: warm tissue tone ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.04, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.15,
    vec3(0.04, 0.02, 0.03),
    vec3(0.05, 0.03, 0.04),
    vec3(0.5, 0.35, 0.4),
    vec3(0.0, 0.1, 0.18)
  );
  color = bgColor * (bgN * 0.12 + 0.05);

  // ── Breathing cycle — global inflation/deflation ──
  float breathCycle = sin(t * 0.8) * 0.5 + 0.5; // 0=exhale, 1=inhale
  float breathScale = 1.0 - breathCycle * 0.08 - u_bass * 0.05;

  // ── Branching airways — tree structure ──
  // Main bronchiole — vertical trunk
  float trunkDist = abs(uv.x) - 0.015;
  float trunkFade = smoothstep(0.5, 0.0, uv.y);
  float trunkGlow = smoothstep(0.01, 0.0, trunkDist) * trunkFade;

  // Branch airways splitting outward
  float branchAccum = 0.0;
  for (int b = 0; b < 6; b++) {
    float bf = float(b);
    float side = bf < 3.0 ? -1.0 : 1.0;
    float idx = mod(bf, 3.0);
    float yStart = 0.3 - idx * 0.2;

    vec2 branchStart = vec2(0.0, yStart);
    float branchAngle = side * (0.6 + idx * 0.2);
    float branchLen = 0.15 + idx * 0.05;
    vec2 branchEnd = branchStart + vec2(cos(branchAngle), -sin(abs(branchAngle))) * branchLen;

    // Distance to branch line
    vec2 pa = uv - branchStart;
    vec2 ba = branchEnd - branchStart;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);

    float branchWidth = mix(0.01, 0.004, h);
    float branchGlow = smoothstep(branchWidth + 0.008, branchWidth, d);
    branchAccum += branchGlow;
  }

  vec3 airwayColor = palette(
    branchAccum * 0.3 + t * 0.03 + paletteShift + 0.3,
    vec3(0.4, 0.25, 0.3),
    vec3(0.35, 0.2, 0.25),
    vec3(0.8, 0.5, 0.6),
    vec3(0.0, 0.1, 0.2)
  );
  color += airwayColor * (trunkGlow * 0.5 + branchAccum * 0.4);

  // ── Alveolar sacs — voronoi-based spongy tissue ──
  vec2 alvUV = uv * breathScale;

  // Domain warp for organic irregularity
  vec2 warp = vec2(
    snoise(alvUV * 3.0 + t * 0.2),
    snoise(alvUV * 3.0 + vec2(5.0, 0.0) + t * 0.15)
  );
  vec2 warped = alvUV + warp * 0.08;

  vec3 v1 = voronoiAlv(warped * 5.0, t * 0.3);
  float ridge1 = v1.y - v1.x;
  float edge1 = smoothstep(0.08, 0.0, ridge1);
  float cell1 = v1.x;

  // Second layer — finer alveoli
  vec3 v2 = voronoiAlv(warped * 10.0 + 3.0, t * 0.5);
  float ridge2 = v2.y - v2.x;
  float edge2 = smoothstep(0.06, 0.0, ridge2);
  float cell2 = v2.x;

  // Alveolar wall color — pink tissue
  vec3 wallColor = palette(
    cell1 * 0.4 + ridge1 * 0.3 + t * 0.02 + paletteShift + 0.1,
    vec3(0.45, 0.3, 0.35),
    vec3(0.35, 0.25, 0.3),
    vec3(0.9, 0.6, 0.7),
    vec3(0.0, 0.1, 0.2)
  );

  // Breathing animation — walls expand/contract
  float wallPulse = 0.5 + 0.3 * breathCycle;
  color += wallColor * edge1 * wallPulse;
  color += wallColor * edge2 * 0.3 * wallPulse;

  // Interior glow — air space
  float airSpace = smoothstep(0.3, 0.1, cell1);
  vec3 airColor = palette(
    cell1 * 0.3 + paletteShift + 0.6,
    vec3(0.15, 0.2, 0.25),
    vec3(0.12, 0.18, 0.22),
    vec3(0.5, 0.7, 0.9),
    vec3(0.0, 0.15, 0.35)
  );
  color += airColor * airSpace * (0.1 + breathCycle * 0.15);

  // ── Oxygen particles — small bright dots moving toward capillaries ──
  for (int p = 0; p < 20; p++) {
    float pf = float(p);
    float seed = hash1(pf * 8.17);
    float seed2 = hash1(pf * 12.31 + 3.0);

    // Particles drift from air spaces into tissue
    float particlePhase = fract(t * 0.3 + seed * 10.0);
    float radialDist = 0.1 + particlePhase * 0.15; // moves outward through wall

    float angle = seed * 6.28 + pf * 0.37;
    vec2 cellCenter = vec2(cos(angle), sin(angle)) * (0.15 + seed2 * 0.25);

    // Spiral outward from cell center
    vec2 particlePos = cellCenter + vec2(cos(angle + particlePhase * 3.0), sin(angle + particlePhase * 3.0)) * radialDist;
    particlePos += vec2(sin(t + pf), cos(t * 0.8 + pf * 1.3)) * 0.02;

    float partDist = length(uv - particlePos);
    float partGlow = exp(-partDist * partDist / 0.0004);
    float partPulse = 0.6 + 0.4 * sin(t * 2.5 + pf * 1.7);

    // Oxygen: blue-ish; CO2: reddish (alternating)
    vec3 partColor;
    if (pf < 10.0) {
      partColor = palette(pf * 0.1 + paletteShift + 0.55,
        vec3(0.3, 0.4, 0.6), vec3(0.25, 0.35, 0.55),
        vec3(0.6, 0.8, 1.0), vec3(0.0, 0.2, 0.45));
    } else {
      partColor = palette(pf * 0.1 + paletteShift + 0.1,
        vec3(0.5, 0.3, 0.3), vec3(0.45, 0.25, 0.25),
        vec3(1.0, 0.6, 0.5), vec3(0.05, 0.1, 0.15));
    }

    color += partColor * partGlow * partPulse * 0.4 * (1.0 + breathCycle * 0.5);
  }

  // ── Capillary network at alveolar walls — mid frequency ──
  float capillary = sin(cell1 * 25.0 + cell2 * 15.0 - t * 3.0) * 0.5 + 0.5;
  capillary = pow(capillary, 6.0) * edge1;
  vec3 capColor = palette(
    t * 0.06 + paletteShift + 0.05,
    vec3(0.5, 0.2, 0.2),
    vec3(0.4, 0.15, 0.15),
    vec3(1.0, 0.4, 0.3),
    vec3(0.0, 0.1, 0.15)
  );
  color += capColor * capillary * u_mid * 0.5;

  // ── Treble: gas exchange sparkle ──
  float exchange = snoise(uv * 25.0 + t * 2.5);
  exchange = smoothstep(0.8, 1.0, exchange) * u_treble * edge1;
  color += vec3(0.7, 0.8, 1.0) * exchange * 0.3;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
