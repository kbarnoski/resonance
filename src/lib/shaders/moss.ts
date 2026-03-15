import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.08;

  // ── Triple-pass domain-warped FBM ──
  // No ground plane. Fullscreen microscope view of tangled filaments.

  // Pass 1: large-scale displacement field
  vec2 warp1 = vec2(
    fbm(uv * 2.0 + vec2(t * 0.3, t * 0.2)),
    fbm(uv * 2.0 + vec2(t * 0.15, -t * 0.25) + 5.3)
  );

  // Pass 2: sample through the displacement
  vec2 warpedUV = uv * 3.0 + warp1 * 1.6;
  vec2 warp2 = vec2(
    fbm(warpedUV + vec2(-t * 0.2, t * 0.1)),
    fbm(warpedUV + vec2(t * 0.18, t * 0.22) + 8.1)
  );

  // Pass 3: fine detail at higher frequency
  vec2 fineUV = uv * 6.0 + warp2 * 0.9 + warp1 * 0.5;
  float fineDetail = fbm(fineUV + vec2(t * 0.1, -t * 0.15));

  // Combined filament structure
  float structure = fbm(uv * 3.5 + warp1 * 1.2 + warp2 * 0.7);
  float filaments = fbm(uv * 7.0 + warp2 * 1.1 + vec2(t * 0.08, 0.0));

  // Filament density — creates the branching tendrils
  float density = smoothstep(-0.1, 0.5, structure);
  float thinStrands = smoothstep(0.15, 0.45, abs(filaments));
  float tendrilMask = density * (1.0 - thinStrands * 0.6);

  // Height / bump from fine detail
  float bump = fineDetail * 0.5 + 0.5;

  // ── Colors: deep forest greens, warm amber accents, dark background ──
  vec3 darkBg = palette(
    structure * 0.2 + paletteShift,
    vec3(0.02, 0.04, 0.03),
    vec3(0.03, 0.05, 0.03),
    vec3(0.4, 0.6, 0.3),
    vec3(0.0, 0.2, 0.1)
  );

  vec3 mossGreen = palette(
    structure * 0.5 + bump * 0.3 + t * 0.03 + paletteShift,
    vec3(0.12, 0.25, 0.10),
    vec3(0.10, 0.22, 0.08),
    vec3(0.7, 1.0, 0.5),
    vec3(0.05, 0.25, 0.40)
  );

  vec3 deepGreen = palette(
    filaments * 0.6 + paletteShift + 0.3,
    vec3(0.05, 0.12, 0.06),
    vec3(0.06, 0.14, 0.07),
    vec3(0.5, 0.9, 0.4),
    vec3(0.0, 0.30, 0.15)
  );

  vec3 amberAccent = palette(
    bump * 0.8 + t * 0.05 + paletteShift + 0.6,
    vec3(0.35, 0.22, 0.08),
    vec3(0.30, 0.20, 0.10),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.10, 0.20)
  );

  // ── Compose layers ──
  vec3 color = darkBg;

  // Broad tendril mass
  color = mix(color, deepGreen, tendrilMask * 0.8);

  // Brighter moss on raised areas
  float raised = smoothstep(0.4, 0.8, bump) * tendrilMask;
  color = mix(color, mossGreen, raised);

  // Amber sporophyte tips — only on highest bumps of filament areas
  float tipMask = smoothstep(0.7, 0.9, bump) * smoothstep(0.3, 0.7, density);
  color = mix(color, amberAccent, tipMask * 0.7);

  // Soft inner glow along curling filament edges
  float edgeGlow = smoothstep(0.02, 0.0, abs(structure - 0.2)) * density;
  color += mossGreen * edgeGlow * 0.3;

  // Subtle depth variation — overlapping layers feel deep
  float depthFade = smoothstep(0.6, 0.0, abs(warp1.x - warp1.y));
  color *= 0.85 + depthFade * 0.15;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
