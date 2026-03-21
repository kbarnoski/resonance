import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Deep ocean abyss — almost total darkness with bioluminescent organisms.
// Distant glowing forms drift through infinite void.
// Deep blue-black with electric blue, green, and purple pulses.

// Hash for pseudo-random per-particle values
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

// Bioluminescent organism — soft glowing sphere with halo
float bioOrg(vec2 uv, vec2 center, float radius, float intensity) {
  float d = length(uv - center);
  // Inner bright core
  float core = exp(-d * d / (radius * radius * 0.3)) * intensity;
  // Outer diffuse halo
  float halo = exp(-d * d / (radius * radius * 2.5)) * intensity * 0.3;
  return core + halo;
}

// Jellyfish-like form — pulsing dome with trailing tendrils
float jellyfish(vec2 uv, vec2 center, float t, float phase) {
  vec2 lp = uv - center;
  float pulse = 0.8 + 0.2 * sin(t * 1.5 + phase);

  // Bell shape — squished ellipse
  vec2 bellP = lp / vec2(0.08 * pulse, 0.06);
  float bell = exp(-dot(bellP, bellP) * 0.5);

  // Trailing tendrils below the bell
  float tendrilY = lp.y + 0.06;
  if (tendrilY > 0.0) {
    float wave = sin(lp.x * 40.0 + t * 2.0 + phase) * 0.005 * tendrilY * 10.0;
    float tendrilX = lp.x + wave;
    float tendrils = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float offset = (fi - 2.0) * 0.015;
      float td = abs(tendrilX - offset);
      float fade = exp(-tendrilY * 8.0);
      tendrils += exp(-td * td * 8000.0) * fade * 0.3;
    }
    bell += tendrils;
  }

  return bell;
}

// Deep water particulate — very faint suspended matter
float deepsea_particles(vec2 uv, float t) {
  float total = 0.0;
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float hx = hash(fi * 13.7);
    float hy = hash(fi * 29.3);
    float hz = hash(fi * 47.1);
    float ht = hash(fi * 67.9);

    // Very slow sinking drift
    vec2 pos = vec2(
      hx * 2.4 - 1.2 + sin(t * 0.1 * ht + fi) * 0.05,
      mod(hy * 2.4 - 1.2 - t * 0.008 * (0.5 + hz), 2.4) - 1.2
    );

    float d = length(uv - pos);
    float size = 0.001 + hz * 0.002;
    float brightness = smoothstep(size, 0.0, d) * 0.15;
    total += brightness;
  }
  return total;
}

// Distant bioluminescent flash — sudden pulse in the deep
float distantFlash(vec2 uv, float t, float seed) {
  float h1 = hash(seed);
  float h2 = hash(seed + 100.0);
  float h3 = hash(seed + 200.0);
  float h4 = hash(seed + 300.0);

  vec2 pos = vec2(h1 * 1.6 - 0.8, h2 * 1.6 - 0.8);
  // Flash timing — long period with brief flash
  float period = 4.0 + h3 * 8.0;
  float flashTime = mod(t + h4 * period, period);
  float flash = exp(-flashTime * flashTime * 2.0);

  float d = length(uv - pos);
  return flash * exp(-d * d * 8.0) * 0.5;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.2;

  // ── Abyssal background — near-total darkness with subtle depth ──
  float bgNoise = fbm(uv * 0.5 + vec2(t * 0.01));
  vec3 abyssColor = palette(
    bgNoise * 0.1 + uv.y * 0.05 + paletteShift,
    vec3(0.005, 0.005, 0.015),
    vec3(0.005, 0.005, 0.01),
    vec3(0.2, 0.3, 0.5),
    vec3(0.0, 0.0, 0.1)
  );

  // Very subtle volumetric darkness variation
  float darkClouds = fbm(uv * 1.5 + vec2(t * 0.02, -t * 0.01));
  darkClouds = darkClouds * 0.5 + 0.5;
  abyssColor *= 0.8 + 0.2 * darkClouds;

  vec3 color = abyssColor;

  // ── Bioluminescent organisms — scattered glowing dots ──
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float hx = hash(fi * 17.3);
    float hy = hash(fi * 31.1);
    float hz = hash(fi * 53.7);
    float hs = hash(fi * 79.9);

    // Slow drifting motion
    vec2 pos = vec2(
      hx * 1.8 - 0.9 + sin(t * 0.15 * (0.5 + hz) + fi * 2.0) * 0.2,
      hy * 1.8 - 0.9 + cos(t * 0.12 * (0.5 + hs) + fi * 1.5) * 0.15
    );

    float radius = 0.02 + hz * 0.03;
    // Pulsing intensity — slow breathing glow
    float pulse = 0.3 + 0.7 * pow(sin(t * 0.5 * (0.3 + hs) + fi * 3.0) * 0.5 + 0.5, 2.0);
    pulse *= (0.5 + u_bass * 0.5);

    float glow = bioOrg(uv, pos, radius, pulse);

    // Each organism has a distinct color
    vec3 orgCol = palette(
      fi * 0.08 + paletteShift + hz * 0.5,
      vec3(0.2, 0.3, 0.5),
      vec3(0.3, 0.3, 0.4),
      vec3(0.5, 0.8, 1.0),
      vec3(0.1, 0.2, 0.4)
    );

    color += orgCol * glow;
  }

  // ── Jellyfish ──
  float jf1 = jellyfish(uv, vec2(
    -0.3 + sin(t * 0.08) * 0.15,
    0.1 + cos(t * 0.06) * 0.1
  ), t, 0.0);
  float jf2 = jellyfish(uv, vec2(
    0.35 + sin(t * 0.07 + 2.0) * 0.12,
    -0.2 + cos(t * 0.05 + 1.0) * 0.08
  ), t, 3.14);

  vec3 jfCol1 = palette(
    t * 0.05 + paletteShift + 0.3,
    vec3(0.3, 0.15, 0.4),
    vec3(0.3, 0.2, 0.35),
    vec3(0.6, 0.3, 0.9),
    vec3(0.1, 0.05, 0.3)
  );
  vec3 jfCol2 = palette(
    t * 0.05 + paletteShift + 0.6,
    vec3(0.1, 0.3, 0.35),
    vec3(0.15, 0.3, 0.3),
    vec3(0.3, 0.8, 0.7),
    vec3(0.05, 0.15, 0.2)
  );

  // Jellyfish glow responds to mid frequencies
  color += jfCol1 * jf1 * (0.6 + u_mid * 0.6);
  color += jfCol2 * jf2 * (0.6 + u_mid * 0.6);

  // ── Distant flashes — random bioluminescent pulses in the deep ──
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float flash = distantFlash(uv, t, fi * 37.0);

    vec3 flashCol = palette(
      fi * 0.12 + paletteShift + 0.1,
      vec3(0.15, 0.25, 0.4),
      vec3(0.2, 0.25, 0.35),
      vec3(0.4, 0.7, 0.9),
      vec3(0.05, 0.1, 0.3)
    );

    color += flashCol * flash * (0.4 + u_treble * 0.8);
  }

  // ── Deep particulate ──
  float particles = deepsea_particles(uv, t);
  particles *= (0.3 + u_treble * 0.7);
  color += vec3(0.15, 0.2, 0.3) * particles;

  // ── Pressure waves — very subtle bass-driven ripples ──
  float pressureDist = length(uv);
  float pressureWave = sin(pressureDist * 20.0 - t * 2.0) * 0.5 + 0.5;
  pressureWave = pow(pressureWave, 8.0);
  color += vec3(0.02, 0.04, 0.08) * pressureWave * u_bass * 0.3;

  // ── Abyssal depth gradient — darker at edges ──
  float depthVignette = 1.0 - smoothstep(0.2, 1.2, length(uv));
  color *= 0.5 + 0.5 * depthVignette;

  // Keep everything very dark — the abyss is nearly lightless
  color = min(color, vec3(0.8));

  gl_FragColor = vec4(color, 1.0);
}
`;
