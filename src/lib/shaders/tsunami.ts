import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Tsunami — Massive wave wall viewed from below, translucent water with light refracting through

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Gerstner-inspired wave function
float wave(vec2 p, float freq, float speed, float angle) {
  vec2 dir = vec2(cos(angle), sin(angle));
  return sin(dot(p, dir) * freq + u_time * speed) / freq;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Perspective — looking up at a towering wave
  // Bottom of screen = deep water, top = curling wave crest
  float height = uv.y + 0.5; // 0 to 1
  height = clamp(height, 0.0, 1.0);

  // Wave wall curvature — the wall bends over the viewer
  float wallCurve = pow(height, 0.7);
  float wallPush = sin(uv.x * 2.0 + t * 3.0) * 0.15 * wallCurve;

  // Water surface coords with depth
  float depth = 1.5 / max(wallCurve + 0.1, 0.1);
  vec2 waterUV = vec2(uv.x * depth + wallPush, depth * 0.4 + t * 4.0);

  // Turbulent water surface
  float h = 0.0;
  h += wave(waterUV, 1.8, 1.5, 0.2);
  h += wave(waterUV, 3.2, 1.0, 1.1);
  h += wave(waterUV, 5.0, 2.0, 2.8);
  h += fbm3(waterUV * 0.3) * 0.2;
  h *= (1.0 + u_bass * 0.6);

  // Foam at the crest — white turbulent water
  float foam = smoothstep(0.7, 0.95, height);
  float foamNoise = fbm3(vec2(uv.x * 6.0 + t * 5.0, height * 4.0));
  foam *= smoothstep(-0.1, 0.3, foamNoise);
  foam *= (0.6 + u_treble * 0.6);

  // Light transmission through the wave wall
  float transmission = exp(-depth * 0.15) * wallCurve;
  float lightAngle = sin(uv.x * 3.0 + t * 2.0) * 0.3 + 0.5;
  float lightShaft = exp(-pow(uv.x - lightAngle, 2.0) * 6.0) * transmission;
  lightShaft *= (0.5 + u_mid * 0.6);

  // Internal wave refraction pattern
  float refract = snoise(waterUV * 2.0 + vec2(h * 2.0));
  refract = abs(refract) * wallCurve;

  // Spray particles at the top
  float spray = snoise(vec2(uv.x * 15.0, height * 20.0 - t * 8.0));
  spray = pow(max(spray, 0.0), 5.0) * smoothstep(0.8, 1.0, height) * u_treble;

  // ── Color ──
  // Deep water — dark teal/indigo
  vec3 deepWater = palette(
    t * 0.04 + u_amplitude * 0.2,
    vec3(0.02, 0.05, 0.12),
    vec3(0.03, 0.08, 0.15),
    vec3(0.3, 0.5, 0.8),
    vec3(0.08, 0.15, 0.30)
  );

  // Mid wave — translucent green-blue
  vec3 midWater = palette(
    height * 0.3 + h * 0.15 + t * 0.06,
    vec3(0.05, 0.18, 0.22),
    vec3(0.08, 0.20, 0.28),
    vec3(0.4, 0.7, 0.6),
    vec3(0.05, 0.20, 0.30)
  );

  // Translucent crest — bright aqua/emerald
  vec3 crestWater = palette(
    wallCurve * 0.4 + refract * 0.2 + t * 0.08,
    vec3(0.15, 0.40, 0.35),
    vec3(0.20, 0.35, 0.40),
    vec3(0.5, 0.8, 0.7),
    vec3(0.10, 0.25, 0.35)
  );

  // Build from deep to crest
  vec3 color = mix(deepWater, midWater, wallCurve * 0.7);
  color = mix(color, crestWater, transmission * 0.6);

  // Internal refraction glow
  color += crestWater * refract * 0.25;

  // Light shafts through the wave
  vec3 lightColor = vec3(0.4, 0.75, 0.65);
  color += lightColor * lightShaft * 0.35;

  // Foam overlay at crest
  vec3 foamColor = vec3(0.75, 0.88, 0.90);
  color = mix(color, foamColor, foam * 0.7);

  // Spray particles
  color += vec3(0.8, 0.9, 0.95) * spray * 0.5;

  // Turbulence detail
  float turb = snoise(uv * 8.0 + vec2(t * 3.0));
  turb = abs(turb) * height * 0.08;
  color += crestWater * turb;

  // Vignette — darker at the deep bottom
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;
  color *= 0.7 + height * 0.3;

  gl_FragColor = vec4(color, 1.0);
}
`;
