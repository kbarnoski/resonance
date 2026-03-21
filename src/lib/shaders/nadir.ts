import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Nadir — looking down into cosmic depth, inverse dome of stars.
// A deep well of space opens below with star layers receding
// into infinite depth, creating vertigo-inducing parallax.

float starField(vec2 uv, float scale, float seed) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  if (h < 0.93) return 0.0;
  float radius = 0.03 + 0.04 * fract(h * 31.7);
  float brightness = 0.5 + 0.5 * sin(u_time * (1.0 + h * 4.0) + h * 80.0);
  return smoothstep(radius, 0.0, length(f)) * brightness;
}

float depthRing(vec2 uv, float radius, float width) {
  float d = abs(length(uv) - radius);
  return smoothstep(width, 0.0, d);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Looking straight down into the abyss
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Depth distortion — fisheye looking downward
  float depth = 1.0 / (r + 0.15);
  vec2 deepUv = vec2(cos(angle), sin(angle)) * depth;

  // Slowly rotating star layers at different depths
  float layers = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float layerDepth = 1.0 + fi * 1.5;
    vec2 rotUv = deepUv * layerDepth * rot2(t * 0.1 * (1.0 + fi * 0.3) + fi * 1.2);
    float scale = 20.0 + fi * 15.0;
    layers += starField(rotUv, scale, fi * 33.0) * (1.0 - fi * 0.15);
  }

  // Depth rings — concentric halos receding into the pit
  float rings = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ringR = 0.15 + fi * 0.12 + sin(t + fi) * 0.02;
    float pulse = 0.8 + 0.2 * sin(t * 2.0 + fi * 1.5) * u_bass;
    rings += depthRing(uv, ringR, 0.005 + u_treble * 0.003) * pulse * (1.0 - fi * 0.12);
  }

  // Nebulous glow at the center — the deepest point
  float centerGlow = exp(-r * 4.0) * (0.6 + u_bass * 0.8);
  float fbmWarp = fbm(deepUv * 2.0 + t * 0.3) * 0.5 + 0.5;

  // Swirling dust at the rim
  float dust = fbm(vec2(angle * 3.0 + t * 0.2, r * 4.0 - t * 0.5)) * 0.5 + 0.5;
  dust *= smoothstep(0.1, 0.5, r) * smoothstep(1.0, 0.6, r);

  float paletteShift = u_amplitude * 0.3;

  // Stars — cold distant whites and blues
  vec3 starCol = palette(
    layers + t * 0.05 + paletteShift,
    vec3(0.7, 0.75, 0.85),
    vec3(0.2, 0.2, 0.3),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.05, 0.15)
  );

  // Ring color — deep indigo to violet
  vec3 ringCol = palette(
    r * 2.0 + t * 0.1 + paletteShift,
    vec3(0.3, 0.2, 0.5),
    vec3(0.3, 0.2, 0.4),
    vec3(0.6, 0.3, 0.8),
    vec3(0.1, 0.0, 0.3)
  );

  // Center void glow — warm gold fading to deep blue
  vec3 voidCol = palette(
    fbmWarp + t * 0.08 + paletteShift,
    vec3(0.4, 0.3, 0.6),
    vec3(0.4, 0.3, 0.5),
    vec3(0.5, 0.4, 0.7),
    vec3(0.15, 0.05, 0.25)
  );

  vec3 color = vec3(0.0);
  color += starCol * layers * (0.8 + u_treble * 0.4);
  color += ringCol * rings * (0.5 + u_mid * 0.5);
  color += voidCol * centerGlow;
  color += ringCol * dust * 0.2 * (0.6 + u_mid * 0.4);

  // Deep space ambient
  color += vec3(0.02, 0.01, 0.04);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
