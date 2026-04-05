import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Cirrus — High-altitude ice clouds, wispy and delicate against deep blue

// 4-octave fbm for wispy detail
float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Wisp function — elongated, feathery cloud strands
float wisp(vec2 p, float stretch, float speed) {
  vec2 q = vec2(p.x * stretch, p.y);
  q.x += u_time * speed;
  float n = fbm4(q);
  return smoothstep(-0.1, 0.4, n) * smoothstep(0.8, 0.3, n);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // Deep sky gradient — dark at top, slightly lighter at horizon
  float skyGrad = smoothstep(0.6, -0.4, uv.y);

  // Multiple wispy cloud layers at different altitudes
  // Each layer has different wind speed and density

  // High wispy layer — very thin, fast
  vec2 w1UV = uv * 1.5 + vec2(t * 1.2, 0.0);
  w1UV = rot2(0.05) * w1UV;
  float wisp1 = wisp(w1UV, 0.3, 0.06);
  wisp1 *= smoothstep(-0.5, 0.0, uv.y) * smoothstep(0.6, 0.3, uv.y);

  // Mid wispy layer — moderate
  vec2 w2UV = uv * 2.0 + vec2(t * 0.8, 0.2);
  w2UV = rot2(-0.03) * w2UV;
  float wisp2 = wisp(w2UV + vec2(30.0), 0.25, 0.04);
  wisp2 *= smoothstep(-0.3, 0.1, uv.y) * smoothstep(0.5, 0.1, uv.y);

  // Low detail layer — slower, broader
  vec2 w3UV = uv * 0.8 + vec2(t * 0.5, -0.1);
  float wisp3 = wisp(w3UV + vec2(60.0), 0.35, 0.03);
  wisp3 *= smoothstep(-0.2, 0.15, uv.y);

  // Combined cloud density
  float clouds = wisp1 * 0.5 + wisp2 * 0.35 + wisp3 * 0.3;
  clouds = clamp(clouds, 0.0, 1.0);
  clouds *= (0.7 + u_mid * 0.4);

  // Ice crystal shimmer within clouds
  float shimmer = snoise(uv * 20.0 + vec2(t * 3.0, t * 1.5));
  shimmer = pow(max(shimmer, 0.0), 5.0) * clouds * u_treble * 0.4;

  // Subtle iridescence — thin-film interference colors in ice crystals
  float iridescence = sin(clouds * 8.0 + uv.x * 5.0 + t * 2.0) * 0.5 + 0.5;
  iridescence *= clouds * 0.3;

  // Wind streaks — very faint directional lines
  float streak = snoise(vec2(uv.x * 0.2 + t * 0.5, uv.y * 5.0));
  streak = smoothstep(0.3, 0.6, streak) * 0.15;

  // ── Color ──
  // Deep sky — rich dark blue
  vec3 deepSky = palette(
    skyGrad * 0.2 + t * 0.03,
    vec3(0.02, 0.03, 0.12),
    vec3(0.03, 0.05, 0.15),
    vec3(0.3, 0.4, 0.8),
    vec3(0.12, 0.15, 0.35)
  );

  // Horizon sky — slightly warmer
  vec3 horizonSky = palette(
    skyGrad * 0.3 + t * 0.04,
    vec3(0.08, 0.08, 0.16),
    vec3(0.06, 0.07, 0.14),
    vec3(0.5, 0.5, 0.7),
    vec3(0.15, 0.18, 0.32)
  );

  // Cloud color — silvery white with blue tint
  vec3 cloudColor = palette(
    clouds * 0.2 + wisp1 * 0.15 + t * 0.05,
    vec3(0.45, 0.50, 0.60),
    vec3(0.22, 0.25, 0.32),
    vec3(0.6, 0.7, 0.9),
    vec3(0.15, 0.22, 0.40)
  );

  // Iridescent accent — pastel rainbow
  vec3 iriColor = palette(
    iridescence * 2.0 + uv.x * 0.5 + t * 0.2,
    vec3(0.5, 0.5, 0.5),
    vec3(0.15, 0.15, 0.15),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.33, 0.67)
  );

  // Build sky
  vec3 color = mix(deepSky, horizonSky, skyGrad);

  // Wind streaks in sky
  color += deepSky * streak * (0.5 + u_bass * 0.3);

  // Cloud overlay
  color = mix(color, cloudColor, clouds * 0.65);

  // Iridescence in thin cloud areas
  color += iriColor * iridescence * 0.2;

  // Ice shimmer
  color += vec3(0.7, 0.8, 1.0) * shimmer;

  // Subtle glow around cloud edges
  float edge = smoothstep(0.1, 0.3, clouds) - smoothstep(0.3, 0.5, clouds);
  color += cloudColor * edge * 0.15 * (0.5 + u_amplitude * 0.3);

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
