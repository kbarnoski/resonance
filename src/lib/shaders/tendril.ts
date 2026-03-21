import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Segment distance for vine branches
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
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: dappled forest light ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.1, t * 0.06));
  float bgN2 = fbm(uv * 4.0 + vec2(-t * 0.05, t * 0.08) + 5.0);
  vec3 bgColor = palette(
    bgN * 0.4 + bgN2 * 0.2 + paletteShift + 0.2,
    vec3(0.02, 0.04, 0.02),
    vec3(0.03, 0.05, 0.03),
    vec3(0.4, 0.7, 0.4),
    vec3(0.0, 0.2, 0.1)
  );
  color = bgColor * (bgN * 0.2 + 0.06);

  // ── Treble energy source — light point that tendrils seek ──
  // Phototaxis target: moves gently, brightens with treble
  vec2 lightPos = vec2(
    sin(t * 0.3) * 0.3 + cos(t * 0.17) * 0.15,
    cos(t * 0.25) * 0.2 + 0.2
  );
  float lightDist = length(uv - lightPos);
  float lightGlow = exp(-lightDist * lightDist / (0.08 + u_treble * 0.06));

  vec3 lightColor = palette(
    t * 0.05 + paletteShift + 0.8,
    vec3(0.6, 0.6, 0.4),
    vec3(0.3, 0.3, 0.2),
    vec3(0.9, 1.0, 0.7),
    vec3(0.0, 0.1, 0.15)
  );
  color += lightColor * lightGlow * (0.3 + u_treble * 0.8);

  // ── Main vine tendrils — curving outward from center, seeking the light ──
  float allVineDist = 1e6;
  float vineGrowth = 0.0;

  int numVines = 8;
  for (int vine = 0; vine < 8; vine++) {
    float fv = float(vine);
    float baseAngle = fv * 0.785 + t * 0.05; // 45 degrees apart
    float seed = hash1(fv * 11.3);

    // Vine grows outward from center in a curving path
    // We trace it as a series of connected segments
    vec2 prevPt = vec2(0.0); // start at center
    float angle = baseAngle;
    float segLen = 0.06 + seed * 0.02;
    float thickness = 0.015;

    // Phototaxis: vine curves toward the light source
    vec2 toLight = normalize(lightPos - prevPt);

    for (int seg = 0; seg < 10; seg++) {
      float fs = float(seg);

      // Growth animation — segments appear over time
      float growPhase = fract(t * (0.2 + seed * 0.1) + seed * 5.0);
      float segVisible = smoothstep(fs / 10.0 - 0.1, fs / 10.0, growPhase);
      if (segVisible < 0.01) break;

      // Curve toward light (phototaxis) — treble strengthens the seeking
      vec2 currentToLight = normalize(lightPos - prevPt);
      float seekStrength = 0.15 + u_treble * 0.2;
      float lightAngle = atan(currentToLight.y, currentToLight.x);

      // Smooth organic curving — noise-driven with phototaxis bias
      float noiseAngle = snoise(vec2(fv * 3.7 + fs * 1.3, t * 0.5)) * 0.6;
      angle = mix(angle + noiseAngle, lightAngle, seekStrength * 0.3);

      vec2 dir = vec2(cos(angle), sin(angle));
      vec2 nextPt = prevPt + dir * segLen;

      // Vine segment distance
      float segDist = sdSeg(uv, prevPt, nextPt);
      float segThick = thickness * (1.0 - fs * 0.07); // taper
      allVineDist = min(allVineDist, segDist - segThick);

      // Growth pulse traveling along the vine
      float growPulse = sin(fs * 2.0 - t * 4.0 + fv * 1.5) * 0.5 + 0.5;
      growPulse = pow(growPulse, 4.0) * smoothstep(0.02, 0.0, segDist);
      vineGrowth += growPulse * segVisible;

      // ── Branching at tips — smaller sub-tendrils ──
      if (seg > 4 && seg < 9) {
        float branchChance = hash1(fv * 7.0 + fs * 13.0);
        if (branchChance > 0.4) {
          float branchAngle = angle + (branchChance > 0.7 ? 0.6 : -0.6);
          branchAngle += snoise(vec2(fv * 5.0 + fs * 2.0, t * 0.3)) * 0.3;
          vec2 branchDir = vec2(cos(branchAngle), sin(branchAngle));
          float branchLen = segLen * 0.5;
          vec2 branchEnd = nextPt + branchDir * branchLen;

          float branchDist = sdSeg(uv, nextPt, branchEnd);
          allVineDist = min(allVineDist, branchDist - segThick * 0.5);

          // Sub-sub-branch (tertiary)
          if (u_amplitude > 0.2) {
            float subAngle = branchAngle + (hash1(fv + fs * 100.0) - 0.5) * 0.8;
            vec2 subDir = vec2(cos(subAngle), sin(subAngle));
            vec2 subEnd = branchEnd + subDir * branchLen * 0.4;
            float subDist = sdSeg(uv, branchEnd, subEnd);
            allVineDist = min(allVineDist, subDist - segThick * 0.25);
          }
        }
      }

      prevPt = nextPt;
    }
  }

  // ── Render vine network ──
  float vineEdge = smoothstep(0.002, -0.002, allVineDist);
  float vineGlow = smoothstep(0.03, 0.0, allVineDist);

  vec3 vineColor = palette(
    allVineDist * 4.0 + t * 0.06 + paletteShift,
    vec3(0.2, 0.45, 0.2),
    vec3(0.25, 0.4, 0.2),
    vec3(0.6, 1.0, 0.5),
    vec3(0.0, 0.2, 0.1)
  );

  vec3 vineDark = palette(
    allVineDist * 2.0 + paletteShift + 0.4,
    vec3(0.15, 0.3, 0.12),
    vec3(0.15, 0.25, 0.1),
    vec3(0.5, 0.8, 0.4),
    vec3(0.0, 0.15, 0.08)
  );

  color += vineDark * vineEdge * 0.9;
  color += vineColor * vineGlow * 0.3;

  // ── Growth pulse glow — bass drives surges of growth energy ──
  vec3 growthColor = palette(
    t * 0.1 + paletteShift + 0.6,
    vec3(0.4, 0.55, 0.3),
    vec3(0.3, 0.4, 0.2),
    vec3(0.8, 1.0, 0.6),
    vec3(0.0, 0.15, 0.1)
  );
  color += growthColor * vineGrowth * (0.3 + u_bass * 1.5);

  // ── Unfurling leaf-buds at branch tips ──
  // Small circular glows at the extending tips
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = hash1(fi * 11.3);
    float tipAngle = fi * 0.785 + t * 0.05;
    float growPhase = fract(t * (0.2 + seed * 0.1) + seed * 5.0);

    // Tip position approximation — at the end of the vine
    float tipR = growPhase * 0.5;
    vec2 tipDir = vec2(cos(tipAngle), sin(tipAngle));
    vec2 tipPos = tipDir * tipR;

    // Tiny leaf bud glow
    float budDist = length(uv - tipPos);
    float budGlow = exp(-budDist * budDist / 0.002) * growPhase;

    vec3 budColor = palette(
      fi * 0.12 + t * 0.08 + paletteShift + 0.3,
      vec3(0.35, 0.5, 0.25),
      vec3(0.3, 0.4, 0.2),
      vec3(0.7, 1.0, 0.5),
      vec3(0.05, 0.2, 0.1)
    );
    color += budColor * budGlow * (0.4 + u_mid * 0.6);
  }

  // ── Ambient spores / pollen drifting ──
  float sporeField = snoise(uv * 15.0 + vec2(t * 0.5, t * 0.3));
  sporeField = smoothstep(0.75, 0.95, sporeField);
  vec3 sporeColor = palette(
    sporeField + paletteShift + 0.7,
    vec3(0.5, 0.5, 0.3),
    vec3(0.3, 0.3, 0.2),
    vec3(0.8, 0.9, 0.6),
    vec3(0.05, 0.15, 0.1)
  );
  color += sporeColor * sporeField * u_treble * 0.3;

  // ── Central root node glow ──
  float rootDist = length(uv);
  float rootGlow = exp(-rootDist * rootDist / 0.01);
  color += vineDark * rootGlow * (0.4 + u_bass * 0.6);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
