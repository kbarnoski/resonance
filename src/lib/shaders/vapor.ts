import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.04;
  float paletteShift = u_amplitude * 0.2;

  // Ethereal dark background — deep and minimal
  float bgGrad = smoothstep(-0.6, 0.6, uv.y);
  vec3 bgBottom = palette(0.72 + paletteShift,
    vec3(0.02, 0.02, 0.04), vec3(0.03, 0.04, 0.06),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.6, 0.7));
  vec3 bgTop = palette(0.68 + paletteShift,
    vec3(0.04, 0.04, 0.06), vec3(0.04, 0.05, 0.08),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  vec3 color = mix(bgBottom, bgTop, bgGrad);

  // Wisp generation — multiple delicate rising tendrils
  float vaporAccum = 0.0;
  float vaporDetail = 0.0;

  for (int w = 0; w < 7; w++) {
    float fw = float(w);
    float wSeed = fw * 13.71;

    // Each wisp has its own origin point along the bottom
    float originX = (fract(sin(wSeed) * 43758.5453) - 0.5) * 1.2;
    float wispWidth = 0.06 + fract(sin(wSeed * 2.3) * 12345.6) * 0.08;

    // Wisp meanders as it rises — gentle S-curves
    float meander1 = sin(uv.y * 3.0 + u_time * 0.3 + fw * 2.0) * 0.08;
    float meander2 = sin(uv.y * 7.0 - u_time * 0.5 + fw * 5.0) * 0.03;
    float meander3 = snoise(vec2(uv.y * 2.0 + fw * 10.0, t + fw)) * 0.05;
    float wispX = originX + meander1 + meander2 + meander3;

    // Turbulence — subtle internal movement
    float turb = snoise(vec2(uv.y * 5.0 + fw * 7.0, u_time * 0.4 + fw * 3.0));
    wispX += turb * 0.02 * u_mid;

    // Distance from wisp center
    float dx = abs(uv.x - wispX);

    // Width varies along the height — thinner at bottom, wisps out at top
    float heightFactor = smoothstep(-0.5, 0.3, uv.y);
    float currentWidth = wispWidth * (0.5 + heightFactor * 1.5);
    currentWidth += snoise(vec2(uv.y * 8.0 + fw * 20.0, t)) * 0.02;

    float wisp = smoothstep(currentWidth, 0.0, dx);

    // Vertical density profile — rises from bottom, dissolves at top
    float riseSpeed = 0.15 + fract(sin(wSeed * 4.7) * 5555.5) * 0.1;
    float birthY = -0.5 + sin(u_time * riseSpeed + fw * 1.7) * 0.1;
    float dissolveY = 0.3 + fract(sin(wSeed * 6.1) * 9999.9) * 0.2;

    wisp *= smoothstep(birthY, birthY + 0.15, uv.y);
    wisp *= smoothstep(dissolveY + 0.1, dissolveY - 0.1, uv.y);

    // Density modulation — fbm makes it appear and disappear
    float densityNoise = fbm(vec2((uv.x - wispX) * 8.0 + fw * 5.0, uv.y * 4.0 - u_time * 0.3));
    wisp *= smoothstep(-0.1, 0.3, densityNoise);

    float opacity = 0.15 - fw * 0.012;
    vaporAccum += wisp * opacity;

    // Fine detail for the wisp interior
    float detail = snoise(vec2(uv.x * 20.0 + fw * 30.0, uv.y * 15.0 - u_time * 0.5));
    detail = smoothstep(0.1, 0.5, detail) * wisp;
    vaporDetail += detail * 0.04;
  }

  // Wisp coloring — very soft, slightly warm or cool shifts
  vec3 vaporColor = palette(vaporAccum * 2.0 + 0.65 + paletteShift,
    vec3(0.25, 0.25, 0.3), vec3(0.12, 0.1, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color = mix(color, vaporColor, clamp(vaporAccum, 0.0, 0.6));

  // Detail adds subtle texture within wisps
  vec3 detailColor = palette(0.7 + paletteShift,
    vec3(0.3, 0.3, 0.35), vec3(0.1, 0.08, 0.08),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color += vaporDetail * detailColor;

  // Soft ambient glow points — light sources beneath the vapor
  for (int g = 0; g < 3; g++) {
    float fg = float(g);
    vec2 glowPos = vec2(
      (fract(sin(fg * 127.1) * 43758.5453) - 0.5) * 0.8,
      -0.45 + fg * 0.05
    );
    float glowDist = length(uv - glowPos);
    float glow = smoothstep(0.4, 0.0, glowDist) * 0.06;

    // Glow pulses gently with bass
    glow *= 0.7 + sin(u_time * 0.5 + fg * 2.0) * 0.15 + u_bass * 0.15;

    vec3 glowCol = palette(fg * 0.2 + 0.6 + paletteShift,
      vec3(0.2, 0.22, 0.3), vec3(0.12, 0.1, 0.1),
      vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
    color += glow * glowCol;
  }

  // Condensation particles — tiny droplets catching light
  float condensation = 0.0;
  for (int c = 0; c < 3; c++) {
    float fc = float(c);
    vec2 dropUV = uv * (30.0 + fc * 15.0);
    dropUV.y -= u_time * (0.2 + fc * 0.1); // slowly falling
    dropUV.x += sin(uv.y * 5.0 + fc * 3.0 + u_time * 0.3) * 2.0;

    float drop = snoise(dropUV + fc * 50.0);
    drop = smoothstep(0.85, 0.95, drop);
    // Only visible where vapor is dense
    drop *= smoothstep(0.05, 0.15, vaporAccum);
    condensation += drop * (0.08 - fc * 0.02);
  }
  vec3 dropColor = palette(0.72 + paletteShift,
    vec3(0.4, 0.42, 0.5), vec3(0.15, 0.12, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color += condensation * dropColor * (0.5 + u_treble * 0.5);

  // Thermal convection currents — very subtle rising distortion
  float thermal = snoise(vec2(uv.x * 6.0, uv.y * 3.0 - u_time * 0.6));
  thermal = smoothstep(0.3, 0.5, thermal) * smoothstep(0.7, 0.5, thermal);
  thermal *= 0.03 * u_mid;
  color += thermal * vaporColor;

  // Dissolution effect at the tops of wisps — they break apart
  float dissolveNoise = fbm(uv * 8.0 + vec2(t, -t * 0.5));
  float dissolve = smoothstep(0.2, 0.5, uv.y) * smoothstep(-0.1, 0.2, dissolveNoise);
  float dissolveParticles = snoise(uv * 25.0 + u_time * 0.8);
  dissolveParticles = smoothstep(0.7, 0.9, dissolveParticles) * dissolve * vaporAccum;
  color += dissolveParticles * vaporColor * 0.2;

  // Very soft overall atmospheric haze
  float haze = smoothstep(-0.5, 0.2, uv.y) * 0.04;
  vec3 hazeColor = palette(0.66 + paletteShift,
    vec3(0.08, 0.08, 0.1), vec3(0.05, 0.04, 0.05),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  color = mix(color, hazeColor, haze);

  // Treble adds sparkle — tiny bright points in the vapor
  float sparkle = snoise(uv * 50.0 + u_time * 2.0);
  sparkle = smoothstep(0.9, 0.98, sparkle) * u_treble * 0.15;
  sparkle *= smoothstep(0.03, 0.1, vaporAccum); // only in vapor
  color += sparkle * dropColor;

  // Bass-reactive subtle breathing — whole scene gently pulses
  float breath = sin(u_time * 0.8) * 0.02 * u_bass;
  color += breath * vaporColor;

  // Dreamlike softness — slight brightness boost in highlights
  color += smoothstep(0.15, 0.3, vaporAccum) * vaporColor * 0.03;

  // Vignette — softer than other shaders for dreamlike quality
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.4;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
