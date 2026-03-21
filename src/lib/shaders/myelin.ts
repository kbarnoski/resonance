import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.3;
  float bass = u_bass;
  float mid = u_mid;
  float treble = u_treble;
  float amp = u_amplitude;

  vec3 color = vec3(0.0);

  // Multiple concentric sheath layers
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 p = uv * rot2(fi * 0.3 + t * 0.1);

    float sheathRadius = 0.08 + fi * 0.06 + mid * 0.02;

    // Myelin rings - concentric wrapping
    float ring = abs(length(vec2(p.x * 0.3, p.y)) - sheathRadius);
    ring = smoothstep(0.015 + treble * 0.005, 0.0, ring);

    // Nodes of Ranvier - gaps between sheaths
    float nodeGap = smoothstep(0.02, 0.05, abs(mod(p.x + t * 0.5 + fi * 0.4, 1.2) - 0.6));
    ring *= nodeGap;

    // Signal propagation - saltatory conduction
    float signal = sin(p.x * 8.0 - t * 6.0 + fi * 1.5) * 0.5 + 0.5;
    signal = pow(signal, 8.0) * amp;
    float signalPulse = exp(-abs(p.y) * 20.0) * signal;

    // Warm myelin colors
    vec3 sheathColor = palette(
      fi * 0.12 + 0.1,
      vec3(0.3, 0.25, 0.15),
      vec3(0.3, 0.3, 0.1),
      vec3(1.0, 1.0, 0.5),
      vec3(0.1, 0.2, 0.15)
    );

    vec3 signalColor = vec3(0.9, 1.0, 0.6) * signalPulse * (1.0 + bass);

    color += sheathColor * ring * (0.3 + amp * 0.3);
    color += signalColor;
  }

  // Central axon glow
  float axonCore = exp(-abs(uv.y) * 30.0) * exp(-abs(uv.x) * 0.5);
  color += vec3(0.4, 0.9, 0.3) * axonCore * (0.3 + amp * 0.5);

  // Subtle noise texture for organic feel
  float n = fbm(uv * 5.0 + t * 0.2) * 0.05;
  color += vec3(0.2, 0.15, 0.05) * n;

  // Signal flash at nodes
  for (int j = 0; j < 4; j++) {
    float fj = float(j);
    float nodeX = fj * 1.2 - 1.8;
    float flashPhase = sin(t * 4.0 - fj * 1.8) * 0.5 + 0.5;
    flashPhase = pow(flashPhase, 12.0);
    float dist = length(uv - vec2(nodeX, 0.0));
    color += vec3(0.8, 1.0, 0.4) * flashPhase * exp(-dist * 15.0) * bass;
  }

  float vig = 1.0 - dot(uv, uv) * 0.5;
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
