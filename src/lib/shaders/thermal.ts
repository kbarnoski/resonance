import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Thermal — heat shimmer and rising convection distortion

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // Heat distortion — domain warping that rises upward
  vec2 distUV = uv;
  float distStr = 0.08 + u_mid * 0.06;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float dx = snoise(distUV * (3.0 + fi) + vec2(t * 0.2, -t * (0.5 + fi * 0.2)));
    float dy = snoise(distUV * (3.0 + fi) + vec2(t * 0.3 + 10.0, -t * (0.6 + fi * 0.15)));
    distUV += vec2(dx, dy) * distStr / (1.0 + fi * 0.5);
  }

  // Convection cells — rising columns of warm air
  float cells = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float cellX = (fi - 1.5) * 0.45;
    float dx = uv.x - cellX;
    float width = 0.2 + u_bass * 0.05;
    float columnMask = exp(-dx * dx / (width * width));

    // Rising thermal noise
    vec2 riseUV = vec2(dx * 3.0, uv.y * 2.0 - t * (0.8 + fi * 0.2));
    float rise = fbm(riseUV + fi * 11.0) * 0.5 + 0.5;
    cells += rise * columnMask * (0.6 - fi * 0.08);
  }

  // Background — layered heat haze
  float haze1 = fbm(distUV * 2.0 + vec2(t * 0.1, -t * 0.3));
  float haze2 = fbm(distUV * 4.0 + vec2(-t * 0.15, -t * 0.5) + 7.0);
  float haze = haze1 * 0.6 + haze2 * 0.4;

  // Temperature gradient — hotter at bottom
  float tempGrad = smoothstep(0.6, -0.5, uv.y);

  // Refraction lines — horizontal distortion bands
  float refract = sin(distUV.y * 40.0 + t * 2.0 + snoise(distUV * 5.0) * 3.0);
  refract = refract * refract * 0.15 * tempGrad;

  // Colors — infrared thermal palette
  vec3 coolColor = palette(
    haze * 0.4 + 0.6 + paletteShift,
    vec3(0.15, 0.1, 0.25),
    vec3(0.15, 0.1, 0.2),
    vec3(0.8, 0.5, 0.9),
    vec3(0.55, 0.3, 0.6)
  );

  vec3 warmColor = palette(
    cells * 0.5 + tempGrad * 0.3 + paletteShift,
    vec3(0.4, 0.2, 0.05),
    vec3(0.35, 0.2, 0.05),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 hotColor = palette(
    cells * 0.3 + paletteShift + 0.15,
    vec3(0.55, 0.35, 0.1),
    vec3(0.4, 0.25, 0.0),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.05, 0.1)
  );

  // Compose: blend based on temperature
  vec3 color = mix(coolColor, warmColor, tempGrad * 0.7);
  color = mix(color, hotColor, cells * tempGrad * 0.8);
  color += vec3(refract * 0.3, refract * 0.15, refract * 0.05);

  // Treble: fine shimmer particles
  float shimmer = snoise(distUV * 50.0 + vec2(0.0, -t * 4.0));
  shimmer = pow(max(shimmer, 0.0), 5.0) * u_treble * 0.25 * tempGrad;
  color += vec3(0.5, 0.3, 0.15) * shimmer;

  // Bass: low pulsing warmth
  color += vec3(0.15, 0.05, 0.0) * u_bass * tempGrad * 0.3;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
