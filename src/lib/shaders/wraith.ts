import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Deep domain warp — wraith tendrils
float domainWarp(vec2 p, float time) {
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + time * 0.08),
    fbm(p + vec2(5.2, 1.3) + time * 0.06)
  );
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + time * 0.05),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) + time * 0.04)
  );
  return fbm(p + 4.0 * r + time * 0.03);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.26;

  // Wraith tendrils: darkness IS the subject — dark shapes on slightly-less-dark bg

  // Multi-scale domain warp
  float f1 = domainWarp(uv * 2.0, t);
  float f2 = domainWarp(uv * 3.5 + 1.3, t * 1.2);
  float f3 = domainWarp(uv * 5.5 + 2.7, t * 0.8);

  // Tendrils: thin dark regions from domain warped noise
  // Inverted: low values = tendrils = darkness
  float tendril1 = 1.0 - smoothstep(0.0, 0.3 + u_bass * 0.1, f1 * 0.5 + 0.5);
  float tendril2 = 1.0 - smoothstep(0.1, 0.35, f2 * 0.5 + 0.5);
  float tendril3 = 1.0 - smoothstep(0.15, 0.32, f3 * 0.5 + 0.5);

  // Combine tendrils — dark overlapping strands
  float tendrilMask = max(tendril1, max(tendril2 * 0.8, tendril3 * 0.6));

  // The background itself is near-dark
  // Tendrils are deeper black cutting through slightly luminous void
  float bgLuminance = fbm(uv * 1.5 + t * 0.04) * 0.5 + 0.5;
  bgLuminance = smoothstep(0.3, 0.8, bgLuminance) * 0.06;

  // Reaching: tendrils pull toward center/toward viewer
  float pullDist = length(uv);
  float pullEffect = (1.0 - exp(-pullDist * 1.8)) * 0.15 * u_bass;
  tendrilMask = clamp(tendrilMask + pullEffect, 0.0, 1.0);

  // Colors — almost entirely dark
  // Background: extremely dark, barely purple-black
  vec3 bgColor = palette(0.77 + paletteShift,
    vec3(0.008, 0.005, 0.012),
    vec3(0.018, 0.01, 0.028),
    vec3(1.0, 1.0, 1.0),
    vec3(0.6, 0.7, 0.9));

  // The slight luminosity in the bg — traces of what the wraith passes through
  vec3 traceColor = palette(0.65 + paletteShift + u_mid * 0.12,
    vec3(0.01, 0.008, 0.02),
    vec3(0.04, 0.02, 0.08),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.6, 0.85));

  // Tendril edges: faint cold glow where darkness meets void — edges of the wraith
  // Only on the boundary, not the interior
  float edge1 = smoothstep(0.0, 0.08, f1 * 0.5 + 0.5) * (1.0 - smoothstep(0.08, 0.25, f1 * 0.5 + 0.5));
  float edge2 = smoothstep(0.05, 0.12, f2 * 0.5 + 0.5) * (1.0 - smoothstep(0.12, 0.28, f2 * 0.5 + 0.5));
  float edgeMask = max(edge1, edge2 * 0.7) * (0.15 + u_treble * 0.12);

  vec3 edgeColor = palette(0.58 + paletteShift + u_mid * 0.08,
    vec3(0.0, 0.0, 0.01),
    vec3(0.03, 0.02, 0.08),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.55, 0.8));

  vec3 color = bgColor;
  color += traceColor * bgLuminance;
  // Tendrils darken the space — subtract light, add tiny trace
  color = mix(color, bgColor * 0.1, tendrilMask * 0.85);
  // Edges of tendrils: faint cold emission
  color += edgeColor * edgeMask;

  // Bass: makes tendrils heavier, more present
  color *= 1.0 - tendrilMask * u_bass * 0.3;

  // Treble: tiny sparkle where tendrils dissipate
  float dissipate = smoothstep(0.4, 0.8, 1.0 - tendrilMask);
  float spark = snoise(uv * 18.0 + t * 2.0) * snoise(uv * 11.0 - t);
  color += traceColor * smoothstep(0.6, 0.9, spark) * dissipate * u_treble * 0.04;

  // Radial pull — edges reach outward
  float radialGlow = exp(-pullDist * 2.5) * 0.04 * (1.0 + u_amplitude);
  color += traceColor * radialGlow * (1.0 - tendrilMask);

  // Vignette
  float vignette = pow(1.0 - smoothstep(0.1, 1.4, pullDist), 2.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
