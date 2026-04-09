import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Night Forest — tree silhouettes against a dark sky with moonlight
// filtering through. Silver light beams between dark trunks.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Hash for tree placement
float hash1(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.03;

  // Shift scene so ground is at bottom
  vec2 sceneUV = uv + vec2(0.0, 0.1);

  // ── Night sky — dark blue-black with subtle gradient ──
  vec3 skyColor = palette(
    sceneUV.y * 0.5 + 0.3,
    vec3(0.01, 0.012, 0.025),
    vec3(0.008, 0.01, 0.02),
    vec3(0.3, 0.35, 0.6),
    vec3(0.1, 0.1, 0.2)
  );

  // Slight clouds drifting
  float cloudNoise = fbm3(vec2(sceneUV.x * 1.5 + t * 0.15, sceneUV.y * 2.0 + 1.0));
  float clouds = smoothstep(0.0, 0.5, cloudNoise) * smoothstep(-0.1, 0.4, sceneUV.y);
  skyColor += vec3(0.015, 0.018, 0.03) * clouds * 0.5;

  // ── Moon — small bright disc upper area ──
  vec2 moonPos = vec2(0.3 + sin(t * 0.1) * 0.02, 0.35);
  float moonDist = length(sceneUV - moonPos);
  float moon = smoothstep(0.04, 0.035, moonDist);
  float moonGlow = smoothstep(0.4, 0.05, moonDist) * 0.08;

  vec3 moonColor = vec3(0.25, 0.27, 0.30) * moon;
  vec3 moonGlowColor = vec3(0.06, 0.07, 0.10) * moonGlow;

  // ── Tree trunks — dark vertical silhouettes ──
  float treeMask = 0.0;
  float gapMask = 1.0; // Where light can pass between trunks

  // 12 trees at different positions and sizes
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float xPos = hash1(fi * 7.3) * 2.4 - 1.2;
    float trunkWidth = 0.02 + hash1(fi * 13.7) * 0.025;
    float trunkHeight = 0.15 + hash1(fi * 23.1) * 0.25;

    // Slight sway in wind
    float sway = sin(t * 0.8 + fi * 2.0) * 0.005 * (sceneUV.y + 0.3);

    // Trunk shape — vertical rectangle with slight taper
    float xDist = abs(sceneUV.x - xPos - sway);
    float taper = 1.0 - smoothstep(-0.3, trunkHeight, sceneUV.y) * 0.3;
    float trunk = smoothstep(trunkWidth * taper, trunkWidth * taper - 0.005, xDist);
    trunk *= smoothstep(-0.45, -0.35, sceneUV.y); // Ground cutoff
    trunk *= smoothstep(trunkHeight + 0.05, trunkHeight - 0.02, sceneUV.y); // Top cutoff

    treeMask = max(treeMask, trunk);

    // Track gaps between trunks for light beams
    float gapContrib = smoothstep(trunkWidth * 2.0, trunkWidth * 4.0, xDist);
    gapMask *= mix(1.0, gapContrib, trunk > 0.01 ? 1.0 : 0.0);
  }

  // ── Canopy — jagged top edge made from noise ──
  float canopyBase = 0.05 + fbm3(vec2(sceneUV.x * 3.0, 1.0)) * 0.15;
  float canopyNoise = snoise(vec2(sceneUV.x * 8.0 + t * 0.1, 0.0)) * 0.08;
  float canopyEdge = canopyBase + canopyNoise;

  float canopy = smoothstep(canopyEdge + 0.02, canopyEdge - 0.02, sceneUV.y);
  // Only in the upper area where trees are
  canopy *= smoothstep(-0.1, 0.05, sceneUV.y);

  // Combined tree mask
  float forest = max(treeMask, canopy * 0.9);

  // ── Light beams — moonlight filtering through gaps ──
  // Beams come from moon direction, fan downward
  float beamIntensity = 0.0;

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float beamX = hash1(fi * 31.7 + 5.0) * 1.6 - 0.8;
    float beamWidth = 0.015 + hash1(fi * 47.3) * 0.02;

    // Beam is a soft vertical strip — slightly angled from moon
    float angle = (beamX - moonPos.x) * 0.15;
    float bx = sceneUV.x - beamX - angle * (sceneUV.y - moonPos.y);
    float beam = exp(-bx * bx / (beamWidth * beamWidth));

    // Only visible below canopy and above ground
    beam *= smoothstep(canopyEdge + 0.05, canopyEdge - 0.1, sceneUV.y);
    beam *= smoothstep(-0.45, -0.2, sceneUV.y);

    // Attenuated by trees
    beam *= (1.0 - forest * 0.9);

    // Dust particles in beam — subtle shimmer
    float dust = snoise(vec2(sceneUV.x * 20.0, sceneUV.y * 30.0 - t * 0.5 + fi)) * 0.5 + 0.5;
    beam *= (0.7 + dust * 0.3);

    beamIntensity += beam;
  }

  beamIntensity = clamp(beamIntensity, 0.0, 1.0);

  // Beam color — silver/blue moonlight
  vec3 beamColor = vec3(0.12, 0.14, 0.20) * beamIntensity;

  // Bass makes beams pulse brighter
  beamColor *= (0.8 + u_bass * 0.4);

  // ── Forest floor — dark with scattered moonlight patches ──
  float groundRegion = smoothstep(-0.2, -0.4, sceneUV.y);
  float groundNoise = fbm3(vec2(sceneUV.x * 4.0, sceneUV.y * 2.0 + 3.0));
  vec3 groundColor = vec3(0.01, 0.012, 0.008) * (1.0 + groundNoise * 0.3);

  // Moonlight patches on ground
  float groundLight = beamIntensity * smoothstep(-0.25, -0.4, sceneUV.y) * 0.5;
  groundColor += vec3(0.04, 0.05, 0.06) * groundLight;

  // ── Tree silhouette color — not pure black, very dark brown ──
  vec3 treeColor = vec3(0.01, 0.008, 0.006);
  // Slight edge highlight where moonlight catches bark
  float edgeLight = smoothstep(0.0, 0.1, forest) * smoothstep(0.2, 0.0, forest);
  treeColor += vec3(0.03, 0.03, 0.04) * edgeLight;

  // ── Compositing ──
  vec3 color = skyColor;

  // Moon and glow
  color += moonColor;
  color += moonGlowColor;

  // Ground
  color = mix(color, groundColor, groundRegion);

  // Light beams (behind trees)
  color += beamColor;

  // Trees on top — silhouettes
  color = mix(color, treeColor, forest);

  // Treble adds firefly-like specks
  float firefly = pow(fract(snoise(sceneUV * 10.0 + vec2(t * 0.5, t * 0.3)) * 5.0), 15.0);
  float fireflyRegion = (1.0 - forest) * smoothstep(-0.4, 0.0, sceneUV.y) * smoothstep(0.2, -0.1, sceneUV.y);
  color += vec3(0.15, 0.18, 0.08) * firefly * fireflyRegion * u_treble * 0.3;

  // Mid-frequency adds subtle atmosphere
  color += vec3(0.01, 0.012, 0.02) * u_mid * 0.1 * (1.0 - forest);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
