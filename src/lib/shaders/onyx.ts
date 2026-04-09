import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Onyx — polished onyx/agate stone surface. Dark with visible banded layers
// of lighter gray and brown swirling through. Subtle light reflections.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.025;

  // ── Domain warping for organic mineral banding ──
  vec2 stoneUV = uv * 2.0;

  // First warp pass — large-scale flow
  float w1 = fbm3(stoneUV + vec2(t * 0.1, t * 0.06));
  float w2 = fbm3(stoneUV + vec2(-t * 0.08, t * 0.07) + 5.0);
  vec2 warped1 = stoneUV + vec2(w1, w2) * 0.6;

  // Second warp — adds complexity to banding
  float w3 = fbm3(warped1 * 0.8 + vec2(t * 0.05, 0.0) + 10.0);
  vec2 warped2 = warped1 + vec2(w3, w3 * 0.7) * 0.3;

  // ── Mineral banding — layered sine waves through warped domain ──
  float band1 = sin(warped2.x * 4.0 + warped2.y * 2.0 + w1 * 3.0) * 0.5 + 0.5;
  float band2 = sin(warped2.x * 2.0 - warped2.y * 5.0 + w2 * 2.5 + 1.5) * 0.5 + 0.5;
  float band3 = sin((warped2.x + warped2.y) * 3.0 + w3 * 4.0 + 3.0) * 0.5 + 0.5;

  // Sharpen bands — onyx has distinct layers, not smooth gradients
  band1 = smoothstep(0.35, 0.65, band1);
  band2 = smoothstep(0.4, 0.6, band2);
  band3 = smoothstep(0.3, 0.7, band3);

  // Combined banding pattern
  float banding = band1 * 0.5 + band2 * 0.3 + band3 * 0.2;

  // ── Stone colors — dark onyx with gray/brown/cream bands ──
  // Dark base
  vec3 darkOnyx = palette(
    banding * 0.3 + u_amplitude * 0.05,
    vec3(0.02, 0.018, 0.022),
    vec3(0.015, 0.012, 0.018),
    vec3(0.4, 0.35, 0.3),
    vec3(0.1, 0.08, 0.12)
  );

  // Lighter band color — warm gray/brown
  vec3 lightBand = palette(
    banding * 1.5 + 0.3,
    vec3(0.10, 0.08, 0.06),
    vec3(0.06, 0.05, 0.04),
    vec3(0.5, 0.4, 0.3),
    vec3(0.05, 0.1, 0.15)
  );

  // Cream/translucent band — the lightest layer
  vec3 creamBand = palette(
    banding * 2.0 + 0.7,
    vec3(0.15, 0.12, 0.09),
    vec3(0.08, 0.06, 0.05),
    vec3(0.6, 0.5, 0.4),
    vec3(0.0, 0.08, 0.12)
  );

  // Mix bands based on banding pattern
  vec3 stoneColor = darkOnyx;
  stoneColor = mix(stoneColor, lightBand, smoothstep(0.3, 0.6, banding));
  stoneColor = mix(stoneColor, creamBand, smoothstep(0.65, 0.85, banding) * 0.6);

  // ── Polished surface — specular-like reflection ──
  // Simulated light source that drifts slowly
  vec2 lightPos = vec2(
    sin(t * 0.4) * 0.3,
    cos(t * 0.3) * 0.2 + 0.1
  );
  float lightDist = length(uv - lightPos);

  // Surface normal approximation from banding gradient
  float dx = fbm3(warped2 + vec2(0.01, 0.0)) - fbm3(warped2 - vec2(0.01, 0.0));
  float dy = fbm3(warped2 + vec2(0.0, 0.01)) - fbm3(warped2 - vec2(0.0, 0.01));
  vec2 normal = normalize(vec2(dx, dy));

  // Specular highlight
  vec2 lightDir = normalize(lightPos - uv);
  float spec = pow(max(dot(normal, lightDir), 0.0), 16.0);
  float specular = spec * 0.12 * smoothstep(1.0, 0.2, lightDist);

  // Broad diffuse glow on surface
  float diffuse = smoothstep(1.2, 0.0, lightDist) * 0.06;

  // ── Surface micro-texture — fine grain of polished stone ──
  float grain = snoise(uv * 30.0 + t * 0.02) * 0.015;

  // ── Compositing ──
  vec3 color = stoneColor;

  // Add grain
  color += vec3(grain);

  // Specular reflection — slightly warm
  color += vec3(0.9, 0.85, 0.75) * specular;

  // Diffuse light
  color += vec3(0.06, 0.05, 0.04) * diffuse;

  // Bass deepens the dark bands
  color *= 1.0 - u_bass * 0.05 * (1.0 - banding);

  // Mid shifts bands subtly
  color += vec3(0.01, 0.008, 0.005) * u_mid * banding * 0.3;

  // Treble sparkles on polished surface
  float sparkle = pow(fract(snoise(warped2 * 12.0) * 5.0), 14.0);
  color += vec3(0.3, 0.28, 0.25) * sparkle * u_treble * 0.08;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
