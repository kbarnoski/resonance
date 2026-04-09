import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Volcanic — dark mountain silhouettes with glowing lava rivers.
// Layered mountain peaks as dark shapes, bright orange/red lava channels below.
// Horizon line with emissive valleys and rising heat haze.

float hash1(float n) { return fract(sin(n) * 43758.5453); }

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Mountain silhouette — jagged peaks from noise
float mountain(float x, float seed, float scale, float height) {
  float n = snoise(vec2(x * scale + seed, seed * 0.5));
  n += snoise(vec2(x * scale * 2.3 + seed + 50.0, seed)) * 0.5;
  n += snoise(vec2(x * scale * 5.0 + seed + 100.0, seed)) * 0.2;
  return n * height;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Sky — dark with faint red/orange glow from below ──
  vec3 skyTop = vec3(0.008, 0.005, 0.012);
  vec3 skyHorizon = vec3(0.04, 0.015, 0.008);
  float skyGrad = smoothstep(-0.1, 0.6, uv.y);
  vec3 col = mix(skyHorizon, skyTop, skyGrad);

  // Horizon glow — lava illuminates the sky from below
  float horizonGlow = exp(-abs(uv.y + 0.05) * 4.0) * 0.08;
  vec3 lavaGlowColor = palette(
    t * 0.3 + u_amplitude * 0.1,
    vec3(0.30, 0.10, 0.03),
    vec3(0.20, 0.08, 0.02),
    vec3(0.8, 0.4, 0.2),
    vec3(0.0, 0.05, 0.1)
  );
  col += lavaGlowColor * horizonGlow * (0.7 + u_bass * 0.4);

  // ── Mountain layers — 4 layers with parallax ──
  // Horizon line at y ~ -0.05

  // Layer 4 (farthest) — large distant peaks
  float m4 = mountain(uv.x, 0.0, 2.0, 0.25) + 0.05;
  float m4Mask = smoothstep(0.0, -0.01, uv.y - m4);
  vec3 m4Color = vec3(0.025, 0.015, 0.02);
  col = mix(col, m4Color, m4Mask);

  // Layer 3
  float m3 = mountain(uv.x, 10.0, 3.0, 0.2) - 0.02;
  float m3Mask = smoothstep(0.0, -0.01, uv.y - m3);
  vec3 m3Color = vec3(0.018, 0.01, 0.015);
  col = mix(col, m3Color, m3Mask);

  // Layer 2
  float m2 = mountain(uv.x, 25.0, 4.0, 0.18) - 0.08;
  float m2Mask = smoothstep(0.0, -0.01, uv.y - m2);
  vec3 m2Color = vec3(0.012, 0.008, 0.01);
  col = mix(col, m2Color, m2Mask);

  // Layer 1 (nearest) — sharp foreground peaks
  float m1 = mountain(uv.x, 50.0, 5.0, 0.15) - 0.15;
  float m1Mask = smoothstep(0.0, -0.01, uv.y - m1);
  vec3 m1Color = vec3(0.008, 0.005, 0.008);
  col = mix(col, m1Color, m1Mask);

  // ── Lava rivers — visible between mountain bases ──
  // Lava exists in the lower portion, between/below mountains
  float lavaRegion = smoothstep(-0.08, -0.25, uv.y);

  // Lava channels — use noise to create river-like patterns
  float lavaFlow = fbm3(vec2(uv.x * 3.0 + t * 0.5, (uv.y + 0.2) * 2.0 + t * 0.3));
  float lavaRivers = smoothstep(-0.1, 0.3, lavaFlow);
  lavaRivers *= lavaRegion;

  // Secondary finer channels
  float fineFlow = snoise(vec2(uv.x * 8.0 + t * 0.8, (uv.y + 0.2) * 6.0 + t * 0.5));
  float fineRivers = smoothstep(0.2, 0.6, fineFlow) * 0.5;
  fineRivers *= lavaRegion;

  float lavaTotal = clamp(lavaRivers + fineRivers, 0.0, 1.0);

  // Lava color — bright orange/red core, darker cooled edges
  vec3 lavaBright = palette(
    lavaFlow * 0.5 + t * 0.2 + u_bass * 0.2,
    vec3(0.35, 0.12, 0.03),
    vec3(0.25, 0.10, 0.03),
    vec3(0.8, 0.5, 0.2),
    vec3(0.0, 0.05, 0.05)
  );

  vec3 lavaCool = palette(
    lavaFlow * 0.3 + 0.5,
    vec3(0.12, 0.04, 0.02),
    vec3(0.10, 0.04, 0.02),
    vec3(0.5, 0.2, 0.1),
    vec3(0.0, 0.1, 0.1)
  );

  // Bright cores vs cooled crust
  float hotness = smoothstep(0.3, 0.7, lavaRivers);
  vec3 lavaColor = mix(lavaCool, lavaBright, hotness);

  // White-hot cores in the brightest channels
  float whiteHot = smoothstep(0.7, 1.0, lavaRivers) * smoothstep(-0.15, -0.3, uv.y);
  lavaColor = mix(lavaColor, vec3(0.4, 0.3, 0.15), whiteHot * 0.5);

  // Apply lava over mountain bases
  col = mix(col, lavaColor, lavaTotal * 0.9);

  // ── Lava glow on mountain edges — edges near lava catch orange light ──
  // Check proximity of each mountain to lava
  float edgeGlow2 = smoothstep(0.03, 0.0, abs(uv.y - m2)) * lavaRegion * 0.3;
  float edgeGlow1 = smoothstep(0.03, 0.0, abs(uv.y - m1)) * lavaRegion * 0.4;
  col += lavaGlowColor * (edgeGlow1 + edgeGlow2) * (0.5 + u_amplitude * 0.5);

  // ── Heat haze — rising shimmer above lava ──
  float hazeRegion = smoothstep(-0.2, 0.15, uv.y) * smoothstep(0.4, -0.1, uv.y);
  float haze = snoise(vec2(uv.x * 6.0, uv.y * 4.0 - t * 2.0)) * 0.5 + 0.5;
  haze *= hazeRegion * 0.015;
  col += lavaGlowColor * haze * (0.6 + u_mid * 0.4);

  // ── Embers / sparks rising from lava ──
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float ex = hash1(fi * 17.3) * 1.6 - 0.8;
    float ey = mod(hash1(fi * 23.7) + t * (0.3 + hash1(fi * 7.1) * 0.4), 1.2) - 0.5;
    ex += sin(t * 2.0 + fi * 4.0) * 0.05;

    float ed = length(uv - vec2(ex, ey));
    float ember = 0.0004 / (ed * ed + 0.0004);
    float fade = smoothstep(-0.5, 0.3, ey); // fade as they rise
    ember *= (1.0 - fade) * (0.5 + u_treble * 0.5);

    vec3 emberCol = mix(vec3(0.35, 0.15, 0.03), vec3(0.3, 0.25, 0.08), fade);
    col += emberCol * ember * 0.04;
  }

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  col *= vignette;

  col = clamp(col, 0.0, 0.4);

  gl_FragColor = vec4(col, 1.0);
}
`;
