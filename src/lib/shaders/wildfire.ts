import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + VORONOI + `
// Wildfire — organic fire spreading horizontally across a surface.
// Tendrils branching and consuming. Embers drift upward. Deep red/orange against smoke.

// Horizontal fire spread noise — biased to move outward from center
float spreadNoise(vec2 p, float time) {
  vec2 warp = vec2(
    fbm(p * 0.9 + vec2(time * 0.6, time * 0.15)),
    fbm(p * 0.85 + vec2(-time * 0.3, time * 0.45) + 4.2)
  );
  return fbm(p * 1.2 + warp * 0.55 + vec2(time * 0.3, 0.0));
}

// Tendril-like branching pattern
float tendrilField(vec2 p, float time) {
  float n = 0.0;
  float amp = 0.6;
  mat2 m = rot2(0.4);
  for (int i = 0; i < 5; i++) {
    float s = snoise(p + vec2(time * 0.2, 0.0));
    // Create sharp ridge lines from noise
    n += amp * (1.0 - abs(s));
    p = m * p * 2.1;
    amp *= 0.5;
  }
  return n;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.25;

  vec3 color = vec3(0.0);

  // ─── BASE SPREAD PATTERN ───
  // Fire spreads outward from multiple seed points
  vec2 spreadUV = uv * rot2(t * 0.02);

  float spread = spreadNoise(spreadUV * 2.5, t);
  spread = spread * 0.5 + 0.5;

  // ─── TENDRIL NETWORK ───
  // Branching fire lines that crawl across the surface
  float tendrils = tendrilField(uv * 3.0 + vec2(t * 0.15, t * 0.08), t * 0.8);
  tendrils = smoothstep(0.4, 1.1, tendrils);

  // ─── VORONOI cracks — fire travels along surface cracks ───
  vec3 vor = voronoi(uv * 4.0 + vec2(t * 0.2, t * 0.1));
  float cracks = smoothstep(0.12, 0.02, vor.y - vor.x);

  // Combined fire pattern
  float fireIntensity = spread * 0.5 + tendrils * 0.4 + cracks * 0.3;
  fireIntensity *= (0.7 + u_bass * 0.4);

  // ─── FIRE FRONT — the leading edge burns brightest ───
  float edgeBright = smoothstep(0.35, 0.55, fireIntensity) - smoothstep(0.55, 0.75, fireIntensity);
  edgeBright = max(edgeBright, 0.0);

  // ─── COLOR LAYERS ───
  // 1. Smoldering ground — dark charred areas
  {
    float charMask = smoothstep(0.6, 0.9, fireIntensity);
    vec3 charColor = palette(vor.x + paletteShift * 0.2,
      vec3(0.03, 0.02, 0.015),
      vec3(0.04, 0.02, 0.01),
      vec3(0.5, 0.3, 0.2),
      vec3(0.0, 0.05, 0.1));
    color += charColor * charMask * 0.3;
  }

  // 2. Deep red fire body
  {
    float bodyMask = smoothstep(0.3, 0.7, fireIntensity);
    vec3 bodyColor = palette(spread * 0.8 + 0.03 + paletteShift * 0.4,
      vec3(0.2, 0.03, 0.01),
      vec3(0.25, 0.06, 0.01),
      vec3(1.0, 0.35, 0.1),
      vec3(0.0, 0.08, 0.15));
    color += bodyColor * bodyMask * bodyMask * 0.9;
  }

  // 3. Orange-bright active fire
  {
    float activeMask = smoothstep(0.45, 0.7, fireIntensity) * (0.5 + tendrils * 0.5);
    vec3 activeColor = palette(tendrils * 0.6 + 0.06 + paletteShift * 0.3 + u_mid * 0.02,
      vec3(0.35, 0.1, 0.02),
      vec3(0.3, 0.12, 0.02),
      vec3(1.0, 0.65, 0.2),
      vec3(0.0, 0.05, 0.1));
    color += activeColor * activeMask * 0.8;
  }

  // 4. Bright fire edge — the leading front
  {
    vec3 edgeColor = mix(
      vec3(1.0, 0.5, 0.1),
      vec3(1.3, 0.95, 0.4),
      edgeBright
    );
    color += edgeColor * edgeBright * (0.6 + u_treble * 0.3);
  }

  // 5. Hot crack glow
  {
    vec3 crackGlow = mix(vec3(0.8, 0.25, 0.05), vec3(1.2, 0.7, 0.2), cracks);
    color += crackGlow * cracks * fireIntensity * 0.5;
  }

  // ─── DRIFTING EMBERS — float upward from the fire ───
  float embers = 0.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    // Seed positions scattered across the fire area
    vec2 seed = vec2(
      fract(sin(fi * 127.1) * 43758.5) * 2.0 - 1.0,
      fract(sin(fi * 311.7) * 43758.5) * 2.0 - 1.0
    );

    // Embers rise and drift sideways with time
    float phase = fract(t * 0.3 + fract(fi * 0.37));
    float rise = phase * 1.5;
    float drift = sin(t * 1.5 + fi * 2.3) * 0.15 * phase;

    vec2 ePos = seed * 0.5 + vec2(drift, rise - 0.3);
    ePos.y = mod(ePos.y + 0.8, 2.0) - 0.8;

    float eDist = length(uv - ePos);
    float eSize = 0.002 + fract(fi * 0.73) * 0.001;
    float eBright = eSize / (eDist * eDist + eSize * 0.3);

    // Embers fade as they rise
    float eFade = 1.0 - smoothstep(0.0, 1.2, ePos.y + 0.3);
    // Flicker
    float eFlicker = 0.5 + 0.5 * sin(t * 8.0 + fi * 11.3);

    embers += eBright * eFade * eFlicker;
  }
  vec3 emberColor = vec3(1.0, 0.55, 0.15);
  color += emberColor * embers * 0.003;

  // ─── SMOKE LAYER — dark haze drifting above ───
  {
    float smokeN = fbm(vec2(uv.x * 1.5 + t * 0.3, uv.y * 2.0 - t * 0.2)) * 0.5 + 0.5;
    float smokeMask = smoothstep(0.0, 0.6, uv.y + 0.3) * 0.15;
    float smoke = smoothstep(0.35, 0.7, smokeN) * smokeMask;
    vec3 smokeColor = vec3(0.04, 0.025, 0.02);
    color = mix(color, smokeColor, smoke * 0.6);
  }

  // ─── Global modulation ───
  // Bass pulses the whole fire
  color *= (0.9 + u_bass * 0.12);
  // Mid adds warmth
  color *= (0.95 + u_mid * 0.08);

  // Vignette
  float vd = length(uv * vec2(0.95, 0.9));
  float vignette = pow(1.0 - smoothstep(0.2, 1.35, vd), 1.5);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
