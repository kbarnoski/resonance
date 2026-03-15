import { U, VISIONARY_PALETTE, ROT2, SMOOTH_NOISE } from "./shared";

// Deep spiraling vortex pulling infinitely inward, warped rings fading into a
// bottomless center. Logarithmic polar spiral with fbm warp.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SMOOTH_NOISE + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.14;
  float paletteShift = u_amplitude * 0.28;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Logarithmic spiral coordinate — each step inward is exponentially farther
  // log(r) maps infinite depth at center to finite coordinate space
  float logR = log(r + 0.001);

  // FBM warp applied in polar space to break perfect symmetry
  float warpAmt = 0.28 + u_bass * 0.18;
  vec2 polarP = vec2(angle * 1.2, logR * 3.0 + t);
  float warp1 = fbm(polarP + vec2(t * 0.3, 0.0)) * warpAmt;
  float warp2 = fbm(polarP * 1.7 + vec2(0.5, t * 0.2)) * warpAmt * 0.5;

  // Warped log-radius drives ring pattern
  float warpedLogR = logR + warp1 + warp2 * u_mid * 0.5;

  // Spiral arms: logR - k*angle = const draws a log spiral
  float spiralArms = 3.0;
  float spiralPhase = warpedLogR * 6.0 - angle * spiralArms - t * 3.5 + u_bass * 1.2;
  float spiral = 0.5 + 0.5 * sin(spiralPhase);

  // Sharp ring edges for the sucking-inward feel
  float ring = pow(spiral, 3.0 + u_mid * 2.0);

  // Secondary tight spiral — faster rotation, creates crossing interference
  float spiralPhase2 = warpedLogR * 11.0 + angle * 2.0 - t * 6.0 + u_treble * 2.0;
  float ring2 = pow(max(0.0, 0.5 + 0.5 * sin(spiralPhase2)), 5.0);

  // Depth falloff — center is infinitely far, so brightness increases toward edge
  // but sucked in by strong central glow
  float depthFog = 1.0 - exp(-r * 3.5);   // near edge = lit, center = void
  float centerGlow = exp(-r * r * 8.0) * (1.0 + u_amplitude * 0.8);

  // Radial velocity shimmer — treble adds fast outward/inward pulse
  float radialShimmer = 0.5 + 0.5 * sin(r * 30.0 - t * 8.0 + u_treble * 3.0);
  radialShimmer = pow(radialShimmer, 4.0) * u_treble * 0.3;

  // Palette lookups
  float ph1 = warpedLogR * 0.5 + t * 0.08 + paletteShift;
  float ph2 = spiralPhase * 0.1 + u_mid * 0.25 + paletteShift;
  float ph3 = r * 1.5 + t * 0.05 + paletteShift;

  vec3 c1 = palette(ph1,
    vec3(0.5, 0.3, 0.6), vec3(0.5, 0.4, 0.5), vec3(1.0, 1.3, 0.8), vec3(0.0, 0.1, 0.4));
  vec3 c2 = palette(ph2,
    vec3(0.2, 0.4, 0.7), vec3(0.6, 0.4, 0.3), vec3(0.8, 1.0, 1.2), vec3(0.4, 0.0, 0.1));
  vec3 c3 = palette(ph3,
    vec3(0.8, 0.6, 0.5), vec3(0.3, 0.3, 0.4), vec3(2.0, 1.0, 1.0), vec3(0.5, 0.2, 0.0));

  vec3 color = vec3(0.0);
  color += c1 * ring * depthFog * (0.6 + u_bass * 0.4);
  color += c2 * ring2 * (0.4 + u_mid * 0.3);
  color += c3 * centerGlow;
  color += vec3(0.9, 0.95, 1.0) * radialShimmer * depthFog;

  // Dark void at absolute center — the unreachable bottom
  float voidMask = smoothstep(0.02, 0.08, r);
  color *= voidMask;

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
