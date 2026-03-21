import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
// Ganymede — ice moon surface with cracked geometric patterns.
// Voronoi tessellation creates tectonic plate boundaries across
// an icy world, with subsurface ocean glow seeping through cracks.

float iceSheen(vec2 uv, float t) {
  float n = snoise(uv * 15.0 + t * 0.1) * 0.5 + 0.5;
  n *= snoise(uv * 25.0 - t * 0.05) * 0.5 + 0.5;
  return pow(n, 3.0);
}

float tectonicCrack(vec2 uv, float t) {
  vec3 v = voronoi(uv * 4.0 + t * 0.02);
  float edge = v.y - v.x;
  return smoothstep(0.08, 0.0, edge);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  float r = length(uv);

  // Planetary disk
  float disk = smoothstep(0.5, 0.47, r);

  // Surface coordinates
  vec2 surfUv = uv * rot2(t * 0.02) * 2.0;

  // Multi-scale voronoi cracks — tectonic plate boundaries
  float cracks1 = tectonicCrack(surfUv, t);
  float cracks2 = tectonicCrack(surfUv * 2.5 + vec2(15.0, 7.0), t * 0.8);
  float cracks3 = tectonicCrack(surfUv * 5.0 + vec2(30.0, 20.0), t * 0.5);
  float cracks = cracks1 * 0.6 + cracks2 * 0.3 + cracks3 * 0.15;

  // Voronoi plates — color variation between tectonic regions
  vec3 v1 = voronoi(surfUv * 4.0 + t * 0.02);
  float plateId = fract(sin(v1.x * 127.1 + v1.y * 311.7) * 43758.5453);

  // Ice surface terrain
  float terrain = fbm(surfUv * 3.0 + vec2(t * 0.03, 0.0)) * 0.5 + 0.5;

  // Subsurface ocean glow — seeps through cracks
  float oceanGlow = cracks * (0.5 + u_bass * 0.8);
  float oceanPulse = sin(t * 1.5 + surfUv.x * 3.0) * 0.3 + 0.7;
  oceanGlow *= oceanPulse;

  // Ice crystalline sheen
  float sheen = iceSheen(surfUv, t);

  // Grooved terrain — parallel ridges
  float ridges = sin(surfUv.x * 20.0 + surfUv.y * 5.0 + t * 0.3) * 0.5 + 0.5;
  ridges = smoothstep(0.4, 0.6, ridges) * 0.15;

  // Lighting — directional from upper left
  vec2 lightDir = normalize(vec2(-0.5, 0.6));
  float lighting = dot(normalize(uv), lightDir) * 0.25 + 0.75;

  float paletteShift = u_amplitude * 0.2;

  // Ice surface — pale blue-white
  vec3 iceCol = palette(
    terrain * 0.3 + plateId * 0.2 + paletteShift,
    vec3(0.6, 0.65, 0.72),
    vec3(0.1, 0.12, 0.15),
    vec3(0.3, 0.35, 0.45),
    vec3(0.0, 0.02, 0.08)
  );

  // Darker old terrain
  vec3 oldIceCol = palette(
    terrain * 0.2 + paletteShift + 0.3,
    vec3(0.4, 0.42, 0.48),
    vec3(0.08, 0.08, 0.12),
    vec3(0.25, 0.28, 0.38),
    vec3(0.05, 0.05, 0.12)
  );

  // Subsurface ocean — deep teal-blue glow
  vec3 oceanCol = palette(
    oceanGlow + t * 0.08 + paletteShift + 0.5,
    vec3(0.1, 0.4, 0.6),
    vec3(0.15, 0.25, 0.3),
    vec3(0.3, 0.5, 0.7),
    vec3(0.1, 0.2, 0.35)
  );

  vec3 color = vec3(0.0);

  // Surface compose
  vec3 surface = mix(oldIceCol, iceCol, terrain);
  surface += vec3(0.15, 0.17, 0.2) * sheen * (0.5 + u_treble * 0.5);
  surface += iceCol * ridges;
  surface *= lighting;

  // Crack glow
  surface += oceanCol * oceanGlow * (0.6 + u_mid * 0.6);

  // Crack darkening at edges
  surface *= (1.0 - cracks * 0.3);

  color += surface * disk;

  // Subtle atmospheric limb
  float limb = smoothstep(0.42, 0.5, r) * smoothstep(0.55, 0.47, r);
  color += vec3(0.15, 0.2, 0.3) * limb * 0.3;

  // Stars
  vec2 starUv = uv * 40.0;
  vec2 starId = floor(starUv);
  vec2 starF = fract(starUv) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float star = (starH > 0.97) ? smoothstep(0.03, 0.0, length(starF)) * 0.4 : 0.0;
  color += vec3(star) * (1.0 - disk);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
