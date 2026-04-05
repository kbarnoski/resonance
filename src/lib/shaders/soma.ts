import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Divine nectar: liquid golden light flowing downward like sacred honey,
// viscous luminous streams descending through space.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Flowing streams — multiple vertical channels of liquid light
  for (int stream = 0; stream < 6; stream++) {
    float fs = float(stream);
    // Each stream has a horizontal position with gentle sway
    float xBase = -0.5 + fs * 0.2 + sin(t * 0.5 + fs * 1.3) * 0.08;

    // Domain warp for viscous, organic flow
    float warpX = snoise(vec2(uv.y * 3.0 - t * 1.5 + fs * 3.0, fs * 5.0)) * 0.1;
    float warpX2 = snoise(vec2(uv.y * 6.0 - t * 2.0 + fs * 7.0, fs * 2.0 + 1.0)) * 0.04;
    float xPos = xBase + warpX + warpX2;

    float dist = abs(uv.x - xPos);

    // Stream width varies — thicker at top (source), thinner as it flows
    float width = 0.04 + 0.03 * smoothstep(0.5, -0.5, uv.y) + u_mid * 0.01;

    // Main stream body
    float streamBody = smoothstep(width, width * 0.3, dist);

    // Bright core of stream
    float streamCore = smoothstep(width * 0.5, 0.0, dist);

    // Drip formations — thicker droplets within the stream
    float dripPhase = uv.y * 5.0 - t * 2.5 + fs * 2.0;
    float drip = sin(dripPhase) * 0.5 + 0.5;
    drip = pow(drip, 3.0);
    float dripWidth = width * (1.0 + drip * 0.8);
    float dripBody = smoothstep(dripWidth, dripWidth * 0.3, dist) * drip;

    // Honey-like viscosity highlights — bright spots where light catches
    float highlight = sin(uv.y * 20.0 - t * 4.0 + fs * 4.0 + warpX * 10.0);
    highlight = pow(max(highlight, 0.0), 5.0) * streamCore * 0.5;

    // Palette — warm golden honey tones
    vec3 streamCol = palette(
      fs * 0.12 + uv.y * 0.2 + paletteShift,
      vec3(0.7, 0.58, 0.3),
      vec3(0.35, 0.3, 0.2),
      vec3(1.0, 0.88, 0.5),
      vec3(0.0, 0.1, 0.2)
    );

    vec3 coreCol = palette(
      fs * 0.12 + paletteShift + 0.15,
      vec3(0.85, 0.75, 0.5),
      vec3(0.2, 0.2, 0.12),
      vec3(1.0, 0.92, 0.7),
      vec3(0.0, 0.05, 0.1)
    );

    float fade = 1.0 / (1.0 + fs * 0.15);
    color += streamCol * streamBody * 0.4 * fade * (0.6 + 0.4 * u_mid);
    color += coreCol * streamCore * 0.6 * fade;
    color += streamCol * dripBody * 0.5 * fade;
    color += coreCol * highlight * fade * (0.5 + 0.5 * u_treble);
  }

  // Source glow at top — where the nectar originates
  float sourceGlow = exp(-(uv.y - 0.5) * (uv.y - 0.5) * 5.0) * smoothstep(0.4, 0.55, uv.y);
  sourceGlow *= (0.5 + 0.3 * u_bass);
  vec3 sourceCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.9, 0.8, 0.55),
    vec3(0.15, 0.15, 0.1),
    vec3(1.0, 0.95, 0.75),
    vec3(0.0, 0.05, 0.08)
  );
  color += sourceCol * sourceGlow;

  // Pool accumulation at bottom — spreading glow
  float pool = smoothstep(-0.3, -0.55, uv.y) * (0.3 + 0.2 * u_bass);
  float poolNoise = snoise(vec2(uv.x * 5.0, t * 0.5)) * 0.5 + 0.5;
  pool *= poolNoise;
  vec3 poolCol = palette(
    uv.x * 0.3 + paletteShift + 0.1,
    vec3(0.65, 0.55, 0.3),
    vec3(0.3, 0.25, 0.15),
    vec3(1.0, 0.85, 0.5),
    vec3(0.05, 0.1, 0.2)
  );
  color += poolCol * pool;

  // Ambient golden mist
  float mist = fbm(uv * 2.5 + vec2(t * 0.1, -t * 0.15));
  mist = smoothstep(-0.1, 0.35, mist) * 0.08;
  color += sourceCol * mist * smoothstep(1.0, 0.2, r);

  // Vignette
  color *= smoothstep(1.5, 0.4, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
