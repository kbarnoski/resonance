import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Consuming spiral — matter being pulled into a central drain,
// everything rotating inward, no escape, accelerating as it approaches center.

float spiralArm(vec2 p, float arms, float tightness, float phase) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float spiral = sin(a * arms - log(r + 0.001) * tightness + phase);
  return smoothstep(0.0, 0.5, spiral) * exp(-r * 0.8);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Polar coordinates
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Inward acceleration — everything curves toward center
  // Bass intensifies the pull
  float pullStrength = 3.0 + u_bass * 4.0;
  float angularSpeed = 1.0 / (r + 0.05);
  float spiralAngle = angle + t * angularSpeed * 1.5;

  // Warp UV toward center with rotation
  vec2 warpedUV = uv * rot2(t * 0.3 + r * pullStrength * 0.2);
  float inwardWarp = 1.0 + 0.3 / (r + 0.1);
  warpedUV *= inwardWarp;

  // Multiple spiral arms with different tightnesses
  float arm1 = spiralArm(uv, 3.0, 8.0 + u_bass * 3.0, t * 2.0);
  float arm2 = spiralArm(uv, 5.0, 12.0 + u_bass * 2.0, -t * 1.5 + 1.0);
  float arm3 = spiralArm(uv, 2.0, 6.0 + u_mid * 2.0, t * 0.8 + 3.0);

  // Debris field — noise particles being swept into the vortex
  vec2 noiseUV = vec2(spiralAngle * 2.0, r * 5.0);
  float debris = fbm(noiseUV + t * 0.5);
  float debrisField = smoothstep(0.1, 0.6, debris) * exp(-r * 1.2);

  // Accretion ring — bright compressed matter at a specific radius
  float ringRadius = 0.25 + u_mid * 0.08;
  float ring = exp(-pow((r - ringRadius) * 8.0, 2.0));
  float ringNoise = snoise(vec2(spiralAngle * 6.0, t * 2.0)) * 0.5 + 0.5;
  ring *= 0.6 + ringNoise * 0.4;

  // Central darkness — the void at the heart
  float centralVoid = smoothstep(0.15 + u_bass * 0.05, 0.0, r);

  // Domain-warped background
  vec2 bgWarp = vec2(
    fbm(warpedUV * 2.0 + vec2(t * 0.1, 0.0)),
    fbm(warpedUV * 2.0 + vec2(0.0, t * 0.08))
  );
  float bgNoise = fbm(warpedUV * 1.5 + bgWarp * 2.0);
  float bgField = bgNoise * 0.5 + 0.5;

  // Colors — deep dark with blood-red and violet accretion
  vec3 bgColor = palette(bgField * 0.3 + paletteShift,
    vec3(0.02, 0.01, 0.03),
    vec3(0.04, 0.02, 0.05),
    vec3(0.8, 0.5, 1.0),
    vec3(0.2, 0.1, 0.4));

  vec3 armColor = palette(arm1 * 0.5 + paletteShift + 0.3,
    vec3(0.06, 0.01, 0.02),
    vec3(0.1, 0.03, 0.06),
    vec3(1.0, 0.4, 0.6),
    vec3(0.0, 0.1, 0.3));

  vec3 ringColor = palette(ringNoise * 0.5 + paletteShift + 0.6,
    vec3(0.1, 0.02, 0.01),
    vec3(0.15, 0.04, 0.02),
    vec3(1.0, 0.5, 0.3),
    vec3(0.0, 0.1, 0.2));

  vec3 debrisColor = palette(debris * 0.4 + paletteShift + 0.15,
    vec3(0.04, 0.02, 0.05),
    vec3(0.06, 0.03, 0.08),
    vec3(0.7, 0.5, 1.0),
    vec3(0.15, 0.1, 0.35));

  // Composite
  vec3 color = bgColor * 0.3;
  color += armColor * (arm1 + arm2 * 0.6 + arm3 * 0.4) * 0.3;
  color += debrisColor * debrisField * 0.2 * (0.5 + u_treble * 0.5);
  color += ringColor * ring * 0.5 * (0.6 + u_bass * 0.4);

  // Radial streaks — matter stretching as it falls in
  float streaks = snoise(vec2(angle * 15.0, r * 3.0 - t * 2.0));
  streaks = smoothstep(0.5, 0.9, streaks) * exp(-r * 2.0);
  color += armColor * streaks * 0.1 * u_treble;

  // Central void consumes everything
  color *= 1.0 - centralVoid;

  // Faint event horizon glow
  float horizonGlow = smoothstep(0.12, 0.06, r) * (1.0 - smoothstep(0.04, 0.0, r));
  color += ringColor * horizonGlow * 0.2 * (0.5 + u_amplitude);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, r);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
