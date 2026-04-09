import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Blood Moon — dark red moon hanging in a black sky
// Crimson clouds drift past, partially occluding the moon.
// SDF circle for moon, fbm3 for cloud layers.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // ── Sky background — near black with subtle color ──
  vec3 sky = vec3(0.01, 0.005, 0.015);
  // Faint vertical gradient — slightly lighter near horizon
  sky += vec3(0.01, 0.005, 0.008) * smoothstep(0.3, -0.6, uv.y);

  // ── Moon — SDF circle, positioned upper area ──
  vec2 moonPos = vec2(0.05, 0.15);
  float moonR = 0.25;
  float moonDist = length(uv - moonPos) - moonR;

  // Moon surface color — deep red/orange tones
  float moonMask = 1.0 - smoothstep(-0.005, 0.005, moonDist);

  // Surface detail — subtle noise for craters/texture
  vec2 moonUV = (uv - moonPos) / moonR;
  float surfaceNoise = fbm3(moonUV * 3.0 + vec2(0.0, t * 0.1));
  float surfaceDetail = 0.5 + 0.5 * surfaceNoise;

  // Moon color — dark crimson core brightening toward edges (limb darkening inverted for drama)
  float limbDist = length(moonUV);
  float limbFade = smoothstep(1.0, 0.3, limbDist);

  vec3 moonCore = palette(
    surfaceDetail * 0.8 + u_amplitude * 0.15,
    vec3(0.18, 0.04, 0.02),
    vec3(0.15, 0.06, 0.02),
    vec3(0.8, 0.3, 0.1),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 moonEdge = palette(
    surfaceDetail * 0.5 + 0.3,
    vec3(0.25, 0.06, 0.03),
    vec3(0.12, 0.04, 0.02),
    vec3(0.6, 0.2, 0.1),
    vec3(0.0, 0.1, 0.15)
  );

  vec3 moonColor = mix(moonEdge, moonCore, limbFade);
  // Darken the very center slightly for depth
  moonColor *= 0.7 + 0.3 * smoothstep(0.0, 0.6, limbDist);

  // Bass makes moon pulse brighter
  moonColor *= 0.85 + u_bass * 0.25;

  // ── Moon glow — atmospheric halo ──
  float glowDist = length(uv - moonPos);
  float innerGlow = exp(-glowDist * 4.0) * 0.12;
  float outerGlow = exp(-glowDist * 1.5) * 0.04;
  vec3 glowColor = vec3(0.35, 0.06, 0.03) * innerGlow + vec3(0.2, 0.03, 0.02) * outerGlow;
  glowColor *= 0.8 + u_amplitude * 0.3;

  // ── Cloud layers — fbm3 based, drifting horizontally ──
  // Layer 1: foreground clouds — thicker, slower
  vec2 cloud1UV = uv * vec2(1.5, 3.0) + vec2(t * 0.8, 0.0);
  float cloud1 = fbm3(cloud1UV);
  cloud1 = smoothstep(-0.1, 0.4, cloud1);

  // Layer 2: higher, thinner clouds — faster drift
  vec2 cloud2UV = uv * vec2(2.0, 4.0) + vec2(t * 1.2 + 10.0, 3.0);
  float cloud2 = fbm3(cloud2UV);
  cloud2 = smoothstep(0.05, 0.5, cloud2);

  // Clouds are darker near top, reddish near moon
  float nearMoon = exp(-length(uv - moonPos) * 2.0);
  vec3 cloudCol1 = mix(
    vec3(0.02, 0.01, 0.015),
    vec3(0.15, 0.03, 0.02),
    nearMoon * 0.6
  );
  vec3 cloudCol2 = mix(
    vec3(0.015, 0.008, 0.012),
    vec3(0.12, 0.025, 0.015),
    nearMoon * 0.4
  );

  // Mid-frequency adds subtle cloud density variation
  cloud1 *= 0.8 + u_mid * 0.2;

  // ── Composite ──
  vec3 col = sky;

  // Add moon glow behind everything
  col += glowColor;

  // Add moon
  col = mix(col, moonColor, moonMask);

  // Overlay clouds — they partially occlude moon and glow
  col = mix(col, cloudCol1, cloud1 * 0.7);
  col = mix(col, cloudCol2, cloud2 * 0.5);

  // ── Faint stars — tiny dots in the sky ──
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    vec2 starPos = vec2(
      fract(sin(fi * 127.1) * 43758.5) * 2.0 - 1.0,
      fract(sin(fi * 311.7) * 43758.5) * 2.0 - 1.0
    );
    float starD = length(uv - starPos);
    float twinkle = 0.5 + 0.5 * sin(t * 10.0 + fi * 5.0);
    float starGlow = 0.0003 / (starD * starD + 0.0003) * twinkle;
    // Only show stars where there are no clouds and no moon
    float starMask = (1.0 - cloud1) * (1.0 - cloud2) * (1.0 - moonMask);
    col += vec3(0.15, 0.1, 0.08) * starGlow * starMask * 0.15;
  }

  // Treble adds faint shimmer to the atmosphere
  col += vec3(0.02, 0.005, 0.005) * u_treble * nearMoon * 0.3;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  col *= vignette;

  // Clamp to keep in dark range
  col = clamp(col, 0.0, 0.4);

  gl_FragColor = vec4(col, 1.0);
}
`;
