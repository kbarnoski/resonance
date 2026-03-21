import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float starField(vec2 uv, float density, float seed) {
  vec2 id = floor(uv * density);
  vec2 f = fract(uv * density) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.92, h);
  float radius = 0.02 + 0.05 * fract(h * 37.3);
  float d = length(f);
  float brightness = smoothstep(radius, 0.0, d);
  float twinkle = sin(u_time * (2.0 + h * 10.0) + h * 80.0) * 0.5 + 0.5;
  twinkle = mix(0.3, 1.0, twinkle);
  return star * brightness * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float rotation = u_time * 0.02 + u_bass * 0.1;
  vec2 rotUv = uv * rot2(rotation);

  vec3 color = vec3(0.0);

  // Atmospheric glow at horizon edges
  float atmosGlow = smoothstep(0.3, 1.5, r);
  vec3 atmosColor = palette(
    a * 0.15 + u_time * 0.01,
    vec3(0.02, 0.02, 0.05),
    vec3(0.05, 0.03, 0.08),
    vec3(0.4, 0.2, 0.8),
    vec3(0.0, 0.1, 0.25)
  );
  color += atmosColor * atmosGlow * (0.3 + u_amplitude * 0.5);

  // Zenith glow brightest at center
  float zenithBright = smoothstep(0.8, 0.0, r) * 0.15;
  vec3 zenithCol = palette(
    u_time * 0.015 + u_mid * 0.2,
    vec3(0.5, 0.5, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.5, 0.3, 1.0),
    vec3(0.15, 0.1, 0.3)
  );
  color += zenithCol * zenithBright;

  // Multiple star layers
  float s1 = starField(rotUv, 60.0, 0.0);
  float s2 = starField(rotUv * 1.3, 120.0, 42.0);
  float s3 = starField(rotUv * 0.7, 200.0, 91.0);

  vec3 brightStars = vec3(0.8, 0.85, 1.2) * s1 * (1.5 + u_treble * 2.0);
  vec3 midStars = vec3(1.1, 1.0, 0.9) * s2 * (1.0 + u_treble * 1.0);
  vec3 dimStars = vec3(0.9, 0.8, 0.7) * s3 * 0.6;
  color += brightStars + midStars + dimStars;

  // Milky Way band
  float milkyAngle = a + rotation * 0.5;
  float bandDist = abs(sin(milkyAngle * 0.5 + 0.3)) * r;
  float milkyDensity = smoothstep(0.5, 0.1, bandDist);
  float milkyNoise = fbm(rotUv * 4.0 + u_time * 0.01) * 0.5 + 0.5;
  milkyDensity *= milkyNoise;

  vec3 milkyCol = palette(
    milkyNoise + u_time * 0.005,
    vec3(0.5, 0.5, 0.5),
    vec3(0.2, 0.2, 0.3),
    vec3(0.6, 0.4, 1.0),
    vec3(0.1, 0.15, 0.3)
  );
  color += milkyCol * milkyDensity * (0.15 + u_bass * 0.2);

  // Faint nebula wisps
  float wisp = fbm(rotUv * 2.0 + vec2(u_time * 0.02, 0.0));
  wisp = smoothstep(0.1, 0.5, wisp) * smoothstep(1.5, 0.5, r);
  vec3 wispCol = palette(
    wisp + u_mid * 0.3,
    vec3(0.5, 0.5, 0.5),
    vec3(0.3, 0.2, 0.4),
    vec3(0.8, 0.3, 0.7),
    vec3(0.0, 0.1, 0.2)
  );
  color += wispCol * wisp * 0.08;

  // Audio-reactive pulse
  float pulse = u_amplitude * 0.1 * smoothstep(0.6, 0.0, r);
  color += vec3(0.1, 0.08, 0.15) * pulse;

  gl_FragColor = vec4(color, 1.0);
}
`;
