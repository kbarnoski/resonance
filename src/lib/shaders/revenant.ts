import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + SMIN + `
// Revenant — returned spirit, distorted humanoid form reforming

float bodyField(vec2 p, float time) {
  // Torso — central mass reforming
  float torso = length(p * vec2(2.5, 1.0)) - 0.2;

  // Head — floating above, not quite connected
  float headOff = sin(time * 0.3) * 0.02;
  float head = length(p - vec2(headOff, 0.35)) - 0.1;

  // Arms — reaching outward, distorted
  vec2 armL = p - vec2(-0.15, 0.1);
  armL = rot2(0.4 + sin(time * 0.25) * 0.2) * armL;
  float armLd = length(armL * vec2(1.0, 4.0)) - 0.03;

  vec2 armR = p - vec2(0.15, 0.1);
  armR = rot2(-0.4 - sin(time * 0.25 + 1.0) * 0.2) * armR;
  float armRd = length(armR * vec2(1.0, 4.0)) - 0.03;

  // Smooth blend everything
  float body = smin(torso, head, 0.15);
  body = smin(body, armLd, 0.1);
  body = smin(body, armRd, 0.1);

  return body;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Distortion — the form is struggling to coalesce
  vec2 distort = vec2(
    fbm(uv * 4.0 + t * 0.2) * 0.08,
    fbm(uv * 4.0 + vec2(5.0, 3.0) + t * 0.15) * 0.08
  );
  distort *= 1.0 + u_bass * 0.6;

  float body = bodyField(uv + distort, t);

  // Reformation pulse — the body solidifies and disperses cyclically
  float pulse = sin(t * 0.8) * 0.5 + 0.5;
  pulse = pulse * 0.5 + 0.5; // bias toward more solid
  pulse *= 1.0 + u_amplitude * 0.3;

  // Layered glow — tighter when reforming, diffuse when dispersing
  float spread = mix(1.5, 5.0, pulse);
  float innerGlow = exp(-max(body, 0.0) * spread * 2.0) * 0.1;
  float outerGlow = exp(-max(body, 0.0) * spread * 0.5) * 0.06;

  // Particle field — fragments reassembling
  float particles = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 pPos = vec2(
      sin(fi * 1.7 + t * 0.3) * 0.4,
      cos(fi * 2.3 + t * 0.25) * 0.5
    );
    float pDist = length(uv - pPos);
    // Particles pulled toward body center
    float pull = mix(1.0, 0.3, pulse);
    pPos = mix(pPos, vec2(0.0, 0.1), pull);
    pDist = length(uv - pPos);
    particles += exp(-pDist * 15.0) * 0.02;
  }

  // Background
  vec3 bgColor = palette(0.75,
    vec3(0.005, 0.004, 0.008),
    vec3(0.01, 0.008, 0.015),
    vec3(1.0, 1.0, 1.0),
    vec3(0.55, 0.5, 0.7));

  // Revenant form — cold spectral light
  vec3 formColor = palette(0.5 + u_mid * 0.12,
    vec3(0.02, 0.015, 0.03),
    vec3(0.06, 0.04, 0.08),
    vec3(1.0, 1.0, 1.0),
    vec3(0.45, 0.5, 0.75));

  vec3 particleColor = palette(0.35 + u_treble * 0.1,
    vec3(0.01, 0.01, 0.02),
    vec3(0.04, 0.03, 0.06),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.55, 0.8));

  // Compose
  vec3 color = bgColor;
  color += formColor * innerGlow * (1.0 + u_bass * 1.2);
  color += formColor * outerGlow;
  color += particleColor * particles * (1.0 + u_treble * 0.5);

  // Static interference — the spirit disrupts reality
  float staticNoise = snoise(uv * 30.0 + t * 5.0);
  float staticMask = exp(-max(body, 0.0) * 3.0);
  color += formColor * smoothstep(0.7, 0.9, staticNoise) * staticMask * u_treble * 0.04;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
