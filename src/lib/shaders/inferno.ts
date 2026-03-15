import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Turbulent fire noise — animated billowing
float fireNoise(vec2 p, float time) {
  // Domain warp for turbulence
  float wx = fbm(p + vec2(time * 0.5, 0.0));
  float wy = fbm(p + vec2(0.0, time * 0.4) + 3.7);
  vec2 warped = p + vec2(wx, wy) * 0.6;
  return fbm(warped + vec2(0.0, -time * 1.2)); // upward flow
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.30;

  // Fire rises from below — ground is at y = -0.4ish
  // uv.y increases upward, fire billows from ground
  float groundY = -0.35 - u_bass * 0.05;
  float above = uv.y - groundY; // 0 at ground, positive upward

  // Perspective: horizontal spread at ground level, tapering with height
  float perspSpread = 1.0 + max(-above, 0.0) * 0.3;

  vec3 color = vec3(0.0);

  // ─── FIRE COLUMNS ───
  // Multiple fire pillars at different x positions, depths
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float pillarX = (fi - 1.5) * 0.55; // spread across screen
    float pillarDepth = fi * 0.25 + 0.5; // depth: 0.5 to 1.25

    // Fire at this pillar: distance-based falloff from center
    float dx = uv.x - pillarX * perspSpread;
    float fireWidth = (0.25 + u_bass * 0.08) / pillarDepth;

    float fireUVx = dx / fireWidth;
    float fireUVy = above * (1.5 + pillarDepth * 0.5);

    // Fire noise lookup
    vec2 fireP = vec2(fireUVx * 0.8 + pillarX * 0.3, fireUVy);
    float fn = fireNoise(fireP * 2.0 + fi * 3.7, t * (0.8 + fi * 0.1));
    fn = fn * 0.5 + 0.5;

    // Fire mask: base at ground, diminishes upward, narrower at top
    float heightMask = smoothstep(1.5, -0.1, above * (1.2 + pillarDepth));
    float widthMask = exp(-fireUVx * fireUVx * 3.0);

    float fireMask = fn * heightMask * widthMask;
    fireMask = max(fireMask, 0.0);

    // Depth fade — farther pillars are dimmer
    float depthFade = 1.0 / pillarDepth;

    // Three zones of fire color:
    // 1. Core: white-yellow (hottest) — high fn values
    float coreT = smoothstep(0.55, 0.9, fn) * widthMask;
    vec3 coreColor = palette(0.1 + paletteShift * 0.3,
      vec3(0.5, 0.4, 0.2),
      vec3(0.5, 0.3, 0.0),
      vec3(1.0, 0.9, 0.5),
      vec3(0.0, 0.05, 0.1));

    // 2. Mid: orange-red
    float midT = smoothstep(0.3, 0.65, fn) * (1.0 - coreT * 0.5);
    vec3 midColor = palette(0.04 + paletteShift * 0.5 + u_mid * 0.03,
      vec3(0.2, 0.05, 0.0),
      vec3(0.3, 0.08, 0.0),
      vec3(1.0, 0.7, 0.2),
      vec3(0.0, 0.1, 0.2));

    // 3. Edge: deep red-black (barely visible)
    float edgeT = smoothstep(0.05, 0.4, fn);
    vec3 edgeColor = palette(0.01 + paletteShift * 0.4,
      vec3(0.08, 0.01, 0.0),
      vec3(0.1, 0.02, 0.0),
      vec3(1.0, 0.3, 0.0),
      vec3(0.0, 0.05, 0.1));

    vec3 fireColor = edgeColor * edgeT;
    fireColor += midColor * midT;
    fireColor += coreColor * coreT * (0.6 + u_treble * 0.3);

    color += fireColor * fireMask * fireMask * depthFade;
  }

  // ─── GROUND / EMBER BED ───
  if (above < 0.05) {
    float groundT = (above - groundY + 0.35);
    float emberN = fbm(vec2(uv.x * 4.0 + t * 0.3, t * 0.5)) * 0.5 + 0.5;
    float ember = smoothstep(0.3, 0.8, emberN);

    vec3 emberColor = palette(0.06 + paletteShift * 0.4,
      vec3(0.15, 0.03, 0.0),
      vec3(0.2, 0.05, 0.0),
      vec3(1.0, 0.6, 0.0),
      vec3(0.0, 0.05, 0.15));

    float groundMask = smoothstep(0.05, -0.1, above);
    color += emberColor * ember * groundMask * (0.5 + u_bass * 0.4);
  }

  // ─── SMOKE / ASH ───
  // Dark smoke rises above the fire, tinting the upper half
  float smokeY = above - 0.3;
  if (smokeY > 0.0) {
    float smokeN = fbm(vec2(uv.x * 1.5, smokeY * 2.0 - t * 0.3)) * 0.5 + 0.5;
    float smoke = smoothstep(0.3, 0.7, smokeN) * exp(-smokeY * 3.0) * 0.25;
    vec3 smokeColor = palette(0.75 + paletteShift,
      vec3(0.02, 0.015, 0.02),
      vec3(0.04, 0.03, 0.035),
      vec3(1.0, 1.0, 1.0),
      vec3(0.5, 0.5, 0.6));
    color += smokeColor * smoke * u_mid;
  }

  // Treble: sparks/embers rising upward
  vec2 sparkUV = vec2(uv.x * 6.0, above * 4.0 - t * 3.0);
  float spark = snoise(sparkUV) * snoise(sparkUV * 2.1 + 5.0);
  float sparks = smoothstep(0.35, 0.5, spark) * exp(-above * 2.5) * max(above, 0.0);
  sparks *= u_treble * 0.2;
  color += vec3(0.6, 0.3, 0.0) * sparks;

  // Vignette — particularly strong at top (smoke swallows edges)
  float vd = length(uv * vec2(1.0, 0.8));
  float vignette = pow(1.0 - smoothstep(0.1, 1.3, vd), 1.8);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
