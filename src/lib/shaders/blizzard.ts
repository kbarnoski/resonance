import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Blizzard — heavy snowstorm with swirling white particles in wind

float snowflake(vec2 uv, float seed) {
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  vec2 rnd = hash2(id + seed);
  vec2 offset = (rnd - 0.5) * 0.6;
  float d = length(f - offset);
  float size = 0.02 + rnd.x * 0.04;
  return smoothstep(size, size * 0.3, d);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.2;

  // Wind direction — mostly horizontal with bass-driven gusts
  float windStr = 1.5 + u_bass * 1.0;
  float windAngle = 0.3 + snoise(vec2(t * 0.3, 0.0)) * 0.2;
  vec2 windDir = vec2(cos(windAngle), sin(windAngle) - 0.3);

  // Blowing snow fog — multiple layers of white-out
  float fog = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float speed = windStr * (0.5 + fi * 0.3);
    float scale = 2.0 + fi * 1.5;
    vec2 fogUV = uv * scale + windDir * t * speed + fi * 7.3;
    fogUV *= rot2(fi * 0.1);
    float layer = fbm(fogUV) * 0.5 + 0.5;
    layer = pow(layer, 1.5);
    fog += layer * (0.35 - fi * 0.04);
  }
  fog = clamp(fog, 0.0, 1.0);

  // Snow particle layers — different depths
  float snow = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float depth = 1.0 + fi * 0.5;
    float fallSpeed = 1.2 + fi * 0.3;
    float driftSpeed = windStr * (0.8 + fi * 0.2);

    vec2 snowUV = uv * (8.0 + fi * 4.0);
    snowUV += vec2(t * driftSpeed, -t * fallSpeed);
    snowUV *= rot2(snoise(vec2(t * 0.1, fi * 3.0)) * 0.3);

    float flake = snowflake(snowUV, fi * 11.0);
    flake *= (1.0 - fi * 0.15) / depth;
    snow += flake;
  }

  // Ground accumulation hint at bottom
  float ground = smoothstep(-0.2, -0.45, uv.y);
  float groundNoise = snoise(vec2(uv.x * 5.0, 0.0)) * 0.04;
  ground = smoothstep(-0.25 + groundNoise, -0.4 + groundNoise, uv.y);

  // Colors — white-out grays and cool blues
  vec3 stormColor = palette(
    fog * 0.3 + paletteShift,
    vec3(0.45, 0.48, 0.52),
    vec3(0.15, 0.15, 0.18),
    vec3(0.6, 0.65, 0.75),
    vec3(0.2, 0.25, 0.35)
  );

  vec3 skyColor = palette(
    uv.y * 0.2 + paletteShift + 0.3,
    vec3(0.3, 0.32, 0.38),
    vec3(0.1, 0.1, 0.14),
    vec3(0.5, 0.55, 0.7),
    vec3(0.25, 0.28, 0.4)
  );

  vec3 groundColor = palette(
    snoise(uv * 3.0) * 0.1 + paletteShift + 0.5,
    vec3(0.6, 0.62, 0.65),
    vec3(0.15, 0.15, 0.15),
    vec3(0.5, 0.55, 0.6),
    vec3(0.2, 0.22, 0.3)
  );

  // Compose
  vec3 color = skyColor;
  color = mix(color, stormColor, fog * 0.7);

  // Snow particles — bright white
  color += vec3(0.9, 0.92, 0.95) * snow * (0.6 + u_treble * 0.5);

  // Ground
  color = mix(color, groundColor, ground);

  // Mid: shifts the fog density
  color = mix(color, stormColor, u_mid * 0.15);

  // Wind streaks — horizontal blur lines
  float streaks = snoise(vec2(uv.x * 2.0 + t * windStr * 2.0, uv.y * 30.0));
  streaks = pow(max(streaks, 0.0), 4.0) * 0.15 * (0.5 + u_bass * 0.5);
  color += vec3(0.7, 0.72, 0.75) * streaks;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
