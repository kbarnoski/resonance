import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Witch Light — will-o'-the-wisps hovering in darkness.
// 5 floating orbs of pale green/blue light with soft glow falloff.
// Slow sine-driven drift, gentle fog backdrop.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // ── Background — deep dark marsh ──
  vec3 bg = vec3(0.008, 0.012, 0.015);
  // Subtle ground fog — lighter near bottom
  float groundFog = smoothstep(0.2, -0.6, uv.y);
  float fogNoise = fbm3(uv * 2.0 + vec2(t * 0.3, 0.0)) * 0.5 + 0.5;
  fogNoise *= groundFog;
  vec3 fogColor = vec3(0.02, 0.025, 0.03);
  bg += fogColor * fogNoise * 0.4;

  vec3 col = bg;

  // ── Will-o'-the-wisps — 5 orbs ──
  for (int i = 0; i < 5; i++) {
    float fi = float(i);

    // Each orb has unique position, speed, and color
    float seed1 = fract(sin(fi * 127.1) * 43758.5);
    float seed2 = fract(sin(fi * 311.7) * 43758.5);
    float seed3 = fract(sin(fi * 197.3) * 43758.5);

    // Base position — spread across the scene
    float bx = (seed1 - 0.5) * 1.2;
    float by = (seed2 - 0.5) * 0.6 - 0.1;

    // Slow sine drift — each orb on its own path
    float driftSpeed = 0.3 + seed3 * 0.4;
    float px = bx + sin(t * driftSpeed + fi * 2.1) * 0.15
                   + sin(t * driftSpeed * 0.6 + fi * 4.3) * 0.08;
    float py = by + cos(t * driftSpeed * 0.8 + fi * 1.7) * 0.1
                   + sin(t * driftSpeed * 0.4 + fi * 3.5) * 0.05;

    vec2 orbPos = vec2(px, py);
    float d = length(uv - orbPos);

    // Breathing pulse — each orb pulses at different rates
    float breathRate = 1.5 + seed1 * 2.0;
    float breath = 0.7 + 0.3 * sin(t * breathRate + fi * 1.5);
    breath *= 0.8 + u_amplitude * 0.3;

    // Glow layers — inner bright core, medium glow, outer haze
    float core = exp(-d * 80.0) * 0.35 * breath;
    float midGlow = exp(-d * 15.0) * 0.12 * breath;
    float outerGlow = exp(-d * 4.0) * 0.03 * breath;

    // Color — mix of pale green, cyan, blue. Each orb slightly different.
    float hueShift = fi * 0.15 + seed3 * 0.3;
    vec3 orbCore = palette(
      hueShift + u_treble * 0.1,
      vec3(0.25, 0.35, 0.30),
      vec3(0.15, 0.20, 0.25),
      vec3(0.4, 0.7, 0.8),
      vec3(0.15, 0.25, 0.3)
    );
    vec3 orbOuter = palette(
      hueShift + 0.2,
      vec3(0.10, 0.18, 0.15),
      vec3(0.10, 0.15, 0.20),
      vec3(0.3, 0.6, 0.7),
      vec3(0.2, 0.3, 0.35)
    );

    // Composite orb glow
    col += orbCore * (core + midGlow * 0.8);
    col += orbOuter * outerGlow;

    // Faint light cast on fog below each orb
    float fogLight = exp(-length(uv - vec2(px, py - 0.3)) * 2.5) * 0.015 * breath;
    col += orbOuter * fogLight * groundFog;
  }

  // ── Ambient particles — tiny motes caught in the light ──
  for (int i = 0; i < 15; i++) {
    float fi = float(i) + 100.0;
    vec2 motePos = vec2(
      fract(sin(fi * 73.1) * 43758.5) * 2.0 - 1.0,
      fract(sin(fi * 149.7) * 43758.5) * 1.2 - 0.6
    );
    // Slow circular drift
    motePos.x += sin(t * 0.5 + fi * 2.0) * 0.05;
    motePos.y += cos(t * 0.4 + fi * 1.5) * 0.04;

    float md = length(uv - motePos);
    float moteBright = 0.00015 / (md * md + 0.00015);
    float moteFlicker = 0.3 + 0.7 * sin(t * 8.0 + fi * 3.0);
    col += vec3(0.08, 0.12, 0.10) * moteBright * moteFlicker * 0.02;
  }

  // Bass adds subtle low-frequency throb to the fog
  col += fogColor * groundFog * fogNoise * u_bass * 0.15;

  // Mid drives subtle overall brightness
  col *= 0.9 + u_mid * 0.1;

  // ── Vignette — heavy, enclosing darkness ──
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  col *= vignette;

  col = clamp(col, 0.0, 0.4);

  gl_FragColor = vec4(col, 1.0);
}
`;
