import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float bassP = u_bass * 0.4;
  float midP = u_mid * 0.3;

  // Subtle domain warp driven by amplitude
  uv += u_amplitude * 0.08 * vec2(snoise(uv * 3.0 + t), snoise(uv * 3.0 + t + 77.0));

  // Two circle centers oscillate with bass
  float sep = 0.25 + 0.05 * sin(t * 0.7) + bassP * 0.1;
  vec2 c1 = vec2(-sep, 0.0);
  vec2 c2 = vec2( sep, 0.0);

  // Rotate centers slowly
  c1 = rot2(t * 0.3) * c1;
  c2 = rot2(t * 0.3) * c2;

  float rad = 0.45 + 0.05 * sin(t * 1.1) + midP * 0.08;
  float d1 = length(uv - c1) - rad;
  float d2 = length(uv - c2) - rad;

  // Vesica piscis = intersection
  float vesica = max(d1, d2);

  // Inner almond shape glow
  float almond = smoothstep(0.02, -0.15, vesica);

  // Sacred inner patterns
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float innerRings = sin(vesica * 60.0 - t * 4.0 + u_treble * 3.0);
  innerRings = smoothstep(0.3, 0.0, abs(innerRings) * max(0.01, -vesica + 0.1));

  // Radial rays
  float rays = sin(a * 12.0 + t * 2.0 + r * 10.0);
  rays = smoothstep(0.05, 0.0, abs(rays) * r) * smoothstep(0.5, 0.1, r);

  // Fbm textures
  float n = fbm(uv * 5.0 + t * 0.3);
  float n2 = fbm(uv * 8.0 - t * 0.2 + 50.0);

  // Warm golden palette for vesica interior
  vec3 colInner = palette(
    almond * 1.5 + n * 0.4 + u_amplitude * 0.3,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.3),
    vec3(1.0, 0.8, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // Cool blue palette for outer circles
  vec3 colOuter = palette(
    r * 2.0 + n2 * 0.3 + u_amplitude * 0.2 + 0.5,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.3, 0.5, 1.0),
    vec3(0.2, 0.1, 0.0)
  );

  vec3 color = vec3(0.0);

  // Outer circle outlines
  float glow1 = smoothstep(0.02, 0.0, abs(d1)) * 1.2;
  float glow2 = smoothstep(0.02, 0.0, abs(d2)) * 1.2;
  color += colOuter * (glow1 + glow2) * (0.7 + 0.4 * u_mid);

  // Vesica interior glow
  color += colInner * almond * (1.0 + 0.8 * u_bass);

  // Inner concentric rings
  color += colInner * innerRings * 1.5 * (0.6 + 0.5 * u_treble);

  // Radial rays
  color += colOuter * rays * 0.6;

  // Central bright point
  float core = smoothstep(0.08, 0.0, r) * (1.2 + u_amplitude * 0.6);
  color += vec3(1.4, 1.2, 1.0) * core;

  // Emissive edge of vesica
  float vesicaEdge = smoothstep(0.01, 0.0, abs(vesica)) * 2.0;
  color += vec3(1.3, 1.1, 0.9) * vesicaEdge * (0.5 + 0.5 * u_bass);

  // Fbm-based ambient glow
  float ambient = smoothstep(0.8, 0.0, r) * (0.15 + 0.1 * n);
  color += colOuter * ambient * 0.4;

  // Vignette
  color *= smoothstep(1.5, 0.5, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
