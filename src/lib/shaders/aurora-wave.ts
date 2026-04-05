import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Aurora Wave — Curtains of aurora light rippling vertically
// like cosmic silk, green/violet/pink bands undulating.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Single aurora curtain band
float curtain(vec2 uv, float xOffset, float freq, float t, float phase) {
  // Vertical undulation — the curtain ripples
  float wave = sin(uv.y * freq + t * 0.8 + phase) * 0.12;
  wave += sin(uv.y * freq * 1.7 + t * 1.2 + phase * 2.0) * 0.06;
  wave += snoise(vec2(uv.y * 3.0 + phase, t * 0.3)) * 0.05;

  float x = uv.x - xOffset - wave;

  // Curtain thickness — thin sheet of light
  float curtainShape = exp(-x * x * 80.0);

  // Vertical intensity variation — brighter at mid-height, fading at edges
  float vertFade = smoothstep(-0.6, -0.1, uv.y) * smoothstep(0.7, 0.2, uv.y);

  // Brightness flicker along the curtain
  float flicker = 0.6 + 0.4 * sin(uv.y * 12.0 + t * 2.0 + phase * 5.0);
  flicker *= 0.7 + 0.3 * snoise(vec2(uv.y * 5.0, t * 0.6 + phase));

  return curtainShape * vertFade * flicker;
}

// Ray structure within the curtain — vertical rays
float rays(vec2 uv, float xOffset, float t, float phase) {
  float wave = sin(uv.y * 4.0 + t * 0.8 + phase) * 0.12;
  float x = uv.x - xOffset - wave;

  // Many thin vertical rays
  float rayPattern = sin(x * 120.0 + uv.y * 2.0 + t * 0.5) * 0.5 + 0.5;
  rayPattern = pow(rayPattern, 4.0);

  float envelope = exp(-x * x * 40.0);
  float vertFade = smoothstep(-0.6, 0.0, uv.y) * smoothstep(0.7, 0.1, uv.y);

  return rayPattern * envelope * vertFade * 0.3;
}

// Background stars
float starField(vec2 uv) {
  vec2 id = floor(uv * 80.0);
  vec2 f = fract(uv * 80.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.94, h);
  float radius = 0.02 + 0.04 * fract(h * 31.0);
  float twinkle = 0.5 + 0.5 * sin(u_time * (2.0 + h * 8.0) + h * 60.0);
  return star * smoothstep(radius, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;

  float paletteShift = u_amplitude * 0.2;

  // ── Background — deep dark sky ──
  vec3 color = vec3(0.01, 0.01, 0.03);

  // Stars
  float s = starField(uv);
  color += vec3(0.8, 0.85, 1.0) * s * 0.8;

  // ── Aurora curtains — 5 overlapping bands ──
  // Curtain 1: main green curtain, center-left
  float c1 = curtain(uv, -0.15, 3.5, t, 0.0);
  float r1 = rays(uv, -0.15, t, 0.0);
  c1 *= (0.8 + u_bass * 0.6);

  // Curtain 2: violet, center-right
  float c2 = curtain(uv, 0.2, 4.2, t, 2.0);
  float r2 = rays(uv, 0.2, t, 2.0);
  c2 *= (0.7 + u_mid * 0.5);

  // Curtain 3: pink, far right
  float c3 = curtain(uv, 0.45, 3.0, t * 0.9, 4.5);
  c3 *= 0.6;

  // Curtain 4: teal, far left
  float c4 = curtain(uv, -0.4, 3.8, t * 1.1, 6.0);
  c4 *= 0.5;

  // Curtain 5: white highlight
  float c5 = curtain(uv, 0.0, 5.0, t * 0.7, 8.5);
  c5 *= 0.3 * u_treble;

  // ── Colors ──
  // Green aurora — the classic oxygen emission
  vec3 col1 = palette(
    c1 * 0.5 + uv.y * 0.3 + t * 0.02 + paletteShift,
    vec3(0.3, 0.7, 0.3),
    vec3(0.2, 0.4, 0.15),
    vec3(0.4, 0.8, 0.3),
    vec3(0.1, 0.25, 0.1)
  );

  // Violet-purple
  vec3 col2 = palette(
    c2 * 0.5 + uv.y * 0.2 + t * 0.025 + paletteShift + 0.3,
    vec3(0.45, 0.3, 0.6),
    vec3(0.3, 0.2, 0.4),
    vec3(0.6, 0.3, 0.9),
    vec3(0.15, 0.1, 0.35)
  );

  // Pink — nitrogen emission at lower altitude
  vec3 col3 = palette(
    c3 * 0.5 + uv.y * 0.15 + t * 0.015 + paletteShift + 0.6,
    vec3(0.6, 0.35, 0.45),
    vec3(0.3, 0.15, 0.25),
    vec3(0.5, 0.2, 0.4),
    vec3(0.1, 0.05, 0.15)
  );

  // Teal
  vec3 col4 = palette(
    c4 * 0.5 + t * 0.02 + paletteShift + 0.8,
    vec3(0.25, 0.55, 0.5),
    vec3(0.15, 0.3, 0.25),
    vec3(0.3, 0.7, 0.5),
    vec3(0.1, 0.2, 0.15)
  );

  // ── Compose aurora ──
  color += col1 * (c1 + r1) * 1.5;
  color += col2 * (c2 + r2) * 1.2;
  color += col3 * c3 * 1.0;
  color += col4 * c4 * 0.8;
  color += vec3(0.8, 0.9, 1.0) * c5 * 2.0;

  // ── Lower glow — aurora light reflected on atmosphere below ──
  float lowerGlow = smoothstep(-0.1, -0.5, uv.y) * 0.2;
  float totalAurora = c1 + c2 + c3 + c4;
  vec3 reflectCol = mix(col1, col2, 0.5) * 0.3;
  color += reflectCol * lowerGlow * totalAurora;

  // ── Diffuse sky glow — aurora lights up the sky around it ──
  float skyGlow = totalAurora * 0.08 * smoothstep(0.8, 0.0, length(uv));
  color += mix(col1, col2, 0.5) * skyGlow;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  color *= (0.75 + 0.25 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;
