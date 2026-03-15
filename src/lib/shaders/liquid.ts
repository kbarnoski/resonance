import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Warp intensity driven by bass
  float warpStrength = 1.0 + u_bass * 1.8;

  // --- Level 1: q warp ---
  vec2 q = vec2(
    fbm(uv * 2.0 + vec2(0.0, 0.0) + t * 0.4),
    fbm(uv * 2.0 + vec2(5.2, 1.3) + t * 0.3)
  );

  // --- Level 2: r warp ---
  vec2 r = vec2(
    fbm(uv * 2.0 + q * warpStrength + vec2(1.7, 9.2) + t * 0.2),
    fbm(uv * 2.0 + q * warpStrength + vec2(8.3, 2.8) + t * 0.25)
  );

  // --- Level 3: s warp (third domain warp level) ---
  vec2 s = vec2(
    fbm(uv * 2.0 + r * warpStrength * 0.8 + vec2(3.1, 7.4) + t * 0.15),
    fbm(uv * 2.0 + r * warpStrength * 0.8 + vec2(6.7, 4.1) + t * 0.18)
  );

  // Final fbm with triple-warped coordinates
  float f = fbm(uv * 2.0 + s * warpStrength * 0.6);

  // Ridge lines: cellular boundaries from absolute value
  float ridgeQ = abs(fbm(uv * 3.0 + q * 1.5 + t * 0.1));
  float ridgeR = abs(fbm(uv * 3.0 + r * 1.2 + t * 0.12));
  float ridgeS = abs(fbm(uv * 3.0 + s * 1.0 + t * 0.08));

  // Combine ridges — sharpen to create vein-like boundaries
  float ridges = min(ridgeQ, min(ridgeR, ridgeS));
  float veinMask = 1.0 - smoothstep(0.0, 0.08, ridges);

  // --- Color: multiple palette lookups ---
  // Palette 1: neon green / magenta
  vec3 col1 = palette(
    f * 0.8 + u_mid * 0.5 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 0.5),
    vec3(0.3, 0.2, 0.1)
  );

  // Palette 2: electric blue / gold
  vec3 col2 = palette(
    length(q) * 1.2 + t * 0.3 + paletteShift * 1.5,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.2)
  );

  // Palette 3: deep magenta / cyan highlights
  vec3 col3 = palette(
    length(s) * 1.5 + u_mid * 0.3 + paletteShift * 0.7,
    vec3(0.6, 0.4, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 0.5, 1.0),
    vec3(0.6, 0.0, 0.35)
  );

  // Blend colors across warp layers
  float blend1 = smoothstep(-0.3, 0.5, f);
  float blend2 = smoothstep(0.2, 0.8, length(r));
  vec3 baseColor = mix(col1, col2, blend1);
  baseColor = mix(baseColor, col3, blend2 * 0.6);

  // Modulate brightness by warp pattern
  float intensity = 0.3 + 0.7 * smoothstep(-0.5, 0.8, f);
  baseColor *= intensity;

  // Emissive veins along ridge lines — warm/cool white tinted
  vec3 warmWhite = vec3(1.4, 1.2, 0.9);
  vec3 coolWhite = vec3(0.9, 1.1, 1.5);
  float veinHue = smoothstep(0.0, 1.0, sin(ridges * 20.0 + t * 2.0) * 0.5 + 0.5);
  vec3 veinColor = mix(warmWhite, coolWhite, veinHue);
  baseColor += veinMask * veinColor * (1.5 + u_treble * 1.5);

  // Extra emissive pops on the sharpest ridges
  float sharpRidge = 1.0 - smoothstep(0.0, 0.03, ridges);
  baseColor += sharpRidge * vec3(1.6, 1.3, 1.0) * (0.8 + u_bass * 1.2);

  // Black background: fade at edges
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  vec3 color = baseColor * vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
