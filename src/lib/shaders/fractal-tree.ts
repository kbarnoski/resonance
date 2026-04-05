import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Distance to a 2D line segment
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Shift origin to bottom center for tree growing upward
  vec2 p = uv;
  p.y += 0.45;

  vec3 color = vec3(0.0);

  // Fractal tree via iterative branching
  // Each branch splits into two, with angle and length ratios
  float branchAngle = 0.45 + sin(t * 0.3) * 0.1 + u_mid * 0.08;
  float lengthRatio = 0.68 + sin(t * 0.2) * 0.05;
  float baseLen = 0.25 + u_bass * 0.02;

  // We trace the tree iteratively using a stack-like approach
  // Process branches level by level: up to 8 levels = 2^8 = 256 branches
  // But we process level by level and accumulate glow

  // Level 0: trunk
  float totalMinDist = 100.0;
  float bestDepth = 0.0;
  float bestParam = 0.0;

  // For each level, we store branch info implicitly via binary path
  // Max 7 levels to keep in budget (2^7 = 128 branches total)
  for (int level = 0; level < 7; level++) {
    float fl = float(level);
    int numBranches = 1;
    for (int k = 0; k < 6; k++) {
      if (k < level) numBranches *= 2;
    }

    float len = baseLen * pow(lengthRatio, fl);
    float thickness = 0.012 * pow(0.7, fl);

    for (int branch = 0; branch < 64; branch++) {
      if (branch >= numBranches) break;

      // Reconstruct branch position from binary encoding
      vec2 pos = vec2(0.0, 0.0);
      float angle = 1.5708; // start pointing up (PI/2)

      // Walk from root to this branch
      int path = branch;
      for (int d = 0; d < 7; d++) {
        if (d >= level) break;
        float dLen = baseLen * pow(lengthRatio, float(d));

        // Wind sway per level
        float sway = sin(t * (1.0 + float(d) * 0.3) + float(d) * 0.5) * 0.03;
        angle += sway;

        vec2 dir = vec2(cos(angle), sin(angle));
        pos += dir * dLen;

        // Branch direction: left or right based on path bit
        int bit = path / 2;
        bit = path - bit * 2;
        float sign_val = (bit == 0) ? -1.0 : 1.0;
        angle += sign_val * branchAngle;
        path /= 2;
      }

      // This branch segment endpoint
      float sway = sin(t * (1.0 + fl * 0.3) + fl * 0.5) * 0.03;
      float endAngle = angle + sway;
      vec2 dir = vec2(cos(endAngle), sin(endAngle));
      vec2 endPos = pos + dir * len;

      // Distance from pixel to this branch segment
      float d = sdSeg(p, pos, endPos);
      d -= thickness; // make it thicker

      if (d < totalMinDist) {
        totalMinDist = d;
        bestDepth = fl;
        bestParam = length(p - pos) / max(len, 0.001);
      }
    }
  }

  // Branch glow
  float branchGlow = exp(-max(totalMinDist, 0.0) * 30.0);
  float branchCore = smoothstep(0.008, 0.0, totalMinDist);

  // Color gradient: trunk is warm, tips are cool
  float depthNorm = bestDepth / 7.0;
  vec3 trunkCol = palette(
    depthNorm * 0.3 + t * 0.2 + paletteShift,
    vec3(0.5, 0.4, 0.3),
    vec3(0.4, 0.3, 0.2),
    vec3(0.8, 0.5, 0.3),
    vec3(0.1, 0.05, 0.0)
  );
  vec3 tipCol = palette(
    depthNorm * 0.5 + t * 0.3 + paletteShift + 0.5,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.7, 1.0, 0.5),
    vec3(0.0, 0.15, 0.4)
  );
  vec3 branchCol = mix(trunkCol, tipCol, depthNorm);

  color += branchCol * branchGlow * 0.4;
  color += branchCol * branchCore * 1.2;

  // Leaf particles at tips (depth > 5)
  if (bestDepth > 4.0) {
    float leafIntensity = (bestDepth - 4.0) / 3.0;
    vec3 leafCol = palette(
      bestParam + t * 0.4 + paletteShift + 0.3,
      vec3(0.5, 0.6, 0.4),
      vec3(0.4, 0.5, 0.3),
      vec3(0.4, 1.0, 0.5),
      vec3(0.1, 0.2, 0.1)
    );
    float leafGlow = branchCore * leafIntensity;
    color += leafCol * leafGlow * 0.5;
  }

  // Background: faint radial gradient
  vec3 bgCol = palette(
    t * 0.08 + paletteShift + 0.7,
    vec3(0.03, 0.03, 0.05),
    vec3(0.02, 0.02, 0.04),
    vec3(0.4, 0.5, 0.8),
    vec3(0.2, 0.1, 0.3)
  );
  color += bgCol * smoothstep(1.2, 0.0, length(uv)) * 0.05;

  // Audio: treble sparkles at tips
  color += tipCol * branchCore * u_treble * 0.5 * depthNorm;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
