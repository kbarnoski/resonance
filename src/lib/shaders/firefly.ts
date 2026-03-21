import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + `
// Firefly — points of warm golden light drifting through darkness.
// Gentle pulsing on/off with smooth easing. Tiny warm trails.
// Dark forest-green/black background. Multiple depth layers.

// Smooth pulse function — ease-in-out blink pattern
float fireflyPulse(float time, float period, float onRatio) {
  float t = mod(time, period) / period;
  // On phase: smooth rise and fall
  float on = smoothstep(0.0, onRatio * 0.3, t)
           * smoothstep(onRatio, onRatio * 0.7, t);
  return on;
}

// Hash for pseudo-random per-firefly values
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash21(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.15;

  vec3 color = vec3(0.0);

  // ─── DARK FOREST BACKGROUND ───
  // Deep green-black with subtle variation
  {
    float bgNoise = fbm(uv * 1.5 + vec2(t * 0.01, t * 0.008)) * 0.5 + 0.5;
    vec3 bgDark = vec3(0.005, 0.012, 0.008);
    vec3 bgLight = vec3(0.015, 0.028, 0.018);
    color = mix(bgDark, bgLight, bgNoise * 0.5);

    // Subtle tree/foliage silhouettes using noise
    float foliage = fbm(uv * 3.0 + vec2(0.0, t * 0.005));
    foliage = smoothstep(0.1, 0.4, foliage) * 0.015;
    color += vec3(0.005, 0.015, 0.008) * foliage;
  }

  // ─── AMBIENT FOREST GLOW — very subtle ground haze ───
  {
    float haze = fbm(vec2(uv.x * 2.0 + t * 0.03, uv.y * 1.5)) * 0.5 + 0.5;
    float hazeMask = smoothstep(0.3, -0.5, uv.y) * 0.025;
    color += vec3(0.01, 0.02, 0.01) * haze * hazeMask;
  }

  // ─── FIREFLIES — multiple layers for depth ───
  // Layer 1: Background (dim, small, slow) — 12 fireflies
  // Layer 2: Midground (medium) — 10 fireflies
  // Layer 3: Foreground (bright, large) — 6 fireflies

  // --- BACKGROUND FIREFLIES (far away, dim) ---
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 seed = hash21(fi * 127.1 + 31.7);

    // Position: wander in Lissajous-like paths
    float px = sin(t * 0.15 * (0.5 + seed.x * 0.5) + fi * 2.3) * 0.7
             + sin(t * 0.08 + fi * 4.1) * 0.2;
    float py = cos(t * 0.12 * (0.4 + seed.y * 0.4) + fi * 1.7) * 0.5
             + sin(t * 0.06 + fi * 3.3) * 0.15;

    vec2 pos = vec2(px, py);

    // Pulse
    float period = 3.5 + seed.x * 4.0;
    float offset = fi * 1.37 + seed.y * 10.0;
    float pulse = fireflyPulse(t * 0.8 + offset, period, 0.35 + seed.y * 0.25);
    pulse *= 0.3 + u_amplitude * 0.15; // dimmer background layer

    // Glow
    float dist = length(uv - pos);
    float glow = 0.003 / (dist * dist + 0.003);
    glow *= pulse;

    // Warm golden color with slight variation
    vec3 flyColor = palette(seed.x * 0.3 + 0.1 + paletteShift * 0.2,
      vec3(0.4, 0.3, 0.1),
      vec3(0.2, 0.15, 0.05),
      vec3(1.0, 0.8, 0.3),
      vec3(0.0, 0.1, 0.2));

    color += flyColor * glow * 0.015;

    // Tiny trail
    float trailDist = length(uv - pos + vec2(
      sin(t * 0.15 + fi * 2.3) * 0.01,
      cos(t * 0.12 + fi * 1.7) * 0.008
    ) * 3.0);
    float trail = 0.001 / (trailDist * trailDist + 0.002);
    color += flyColor * trail * pulse * 0.003;
  }

  // --- MIDGROUND FIREFLIES ---
  for (int i = 0; i < 10; i++) {
    float fi = float(i) + 20.0;
    vec2 seed = hash21(fi * 173.3 + 47.1);

    float px = sin(t * 0.18 * (0.6 + seed.x * 0.5) + fi * 1.9) * 0.6
             + sin(t * 0.1 + fi * 3.7) * 0.25;
    float py = cos(t * 0.14 * (0.5 + seed.y * 0.4) + fi * 2.3) * 0.45
             + sin(t * 0.07 + fi * 2.9) * 0.15;

    vec2 pos = vec2(px, py);

    float period = 3.0 + seed.x * 3.5;
    float offset = fi * 1.23 + seed.y * 8.0;
    float pulse = fireflyPulse(t * 0.9 + offset, period, 0.4 + seed.y * 0.2);
    pulse *= 0.5 + u_amplitude * 0.2;

    // Bass makes mid-layer fireflies brighter
    pulse *= (0.8 + u_bass * 0.25);

    float dist = length(uv - pos);
    float glow = 0.004 / (dist * dist + 0.002);
    glow *= pulse;

    vec3 flyColor = palette(seed.x * 0.4 + 0.05 + paletteShift * 0.3,
      vec3(0.45, 0.32, 0.08),
      vec3(0.25, 0.18, 0.05),
      vec3(1.0, 0.85, 0.35),
      vec3(0.0, 0.08, 0.18));

    color += flyColor * glow * 0.025;

    // Trail — follows the direction of motion
    vec2 vel = vec2(
      cos(t * 0.18 + fi * 1.9) * 0.18 * (0.6 + seed.x * 0.5),
      -sin(t * 0.14 + fi * 2.3) * 0.14 * (0.5 + seed.y * 0.4)
    );
    vec2 trailDir = normalize(vel + 0.0001) * 0.02;
    for (int j = 1; j <= 3; j++) {
      float fj = float(j);
      vec2 trailPos = pos - trailDir * fj;
      float td = length(uv - trailPos);
      float trailGlow = 0.0015 / (td * td + 0.002);
      float trailFade = 1.0 - fj * 0.3;
      color += flyColor * trailGlow * pulse * trailFade * 0.008;
    }
  }

  // --- FOREGROUND FIREFLIES (close, bright, large glow) ---
  for (int i = 0; i < 6; i++) {
    float fi = float(i) + 50.0;
    vec2 seed = hash21(fi * 211.7 + 89.3);

    float px = sin(t * 0.22 * (0.7 + seed.x * 0.4) + fi * 1.3) * 0.55
             + sin(t * 0.12 + fi * 5.1) * 0.2;
    float py = cos(t * 0.17 * (0.6 + seed.y * 0.3) + fi * 1.1) * 0.4
             + sin(t * 0.09 + fi * 3.7) * 0.12;

    vec2 pos = vec2(px, py);

    float period = 2.5 + seed.x * 3.0;
    float offset = fi * 0.97 + seed.y * 6.0;
    float pulse = fireflyPulse(t + offset, period, 0.45 + seed.y * 0.15);
    pulse *= 0.7 + u_amplitude * 0.3;

    // Treble makes foreground fireflies sparkle
    pulse *= (0.7 + u_treble * 0.35);

    float dist = length(uv - pos);

    // Larger, softer glow for foreground
    float glow = 0.006 / (dist * dist + 0.001);
    glow *= pulse;

    // Brighter, warmer color
    vec3 flyColor = palette(seed.x * 0.3 + 0.02 + paletteShift * 0.4,
      vec3(0.5, 0.38, 0.1),
      vec3(0.3, 0.2, 0.05),
      vec3(1.0, 0.9, 0.4),
      vec3(0.0, 0.06, 0.15));

    color += flyColor * glow * 0.035;

    // Bright core point
    float core = 0.0008 / (dist * dist + 0.0003);
    color += vec3(1.0, 0.9, 0.6) * core * pulse * 0.008;

    // Warm trailing glow
    vec2 vel = vec2(
      cos(t * 0.22 + fi * 1.3) * 0.22 * (0.7 + seed.x * 0.4),
      -sin(t * 0.17 + fi * 1.1) * 0.17 * (0.6 + seed.y * 0.3)
    );
    vec2 trailDir = normalize(vel + 0.0001) * 0.025;
    for (int j = 1; j <= 5; j++) {
      float fj = float(j);
      vec2 trailPos = pos - trailDir * fj;
      float td = length(uv - trailPos);
      float trailGlow = 0.002 / (td * td + 0.0015);
      float trailFade = 1.0 - fj * 0.18;
      color += flyColor * trailGlow * pulse * trailFade * 0.006;
    }
  }

  // ─── AMBIENT WARMTH from all the fireflies ───
  {
    float ambientGlow = 0.0;
    // Quick approximation — just add subtle warm light at center
    ambientGlow = 0.01 * u_amplitude;
    color += vec3(0.015, 0.01, 0.003) * ambientGlow;
  }

  // ─── MID frequency gently shifts background green ───
  color += vec3(0.002, 0.005, 0.003) * u_mid * 0.3;

  // ─── VIGNETTE — dark forest edges ───
  float vd = length(uv * vec2(0.9, 0.95));
  float vignette = pow(1.0 - smoothstep(0.2, 1.2, vd), 1.8);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
