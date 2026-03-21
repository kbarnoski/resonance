import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Dancing fire — organic flames rising from the bottom with layered noise.
// Hot white/yellow core, orange mid, red/crimson edges fading to darkness.

// Turbulent fire noise with domain warping for natural flicker
float flameNoise(vec2 p, float time) {
  vec2 warp1 = vec2(
    fbm(p * 1.2 + vec2(time * 0.7, time * 0.3)),
    fbm(p * 1.1 + vec2(-time * 0.5, time * 0.6) + 5.3)
  );
  vec2 warped = p + warp1 * 0.45;
  return fbm(warped * 1.5 + vec2(0.0, -time * 2.0));
}

// Secondary flickering layer — faster, more chaotic
float flickerNoise(vec2 p, float time) {
  vec2 q = vec2(
    snoise(p * 3.0 + vec2(time * 1.5, 0.0)),
    snoise(p * 2.8 + vec2(0.0, time * 1.2) + 7.1)
  );
  return fbm(p * 2.0 + q * 0.35 + vec2(0.0, -time * 3.5));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.2;

  // Ground line — flames rise from here
  float groundY = -0.45 - u_bass * 0.03;
  float above = uv.y - groundY;

  vec3 color = vec3(0.0);

  // ─── LAYER 1: Deep background fire (slow, wide) ───
  {
    vec2 fp = vec2(uv.x * 0.8, above * 0.9);
    float n = flameNoise(fp * 1.8, t * 0.6);
    n = n * 0.5 + 0.5;

    float heightFade = smoothstep(1.8, -0.05, above);
    float widthFade = exp(-uv.x * uv.x * 1.5);
    float mask = n * heightFade * widthFade;
    mask = max(mask, 0.0);

    // Deep crimson/dark red
    vec3 c = palette(n * 0.8 + 0.02 + paletteShift * 0.3,
      vec3(0.12, 0.02, 0.01),
      vec3(0.2, 0.04, 0.01),
      vec3(1.0, 0.4, 0.1),
      vec3(0.0, 0.08, 0.15));

    color += c * mask * mask * 0.6;
  }

  // ─── LAYER 2: Main fire body (medium speed) ───
  {
    vec2 fp = vec2(uv.x * 1.2, above * 1.1);
    float n = flameNoise(fp * 2.2, t * 1.0);
    n = n * 0.5 + 0.5;

    float heightFade = smoothstep(1.2, -0.08, above);
    float widthFade = exp(-uv.x * uv.x * 2.5);
    float mask = n * heightFade * widthFade;
    mask = max(mask, 0.0);

    // Orange/warm fire body
    vec3 c = palette(n * 1.2 + 0.05 + paletteShift * 0.4 + u_mid * 0.02,
      vec3(0.25, 0.08, 0.02),
      vec3(0.35, 0.12, 0.02),
      vec3(1.0, 0.65, 0.25),
      vec3(0.0, 0.06, 0.12));

    color += c * mask * mask * 0.8;
  }

  // ─── LAYER 3: Inner fire (faster, narrow, bright) ───
  {
    vec2 fp = vec2(uv.x * 1.8, above * 1.3);
    float n = flickerNoise(fp * 2.0, t * 1.3);
    n = n * 0.5 + 0.5;

    float heightFade = smoothstep(0.85, -0.05, above);
    float widthFade = exp(-uv.x * uv.x * 5.0);
    float mask = n * heightFade * widthFade;
    mask = max(mask, 0.0);

    // Yellow-orange, brighter
    vec3 c = palette(n * 1.5 + 0.1 + paletteShift * 0.3,
      vec3(0.45, 0.25, 0.05),
      vec3(0.4, 0.2, 0.05),
      vec3(1.0, 0.8, 0.4),
      vec3(0.0, 0.04, 0.08));

    color += c * mask * mask;
  }

  // ─── LAYER 4: Hot core (fastest, very narrow, white-yellow) ───
  {
    vec2 fp = vec2(uv.x * 2.5, above * 1.5);
    float n = flickerNoise(fp * 2.5 + 3.0, t * 1.8);
    n = n * 0.5 + 0.5;

    float heightFade = smoothstep(0.5, -0.03, above);
    float widthFade = exp(-uv.x * uv.x * 10.0);
    float mask = n * heightFade * widthFade;
    mask = max(mask, 0.0);

    // White-yellow hottest core
    float intensity = smoothstep(0.4, 0.85, n);
    vec3 c = mix(
      vec3(1.0, 0.7, 0.2),
      vec3(1.4, 1.25, 0.9),
      intensity
    );

    color += c * mask * mask * (0.7 + u_treble * 0.25);
  }

  // ─── EMBER BED at ground level ───
  {
    float groundMask = smoothstep(0.08, -0.15, above);
    float emberN = fbm(vec2(uv.x * 5.0 + t * 0.4, t * 0.3)) * 0.5 + 0.5;
    float ember = smoothstep(0.25, 0.75, emberN);

    vec3 emberColor = palette(0.04 + paletteShift * 0.3,
      vec3(0.18, 0.04, 0.01),
      vec3(0.25, 0.08, 0.01),
      vec3(1.0, 0.55, 0.1),
      vec3(0.0, 0.06, 0.12));

    color += emberColor * ember * groundMask * (0.6 + u_bass * 0.5);
  }

  // ─── RISING SPARKS ───
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float sx = fract(sin(fi * 173.7) * 43758.5) * 1.4 - 0.7;
    float sy = groundY + mod(fract(sin(fi * 427.3) * 21345.7) * 3.0 + t * (0.4 + fract(fi * 0.31) * 0.6), 2.2);
    sx += sin(t * 3.0 + fi * 4.7) * 0.05 * (1.0 + fract(fi * 0.17) * 0.5);

    float sparkDist = length(uv - vec2(sx, sy));
    float sparkSize = 0.0015 + fract(fi * 0.57) * 0.001;
    float sparkBright = sparkSize / (sparkDist * sparkDist + sparkSize * 0.5);

    float heightRatio = (sy - groundY) / 2.0;
    vec3 sparkColor = mix(vec3(1.2, 0.9, 0.3), vec3(0.8, 0.2, 0.05), heightRatio);
    color += sparkColor * sparkBright * 0.004 * u_treble;
  }

  // ─── SMOKE above the fire ───
  {
    float smokeY = above - 0.5;
    float smokeN = fbm(vec2(uv.x * 1.8, smokeY * 2.5 - t * 0.4)) * 0.5 + 0.5;
    float smoke = smoothstep(0.3, 0.65, smokeN) * smoothstep(0.0, 0.2, smokeY) * exp(-smokeY * 2.5) * 0.2;
    vec3 smokeColor = vec3(0.03, 0.02, 0.015);
    color += smokeColor * smoke * u_mid;
  }

  // ─── Bottom warm glow ───
  float bottomGlow = smoothstep(0.3, -0.5, uv.y) * 0.12;
  color += vec3(0.5, 0.15, 0.03) * bottomGlow * (0.5 + u_amplitude * 0.5);

  // Mid-frequency breathing
  color *= (0.92 + u_mid * 0.1);

  // Bass intensifies fire base
  color *= (0.95 + u_bass * 0.08 * smoothstep(0.3, -0.3, uv.y));

  // Vignette — strong at edges, darker at top
  float vd = length(uv * vec2(0.9, 0.85));
  float vignette = pow(1.0 - smoothstep(0.15, 1.3, vd), 1.6);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
