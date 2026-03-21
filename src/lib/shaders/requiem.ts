import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
// Funeral music — slow, stately, dark procession of geometric forms,
// candle-like points of light in vast darkness, measured and solemn.

float candleFlame(vec2 uv, vec2 pos, float flicker) {
  vec2 d = uv - pos;
  d.x *= 2.5;
  float dist = length(d);
  float flame = 0.004 / (dist * dist + 0.002);
  float outerGlow = 0.02 / (dist + 0.05);
  float shimmer = 0.8 + 0.2 * sin(flicker * 8.0 + pos.x * 20.0);
  return (flame + outerGlow * 0.3) * shimmer;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Solemn procession pace — slow, measured, bass gives weight
  float processionPhase = t * 0.3;

  // Geometric forms — stately shapes moving in procession
  // Tall rectangles like tombstones or cathedral columns
  float forms = 0.0;
  float formEdges = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float spacing = 0.35;
    float xPos = mod(fi * spacing - processionPhase, 3.5) - 1.75;
    float yPos = -0.05 + sin(fi * 2.7) * 0.05;
    float height = 0.25 + fract(sin(fi * 7.3) * 4567.8) * 0.3;
    float width = 0.04 + fract(sin(fi * 3.1) * 2345.6) * 0.03;

    vec2 formPos = vec2(xPos, yPos);
    float form = sdBox(uv - formPos, vec2(width, height));
    float formShape = smoothstep(0.005, 0.0, form);
    float formOutline = smoothstep(0.015, 0.005, abs(form));

    // Depth — further forms are dimmer and slightly smaller
    float depth = 0.4 + 0.6 * smoothstep(1.75, 0.0, abs(xPos));

    forms += formShape * depth * 0.3;
    formEdges += formOutline * depth;
  }

  // Background — vast darkness with subtle gradient
  float bgNoise = fbm(uv * 1.5 + t * 0.02);
  float bgField = bgNoise * 0.5 + 0.5;

  vec3 bgColor = palette(bgField * 0.15 + paletteShift,
    vec3(0.008, 0.005, 0.012),
    vec3(0.012, 0.008, 0.018),
    vec3(0.5, 0.4, 0.7),
    vec3(0.15, 0.1, 0.3));

  // Form color — dark stone
  vec3 formColor = palette(forms * 0.3 + paletteShift + 0.2,
    vec3(0.025, 0.02, 0.03),
    vec3(0.03, 0.025, 0.035),
    vec3(0.4, 0.35, 0.5),
    vec3(0.1, 0.08, 0.2));

  // Edge color — faint luminous outline
  vec3 edgeColor = palette(t * 0.1 + paletteShift + 0.4,
    vec3(0.03, 0.02, 0.04),
    vec3(0.05, 0.03, 0.06),
    vec3(0.5, 0.4, 0.7),
    vec3(0.15, 0.1, 0.3));

  vec3 color = bgColor;
  color = mix(color, formColor, clamp(forms, 0.0, 1.0));
  color += edgeColor * formEdges * 0.08 * (0.5 + u_mid * 0.5);

  // Candle flames — sparse points of warm light in the darkness
  float candleTotal = 0.0;
  vec3 candleColorTotal = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float cx = (fi - 4.0) * 0.22 + sin(fi * 1.7 + t * 0.1) * 0.02;
    float cy = 0.15 + fract(sin(fi * 5.3) * 3456.7) * 0.15;

    // Procession: candles move with the forms
    cx = mod(cx - processionPhase * 0.5, 2.5) - 1.25;

    float flicker = t * (3.0 + fi * 0.5) + snoise(vec2(fi, t * 2.0)) * 2.0;
    float candle = candleFlame(uv, vec2(cx, cy), flicker);

    // Candle color — warm amber, bass makes them burn brighter
    vec3 cColor = palette(candle * 0.2 + paletteShift + 0.6 + fi * 0.03,
      vec3(0.1, 0.04, 0.01),
      vec3(0.15, 0.06, 0.02),
      vec3(1.0, 0.6, 0.2),
      vec3(0.0, 0.1, 0.2));

    float brightness = 0.3 + u_bass * 0.3;
    float depthFade = smoothstep(1.25, 0.0, abs(cx));
    candleColorTotal += cColor * candle * brightness * depthFade;
    candleTotal += candle * depthFade;
  }

  color += candleColorTotal * 0.02;

  // Light pooling — candles cast faint downward light
  float lightPool = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float px = (fi - 2.0) * 0.35;
    px = mod(px - processionPhase * 0.5, 2.5) - 1.25;
    float poolDist = length((uv - vec2(px, -0.1)) * vec2(1.0, 3.0));
    lightPool += exp(-poolDist * 5.0) * 0.03;
  }

  vec3 poolColor = palette(lightPool * 2.0 + paletteShift + 0.55,
    vec3(0.04, 0.02, 0.01),
    vec3(0.06, 0.03, 0.015),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.1, 0.2));
  color += poolColor * lightPool * (0.4 + u_amplitude * 0.6);

  // Solemn rhythm — slow pulsing of the entire scene with bass
  float solemnPulse = sin(processionPhase * 6.28) * 0.5 + 0.5;
  solemnPulse = pow(solemnPulse, 4.0) * u_bass * 0.06;
  color += edgeColor * solemnPulse;

  // Dust motes — tiny particles visible in candlelight
  float motes = snoise(uv * 20.0 + t * 0.3);
  motes = smoothstep(0.7, 0.95, motes * 0.5 + 0.5);
  float moteIllum = min(candleTotal * 0.2, 0.5);
  color += vec3(motes * moteIllum * 0.02 * u_treble);

  // Ground line — subtle horizon
  float ground = smoothstep(-0.28, -0.32, uv.y);
  float groundLine = smoothstep(0.005, 0.0, abs(uv.y + 0.3));
  color *= 0.8 + ground * 0.2;
  color += edgeColor * groundLine * 0.04;

  // Vignette — the infinite dark surrounding the procession
  float vd = length(uv);
  float vignette = pow(1.0 - smoothstep(0.2, 1.3, vd), 1.8);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
