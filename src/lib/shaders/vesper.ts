import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Evening star — central radiant point
  float starDist = r;
  float starRays = pow(abs(cos(a * 4.0 + t * 0.3)), 12.0);
  starRays += pow(abs(cos(a * 4.0 + t * 0.3 + 0.3927)), 20.0) * 0.5;
  float starGlow = exp(-starDist * 6.0) + starRays * exp(-starDist * 3.0) * 0.4;
  starGlow *= (1.0 + u_bass * 0.3);

  // Twilight gradient — dark at top, warm horizon at bottom
  float horizonGrad = smoothstep(0.5, -0.5, uv.y);

  // Sacred geometry: hexagonal star grid in the sky
  vec2 hexUV = rot2(t * 0.05) * uv * 4.0;
  vec3 vor = voronoi(hexUV + t * 0.1);
  float hexPattern = smoothstep(0.05, 0.03, vor.x);
  float hexEdge = smoothstep(0.08, 0.04, vor.y - vor.x);
  hexEdge *= smoothstep(0.1, 0.3, r); // Fade near center

  // Constellation lines connecting stars
  float constellations = 0.0;
  for (int i = 0; i < 7; i++) {
    float seed1 = float(i) * 3.17;
    float seed2 = float(i) * 5.43 + 2.0;
    vec2 star1 = vec2(sin(seed1) * 0.5, cos(seed1 * 1.3) * 0.4 + 0.1);
    vec2 star2 = vec2(sin(seed2) * 0.5, cos(seed2 * 1.3) * 0.4 + 0.1);
    float lineDist = length(uv - star1) + length(uv - star2) - length(star1 - star2);
    constellations += smoothstep(0.02, 0.005, lineDist) * 0.3;
  }

  // Small twinkling stars scattered across the sky
  float twinkle = 0.0;
  for (int i = 0; i < 15; i++) {
    float sx = sin(float(i) * 4.71 + 1.0) * 0.7;
    float sy = cos(float(i) * 3.23 + 2.0) * 0.5 + 0.1;
    vec2 sp = vec2(sx, sy);
    float sd = length(uv - sp);
    float blink = sin(t * (1.5 + float(i) * 0.3) + float(i)) * 0.5 + 0.5;
    twinkle += smoothstep(0.015, 0.003, sd) * blink;
  }
  twinkle *= u_treble * 0.8 + 0.2;

  // Horizon glow — warm light at the bottom edge
  float horizonLight = exp(-(uv.y + 0.3) * (uv.y + 0.3) * 8.0);
  horizonLight *= smoothstep(-0.6, -0.2, uv.y);

  // Radiating sacred circles at cardinal points
  float sacredCircles = 0.0;
  for (int i = 0; i < 4; i++) {
    float ca = float(i) * 1.5708 + t * 0.15;
    vec2 cp = vec2(cos(ca), sin(ca)) * 0.35;
    float cd = abs(length(uv - cp) - 0.06) - 0.003;
    sacredCircles += smoothstep(0.006, 0.0, abs(cd));
  }

  // FBM cloud wisps
  float clouds = fbm(uv * 3.0 + vec2(t * 0.1, 0.0));
  float cloudMask = smoothstep(-0.1, -0.3, uv.y) * smoothstep(-0.6, -0.3, uv.y);

  // Dusk sky palette — deep indigo to warm amber
  vec3 col1 = palette(
    horizonGrad + paletteShift,
    vec3(0.15, 0.1, 0.25),
    vec3(0.35, 0.25, 0.3),
    vec3(0.4, 0.3, 0.7),
    vec3(0.7, 0.2, 0.1)
  );

  // Star / constellation palette — silver / ice blue
  vec3 col2 = palette(
    r * 2.0 + paletteShift + 0.3,
    vec3(0.7, 0.75, 0.85),
    vec3(0.3, 0.3, 0.35),
    vec3(0.8, 0.85, 1.0),
    vec3(0.2, 0.25, 0.4)
  );

  // Horizon warmth — amber / rose
  vec3 col3 = palette(
    uv.x + t * 0.1 + paletteShift + 0.6,
    vec3(0.7, 0.5, 0.3),
    vec3(0.35, 0.3, 0.2),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 color = vec3(0.0);

  // Base twilight sky
  color += col1 * (0.15 + horizonGrad * 0.1);

  // Horizon glow
  color += col3 * horizonLight * 0.8 * (0.7 + u_bass * 0.4);

  // Evening star — the central bright point
  color += col2 * starGlow * 1.5;

  // Hexagonal sacred grid
  color += col2 * hexEdge * 0.4 * (0.5 + u_mid * 0.5);
  color += col2 * hexPattern * 0.6;

  // Constellation lines
  color += col2 * constellations * (0.4 + u_mid * 0.4);

  // Twinkling stars
  color += vec3(1.2, 1.15, 1.0) * twinkle * 1.0;

  // Sacred circles
  color += col3 * sacredCircles * 0.8 * (0.5 + u_treble * 0.5);

  // Cloud wisps at horizon
  color += col3 * abs(clouds) * cloudMask * 0.3;

  // Emissive star core
  float starCore = exp(-r * 12.0);
  color += vec3(1.4, 1.35, 1.2) * starCore * 0.8;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
