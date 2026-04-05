import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Lightyear — Deep parallax layers of stars with nebula gas
// between layers, creating profound depth as you drift through space.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Star layer at a given depth
float starLayer(vec2 uv, float density, float seed) {
  vec2 id = floor(uv * density);
  vec2 f = fract(uv * density) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.91, h);
  float radius = 0.02 + 0.05 * fract(h * 37.0);
  float brightness = smoothstep(radius, 0.0, length(f));
  float twinkle = 0.5 + 0.5 * sin(u_time * (1.5 + h * 7.0) + h * 60.0 + seed);
  return star * brightness * twinkle;
}

// Nebula gas at a given depth — soft domain-warped clouds
float nebulaGas(vec2 uv, float t, float seed) {
  vec2 warp = vec2(
    sin(uv.y * 1.5 + t * 0.04 + seed) * 0.4,
    cos(uv.x * 1.3 + t * 0.03 + seed * 2.0) * 0.4
  );
  float n = fbm3(uv * 0.8 + warp + seed);
  n = smoothstep(-0.1, 0.5, n);
  return n;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  float paletteShift = u_amplitude * 0.2;

  // Camera drift — slow lateral movement
  vec2 drift = vec2(sin(t * 0.3) * 0.2, cos(t * 0.2) * 0.15) + t * vec2(0.08, 0.04);

  vec3 color = vec3(0.005, 0.005, 0.015);

  // ── 6 parallax depth layers, back to front ──

  // Layer 6 — deepest, slowest
  vec2 uv6 = uv * 0.3 + drift * 0.1 + vec2(100.0, 80.0);
  float s6 = starLayer(uv6, 30.0, 600.0);
  color += vec3(0.4, 0.4, 0.6) * s6 * 0.3;

  // Nebula between layers 6 and 5
  float n65 = nebulaGas(uv * 0.35 + drift * 0.12 + vec2(90.0, 70.0), t, 65.0);
  vec3 n65Col = palette(
    n65 + t * 0.01 + paletteShift + 0.8,
    vec3(0.2, 0.15, 0.3),
    vec3(0.12, 0.08, 0.2),
    vec3(0.4, 0.2, 0.6),
    vec3(0.1, 0.05, 0.2)
  );
  color += n65Col * n65 * 0.08;

  // Layer 5
  vec2 uv5 = uv * 0.5 + drift * 0.2 + vec2(70.0, 50.0);
  float s5 = starLayer(uv5, 45.0, 500.0);
  color += vec3(0.5, 0.5, 0.7) * s5 * 0.4;

  // Nebula between layers 5 and 4
  float n54 = nebulaGas(uv * 0.55 + drift * 0.25 + vec2(60.0, 40.0), t * 0.9, 54.0);
  vec3 n54Col = palette(
    n54 + t * 0.012 + paletteShift + 0.5,
    vec3(0.25, 0.2, 0.35),
    vec3(0.15, 0.1, 0.25),
    vec3(0.5, 0.3, 0.7),
    vec3(0.1, 0.08, 0.25)
  );
  color += n54Col * n54 * 0.1;

  // Layer 4
  vec2 uv4 = uv * 0.7 + drift * 0.35 + vec2(40.0, 25.0);
  float s4 = starLayer(uv4, 55.0, 400.0);
  color += vec3(0.6, 0.65, 0.8) * s4 * 0.5;

  // Nebula between layers 4 and 3 — the prominent one
  float n43 = nebulaGas(uv * 0.75 + drift * 0.4 + vec2(30.0, 15.0), t * 0.8, 43.0);
  n43 *= (0.6 + u_bass * 0.6);
  vec3 n43Col = palette(
    n43 + uv.x * 0.1 + t * 0.015 + paletteShift + 0.2,
    vec3(0.4, 0.3, 0.5),
    vec3(0.25, 0.2, 0.35),
    vec3(0.6, 0.35, 0.8),
    vec3(0.1, 0.1, 0.3)
  );
  color += n43Col * n43 * 0.2;

  // Layer 3
  vec2 uv3 = uv * 0.9 + drift * 0.55 + vec2(15.0, 8.0);
  float s3 = starLayer(uv3, 70.0, 300.0);
  color += vec3(0.8, 0.8, 1.0) * s3 * 0.7;

  // Nebula between layers 3 and 2
  float n32 = nebulaGas(uv + drift * 0.65 + vec2(8.0, 4.0), t * 0.7, 32.0);
  n32 *= (0.5 + u_mid * 0.5);
  vec3 n32Col = palette(
    n32 + uv.y * 0.1 + t * 0.018 + paletteShift + 0.0,
    vec3(0.35, 0.25, 0.4),
    vec3(0.2, 0.15, 0.3),
    vec3(0.5, 0.25, 0.7),
    vec3(0.12, 0.08, 0.28)
  );
  color += n32Col * n32 * 0.15;

  // Layer 2
  vec2 uv2 = uv * 1.1 + drift * 0.8;
  float s2 = starLayer(uv2, 90.0, 200.0);
  color += vec3(1.0, 0.95, 0.9) * s2 * 0.9;

  // Layer 1 — nearest, brightest, fastest parallax
  vec2 uv1 = uv * 1.3 + drift * 1.2 + vec2(-5.0, -3.0);
  float s1 = starLayer(uv1, 50.0, 100.0);
  // Nearest stars are bigger and brighter
  vec2 id1 = floor(uv1 * 50.0);
  float h1 = fract(sin(dot(id1 + 100.0, vec2(127.1, 311.7))) * 43758.5453);
  vec3 nearStarCol = mix(vec3(1.0, 0.95, 0.8), vec3(0.8, 0.9, 1.3), fract(h1 * 7.0));
  color += nearStarCol * s1 * 1.5 * (0.8 + u_treble * 0.5);

  // ── Foreground dust — very faint extinction ──
  float dust = fbm3(uv * 2.0 + drift * 1.5);
  dust = smoothstep(0.1, 0.5, dust) * 0.06;
  color *= (1.0 - dust);

  // ── Ambient cosmic glow ──
  float ambientGlow = smoothstep(1.2, 0.0, length(uv)) * 0.03;
  vec3 glowCol = palette(
    t * 0.02 + paletteShift + 0.4,
    vec3(0.15, 0.12, 0.25),
    vec3(0.1, 0.08, 0.15),
    vec3(0.5, 0.3, 0.7),
    vec3(0.1, 0.1, 0.25)
  );
  color += glowCol * ambientGlow * (0.5 + u_amplitude * 0.5);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= (0.75 + 0.25 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;
