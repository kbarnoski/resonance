import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Suffocating dark — darkness closing in from edges, the available light
// shrinking, claustrophobic compression, the last pocket of visibility.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Breathing aperture — the visible area pulses with audio
  // Bass makes it contract, amplitude gives brief relief
  float breathe = sin(t * 0.7) * 0.05 + sin(t * 1.3) * 0.03;
  float aperture = 0.25 + breathe - u_bass * 0.12 + u_amplitude * 0.08;
  aperture = max(aperture, 0.05);

  // The darkness boundary — irregular, creeping, organic
  float boundaryNoise = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float freq = 3.0 + fi * 2.0;
    float amp = 0.06 / (1.0 + fi * 0.5);
    float speed = 0.15 + fi * 0.05;
    boundaryNoise += snoise(vec2(angle * freq + t * speed, fi * 7.1)) * amp;
  }

  // The closing edge — dark tendrils reaching inward
  float tendrilLayer = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float tendrilAngle = angle + fi * 1.57 + t * (0.1 + fi * 0.03);
    float tendrilR = snoise(vec2(tendrilAngle * (4.0 + fi), t * 0.2 + fi));
    tendrilR = max(tendrilR, 0.0);
    float tendril = tendrilR * 0.15 * exp(-fi * 0.3);
    tendrilLayer += tendril;
  }

  float darkEdge = aperture + boundaryNoise - tendrilLayer;

  // Light falloff — the pocket of visibility
  float visibility = smoothstep(darkEdge + 0.15, darkEdge - 0.05, r);

  // Inner light — what remains visible, dim and fading
  vec2 innerUV = uv * rot2(t * 0.1);
  float innerNoise = fbm(innerUV * 3.0 + t * 0.08);
  float innerField = innerNoise * 0.5 + 0.5;

  // Second layer of inner detail
  float detail = fbm(innerUV * 6.0 - t * 0.05 + vec2(5.0));
  float detailField = detail * 0.5 + 0.5;

  // Inner color — muted, pale, like suffocated light
  vec3 innerColor = palette(innerField * 0.3 + paletteShift,
    vec3(0.04, 0.03, 0.05),
    vec3(0.06, 0.04, 0.07),
    vec3(0.6, 0.5, 0.8),
    vec3(0.15, 0.1, 0.3));

  vec3 detailColor = palette(detailField * 0.4 + paletteShift + 0.3,
    vec3(0.03, 0.03, 0.04),
    vec3(0.05, 0.04, 0.06),
    vec3(0.5, 0.6, 0.7),
    vec3(0.2, 0.15, 0.3));

  vec3 lightPocket = innerColor * 0.5 + detailColor * 0.3;
  lightPocket *= (0.15 + u_mid * 0.1);

  // The breathing center — a faint warm core
  float coreDist = length(uv - vec2(sin(t * 0.3) * 0.05, cos(t * 0.4) * 0.03));
  float coreGlow = exp(-coreDist * 6.0) * 0.15;
  vec3 coreColor = palette(t * 0.2 + paletteShift + 0.6,
    vec3(0.05, 0.02, 0.03),
    vec3(0.08, 0.03, 0.05),
    vec3(0.8, 0.4, 0.5),
    vec3(0.0, 0.1, 0.25));

  lightPocket += coreColor * coreGlow * (0.5 + u_amplitude * 0.5);

  // The dark mass — not just black, but textured darkness
  float darkNoise = fbm(uv * 2.0 + t * 0.03);
  float darkTexture = darkNoise * 0.5 + 0.5;
  vec3 darkMass = palette(darkTexture * 0.2 + paletteShift + 0.8,
    vec3(0.005, 0.003, 0.008),
    vec3(0.01, 0.005, 0.015),
    vec3(0.5, 0.4, 0.8),
    vec3(0.2, 0.15, 0.35));
  darkMass *= 0.15;

  // Boundary glow — faint luminance where dark meets light
  float boundaryDist = abs(r - darkEdge);
  float boundaryGlow = exp(-boundaryDist * 15.0) * 0.12;
  vec3 boundaryColor = palette(angle * 0.3 + t + paletteShift,
    vec3(0.03, 0.02, 0.05),
    vec3(0.06, 0.03, 0.08),
    vec3(0.6, 0.5, 0.9),
    vec3(0.15, 0.1, 0.35));

  // Treble: sparks at the boundary — the light fighting back
  float sparkNoise = snoise(vec2(angle * 20.0, r * 15.0 + t * 3.0));
  float sparks = smoothstep(0.7, 0.95, sparkNoise) * exp(-boundaryDist * 8.0);
  sparks *= u_treble * 0.2;

  // Pressure waves — concentric pulses from bass
  float wave = sin(r * 30.0 - t * 4.0 - u_bass * 5.0) * 0.5 + 0.5;
  wave = pow(wave, 8.0) * exp(-r * 4.0) * u_bass * 0.08;

  // Composite
  vec3 color = mix(darkMass, lightPocket, visibility);
  color += boundaryColor * boundaryGlow * (0.5 + u_mid * 0.5);
  color += boundaryColor * sparks;
  color += coreColor * wave;

  // The suffocation effect — everything dims as the aperture shrinks
  float suffocation = smoothstep(0.4, 0.05, aperture);
  color *= 1.0 - suffocation * 0.5;

  // Vignette — extra heavy, reinforcing the closing-in sensation
  float vignette = pow(1.0 - smoothstep(0.1, 1.0, r), 2.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
