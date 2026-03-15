import { U } from "./shared";

export const FRAG =
  U +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.3;

  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  float tunnel = 0.3 / (radius + 0.001);

  float z = tunnel + t * 0.8;
  float a = angle / 3.14159;

  // Concentric rings + radial lines
  float rings = abs(fract(z * 2.0) - 0.5);
  float radials = abs(fract(a * 4.0) - 0.5);

  float ringGlow = smoothstep(0.08, 0.0, rings);
  float radialGlow = smoothstep(0.1, 0.0, radials);
  float grid = ringGlow + radialGlow * 0.5;

  // Audio-reactive ring pulse
  float bassRing = smoothstep(0.06, 0.0, abs(fract(z * 1.5 - u_bass * 2.0) - 0.5));
  grid += bassRing * u_bass * 0.8;

  // Hue cycling
  float hue = fract(a * 0.5 + t * 0.05 + u_amplitude * 0.2);
  vec3 neonColor;
  neonColor.r = abs(sin(hue * 6.28)) * 0.7 + 0.2;
  neonColor.g = abs(sin((hue + 0.33) * 6.28)) * 0.5;
  neonColor.b = abs(sin((hue + 0.66) * 6.28)) * 0.8 + 0.1;

  // Mid-frequency brightens the color
  neonColor *= 1.0 + u_mid * 0.4;

  float fog = smoothstep(0.0, 3.0, tunnel);

  vec3 color = neonColor * grid * fog;

  // Background glow
  float bgHue = fract(t * 0.025);
  vec3 bgColor = vec3(
    0.03 * abs(sin(bgHue * 6.28)),
    0.02 * abs(sin((bgHue + 0.33) * 6.28)),
    0.05 * abs(sin((bgHue + 0.66) * 6.28))
  );
  color += bgColor * fog * 0.7;
  color += smoothstep(0.5, 0.0, radius) * 0.08;

  // Treble sparkle at ring intersections
  float sparkle = ringGlow * radialGlow * u_treble * 2.0;
  color += vec3(1.0, 0.95, 0.9) * sparkle;

  gl_FragColor = vec4(color, 1.0);
}
`;
