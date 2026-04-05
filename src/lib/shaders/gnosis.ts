import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Inner knowledge visualization: expanding awareness rings with particle
// enlightenment, concentric ripples of understanding propagating outward.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 color = vec3(0.0);

  // Expanding awareness rings — concentric waves propagating outward
  float ringSpeed = t * 1.2;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ringPhase = fract(ringSpeed * 0.15 + fi * 0.2);
    float ringR = ringPhase * 1.2;
    float ringWidth = 0.02 + ringPhase * 0.01;
    float ring = smoothstep(ringWidth, 0.0, abs(r - ringR));
    float ringFade = (1.0 - ringPhase) * (1.0 - ringPhase); // fade as expand

    vec3 ringCol = palette(
      fi * 0.18 + ringPhase * 0.5 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.4),
      vec3(1.0, 0.8, 0.5),
      vec3(0.0, 0.15, 0.35)
    );

    color += ringCol * ring * ringFade * (0.8 + 0.4 * u_mid);
  }

  // Particle field — points of light scattered and orbiting
  for (int p = 0; p < 30; p++) {
    float fp = float(p);
    float pSeed = fp * 1.7 + 3.14;
    float pAngle = fract(sin(pSeed * 127.1) * 43758.5) * 6.28318 + t * (0.3 + fract(sin(pSeed * 41.3) * 9173.1) * 0.4);
    float pRadius = 0.15 + fract(sin(pSeed * 269.5) * 18345.3) * 0.6;
    pRadius += 0.03 * sin(t * 2.0 + fp);

    vec2 pPos = vec2(cos(pAngle), sin(pAngle)) * pRadius;
    float pDist = length(uv - pPos);
    float pGlow = exp(-pDist * pDist * 800.0) * (0.6 + 0.4 * u_treble);

    vec3 pCol = palette(
      fp * 0.07 + paletteShift + 0.2,
      vec3(0.7, 0.6, 0.4),
      vec3(0.3, 0.3, 0.3),
      vec3(1.0, 0.9, 0.6),
      vec3(0.05, 0.1, 0.2)
    );

    color += pCol * pGlow;
  }

  // Central knowledge core — pulsing bright point
  float pulse = 0.8 + 0.3 * sin(t * 3.0) + u_bass * 0.5;
  float core = exp(-r * r * 25.0) * pulse;
  vec3 coreCol = palette(
    t * 0.08 + paletteShift,
    vec3(0.9, 0.8, 0.6),
    vec3(0.2, 0.2, 0.15),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.1)
  );
  color += coreCol * core;

  // FBM nebular wisdom field
  float wisdom = fbm(uv * 3.5 + vec2(t * 0.12, -t * 0.08));
  wisdom = smoothstep(-0.1, 0.45, wisdom) * 0.2;
  vec3 wisdomCol = palette(
    wisdom * 2.0 + paletteShift + 0.6,
    vec3(0.4, 0.3, 0.5),
    vec3(0.4, 0.3, 0.4),
    vec3(0.8, 1.0, 0.9),
    vec3(0.2, 0.05, 0.3)
  );
  color += wisdomCol * wisdom * smoothstep(1.0, 0.15, r);

  // Radial light beams from center — subtle
  float beams = sin(a * 12.0 + t * 0.5) * 0.5 + 0.5;
  beams = pow(beams, 4.0) * exp(-r * 2.5) * 0.3 * (0.5 + 0.5 * u_bass);
  color += coreCol * beams;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
