import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Caldera — volcanic crater with circular depression and lava veins

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  // Polar coordinates from center
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Crater rim — ring shape with noise-distorted edge
  float rimNoise = snoise(vec2(a * 3.0, t * 0.2)) * 0.06;
  float rimRadius = 0.45 + u_bass * 0.05 + rimNoise;
  float rim = smoothstep(rimRadius - 0.04, rimRadius, r) *
              smoothstep(rimRadius + 0.08, rimRadius + 0.02, r);

  // Inner crater floor — dark with lava veins
  float craterFloor = smoothstep(rimRadius - 0.02, rimRadius - 0.08, r);

  // Lava vein network — radial cracks from center
  vec2 lavaUV = uv * rot2(t * 0.05);
  float veins = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 vUV = lavaUV * (1.5 + fi * 0.8) + fi * 5.3;
    float n1 = fbm(vUV + vec2(t * 0.1, 0.0));
    float n2 = fbm(vUV * 1.5 + vec2(0.0, t * 0.15) + 3.7);
    float vein = abs(n1 - n2);
    vein = smoothstep(0.02, 0.0, vein) * (1.0 - fi * 0.15);
    veins += vein;
  }
  veins = clamp(veins, 0.0, 1.0) * craterFloor;

  // Central magma pool — pulsing glow at center
  float magmaR = 0.12 + u_bass * 0.04 + snoise(vec2(a * 2.0, t)) * 0.03;
  float magma = smoothstep(magmaR + 0.04, magmaR - 0.02, r);
  float magmaTurb = fbm(uv * 6.0 + vec2(t * 0.3, -t * 0.2)) * 0.5 + 0.5;

  // Outer terrain — rocky slopes
  float terrain = fbm(uv * 3.0 + vec2(t * 0.02)) * 0.5 + 0.5;
  float outerSlope = smoothstep(rimRadius + 0.02, rimRadius + 0.4, r);

  // Colors
  // Lava veins — bright orange-yellow
  vec3 lavaColor = palette(
    veins * 0.4 + t * 0.1 + paletteShift,
    vec3(0.5, 0.2, 0.0),
    vec3(0.5, 0.3, 0.0),
    vec3(1.0, 0.7, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Crater floor — dark basalt
  vec3 floorColor = palette(
    terrain * 0.3 + paletteShift,
    vec3(0.06, 0.04, 0.03),
    vec3(0.04, 0.03, 0.02),
    vec3(0.5, 0.4, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Magma pool — white-hot center fading to red
  vec3 magmaColor = palette(
    magmaTurb * 0.5 + paletteShift + 0.2,
    vec3(0.6, 0.3, 0.05),
    vec3(0.4, 0.2, 0.0),
    vec3(1.0, 0.6, 0.1),
    vec3(0.0, 0.08, 0.15)
  );

  // Rim color — warm-lit rock
  vec3 rimColor = palette(
    rim * 0.5 + a * 0.1 + paletteShift,
    vec3(0.2, 0.12, 0.08),
    vec3(0.15, 0.1, 0.05),
    vec3(0.8, 0.6, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // Outer terrain
  vec3 outerColor = palette(
    terrain * 0.4 + paletteShift,
    vec3(0.1, 0.08, 0.06),
    vec3(0.08, 0.06, 0.04),
    vec3(0.6, 0.5, 0.35),
    vec3(0.05, 0.08, 0.15)
  );

  // Compose scene
  vec3 color = floorColor * craterFloor;
  color += lavaColor * veins * (0.7 + u_mid * 0.5);
  color += magmaColor * magma * magmaTurb * (0.8 + u_bass * 0.6);
  color = mix(color, rimColor, rim);
  color = mix(color, outerColor, outerSlope);

  // Treble: heat sparks rising from lava
  float sparks = snoise(vec2(a * 8.0, r * 20.0 - t * 3.0));
  sparks = pow(max(sparks, 0.0), 6.0) * craterFloor * u_treble * 0.5;
  color += vec3(0.7, 0.4, 0.1) * sparks;

  // Ambient glow from center
  float glow = exp(-r * 3.0) * (0.15 + u_bass * 0.15);
  color += vec3(0.4, 0.1, 0.0) * glow;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
