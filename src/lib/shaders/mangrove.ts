import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
// Distance to a curved segment
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Water background — murky brown-green gradient
  float waterDepth = smoothstep(0.3, -0.5, uv.y);
  vec3 color = palette(
    waterDepth * 0.3 + t * 0.01,
    vec3(0.08, 0.1, 0.06),
    vec3(0.05, 0.06, 0.04),
    vec3(0.3, 0.35, 0.2),
    vec3(0.0, 0.1, 0.05)
  );

  // Water surface line
  float waterLine = 0.0;
  float waterY = snoise(vec2(uv.x * 3.0, t * 0.3)) * 0.03;
  float waterSurface = smoothstep(0.02, 0.0, abs(uv.y - waterY));
  color += vec3(0.15, 0.2, 0.1) * waterSurface * 0.5;

  // Tangled root system — many curved intertwining roots
  float rootDist = 1e6;
  float rootGlow = 0.0;

  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float seed = fi * 5.37 + 1.2;

    // Root origin — spread along top
    vec2 origin = vec2(
      sin(seed * 1.7) * 0.5,
      0.4 + sin(seed * 0.9) * 0.15
    );

    // Root curves downward with organic bends
    vec2 prev = origin;
    for (int j = 0; j < 5; j++) {
      float fj = float(j);
      float bend = snoise(vec2(seed + fj * 0.8, t * 0.06)) * 0.4;
      float dropRate = 0.12 + fj * 0.02;
      vec2 next = prev + vec2(
        bend * 0.15 + sin(t * 0.15 + seed + fj) * 0.02,
        -dropRate
      );

      float thickness = (0.012 - fj * 0.0015) * (1.0 + u_bass * 0.3);
      float d = sdSeg(uv, prev, next) - thickness;
      rootDist = smin(rootDist, d, 0.02);
      prev = next;
    }
  }

  float roots = smoothstep(0.005, -0.002, rootDist);
  float rootEdgeGlow = smoothstep(0.04, 0.0, rootDist);

  // Root color — warm brown bark
  vec3 rootColor = palette(
    rootDist * 3.0 + t * 0.02,
    vec3(0.3, 0.2, 0.1),
    vec3(0.2, 0.12, 0.06),
    vec3(0.6, 0.4, 0.2),
    vec3(0.0, 0.08, 0.05)
  );

  // Submerged roots get greener (algae)
  vec3 algaeRoot = palette(
    rootDist * 2.0 + t * 0.03 + 0.3,
    vec3(0.15, 0.22, 0.08),
    vec3(0.1, 0.15, 0.05),
    vec3(0.4, 0.5, 0.2),
    vec3(0.0, 0.1, 0.0)
  );

  float submerged = smoothstep(waterY + 0.05, waterY - 0.1, uv.y);
  vec3 finalRootColor = mix(rootColor, algaeRoot, submerged * 0.6);

  // Apply roots
  color = mix(color, finalRootColor, roots);
  color += finalRootColor * rootEdgeGlow * 0.15;

  // Underwater murk and debris
  float murk = fbm(uv * 5.0 + vec2(t * 0.08, -t * 0.05));
  color += vec3(0.06, 0.08, 0.03) * murk * submerged * 0.3;

  // Water reflections on roots above waterline
  float aboveWater = 1.0 - submerged;
  float reflection = sin(uv.y * 30.0 + t * 1.5 + uv.x * 10.0) * 0.5 + 0.5;
  reflection = pow(reflection, 4.0);
  color += vec3(0.1, 0.15, 0.08) * reflection * rootEdgeGlow * aboveWater * u_mid * 0.3;

  // Mud/sediment at bottom
  float mud = smoothstep(-0.3, -0.5, uv.y);
  vec3 mudColor = vec3(0.12, 0.09, 0.05);
  color = mix(color, mudColor, mud * 0.5);

  // Life in the roots — treble reactive sparkles
  float life = pow(snoise(uv * 25.0 + t * 2.0) * 0.5 + 0.5, 12.0);
  color += vec3(0.3, 0.4, 0.15) * life * u_treble * 0.4 * submerged;

  // Tidal pulse — bass
  float tidal = sin(uv.x * 8.0 + t * 2.0) * 0.5 + 0.5;
  tidal = pow(tidal, 4.0) * submerged;
  color += vec3(0.08, 0.12, 0.06) * tidal * u_bass * 0.3;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
