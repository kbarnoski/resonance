import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Distance to nearest line segment — for branch drawing
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Branch thickness tapers with depth/generation
float branchThickness(int gen) {
  return 0.008 / pow(1.6, float(gen));
}

// Fractal branching: iteratively computes distance to a tree of segments
// rooted at 'root', growing in direction 'dir', up to 'maxGen' generations
float branchDist(vec2 p, vec2 root, vec2 dir, int maxGen, float baseLen, float t, float seed) {
  float minDist = 1e6;
  float len = baseLen;
  vec2 start = root;
  vec2 end = root + dir * len;

  // Generation 0 — main trunk
  float d = sdSegment(p, start, end);
  float thick = 0.018;
  minDist = min(minDist, d - thick);

  // Recursively branch using a stack-like unrolled loop
  // We limit to 5 generations to stay within GLSL budget
  vec2 s1 = end; float len1 = len * 0.65;
  vec2 d1L = rot2(0.52 + sin(t * 0.3 + seed) * 0.15) * dir;
  vec2 d1R = rot2(-0.52 + cos(t * 0.25 + seed) * 0.12) * dir;
  vec2 e1L = s1 + d1L * len1;
  vec2 e1R = s1 + d1R * len1;
  float thick1 = 0.011;
  minDist = min(minDist, sdSegment(p, s1, e1L) - thick1);
  minDist = min(minDist, sdSegment(p, s1, e1R) - thick1);

  if (maxGen >= 2) {
    float len2 = len1 * 0.65;
    float thick2 = 0.007;
    float branchAngle2 = 0.48 + sin(t * 0.35 + seed * 1.3) * 0.12;
    vec2 d2LL = rot2(branchAngle2) * d1L;
    vec2 d2LR = rot2(-branchAngle2) * d1L;
    vec2 d2RL = rot2(branchAngle2) * d1R;
    vec2 d2RR = rot2(-branchAngle2) * d1R;
    minDist = min(minDist, sdSegment(p, e1L, e1L + d2LL * len2) - thick2);
    minDist = min(minDist, sdSegment(p, e1L, e1L + d2LR * len2) - thick2);
    minDist = min(minDist, sdSegment(p, e1R, e1R + d2RL * len2) - thick2);
    minDist = min(minDist, sdSegment(p, e1R, e1R + d2RR * len2) - thick2);

    if (maxGen >= 3) {
      float len3 = len2 * 0.65;
      float thick3 = 0.004;
      float ba3 = 0.44 + cos(t * 0.4 + seed * 1.7) * 0.10;
      vec2 e2LL = e1L + d2LL * len2;
      vec2 e2LR = e1L + d2LR * len2;
      vec2 e2RL = e1R + d2RL * len2;
      vec2 e2RR = e1R + d2RR * len2;
      minDist = min(minDist, sdSegment(p, e2LL, e2LL + rot2(ba3) * d2LL * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2LL, e2LL + rot2(-ba3) * d2LL * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2LR, e2LR + rot2(ba3) * d2LR * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2LR, e2LR + rot2(-ba3) * d2LR * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2RL, e2RL + rot2(ba3) * d2RL * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2RL, e2RL + rot2(-ba3) * d2RL * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2RR, e2RR + rot2(ba3) * d2RR * len3) - thick3);
      minDist = min(minDist, sdSegment(p, e2RR, e2RR + rot2(-ba3) * d2RR * len3) - thick3);
    }
  }
  return minDist;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.25;

  vec3 color = vec3(0.0);

  // ── Background: deep void with faint FBM texture ──
  float bgN = fbm(uv * 3.0 + t * 0.05);
  vec3 bgColor = palette(
    bgN * 0.4 + t * 0.01 + paletteShift + 0.7,
    vec3(0.02, 0.02, 0.04),
    vec3(0.02, 0.02, 0.04),
    vec3(0.4, 0.5, 0.8),
    vec3(0.0, 0.15, 0.35)
  );
  color = bgColor * (bgN * 0.3 + 0.05);

  // ── Multi-scale fractal branching ──
  // We render N trees at different scales and positions to create an
  // infinite-feeling neural/dendritic forest

  // Bass causes growth bursts — increases effective generation depth
  int generations = 2 + int(u_bass * 1.5);
  generations = generations > 3 ? 3 : generations; // cap at 3 for GLSL safety

  // Scale 1: Large foreground dendrites
  {
    // 4 trees spread around the frame
    float baseLen = 0.28 + u_bass * 0.05;

    // Tree rooted at bottom center, growing upward
    vec2 growDir = rot2(t * 0.05) * vec2(0.0, 1.0);
    float d1 = branchDist(uv, vec2(0.0, -0.5), growDir, generations, baseLen, t, 1.1);

    // Tree from left, growing right-up
    vec2 growDir2 = rot2(t * 0.04 + 0.8) * vec2(1.0, 0.6);
    growDir2 = normalize(growDir2);
    float d2 = branchDist(uv, vec2(-0.8, -0.1), growDir2, generations, baseLen, t, 3.7);

    // Tree from right, growing left-up
    vec2 growDir3 = rot2(-t * 0.04 + 0.3) * vec2(-1.0, 0.7);
    growDir3 = normalize(growDir3);
    float d3 = branchDist(uv, vec2(0.8, -0.2), growDir3, generations, baseLen, t, 7.3);

    // Tree from top, hanging down (apical dendrite)
    vec2 growDir4 = rot2(t * 0.03) * vec2(0.0, -1.0);
    float d4 = branchDist(uv, vec2(-0.1, 0.6), growDir4, generations, baseLen * 0.8, t, 11.9);

    float allDist = min(min(d1, d2), min(d3, d4));

    vec3 branchColor = palette(
      allDist * 3.0 + t * 0.05 + paletteShift,
      vec3(0.4, 0.5, 0.6),
      vec3(0.3, 0.4, 0.5),
      vec3(0.8, 1.0, 0.9),
      vec3(0.0, 0.2, 0.45)
    );

    float branch = smoothstep(0.003, -0.001, allDist);
    float glow = smoothstep(0.04, 0.0, allDist);

    // Signal pulse traveling along branches — bass triggers surges
    float pulse = sin(allDist * 30.0 - t * 6.0) * 0.5 + 0.5;
    pulse = pow(pulse, 5.0) * u_bass;

    color += branchColor * (branch * 1.2 + glow * 0.3);
    color += branchColor * pulse * 1.5;
  }

  // Scale 2: Mid-distance — smaller trees, more numerous
  {
    float sf = 2.2; // scale factor
    float baseLen = 0.20;

    vec2 p = uv * sf;
    vec2 growDir5 = rot2(t * 0.06 + 1.5) * vec2(0.3, 1.0);
    growDir5 = normalize(growDir5);
    float d5 = branchDist(p, vec2(0.3, -0.7), growDir5, 2, baseLen, t * 1.1, 17.3) / sf;

    vec2 growDir6 = rot2(-t * 0.07 + 2.1) * vec2(-0.2, 0.9);
    growDir6 = normalize(growDir6);
    float d6 = branchDist(p, vec2(-0.4, -0.6), growDir6, 2, baseLen, t * 1.1, 23.7) / sf;

    float allDist2 = min(d5, d6);

    vec3 midColor = palette(
      allDist2 * 2.0 + t * 0.04 + paletteShift + 0.25,
      vec3(0.3, 0.4, 0.55),
      vec3(0.25, 0.35, 0.50),
      vec3(0.7, 0.9, 1.0),
      vec3(0.0, 0.15, 0.40)
    );

    float midBranch = smoothstep(0.002, -0.001, allDist2);
    float midGlow = smoothstep(0.025, 0.0, allDist2);

    // Mid-frequency activates these mid-distance branches
    float midAct = 0.5 + u_mid * 0.5;
    color += midColor * (midBranch * 0.8 + midGlow * 0.2) * midAct;
  }

  // Scale 3: Far background — very fine lacework
  {
    float sf = 5.0;
    vec2 p = uv * sf + vec2(t * 0.04, 0.0);

    vec2 growDir7 = rot2(t * 0.08) * vec2(0.0, 1.0);
    float d7 = branchDist(p, vec2(0.0, -0.5), growDir7, 2, 0.22, t * 1.3, 31.1) / sf;

    vec2 growDir8 = rot2(t * 0.06 + 3.1) * vec2(0.0, 1.0);
    float d8 = branchDist(p + vec2(0.5, 0.0), vec2(-0.3, -0.5), growDir8, 2, 0.18, t * 1.3, 41.3) / sf;

    float allDist3 = min(d7, d8);

    vec3 farColor = palette(
      allDist3 * 4.0 + paletteShift + 0.5,
      vec3(0.2, 0.3, 0.45),
      vec3(0.15, 0.25, 0.40),
      vec3(0.6, 0.8, 1.0),
      vec3(0.0, 0.1, 0.35)
    );

    float farBranch = smoothstep(0.001, 0.0, allDist3);
    float farGlow = smoothstep(0.015, 0.0, allDist3);

    // Treble activates fine detail
    float trebleAct = smoothstep(0.05, 0.5, u_treble);
    color += farColor * (farBranch * 0.6 + farGlow * 0.15) * trebleAct;
  }

  // ── Synapse glow at branch tips and intersections ──
  float fbmOverlay = fbm(uv * 4.0 + vec2(t * 0.1, 0.0));
  vec3 synapseColor = palette(
    fbmOverlay + t * 0.03 + paletteShift + 0.4,
    vec3(0.5, 0.6, 0.5),
    vec3(0.3, 0.4, 0.3),
    vec3(0.7, 1.0, 0.8),
    vec3(0.0, 0.1, 0.3)
  );
  color += synapseColor * pow(fbmOverlay * 0.5 + 0.5, 8.0) * u_treble * 0.5;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
