import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.3;
  float bass = u_bass;
  float mid = u_mid;
  float treble = u_treble;
  float amp = u_amplitude;

  // Heat shimmer distortion
  vec2 shimmer = vec2(
    snoise(vec2(uv.y * 8.0 + t, t * 0.7)) * 0.03 * (1.0 + bass * 2.0),
    snoise(vec2(uv.x * 6.0 + t * 0.5, t * 0.3)) * 0.015 * (1.0 + mid)
  );
  vec2 p = uv + shimmer;

  // Horizontal desert wind streaks
  float streaks = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float speed = 1.5 + fi * 0.4 + bass * 0.8;
    float yOff = snoise(vec2(fi * 3.7, t * 0.2)) * 0.6;
    float y = p.y - yOff;
    float streak = exp(-y * y * (15.0 + fi * 5.0));
    float xWave = snoise(vec2(p.x * (3.0 + fi) + t * speed, fi * 2.1));
    streak *= smoothstep(-0.2, 0.3, xWave) * smoothstep(0.8, 0.3, xWave);
    streak *= 0.5 + 0.5 * sin(p.x * (10.0 + fi * 3.0) + t * speed * 2.0);
    streaks += streak * (0.3 + treble * 0.3);
  }

  // Rising heat columns
  float heat = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float xPos = snoise(vec2(fi * 5.3, 0.0)) * 1.2;
    float dx = p.x - xPos;
    float column = exp(-dx * dx * 8.0);
    float rise = fbm(vec2(dx * 4.0, p.y * 3.0 - t * (1.0 + fi * 0.2) - amp));
    column *= smoothstep(-0.1, 0.4, rise);
    heat += column * 0.2;
  }

  // Sand particle drift
  float sand = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 sp = p * (5.0 + fi * 3.0);
    sp.x += t * (2.0 + fi) + bass;
    sp.y += snoise(vec2(sp.x * 0.3, t + fi)) * 0.5;
    float grain = snoise(sp);
    grain = smoothstep(0.5, 0.7, grain) * (0.15 + treble * 0.1);
    sand += grain;
  }

  // Warm desert palette
  float intensity = streaks + heat + sand;
  vec3 hotColor = palette(intensity * 0.6 + t * 0.05,
    vec3(0.1, 0.02, 0.0),
    vec3(0.6, 0.3, 0.1),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.15, 0.2)
  );

  // Horizon glow
  float horizonGlow = exp(-uv.y * uv.y * 4.0) * (0.15 + amp * 0.2);
  hotColor += vec3(0.4, 0.15, 0.02) * horizonGlow;

  vec3 color = hotColor * (0.8 + amp * 0.5);
  color *= 1.0 - 0.3 * length(uv);

  gl_FragColor = vec4(color, 1.0);
}
`;
