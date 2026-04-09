import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Night Rain — rain falling through darkness lit by a distant streetlight.
// Hash-based rain streaks in a 50-iteration loop.
// Warm glow zone in center, vertical light streaks, wet atmosphere.

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float hash1v(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // ── Background — dark night sky ──
  vec3 col = vec3(0.01, 0.012, 0.018);

  // ── Streetlight glow — warm zone in upper center ──
  vec2 lightPos = vec2(0.0, 0.35);
  float lightDist = length(uv - lightPos);

  // Cone of light spreading downward
  float cone = smoothstep(0.8, 0.0, lightDist);
  // Wider at bottom, narrower at top
  float coneShape = smoothstep(0.0, -0.6, uv.y - lightPos.y);
  float coneWidth = 0.15 + coneShape * 0.5;
  float coneMask = smoothstep(coneWidth, 0.0, abs(uv.x - lightPos.x));
  coneMask *= smoothstep(0.5, -0.3, uv.y - lightPos.y);

  // Light source glow
  float sourceGlow = exp(-lightDist * 6.0) * 0.25;
  float ambientLight = coneMask * 0.05;

  vec3 warmLight = palette(
    0.1 + u_amplitude * 0.05,
    vec3(0.30, 0.22, 0.12),
    vec3(0.15, 0.10, 0.05),
    vec3(0.5, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  col += warmLight * sourceGlow;
  col += warmLight * ambientLight * (0.8 + u_bass * 0.3);

  // ── Rain streaks — 50 drops ──
  float rainAccum = 0.0;
  float litRainAccum = 0.0;

  for (int i = 0; i < 50; i++) {
    float fi = float(i);

    // Random position for each drop
    float rx = hash1(fi * 13.37) * 2.4 - 1.2;
    float speed = 1.5 + hash1(fi * 7.91) * 1.5;
    float phase = hash1(fi * 3.14) * 10.0;

    // Drop falls continuously — repeating via mod
    float ry = mod(-t * speed + phase, 2.4) - 1.2;

    // Slight wind drift
    float wind = sin(t * 0.3) * 0.03;
    rx += wind;

    // Streak length — short vertical line
    float streakLen = 0.02 + hash1(fi * 5.71) * 0.03;
    float streakWidth = 0.001 + hash1(fi * 2.33) * 0.001;

    // Distance to the streak (vertical line segment)
    vec2 dropTop = vec2(rx, ry + streakLen);
    vec2 dropBot = vec2(rx, ry);
    vec2 pa = uv - dropBot;
    vec2 ba = dropTop - dropBot;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);

    // Streak brightness — sharp falloff
    float streak = smoothstep(streakWidth * 2.0, 0.0, d);

    // Is this drop in the light cone?
    float inLight = coneMask * 0.5;
    float dropLight = smoothstep(0.8, 0.0, length(vec2(rx, ry) - lightPos));

    float brightness = 0.015 + inLight * 0.08 + dropLight * 0.04;
    rainAccum += streak * brightness;
    litRainAccum += streak * dropLight * 0.05;
  }

  // Rain color — mostly white/cool, warmer in the light
  col += vec3(0.15, 0.17, 0.20) * rainAccum;
  col += warmLight * litRainAccum;

  // ── Wet ground reflection — bottom of screen ──
  float groundY = -0.45;
  float groundMask = smoothstep(groundY + 0.05, groundY - 0.05, uv.y);

  // Reflected light on wet ground
  float reflDist = length(vec2(uv.x - lightPos.x, (uv.y - groundY) * 3.0));
  float refl = exp(-reflDist * 3.0) * 0.08;
  col += warmLight * refl * groundMask;

  // Ripples on the ground — subtle noise
  float rippleNoise = snoise(vec2(uv.x * 15.0, (uv.y - groundY) * 5.0 + t * 2.0));
  float ripples = smoothstep(0.6, 0.9, rippleNoise) * groundMask * 0.03;
  col += warmLight * ripples * (0.5 + u_treble * 0.5);

  // ── Atmospheric fog — subtle depth haze ──
  float haze = fbm3(uv * 1.5 + vec2(t * 0.2, t * 0.1)) * 0.5 + 0.5;
  haze *= 0.02;
  col += vec3(0.02, 0.02, 0.025) * haze;

  // Mid drives subtle fog density
  col += vec3(0.01, 0.01, 0.012) * haze * u_mid * 0.5;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  col *= vignette;

  col = clamp(col, 0.0, 0.4);

  gl_FragColor = vec4(col, 1.0);
}
`;
