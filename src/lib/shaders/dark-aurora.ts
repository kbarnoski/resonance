import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Dark aurora — moody aurora borealis with deep greens and purples
// Vertical curtains of color rippling against a near-black sky.

// 3-octave fbm
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.15;

  // ── Night sky base — near-black with faint deep blue ──
  float skyGrad = smoothstep(-0.8, 0.9, uv.y);
  vec3 color = mix(
    vec3(0.008, 0.005, 0.012), // bottom — nearly black
    vec3(0.012, 0.01, 0.025),  // top — faintest indigo hint
    skyGrad
  );

  // ── Aurora curtains — multiple overlapping bands ──
  // Each curtain is a sine wave with domain warping for organic ripple

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float curtainPhase = fi * 1.47 + 0.5;

    // Horizontal position of this curtain band
    float curtainX = (fi - 2.0) * 0.35;

    // Domain warp the x-coordinate for organic rippling
    float warpAmt = 0.15 + fi * 0.03;
    float warpFreq = 2.0 + fi * 0.5;
    float warp = fbm3(vec2(uv.y * warpFreq + t * (0.3 + fi * 0.1), fi * 3.7)) * warpAmt;
    float warp2 = sin(uv.y * (3.0 + fi * 0.7) + t * (0.5 + fi * 0.15) + curtainPhase) * 0.08;

    // The curtain shape — a soft vertical band
    float dx = uv.x - curtainX + warp + warp2;
    float curtainWidth = 0.12 + fbm3(vec2(uv.y * 1.5 + fi * 5.0, t * 0.2)) * 0.08;

    // Gaussian-ish falloff from curtain center
    float curtain = exp(-dx * dx / (curtainWidth * curtainWidth * 2.0));

    // Vertical intensity — aurora is brighter in the upper-mid region
    float vertMask = smoothstep(-0.5, 0.0, uv.y) * smoothstep(0.8, 0.2, uv.y);
    // Add some variation along the curtain height
    float heightVar = fbm3(vec2(uv.y * 3.0 + fi * 2.1, t * 0.4 + fi)) * 0.5 + 0.5;
    heightVar = smoothstep(0.2, 0.8, heightVar);

    curtain *= vertMask * heightVar;

    // Bass makes curtains slightly brighter and wider
    curtain *= (0.7 + u_bass * 0.4);

    // ── Curtain color — alternating greens and purples ──
    float hueShift = fi * 0.22 + paletteShift;

    // Green-dominant curtains
    vec3 auroraGreen = palette(
      hueShift + uv.y * 0.15,
      vec3(0.02, 0.08, 0.03),
      vec3(0.04, 0.12, 0.04),
      vec3(0.3, 0.8, 0.4),
      vec3(0.1, 0.25, 0.15)
    );

    // Purple/violet curtains
    vec3 auroraPurple = palette(
      hueShift + 0.5 + uv.y * 0.1,
      vec3(0.04, 0.02, 0.08),
      vec3(0.06, 0.03, 0.1),
      vec3(0.5, 0.3, 0.8),
      vec3(0.15, 0.1, 0.3)
    );

    // Mix green and purple based on curtain index
    float greenPurple = sin(fi * 1.8 + 0.3) * 0.5 + 0.5;
    vec3 curtainColor = mix(auroraGreen, auroraPurple, greenPurple);

    // Height-based color shift — bottom of curtains more red/purple, top more green
    vec3 bottomTint = palette(
      hueShift + 0.65,
      vec3(0.06, 0.01, 0.04),
      vec3(0.05, 0.02, 0.06),
      vec3(0.6, 0.2, 0.7),
      vec3(0.1, 0.05, 0.25)
    );
    curtainColor = mix(bottomTint, curtainColor, smoothstep(-0.2, 0.3, uv.y));

    // Add to scene
    color += curtainColor * curtain * 0.25;
  }

  // ── Mid-frequency ripple — subtle horizontal shimmer across the aurora ──
  float shimmer = sin(uv.x * 15.0 + uv.y * 5.0 + u_time * 1.5) * 0.5 + 0.5;
  shimmer = smoothstep(0.6, 0.9, shimmer);
  float auroraMask = smoothstep(-0.3, 0.1, uv.y) * smoothstep(0.7, 0.3, uv.y);
  color += vec3(0.01, 0.02, 0.01) * shimmer * auroraMask * u_mid * 0.3;

  // ── Faint stars in the dark sky — tiny specks ──
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float sx = fract(sin(fi * 127.1) * 43758.5) * 2.0 - 1.0;
    float sy = fract(sin(fi * 311.7) * 43758.5) * 1.0 - 0.2; // biased upward
    float sd = length(uv - vec2(sx, sy));
    float starSize = 0.001 + fract(fi * 0.37) * 0.001;
    float star = starSize / (sd * sd + starSize * 0.5);
    // Twinkle
    float twinkle = 0.5 + 0.5 * sin(u_time * (1.5 + fract(fi * 0.73) * 3.0) + fi * 4.7);
    star *= twinkle;
    // Stars dimmed where aurora is bright
    float starDim = 1.0 - smoothstep(0.0, 0.3, length(color));
    color += vec3(0.7, 0.8, 1.0) * star * 0.003 * starDim;
  }

  // ── Treble-reactive aurora brightening — occasional flare ──
  float flareNoise = fbm3(vec2(uv.x * 2.0 + t * 0.5, uv.y * 3.0 + t * 0.3));
  float flare = smoothstep(0.3, 0.7, flareNoise) * auroraMask;
  color += vec3(0.01, 0.025, 0.01) * flare * u_treble * 0.4;

  // Vignette — subtle, keeps the sky feeling vast
  float vd = length(uv * vec2(0.85, 0.75));
  float vignette = 1.0 - smoothstep(0.5, 1.4, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
