import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Segment SDF for dendrite branches
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
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: deep neural tissue ──
  float bgN = fbm(uv * 2.5 + vec2(t * 0.05, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.7,
    vec3(0.02, 0.01, 0.04),
    vec3(0.03, 0.02, 0.05),
    vec3(0.4, 0.3, 0.7),
    vec3(0.0, 0.1, 0.3)
  );
  color = bgColor * (bgN * 0.2 + 0.06);

  // ── Dendrite network: multiple branching trees ──
  float allDendrite = 1e6;
  float impulseAccum = 0.0;

  // 6 dendrite trees radiating from different positions
  for (int tree = 0; tree < 6; tree++) {
    float ft = float(tree);
    float treeAngle = ft * 1.047 + t * 0.05; // 60 degrees apart, slow rotation
    float treeSeed = ft * 17.3;

    // Root position — arranged in a ring around center
    float rootR = 0.05 + ft * 0.02;
    vec2 root = vec2(cos(treeAngle + 0.5), sin(treeAngle + 0.5)) * rootR;

    // Primary growth direction — outward from center
    vec2 growDir = normalize(vec2(cos(treeAngle), sin(treeAngle)));
    float segLen = 0.18 + hash1(treeSeed) * 0.08;

    // Generation 0: trunk
    vec2 end0 = root + growDir * segLen;
    float d0 = sdSeg(uv, root, end0);
    allDendrite = min(allDendrite, d0 - 0.012);

    // Impulse traveling along trunk
    float trunkParam = clamp(dot(uv - root, growDir) / segLen, 0.0, 1.0);
    float impulse0 = sin(trunkParam * 15.0 - t * 8.0 + ft * 2.0) * 0.5 + 0.5;
    impulse0 = pow(impulse0, 6.0) * smoothstep(0.03, 0.0, d0);

    // Generation 1: two branches
    float branchAngle1 = 0.5 + sin(t * 0.3 + treeSeed) * 0.15;
    vec2 dir1L = rot2(branchAngle1) * growDir;
    vec2 dir1R = rot2(-branchAngle1) * growDir;
    float len1 = segLen * 0.6;
    vec2 end1L = end0 + dir1L * len1;
    vec2 end1R = end0 + dir1R * len1;
    allDendrite = min(allDendrite, sdSeg(uv, end0, end1L) - 0.008);
    allDendrite = min(allDendrite, sdSeg(uv, end0, end1R) - 0.008);

    // Impulses on branches
    float param1L = clamp(dot(uv - end0, dir1L) / len1, 0.0, 1.0);
    float imp1L = sin((trunkParam + param1L) * 12.0 - t * 8.0 + ft * 2.0) * 0.5 + 0.5;
    imp1L = pow(imp1L, 6.0) * smoothstep(0.025, 0.0, sdSeg(uv, end0, end1L));

    // Generation 2: four sub-branches
    float ba2 = 0.45 + cos(t * 0.35 + treeSeed * 1.3) * 0.12;
    float len2 = len1 * 0.55;
    vec2 e2LL = end1L + rot2(ba2) * dir1L * len2;
    vec2 e2LR = end1L + rot2(-ba2) * dir1L * len2;
    vec2 e2RL = end1R + rot2(ba2) * dir1R * len2;
    vec2 e2RR = end1R + rot2(-ba2) * dir1R * len2;
    allDendrite = min(allDendrite, sdSeg(uv, end1L, e2LL) - 0.005);
    allDendrite = min(allDendrite, sdSeg(uv, end1L, e2LR) - 0.005);
    allDendrite = min(allDendrite, sdSeg(uv, end1R, e2RL) - 0.005);
    allDendrite = min(allDendrite, sdSeg(uv, end1R, e2RR) - 0.005);

    // Generation 3: fine terminal branches — treble-activated
    if (u_treble > 0.15) {
      float ba3 = 0.4 + sin(t * 0.4 + treeSeed * 2.1) * 0.1;
      float len3 = len2 * 0.5;
      float thick3 = 0.003;
      allDendrite = min(allDendrite, sdSeg(uv, e2LL, e2LL + rot2(ba3) * normalize(e2LL - end1L) * len3) - thick3);
      allDendrite = min(allDendrite, sdSeg(uv, e2LR, e2LR + rot2(-ba3) * normalize(e2LR - end1L) * len3) - thick3);
      allDendrite = min(allDendrite, sdSeg(uv, e2RL, e2RL + rot2(ba3) * normalize(e2RL - end1R) * len3) - thick3);
      allDendrite = min(allDendrite, sdSeg(uv, e2RR, e2RR + rot2(-ba3) * normalize(e2RR - end1R) * len3) - thick3);
    }

    impulseAccum += impulse0 + imp1L;
  }

  // ── Dendrite rendering ──
  float dendriteEdge = smoothstep(0.003, -0.002, allDendrite);
  float dendriteGlow = smoothstep(0.04, 0.0, allDendrite);

  vec3 dendriteColor = palette(
    allDendrite * 5.0 + t * 0.06 + paletteShift,
    vec3(0.3, 0.4, 0.6),
    vec3(0.3, 0.3, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.15, 0.45)
  );
  color += dendriteColor * (dendriteEdge * 0.9 + dendriteGlow * 0.25);

  // ── Electrical impulse visualization ──
  float impulseWave = sin(allDendrite * 40.0 - t * 10.0) * 0.5 + 0.5;
  impulseWave = pow(impulseWave, 8.0) * smoothstep(0.02, -0.005, allDendrite);
  vec3 impulseColor = palette(
    t * 0.2 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.4),
    vec3(0.4, 0.4, 0.5),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.1, 0.3)
  );
  color += impulseColor * impulseWave * (1.0 + u_bass * 2.5);

  // ── Synaptic gap: cell body at center ──
  float cellDist = length(uv);
  float cellBody = smoothstep(0.08, 0.04, cellDist);
  float cellEdge = smoothstep(0.06, 0.04, cellDist) - smoothstep(0.04, 0.02, cellDist);
  vec3 cellColor = palette(
    t * 0.08 + paletteShift + 0.2,
    vec3(0.4, 0.35, 0.5),
    vec3(0.3, 0.3, 0.45),
    vec3(0.9, 0.8, 1.0),
    vec3(0.05, 0.1, 0.35)
  );
  color += cellColor * cellBody * (0.6 + u_amplitude * 0.4);
  color += cellColor * cellEdge * 1.5;

  // ── Neurotransmitter dots in synaptic cleft ──
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float seed = hash1(fi * 11.3);
    float seed2 = hash1(fi * 23.7 + 5.0);

    // Dots drift outward from cell body
    float age = fract(t * (0.4 + seed * 0.3) + seed * 10.0);
    float angle = seed * 6.28 + t * 0.2;
    float radius = 0.05 + age * 0.15;
    vec2 dotPos = vec2(cos(angle), sin(angle)) * radius;

    // Brownian wobble
    dotPos += vec2(
      snoise(vec2(fi * 3.1 + t * 2.0, 0.0)),
      snoise(vec2(0.0, fi * 5.7 + t * 2.0))
    ) * 0.02;

    float dotDist = length(uv - dotPos);
    float dotGlow = exp(-dotDist * dotDist / 0.0003);

    // Fade out as they drift
    float dotFade = 1.0 - age;

    vec3 ntColor = palette(
      seed + t * 0.1 + paletteShift + 0.4,
      vec3(0.5, 0.4, 0.3),
      vec3(0.4, 0.3, 0.4),
      vec3(0.9, 0.7, 1.0),
      vec3(0.1, 0.15, 0.4)
    );
    color += ntColor * dotGlow * dotFade * (0.5 + u_mid * 1.0);
  }

  // ── Cascading activation: ripple from bass hits ──
  float rippleR = fract(t * 0.5) * 1.5;
  float ripple = smoothstep(0.04, 0.0, abs(cellDist - rippleR));
  ripple *= (1.0 - rippleR / 1.5); // fade with expansion
  color += impulseColor * ripple * u_bass * 1.5;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.55, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
