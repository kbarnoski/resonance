import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Layered fbm for phantom wisps
float wispNoise(vec2 p, float seed) {
  return fbm(p + fbm(p + seed) * 0.8);
}

// Phantom form at a given depth layer
float phantomForm(vec2 p, float depth, float seed, float time) {
  // Domain warp to make them wispy/translucent
  vec2 warped = p + vec2(
    fbm(p * 1.5 + seed + time * 0.07),
    fbm(p * 1.5 + seed + 3.7 + time * 0.05)
  ) * 0.4;

  float n = wispNoise(warped * (1.5 + depth * 0.4) + seed, time * 0.1);
  // Threshold to create form — NOT a solid: leave holes
  float form = smoothstep(0.15, 0.55, n * 0.5 + 0.5);
  // Erode with secondary noise for ethereal holes
  float erode = smoothstep(0.4, 0.7, fbm(warped * 3.0 - seed + time * 0.12) * 0.5 + 0.5);
  return form * (1.0 - erode * 0.7);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.29;

  // Slow drift of whole scene
  float driftX = sin(t * 0.3) * 0.05;
  float driftY = cos(t * 0.23) * 0.04;
  vec2 baseUV = uv + vec2(driftX, driftY);

  vec3 color = vec3(0.0); // absolute darkness as base
  float totalOpacity = 0.0;

  // 6 depth layers of phantoms
  // Each layer: different scale, drift speed, opacity
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float depth = fi * 0.18 + 0.1; // 0.1 near, 1.1 far
    float layerScale = 1.0 + depth * 1.2;
    float seed = fi * 4.371;

    // Each layer drifts independently — slow, aimless
    float layerDrift = t * (0.03 + fi * 0.008);
    vec2 layerUV = baseUV * layerScale + vec2(
      cos(fi * 2.1 + t * 0.07) * 0.1,
      sin(fi * 1.7 + t * 0.05) * 0.08
    );
    layerUV.y += layerDrift * 0.12; // drift upward slightly

    float form = phantomForm(layerUV, depth, seed, t);

    // Depth fade: far phantoms are fainter
    float depthFade = exp(-depth * 1.4) * (0.6 + u_mid * 0.2);

    // Opacity: never fully opaque — always translucent
    float layerOpacity = form * depthFade * (0.25 + u_amplitude * 0.15);

    // Color for this layer — cold, deathly
    // Near layers: pale cold blue-white
    // Far layers: deep violet, barely there
    float hue = 0.62 + depth * 0.12 + paletteShift + u_mid * 0.08;
    vec3 layerColor = palette(hue,
      vec3(0.0, 0.0, 0.02),
      vec3(0.08, 0.06, 0.15),
      vec3(1.0, 1.0, 1.0),
      vec3(0.5, 0.6, 0.8));

    // Treble: hot cold core — brightest wisps get a white-blue spike
    float coreBright = smoothstep(0.5, 0.8, form) * u_treble * 0.15 * depthFade;
    vec3 coreColor = palette(0.58 + paletteShift,
      vec3(0.05, 0.05, 0.1),
      vec3(0.2, 0.18, 0.3),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.2, 0.5));

    // Bass: makes close phantoms heavier, more opaque
    float bassBoost = (1.0 - depth) * u_bass * 0.2;

    color += layerColor * (layerOpacity + bassBoost * form * depthFade);
    color += coreColor * coreBright;
  }

  // Background: absolute black. A few phantom wisps in extreme far distance
  // Far background: very faint noise smear at depth ~ infinity
  vec2 farUV = baseUV * 3.5;
  float farWisp = fbm(farUV + t * 0.04) * 0.5 + 0.5;
  farWisp = smoothstep(0.55, 0.72, farWisp) * 0.025;
  vec3 farColor = palette(0.75 + paletteShift,
    vec3(0.0),
    vec3(0.02, 0.01, 0.05),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.5, 0.7));
  color += farColor * farWisp;

  // Vignette — edges bleed into nothing
  float vd = length(uv);
  float vignette = pow(1.0 - smoothstep(0.2, 1.5, vd), 1.8);
  color *= vignette;

  // Overall darkness — these are barely visible
  color = pow(color, vec3(0.85));

  gl_FragColor = vec4(color, 1.0);
}`;
