import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Perdition — descent into darkness, spiraling downward motion

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Convert to polar for spiral work
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  // Spiraling descent — logarithmic spiral pulling inward
  float spiral1 = sin(angle * 3.0 - log(dist + 0.01) * 6.0 + t * 1.5);
  float spiral2 = sin(angle * 5.0 + log(dist + 0.01) * 8.0 - t * 1.2);
  float spiral3 = sin(angle * 2.0 - log(dist + 0.01) * 4.0 + t * 0.8);

  // Combine spirals — create layered vortex
  float vortex = spiral1 * 0.4 + spiral2 * 0.35 + spiral3 * 0.25;

  // Spiral arms — the channels of descent
  float arm1 = smoothstep(0.3, 0.8, spiral1) * exp(-dist * 0.5);
  float arm2 = smoothstep(0.4, 0.85, spiral2) * exp(-dist * 0.7);

  // Central abyss — absolute darkness at the core
  float abyss = exp(-dist * 8.0);
  float abyssEdge = exp(-dist * 3.0) - exp(-dist * 5.0);

  // Noise turbulence in the spiral
  vec2 spiralUV = rot2(t * 0.1 + dist * 2.0) * uv;
  float turbulence = fbm(spiralUV * 4.0 + t * 0.15);

  // Falling debris — things being pulled down the spiral
  float debris = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float dAngle = fi * 0.785 + t * (0.3 + fi * 0.05);
    float dDist = mod(0.6 - t * 0.1 - fi * 0.08, 0.8) + 0.05;
    vec2 dPos = vec2(cos(dAngle), sin(dAngle)) * dDist;
    float d = length(uv - dPos);
    debris += exp(-d * 30.0) * 0.04;
  }

  // Colors: deep infernal — blacks, dark reds, hints of dull amber
  vec3 spiralColor = palette(0.1 + vortex * 0.1 + u_amplitude * 0.12,
    vec3(0.01, 0.005, 0.003),
    vec3(0.03, 0.012, 0.006),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.2));

  vec3 armColor = palette(0.15 + u_bass * 0.1,
    vec3(0.02, 0.008, 0.004),
    vec3(0.04, 0.015, 0.008),
    vec3(1.0, 1.0, 1.0),
    vec3(0.05, 0.15, 0.25));

  vec3 abyssColor = vec3(0.001, 0.0, 0.001);

  vec3 edgeColor = palette(0.08 + u_treble * 0.1,
    vec3(0.015, 0.008, 0.003),
    vec3(0.04, 0.02, 0.008),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.08, 0.18));

  vec3 debrisColor = palette(0.2 + u_mid * 0.08,
    vec3(0.02, 0.012, 0.005),
    vec3(0.04, 0.02, 0.01),
    vec3(1.0, 1.0, 1.0),
    vec3(0.05, 0.12, 0.2));

  // Background: near-black with spiral tint
  vec3 bgColor = vec3(0.005, 0.004, 0.006);

  // Compose
  vec3 color = bgColor;

  // Spiral structure
  color += spiralColor * (vortex * 0.5 + 0.5) * 0.03 * exp(-dist * 0.8);
  color += armColor * arm1 * 0.06 * (1.0 + u_bass * 0.8);
  color += armColor * arm2 * 0.04;

  // Turbulence
  color += spiralColor * turbulence * 0.02 * exp(-dist * 1.0);

  // Abyss edge glow — the rim of the pit
  color += edgeColor * abyssEdge * 0.15 * (1.0 + u_amplitude * 0.5);

  // Central void
  color = mix(color, abyssColor, abyss);

  // Debris
  color += debrisColor * debris * (1.0 + u_treble * 0.5);

  // Rotational motion blur
  vec2 blurUV = rot2(0.05) * uv;
  float motionBlur = fbm(blurUV * 3.0 + t * 0.2);
  color += spiralColor * motionBlur * 0.01 * exp(-dist * 1.5);

  // Bass: vortex intensifies
  color *= 1.0 + u_bass * abyssEdge * 0.3;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
