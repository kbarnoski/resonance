import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Flowing volcanic glass — thick, viscous dark fluid with occasional hot cracks.
// Slow, heavy movement. The surface catches light in oily sheens.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;

  // ── Viscous flow field — domain warping for thick fluid motion ──
  vec2 flowUV = uv * 2.0;
  float warp1 = fbm4(flowUV + vec2(t * 0.3, t * 0.1));
  float warp2 = fbm4(flowUV + vec2(-t * 0.2, t * 0.25) + 5.0);
  vec2 warped = flowUV + vec2(warp1, warp2) * 0.6;

  // Second pass — double domain warp for extra viscosity
  float flow = fbm4(warped + vec2(t * 0.15, -t * 0.1));

  // ── Surface topology — ridges and valleys in the glass flow ──
  float ridge = abs(flow);
  float valley = 1.0 - ridge;
  float surface = smoothstep(0.0, 0.4, ridge);

  // ── Hot cracks — where the flow tears apart, molten interior visible ──
  float crackNoise = fbm4(warped * 2.0 + vec2(t * 0.4, 0.0));
  float cracks = smoothstep(0.02, 0.0, abs(crackNoise));
  cracks += smoothstep(0.03, 0.0, abs(crackNoise - 0.5)) * 0.5;

  // Bass opens cracks wider
  cracks *= (0.5 + u_bass * 0.8);

  // ── Oily surface sheen — iridescent reflection on the glass ──
  float sheenAngle = fbm4(warped * 0.5 * rot2(t * 0.05));
  float sheen = pow(smoothstep(0.3, 0.7, sheenAngle), 2.0) * 0.15;

  // ── Colors ──
  // Base obsidian flow — near-black with deep blue undertone
  vec3 flowColor = palette(
    flow * 1.5 + u_amplitude * 0.15,
    vec3(0.015, 0.01, 0.02),
    vec3(0.03, 0.02, 0.04),
    vec3(0.3, 0.25, 0.4),
    vec3(0.1, 0.08, 0.15)
  );

  // Ridge highlights — where the surface catches dim light
  vec3 ridgeColor = palette(
    ridge * 3.0 + t * 0.2,
    vec3(0.04, 0.03, 0.06),
    vec3(0.05, 0.04, 0.08),
    vec3(0.4, 0.35, 0.6),
    vec3(0.1, 0.08, 0.2)
  );

  // Hot crack interior — deep red to orange
  vec3 crackColor = palette(
    cracks * 2.0 + t * 0.3,
    vec3(0.4, 0.1, 0.02),
    vec3(0.4, 0.2, 0.05),
    vec3(0.8, 0.4, 0.2),
    vec3(0.0, 0.05, 0.05)
  );

  // Iridescent sheen — oil-slick purples and greens
  vec3 sheenColor = palette(
    sheenAngle * 4.0 + t * 0.15,
    vec3(0.08, 0.05, 0.1),
    vec3(0.1, 0.08, 0.15),
    vec3(0.7, 0.5, 0.9),
    vec3(0.1, 0.2, 0.3)
  );

  // ── Compositing ──
  vec3 color = flowColor;
  color += ridgeColor * surface * 0.3;
  color += crackColor * cracks * 0.7;
  color += sheenColor * sheen * (0.5 + u_mid * 0.5);

  // White-hot crack centers
  float hotCore = pow(cracks, 3.0);
  color += vec3(1.0, 0.7, 0.3) * hotCore * 0.4;

  // Heat haze near cracks
  float haze = smoothstep(0.0, 0.1, cracks) * 0.05;
  color += vec3(0.2, 0.08, 0.03) * haze;

  // Treble adds surface sparkle
  float sparkle = pow(fract(snoise(warped * 10.0) * 5.0), 12.0);
  color += vec3(0.5, 0.4, 0.6) * sparkle * 0.1 * u_treble;

  // Vignette
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
