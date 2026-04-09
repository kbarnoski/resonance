import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark Nebula — moody deep-space nebula with dark purple/blue cloud masses
// and bright stars poking through. Not a bright cosmos — a brooding one.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Deterministic hash for star placement
float starHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.03;

  // ── Nebula cloud layers — domain-warped fbm3 ──
  vec2 nebUV = uv * 1.8;

  // Warp field for organic cloud shapes
  float warp1 = fbm3(nebUV + vec2(t * 0.15, t * 0.08));
  float warp2 = fbm3(nebUV + vec2(-t * 0.1, t * 0.12) + 4.0);
  vec2 warped = nebUV + vec2(warp1, warp2) * 0.5;

  // Primary nebula density
  float density1 = fbm3(warped);
  float density2 = fbm3(warped * 0.6 + vec2(7.0, 3.0) + t * 0.05);

  // Combined density — controls where nebula is visible
  float nebulaMask = smoothstep(-0.1, 0.4, density1) * 0.7 +
                     smoothstep(-0.2, 0.3, density2) * 0.3;

  // ── Nebula colors — dark purple and deep blue ──
  vec3 nebColor1 = palette(
    density1 * 1.5 + u_amplitude * 0.1,
    vec3(0.04, 0.02, 0.08),
    vec3(0.06, 0.03, 0.10),
    vec3(0.5, 0.3, 0.8),
    vec3(0.2, 0.1, 0.3)
  );

  vec3 nebColor2 = palette(
    density2 * 1.5 + 0.5,
    vec3(0.02, 0.03, 0.07),
    vec3(0.04, 0.04, 0.08),
    vec3(0.3, 0.5, 0.7),
    vec3(0.1, 0.2, 0.4)
  );

  // Blend the two cloud layers
  vec3 nebulaColor = mix(nebColor1, nebColor2, smoothstep(-0.1, 0.3, density2 - density1));

  // ── Brighter nebula filaments — thin bright edges in the clouds ──
  float filament = abs(density1 - density2);
  float filamentBright = smoothstep(0.02, 0.0, filament) * 0.12;
  vec3 filamentColor = vec3(0.15, 0.08, 0.25) * filamentBright;

  // ── Deep space background — near black ──
  vec3 deepSpace = vec3(0.008, 0.006, 0.015);

  // Very subtle gradient — slightly warmer at bottom
  deepSpace += vec3(0.005, 0.002, 0.008) * smoothstep(0.5, -0.5, uv.y);

  // ── Stars — hash-based bright points ──
  float stars = 0.0;
  vec3 starColor = vec3(0.0);

  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    // Star position from hash
    vec2 starPos = vec2(
      starHash(vec2(fi * 1.3, fi * 2.7)) * 2.0 - 1.0,
      starHash(vec2(fi * 3.1, fi * 0.7)) * 2.0 - 1.0
    ) * 0.8;

    float d = length(uv - starPos);

    // Star brightness — twinkling
    float twinkle = sin(t * 3.0 + fi * 4.7) * 0.3 + 0.7;
    float starBright = 0.0015 / (d * d + 0.0002) * twinkle;

    // Dimmer if behind thick nebula
    float nebulaBlock = 1.0 - nebulaMask * 0.7;
    starBright *= nebulaBlock;

    // Treble makes stars flicker brighter
    starBright *= (0.7 + u_treble * 0.5);

    // Star color temperature varies
    float temp = starHash(vec2(fi * 5.3, fi * 9.1));
    vec3 sColor = mix(
      vec3(0.7, 0.8, 1.0),  // Blue-white
      vec3(1.0, 0.9, 0.7),  // Warm white
      temp
    );

    starColor += sColor * starBright;
    stars += starBright;
  }

  stars = clamp(stars, 0.0, 1.0);
  starColor = clamp(starColor, 0.0, 0.4);

  // ── Compositing ──
  vec3 color = deepSpace;

  // Nebula clouds — blend onto deep space based on density
  color = mix(color, nebulaColor, nebulaMask * 0.8);

  // Filament highlights
  color += filamentColor;

  // Bass pumps nebula glow slightly
  color += nebulaColor * 0.08 * u_bass * nebulaMask;

  // Mid-frequency shifts subtle hue in clouds
  color += vec3(0.02, 0.01, 0.04) * u_mid * nebulaMask * 0.15;

  // Stars on top
  color += starColor * 0.5;

  // A couple of brighter "foreground" stars with glow
  float bigStar1 = 0.003 / (length(uv - vec2(0.35, 0.25)) + 0.005);
  float bigStar2 = 0.002 / (length(uv - vec2(-0.4, -0.15)) + 0.004);
  color += vec3(0.25, 0.22, 0.35) * bigStar1 * 0.06;
  color += vec3(0.20, 0.25, 0.35) * bigStar2 * 0.05;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
