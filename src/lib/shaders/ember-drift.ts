import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Glowing embers drifting upward through dark air.
// Hash-based particle field — warm orange/red sparks trailing faint light.

float hash1(float n) { return fract(sin(n) * 43758.5453); }
vec2 hash2v(float n) {
  return vec2(fract(sin(n) * 43758.5453), fract(sin(n + 1.0) * 27183.8241));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.2;

  vec3 color = vec3(0.012, 0.008, 0.005); // near-black warm background

  // ── Subtle background heat haze ──
  float haze = snoise(uv * 2.0 + vec2(t * 0.3, -t * 0.2)) * 0.5 + 0.5;
  haze *= smoothstep(1.2, 0.0, length(uv));
  color += vec3(0.015, 0.005, 0.002) * haze * (0.5 + u_bass * 0.3);

  // ── Ember particles ──
  float totalGlow = 0.0;
  vec3 emberAccum = vec3(0.0);

  for (int i = 0; i < 35; i++) {
    float fi = float(i);
    float seed = fi * 7.31;

    // Base position — scattered across the view
    float px = hash1(seed) * 2.4 - 1.2;
    float pyBase = hash1(seed + 3.7) * 2.8 - 1.4;

    // Rise speed — each ember drifts upward at its own pace
    float riseSpeed = 0.08 + hash1(seed + 11.2) * 0.14;
    float lifetime = 3.5 + hash1(seed + 5.3) * 3.0;

    // Looping vertical position — wraps around
    float py = pyBase + mod(t * riseSpeed + hash1(seed + 2.1) * lifetime, lifetime) - 0.7;

    // Horizontal drift — gentle sine wobble
    float wobbleFreq = 0.5 + hash1(seed + 8.9) * 1.0;
    float wobbleAmp = 0.03 + hash1(seed + 6.4) * 0.06;
    px += sin(t * wobbleFreq + fi * 1.7) * wobbleAmp;

    // Wind influence from bass
    px += sin(t * 0.4 + py * 2.0) * u_bass * 0.03;

    vec2 particlePos = vec2(px, py);
    float d = length(uv - particlePos);

    // Ember size — varies per particle
    float baseSize = 0.008 + hash1(seed + 14.5) * 0.012;
    float size = baseSize * (0.8 + u_mid * 0.3);

    // Soft glow falloff — inverse square with floor
    float glow = size / (d * d + size * 0.3);

    // Brightness pulsing — each ember flickers
    float flicker = 0.6 + 0.4 * sin(u_time * (2.0 + hash1(seed + 17.3) * 4.0) + fi * 2.3);
    glow *= flicker;

    // Fade at edges of lifetime (top and bottom of travel)
    float fadeIn = smoothstep(-0.7, -0.3, py);
    float fadeOut = smoothstep(1.3, 0.7, py);
    glow *= fadeIn * fadeOut;

    // Per-ember color variation — warm palette from deep red to bright orange
    float colorT = hash1(seed + 20.1);
    vec3 emberColor = palette(
      colorT * 0.3 + paletteShift + 0.05,
      vec3(0.25, 0.08, 0.02),
      vec3(0.25, 0.12, 0.03),
      vec3(1.0, 0.6, 0.2),
      vec3(0.0, 0.05, 0.1)
    );

    // Hotter embers are brighter and more yellow
    float hotness = hash1(seed + 23.7);
    vec3 hotColor = palette(
      colorT * 0.2 + paletteShift + 0.12,
      vec3(0.4, 0.25, 0.08),
      vec3(0.3, 0.2, 0.05),
      vec3(1.0, 0.8, 0.4),
      vec3(0.0, 0.03, 0.08)
    );
    emberColor = mix(emberColor, hotColor, hotness);

    emberAccum += emberColor * glow;
    totalGlow += glow;
  }

  // Scale embers to target brightness range (peak 0.15–0.40)
  color += emberAccum * 0.012;

  // ── Faint trailing wisps behind embers ──
  // Upward-streaming noise that suggests smoke trails
  float trailNoise = snoise(vec2(uv.x * 4.0, uv.y * 2.0 - t * 1.5));
  float trail2 = snoise(vec2(uv.x * 6.0 + 3.0, uv.y * 3.0 - t * 2.0));
  float trails = smoothstep(0.5, 0.9, trailNoise) * smoothstep(0.4, 0.8, trail2);
  trails *= smoothstep(1.0, 0.2, length(uv)) * 0.04;
  vec3 trailColor = palette(
    trailNoise + paletteShift + 0.6,
    vec3(0.06, 0.02, 0.01),
    vec3(0.04, 0.02, 0.01),
    vec3(1.0, 0.5, 0.2),
    vec3(0.0, 0.08, 0.15)
  );
  color += trailColor * trails * (0.5 + u_treble * 0.5);

  // ── Warm ambient glow from below — suggests heat source ──
  float bottomGlow = smoothstep(0.3, -0.8, uv.y);
  bottomGlow *= smoothstep(1.0, 0.0, abs(uv.x) * 1.5);
  color += vec3(0.04, 0.012, 0.003) * bottomGlow * (0.6 + u_bass * 0.4);

  // Vignette — strong edges, maintains dark atmosphere
  float vd = length(uv * vec2(0.9, 0.85));
  float vignette = 1.0 - smoothstep(0.4, 1.3, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
