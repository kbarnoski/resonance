import { U, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // ── Layered aurora curtains ──
  // Multiple sine waves creating flowing curtain shapes
  float curtain1 = sin(uv.x * 3.0 + t * 2.0 + sin(uv.y * 2.0 + t) * 1.5);
  float curtain2 = sin(uv.x * 5.0 - t * 1.5 + cos(uv.y * 3.0 - t * 0.7) * 1.2);
  float curtain3 = sin(uv.x * 2.0 + t * 0.8 + sin(uv.y * 4.0 + t * 1.2) * 0.8);

  // Combine curtains with audio reactivity
  float aurora = curtain1 * 0.4 + curtain2 * 0.35 + curtain3 * 0.25;
  aurora = aurora * 0.5 + 0.5;
  aurora = pow(aurora, 2.0 - u_bass * 0.6);

  // Vertical fade — aurora lives in upper region, fades below
  float verticalFade = smoothstep(-0.3, 0.5, uv.y + sin(uv.x * 2.0 + t) * 0.15);

  // ── Star field ──
  vec2 starUV = uv * 8.0;
  vec2 starCell = floor(starUV);
  vec2 starF = fract(starUV) - 0.5;

  float stars = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 cellId = starCell + neighbor;
      // Pseudo-random star position within cell
      vec2 starPos = vec2(
        fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453) - 0.5,
        fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453) - 0.5
      );
      float starDist = length(starF - neighbor - starPos * 0.8);
      // Twinkling
      float twinkle = sin(t * 8.0 + dot(cellId, vec2(12.9, 78.2))) * 0.5 + 0.5;
      twinkle = 0.6 + 0.4 * twinkle;
      float starBright = 0.003 / (starDist * starDist + 0.003) * twinkle;
      // Brighter stars on beat
      starBright *= 1.0 + u_treble * 0.5;
      stars += starBright;
    }
  }
  stars = min(stars, 3.0);

  // ── Color palettes ──
  // Aurora palette — ethereal greens, teals, violets
  vec3 auroraCol1 = palette(
    aurora * 2.0 + uv.x * 0.5 + u_amplitude * 0.3,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.3, 0.8, 0.6),
    vec3(0.1, 0.3, 0.5)
  );

  vec3 auroraCol2 = palette(
    aurora * 1.5 - uv.x * 0.3 + 0.5 + u_mid * 0.2,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.6, 0.4, 0.9),
    vec3(0.2, 0.1, 0.4)
  );

  // Blend aurora colors based on position
  vec3 auroraFinal = mix(auroraCol1, auroraCol2, smoothstep(-0.3, 0.3, uv.x + sin(t) * 0.2));

  // ── Compositing ──
  // Deep sky background
  vec3 skyTop = vec3(0.01, 0.01, 0.04);
  vec3 skyBottom = vec3(0.02, 0.01, 0.02);
  vec3 color = mix(skyBottom, skyTop, uv.y * 0.5 + 0.5);

  // Stars
  vec3 starColor = vec3(0.9, 0.92, 1.0);
  color += starColor * stars * 0.15;

  // Aurora layer
  float auroraIntensity = aurora * verticalFade * (0.6 + u_amplitude * 0.4);
  color += auroraFinal * auroraIntensity * 0.7;

  // Aurora glow — soft light bleeding
  float glowMask = smoothstep(0.0, 0.8, verticalFade) * aurora;
  color += auroraCol1 * glowMask * 0.15;

  // ── Emissive peaks — brightest aurora bands ──
  float hotBand = pow(aurora, 4.0) * verticalFade;
  color += vec3(1.1, 1.2, 1.0) * hotBand * 0.5 * (1.0 + u_bass * 0.5);

  // Subtle radial glow from center
  float centerGlow = exp(-r * 2.5) * 0.06;
  color += auroraCol2 * centerGlow;

  // Vignette
  float vignette = 1.0 - smoothstep(0.6, 1.4, r);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
