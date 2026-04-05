import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Torrent — Rushing water current with turbulent foam patterns and underwater caustics

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Caustic light pattern
float caustic(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.28 * fract(
        sin(vec2(dot(i + g, vec2(127.1, 311.7)), dot(i + g, vec2(269.5, 183.3))))
        * 43758.5453));
      float d = length(f - g - o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Strong directional current — everything flows to the right
  vec2 flowUV = uv;
  flowUV.x -= t * 2.0;

  // Turbulence distortion
  vec2 turb = vec2(
    fbm3(flowUV * 2.0 + vec2(0.0, 10.0)),
    fbm3(flowUV * 2.0 + vec2(10.0, 0.0))
  ) * 0.15;
  turb *= (1.0 + u_bass * 0.5);
  vec2 distorted = flowUV + turb;

  // Water surface — rapids pattern
  float rapids = fbm3(distorted * 3.0);
  float rapids2 = fbm3(distorted * 1.5 + vec2(40.0));

  // Foam — white water in turbulent zones
  float foam = smoothstep(0.15, 0.4, rapids) * smoothstep(0.6, 0.35, rapids);
  foam += smoothstep(0.2, 0.45, rapids2) * 0.4;
  foam = clamp(foam, 0.0, 1.0);
  foam *= (0.5 + u_treble * 0.6);

  // Foam streaks — elongated in flow direction
  float foamStreak = snoise(vec2(distorted.x * 1.0, distorted.y * 6.0));
  foamStreak = smoothstep(0.3, 0.6, foamStreak) * 0.4;

  // Underwater caustics
  vec2 causticUV = distorted * 4.0 + turb * 3.0;
  float c = caustic(causticUV);
  float causticBright = 1.0 - smoothstep(0.0, 0.15, c);
  causticBright = pow(causticBright, 1.5) * 0.5;
  causticBright *= (0.4 + u_mid * 0.5);

  // Current speed variation
  float speed = fbm3(uv * 0.5 + vec2(t * 0.3));
  speed = 0.5 + 0.5 * speed;

  // Splash particles
  float splash = snoise(distorted * 10.0 + vec2(t * 8.0));
  splash = pow(max(splash, 0.0), 6.0) * foam * u_treble * 0.5;

  // ── Color ──
  // Deep water — dark blue-green
  vec3 deepColor = palette(
    speed * 0.3 + t * 0.05,
    vec3(0.03, 0.08, 0.12),
    vec3(0.04, 0.10, 0.15),
    vec3(0.3, 0.6, 0.7),
    vec3(0.08, 0.18, 0.30)
  );

  // Flowing water — teal
  vec3 flowColor = palette(
    rapids * 0.3 + speed * 0.2 + t * 0.06 + u_amplitude * 0.15,
    vec3(0.06, 0.18, 0.22),
    vec3(0.08, 0.20, 0.25),
    vec3(0.4, 0.7, 0.6),
    vec3(0.05, 0.22, 0.32)
  );

  // Foam color — near white with blue tint
  vec3 foamColor = palette(
    foam * 0.2 + t * 0.08,
    vec3(0.60, 0.68, 0.72),
    vec3(0.20, 0.22, 0.25),
    vec3(0.5, 0.7, 0.8),
    vec3(0.12, 0.20, 0.35)
  );

  // Build water
  vec3 color = mix(deepColor, flowColor, speed * 0.6);

  // Caustic light
  color += flowColor * causticBright * 0.4;

  // Foam overlay
  color = mix(color, foamColor, foam * 0.6);
  color = mix(color, foamColor * 0.9, foamStreak * 0.3);

  // Splash particles
  color += vec3(0.8, 0.9, 0.92) * splash;

  // Turbulence detail
  float turbDetail = length(turb) * 5.0;
  color += flowColor * turbDetail * 0.1;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
