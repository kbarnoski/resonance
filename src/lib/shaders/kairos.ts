import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Kairos — The right moment: radial burst frozen in meaning

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  float bass = 0.5 + 0.5 * sin(u_bass * 3.14159);
  float amp = 0.5 + 0.5 * sin(u_amplitude * 3.14159);

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Radial burst that expands very slowly then pauses
  // Use a sine that spends most time near its peak
  float expansion = sin(t * 0.4) * 0.5 + 0.5;
  expansion = smoothstep(0.0, 1.0, expansion); // more time at extremes
  float burstRadius = 0.1 + expansion * 0.5;

  // Radial rays — frozen burst
  float rays = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float rayAngle = fi * 0.2618; // 24 rays
    float angDist = abs(sin(angle - rayAngle));

    // Rays narrow toward the tips
    float thickness = 0.005 + (burstRadius - r) * 0.02;
    thickness = max(thickness, 0.003);

    float ray = smoothstep(thickness, thickness * 0.1, angDist);
    ray *= smoothstep(burstRadius + 0.02, burstRadius * 0.3, r);

    // Noise texture on rays — only where the ray is (PERF 2026-10-13, the
    // 120 fps law: 24 three-octave noises per pixel, almost all multiplied
    // by an exact 0; skipping them changes no pixel)
    if (ray > 0.0) {
      float n = fbm3(vec2(fi, r * 5.0 + t * 0.2));
      ray *= (0.6 + n * 0.4);
      rays += ray * 0.12;
    }
  }

  // Central bright core — the moment itself
  float core = exp(-r * 8.0) * 1.5;
  float innerCore = exp(-r * 20.0) * 0.8;

  // Expanding ring at the burst edge
  float burstRing = smoothstep(0.015, 0.0, abs(r - burstRadius)) * 0.5;
  burstRing *= (0.8 + amp * 0.2);

  // Frozen particles at the burst front
  float particles = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float pa = fi * 0.5236;
    vec2 pp = vec2(cos(pa), sin(pa)) * burstRadius;
    float pd = length(uv - pp);
    particles += exp(-pd * 30.0) * 0.2;
  }

  // Gold-white palette
  vec3 rayColor = palette(
    r * 2.0 + t * 0.08,
    vec3(0.7, 0.55, 0.2),
    vec3(0.4, 0.3, 0.12),
    vec3(1.0, 0.85, 0.4),
    vec3(0.0, 0.08, 0.15)
  );

  vec3 color = vec3(0.0);
  color += rayColor * rays;
  color += vec3(1.0, 0.9, 0.6) * core;
  color += vec3(1.0, 0.97, 0.9) * innerCore;
  color += vec3(1.0, 0.85, 0.5) * burstRing;
  color += vec3(1.0, 0.9, 0.65) * particles * (0.8 + bass * 0.2);

  // Warm ambient
  color += vec3(0.08, 0.05, 0.02) * exp(-r * 1.5);

  // Vignette
  color *= smoothstep(1.5, 0.4, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
