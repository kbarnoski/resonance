import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Curl noise 2D — returns perpendicular gradient of snoise.
// PERF (2026-10-13, the 120 fps law): the four central-difference samples
// sit 0.01 apart, so they nearly always share one noise cell — its four
// corner hashes (the sin() calls that dominated plankton's cost: 17 curl
// steps per pixel) are computed once and reused, each sample keeping its own
// exact fract()/fade math. Samples straddling a cell edge take the original
// path. Bit-for-bit the same field (A/B: scripts/perf/shader-ab.mjs).
float snoiseCell(vec2 f, vec2 g00, vec2 g10, vec2 g01, vec2 g11) {
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(g00, f),
                 dot(g10, f - vec2(1.0, 0.0)), u.x),
             mix(dot(g01, f - vec2(0.0, 1.0)),
                 dot(g11, f - vec2(1.0, 1.0)), u.x), u.y);
}
vec2 curlNoise(vec2 p, float scale) {
  float eps = 0.01;
  vec2 q1 = p * scale + vec2(eps, 0.0);
  vec2 q2 = p * scale - vec2(eps, 0.0);
  vec2 q3 = p * scale + vec2(0.0, eps);
  vec2 q4 = p * scale - vec2(0.0, eps);
  vec2 i = floor(q1);
  float n1, n2, n3, n4;
  if (floor(q2) == i && floor(q3) == i && floor(q4) == i) {
    vec2 g00 = hash2(i), g10 = hash2(i + vec2(1.0, 0.0)), g01 = hash2(i + vec2(0.0, 1.0)), g11 = hash2(i + vec2(1.0, 1.0));
    n1 = snoiseCell(fract(q1), g00, g10, g01, g11);
    n2 = snoiseCell(fract(q2), g00, g10, g01, g11);
    n3 = snoiseCell(fract(q3), g00, g10, g01, g11);
    n4 = snoiseCell(fract(q4), g00, g10, g01, g11);
  } else {
    n1 = snoise(q1); n2 = snoise(q2); n3 = snoise(q3); n4 = snoise(q4);
  }
  float dndx = (n1 - n2) / (2.0 * eps);
  float dndy = (n3 - n4) / (2.0 * eps);
  // Curl = perpendicular to gradient (divergence-free)
  return vec2(dndy, -dndx);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.05;
  float paletteShift = u_amplitude * 0.08;

  // ── Deep ocean background ──
  float bgNoise = fbm(uv * 1.5 + t * 0.03);
  vec3 deepBg = palette(
    bgNoise * 0.4 + paletteShift + 0.7,
    vec3(0.01, 0.02, 0.06),
    vec3(0.01, 0.02, 0.05),
    vec3(0.15, 0.3, 0.6),
    vec3(0.0, 0.08, 0.25)
  );
  vec3 color = deepBg;

  // ── Flow trail layers ──
  // Each scale creates streamlines at different sizes and speeds
  // Trace backward along the curl field to compute streamline density

  // Scale 1: large slow currents
  {
    float flowScale = 1.8;
    float speed = 0.3;
    vec2 pos = uv;
    float phase = 0.0;
    float pathLen = 0.0;

    // Backward trace along flow field — 6 Euler steps
    for (int i = 0; i < 6; i++) {
      vec2 vel = curlNoise(pos + vec2(t * speed, t * speed * 0.7), flowScale);
      pos -= vel * 0.04;
      phase += length(vel) * 0.8;
      pathLen += 0.04;
    }

    // Streamline density from accumulated phase
    float stream = sin(phase * 8.0 + t * 0.4) * 0.5 + 0.5;
    stream = pow(stream, 3.0);

    vec3 trailCol = palette(
      phase * 0.2 + t * 0.02 + paletteShift + 0.1,
      vec3(0.05, 0.18, 0.25),
      vec3(0.08, 0.20, 0.28),
      vec3(0.3, 0.8, 0.9),
      vec3(0.0, 0.15, 0.35)
    );
    color += trailCol * stream * 0.25;
  }

  // Scale 2: medium flowing trails — primary visual layer
  {
    float flowScale = 3.5;
    float speed = 0.5;
    vec2 pos = uv * rot2(0.4);
    float phase = 0.0;

    for (int i = 0; i < 6; i++) {
      vec2 vel = curlNoise(pos + vec2(t * speed * 0.6, -t * speed * 0.4), flowScale);
      pos -= vel * 0.03;
      phase += length(vel) * 1.2;
    }

    float stream = sin(phase * 12.0 + t * 0.6) * 0.5 + 0.5;
    stream = pow(stream, 2.5);

    // Bright core of the trails
    float bright = sin(phase * 24.0 + t * 0.8) * 0.5 + 0.5;
    bright = pow(bright, 6.0);

    vec3 trailCol = palette(
      phase * 0.15 + t * 0.03 + paletteShift + 0.3,
      vec3(0.08, 0.25, 0.30),
      vec3(0.12, 0.30, 0.35),
      vec3(0.4, 0.9, 0.8),
      vec3(0.0, 0.20, 0.40)
    );

    vec3 coreCol = palette(
      bright * 0.5 + paletteShift + 0.5,
      vec3(0.20, 0.50, 0.45),
      vec3(0.20, 0.45, 0.40),
      vec3(0.5, 1.0, 0.8),
      vec3(0.0, 0.10, 0.30)
    );

    color += trailCol * stream * 0.35;
    color += coreCol * bright * 0.20;
  }

  // Scale 3: fine detail trails — fastest, smallest
  {
    float flowScale = 7.0;
    float speed = 0.8;
    vec2 pos = uv * rot2(-0.6);
    float phase = 0.0;

    for (int i = 0; i < 5; i++) {
      vec2 vel = curlNoise(pos + vec2(-t * speed * 0.3, t * speed * 0.5), flowScale);
      pos -= vel * 0.02;
      phase += length(vel) * 1.5;
    }

    float stream = sin(phase * 18.0 + t * 1.0) * 0.5 + 0.5;
    stream = pow(stream, 3.0);

    vec3 fineCol = palette(
      phase * 0.1 + t * 0.04 + paletteShift + 0.55,
      vec3(0.06, 0.20, 0.28),
      vec3(0.10, 0.25, 0.32),
      vec3(0.35, 0.85, 0.95),
      vec3(0.0, 0.18, 0.38)
    );
    color += fineCol * stream * 0.18;
  }

  // ── Convergence points — bright bioluminescent flashes ──
  // Where curl noise magnitude is low, flow converges
  vec2 curl1 = curlNoise(uv + vec2(t * 0.4, t * 0.3), 3.0);
  vec2 curl2 = curlNoise(uv + vec2(-t * 0.3, t * 0.35), 5.0);
  float convergence = 1.0 / (length(curl1) * 8.0 + 0.5);
  convergence = smoothstep(0.6, 1.5, convergence);

  // Occasional warm gold flash at convergence
  vec3 flashCol = palette(
    convergence * 0.5 + t * 0.05 + paletteShift + 0.8,
    vec3(0.40, 0.35, 0.15),
    vec3(0.30, 0.25, 0.10),
    vec3(0.8, 0.6, 0.3),
    vec3(0.05, 0.10, 0.20)
  );
  color += flashCol * convergence * 0.15;

  // ── Scattered luminous points — individual organisms ──
  float points = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 pp = vec2(
      snoise(vec2(fi * 7.3, t * 0.15 + fi)),
      snoise(vec2(fi * 13.1, t * 0.12 + fi * 2.0))
    ) * 0.7;
    float pd = length(uv - pp);
    float glow = 0.003 / (pd * pd + 0.003);
    points += glow;
  }
  vec3 pointCol = palette(
    t * 0.03 + paletteShift + 0.2,
    vec3(0.15, 0.40, 0.35),
    vec3(0.15, 0.35, 0.30),
    vec3(0.5, 1.0, 0.8),
    vec3(0.0, 0.15, 0.30)
  );
  color += pointCol * points * 0.006;

  // ── Subtle volumetric haze ──
  float haze = fbm(uv * 2.0 + t * 0.04) * 0.5 + 0.5;
  haze = smoothstep(0.35, 0.75, haze);
  color += deepBg * haze * 0.06;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
