import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Lightning Field — dark sky with periodic bright lightning bolt flashes.
// White/blue branching lines against near-black clouds.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Hash for bolt positioning
float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Lightning bolt — noisy vertical line that branches
float bolt(vec2 uv, float seed, float t) {
  // Bolt origin at top, zig-zags down
  float xOff = hash1(seed * 17.3) * 1.4 - 0.7;
  float boltX = xOff;

  float intensity = 0.0;
  float yStep = 0.02;
  float thickness = 0.006;

  // Main trunk — 40 segments
  vec2 pos = vec2(boltX, 0.6);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    // Horizontal jitter per segment
    float jitter = snoise(vec2(fi * 2.1 + seed * 10.0, seed * 5.0)) * 0.04;
    pos.x += jitter;
    pos.y -= yStep;

    // Distance from this segment to uv
    float d = length(uv - pos);
    float bright = thickness / (d + 0.001);
    intensity += bright;

    // Branch at certain points
    if (mod(fi, 8.0) < 1.0 && fi > 5.0) {
      float branchDir = sign(jitter) * 0.8;
      vec2 bPos = pos;
      for (int j = 0; j < 10; j++) {
        float fj = float(j);
        bPos.x += branchDir * 0.015 + snoise(vec2(fj * 3.0 + seed, fi)) * 0.02;
        bPos.y -= yStep * 0.7;
        float bd = length(uv - bPos);
        intensity += (thickness * 0.5) / (bd + 0.001);
      }
    }
  }

  return clamp(intensity, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // ── Dark sky — stormy clouds via fbm3 ──
  vec2 skyUV = uv * 1.5 + vec2(t * 0.1, t * 0.05);
  float clouds = fbm3(skyUV) * 0.5 + 0.5;
  float cloudLayer2 = fbm3(skyUV * 0.7 + vec2(3.0, t * 0.08)) * 0.5 + 0.5;

  // Cloud color — very dark gray with slight blue
  vec3 skyColor = palette(
    clouds * 0.5 + cloudLayer2 * 0.3,
    vec3(0.015, 0.015, 0.025),
    vec3(0.01, 0.01, 0.02),
    vec3(0.3, 0.35, 0.5),
    vec3(0.1, 0.1, 0.2)
  );

  // Slightly brighter cloud highlights
  float cloudBright = smoothstep(0.5, 0.8, clouds) * 0.025;
  skyColor += vec3(0.02, 0.02, 0.035) * cloudBright;

  // ── Lightning bolts — appear periodically ──
  // Each bolt has a lifecycle: flash in, hold briefly, fade out
  float boltIntensity = 0.0;
  float flashGlow = 0.0;

  // 3 bolt slots cycling at different rates
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float period = 3.5 + fi * 1.7; // Different periods per bolt
    float phase = fract(t / period + fi * 0.37);

    // Flash envelope: quick rise, brief hold, fast decay
    float envelope = smoothstep(0.0, 0.02, phase) * smoothstep(0.12, 0.04, phase);
    // Bass extends flash duration
    envelope *= (0.6 + u_bass * 0.6);

    if (envelope > 0.01) {
      float seed = floor(t / period + fi * 0.37);
      float b = bolt(uv, seed + fi * 100.0, t);
      boltIntensity += b * envelope;

      // Sky flash — illuminate clouds during bolt
      flashGlow += envelope * 0.15;
    }
  }

  boltIntensity = clamp(boltIntensity, 0.0, 1.0);

  // ── Bolt color — white core, blue edges ──
  vec3 boltColor = mix(
    vec3(0.3, 0.4, 0.9),  // Blue edges
    vec3(0.9, 0.95, 1.0),  // White-hot core
    smoothstep(0.2, 0.8, boltIntensity)
  );

  // ── Sky illumination during flash ──
  vec3 flashColor = vec3(0.08, 0.08, 0.18) * flashGlow * clouds;

  // ── Distant dim flash on horizon ──
  float horizonFlash = smoothstep(-0.3, -0.1, uv.y) * smoothstep(-0.5, -0.3, uv.y);
  float distantPulse = smoothstep(0.7, 0.8, sin(t * 2.3 + 1.5)) * 0.04;
  vec3 horizonGlow = vec3(0.06, 0.06, 0.12) * horizonFlash * distantPulse;

  // ── Compositing ──
  vec3 color = skyColor;
  color += flashColor;
  color += horizonGlow;

  // Bolt on top
  color += boltColor * boltIntensity * 0.35;

  // Treble brightens bolt crackle
  color += vec3(0.5, 0.55, 0.9) * boltIntensity * u_treble * 0.15;

  // Mid drives ambient cloud rumble
  color += vec3(0.02, 0.02, 0.04) * clouds * u_mid * 0.2;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
