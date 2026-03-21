import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Symmetric chalice — mirror on x-axis
  vec2 suv = vec2(abs(uv.x), uv.y);

  // Chalice profile curve:
  // Cup: wide at top, narrowing to stem
  // Stem: thin vertical
  // Base: flared out at bottom
  float cupTop = 0.3;
  float cupBot = -0.05;
  float stemBot = -0.35;
  float baseBot = -0.5;

  // Cup profile — parabolic curve
  float cupY = clamp((uv.y - cupBot) / (cupTop - cupBot), 0.0, 1.0);
  float cupWidth = 0.08 + cupY * cupY * 0.22 + u_bass * 0.02;

  // Stem profile
  float stemY = clamp((uv.y - stemBot) / (cupBot - stemBot), 0.0, 1.0);
  float stemWidth = 0.025 + stemY * 0.02;

  // Base profile — flared
  float baseY = clamp((uv.y - baseBot) / (stemBot - baseBot), 0.0, 1.0);
  float baseWidth = 0.03 + (1.0 - baseY) * (1.0 - baseY) * 0.15;

  // Combine profiles
  float profileWidth;
  if (uv.y > cupBot) {
    profileWidth = cupWidth;
  } else if (uv.y > stemBot) {
    profileWidth = stemWidth;
  } else {
    profileWidth = baseWidth;
  }

  // Distance to chalice edge
  float chaliceDist = suv.x - profileWidth;
  float chaliceEdge = smoothstep(0.012, 0.0, abs(chaliceDist));
  float chaliceInside = smoothstep(0.01, -0.01, chaliceDist);

  // Vertical bounds mask
  float vertMask = step(baseBot, uv.y) * step(uv.y, cupTop);
  chaliceEdge *= vertMask;
  chaliceInside *= vertMask;

  // Liquid light filling the cup
  float liquidLevel = cupBot + (cupTop - cupBot) * (0.6 + 0.15 * sin(t * 2.0) + u_amplitude * 0.2);
  float liquidMask = smoothstep(liquidLevel + 0.02, liquidLevel - 0.02, uv.y);
  liquidMask *= chaliceInside * step(cupBot, uv.y);

  // Liquid surface ripples
  float surface = abs(uv.y - liquidLevel);
  float ripple = sin(uv.x * 40.0 + t * 4.0) * 0.005;
  float surfaceGlow = smoothstep(0.02, 0.0, abs(surface + ripple)) * chaliceInside;

  // Overflowing light — streams down the sides
  float overflow = 0.0;
  for (int i = 0; i < 4; i++) {
    float ox = (float(i) - 1.5) * 0.08;
    float streamX = ox + sin(uv.y * 8.0 + t * 2.0 + float(i) * 1.5) * 0.02;
    float streamDist = abs(uv.x - streamX);
    float stream = smoothstep(0.015, 0.0, streamDist);
    stream *= smoothstep(cupTop, cupTop - 0.05, uv.y);
    stream *= smoothstep(cupTop - 0.4, cupTop, uv.y);
    stream *= (0.5 + 0.5 * sin(uv.y * 20.0 - t * 6.0 + float(i)));
    overflow += stream;
  }
  overflow *= u_mid * 0.8 + 0.2;

  // Rising steam / luminous vapor above the cup
  vec2 steamUV = uv - vec2(0.0, cupTop);
  float steamMask = smoothstep(0.0, 0.05, steamUV.y) * smoothstep(0.4, 0.1, steamUV.y);
  steamMask *= smoothstep(0.2, 0.0, abs(uv.x));
  float steam = fbm(vec2(uv.x * 5.0, uv.y * 3.0 - t * 0.8));
  steam = max(steam, 0.0) * steamMask;

  // Ornamental pattern on the cup (engraved lines)
  float ornament = sin(uv.y * 40.0 + sin(uv.x * 30.0) * 2.0) * chaliceInside;
  ornament = smoothstep(0.7, 0.9, ornament) * 0.3;

  // FBM glow inside the liquid
  float liquidFBM = fbm(uv * 6.0 + t * 0.5);
  float liquidGlow = abs(liquidFBM) * liquidMask;

  // Sacred gold / amber palette for the chalice
  vec3 col1 = palette(
    uv.y * 2.0 + paletteShift,
    vec3(0.6, 0.5, 0.3),
    vec3(0.4, 0.35, 0.2),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.08, 0.15)
  );

  // Liquid light — warm white / cyan
  vec3 col2 = palette(
    liquidFBM + t * 0.3 + paletteShift + 0.4,
    vec3(0.7, 0.75, 0.8),
    vec3(0.4, 0.4, 0.4),
    vec3(0.8, 0.9, 1.0),
    vec3(0.1, 0.2, 0.3)
  );

  // Steam / overflow — ethereal violet / silver
  vec3 col3 = palette(
    steam * 2.0 + paletteShift + 0.7,
    vec3(0.7, 0.65, 0.75),
    vec3(0.3, 0.3, 0.35),
    vec3(0.8, 0.7, 1.0),
    vec3(0.3, 0.2, 0.5)
  );

  vec3 color = vec3(0.0);

  // Chalice body
  color += col1 * chaliceEdge * 1.8 * (0.8 + u_bass * 0.4);
  color += col1 * chaliceInside * 0.15;
  color += col1 * ornament;

  // Liquid light inside
  color += col2 * liquidMask * 0.6 * (0.7 + u_mid * 0.5);
  color += col2 * liquidGlow * 0.8;

  // Surface ripple
  color += vec3(1.3, 1.25, 1.1) * surfaceGlow * 1.5 * (0.5 + u_treble * 0.5);

  // Overflow streams
  color += col3 * overflow * 1.2;

  // Rising steam
  color += col3 * steam * 1.0 * (0.5 + u_treble * 0.5);

  // Warm emissive at liquid surface
  color += vec3(1.4, 1.2, 0.9) * surfaceGlow * liquidMask * 2.0;

  // Subtle glow around the whole chalice
  float aura = exp(-abs(chaliceDist) * 10.0) * vertMask;
  color += col1 * aura * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
