import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark matter — invisible substance made visible through its gravitational
// effects, lensing, dark energy visualization, negative-space aesthetics.

vec2 gravitationalLens(vec2 uv, vec2 massPos, float strength) {
  vec2 delta = uv - massPos;
  float dist = length(delta);
  float deflection = strength / (dist * dist + 0.01);
  return uv + normalize(delta) * deflection * 0.1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Dark matter masses — invisible but distorting space
  vec2 mass1 = vec2(sin(t * 0.3) * 0.3, cos(t * 0.4) * 0.25);
  vec2 mass2 = vec2(cos(t * 0.25 + 2.0) * 0.4, sin(t * 0.35 + 1.0) * 0.3);
  vec2 mass3 = vec2(sin(t * 0.2 + 4.0) * 0.25, cos(t * 0.3 + 3.0) * 0.35);

  float massStr1 = 0.05 + u_bass * 0.04;
  float massStr2 = 0.035 + u_mid * 0.03;
  float massStr3 = 0.025 + u_treble * 0.02;

  // Apply gravitational lensing — cascade of distortions
  vec2 lensedUV = uv;
  lensedUV = gravitationalLens(lensedUV, mass1, massStr1);
  lensedUV = gravitationalLens(lensedUV, mass2, massStr2);
  lensedUV = gravitationalLens(lensedUV, mass3, massStr3);

  // Distortion field — difference between original and lensed space
  float distortion = length(lensedUV - uv);
  float distortionMap = smoothstep(0.0, 0.1, distortion);

  // Background starfield — faint points being lensed
  float starField = 0.0;
  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    vec2 starPos = hash2(vec2(fi * 17.3, fi * 11.7));
    float starDist = length(lensedUV - starPos);
    float starBright = 0.001 / (starDist * starDist + 0.001);
    starBright *= 0.3 + 0.7 * sin(t * (0.5 + fi * 0.1) + fi) * 0.5 + 0.5;
    starField += starBright;
  }
  starField = min(starField, 1.0);

  // Dark energy web — the large-scale structure of the cosmos
  // Made visible only through its effects
  float web1 = fbm(lensedUV * 3.0 + t * 0.05);
  float web2 = fbm(lensedUV * 5.0 - t * 0.03 + vec2(8.0));
  float webField = web1 * web2;
  webField = webField * 0.5 + 0.5;

  // Filaments — the cosmic web connecting dark matter halos
  float filament = smoothstep(0.45, 0.55, webField);
  float filamentEdge = smoothstep(0.43, 0.47, webField) *
                       (1.0 - smoothstep(0.53, 0.57, webField));

  // Negative space halos around masses — dark matter halos
  float halo1 = length(uv - mass1);
  float halo2 = length(uv - mass2);
  float halo3 = length(uv - mass3);

  float haloRing1 = exp(-pow((halo1 - 0.15) * 8.0, 2.0)) * 0.3;
  float haloRing2 = exp(-pow((halo2 - 0.12) * 10.0, 2.0)) * 0.2;
  float haloRing3 = exp(-pow((halo3 - 0.1) * 12.0, 2.0)) * 0.15;

  // Colors: the invisible made barely perceptible
  // Base: near-total darkness
  vec3 voidColor = palette(0.9 + paletteShift,
    vec3(0.005, 0.003, 0.008),
    vec3(0.008, 0.005, 0.012),
    vec3(0.5, 0.4, 0.8),
    vec3(0.2, 0.15, 0.4));

  // Distortion visualization — where space is being bent
  vec3 lensColor = palette(distortion * 5.0 + paletteShift + 0.3,
    vec3(0.01, 0.008, 0.02),
    vec3(0.03, 0.015, 0.04),
    vec3(0.6, 0.4, 0.9),
    vec3(0.15, 0.1, 0.35));

  // Filament color — the cosmic web
  vec3 webColor = palette(webField * 0.4 + paletteShift + 0.5,
    vec3(0.008, 0.005, 0.015),
    vec3(0.02, 0.01, 0.03),
    vec3(0.5, 0.3, 0.8),
    vec3(0.2, 0.15, 0.4));

  // Halo color — gravitational aura
  vec3 haloColor = palette(t * 0.2 + paletteShift + 0.7,
    vec3(0.01, 0.005, 0.02),
    vec3(0.03, 0.01, 0.05),
    vec3(0.7, 0.4, 1.0),
    vec3(0.1, 0.1, 0.3));

  // Star color
  vec3 starColor = palette(starField * 0.3 + paletteShift + 0.15,
    vec3(0.06, 0.05, 0.08),
    vec3(0.1, 0.08, 0.12),
    vec3(0.5, 0.6, 0.8),
    vec3(0.1, 0.15, 0.25));

  // Composite
  vec3 color = voidColor;

  // Cosmic web filaments — faint structure
  color += webColor * filament * 0.08 * (0.5 + u_mid * 0.5);
  color += webColor * filamentEdge * 0.12;

  // Distortion glow — where lensing is strongest
  color += lensColor * distortionMap * 0.15 * (0.4 + u_bass * 0.6);

  // Dark matter halos
  color += haloColor * (haloRing1 + haloRing2 + haloRing3) * (0.3 + u_amplitude * 0.7);

  // Lensed starfield
  color += starColor * starField * 0.04 * (0.5 + u_treble * 0.5);

  // Einstein ring effect — bright arc around strongest mass
  float einsteinAngle = atan(uv.y - mass1.y, uv.x - mass1.x);
  float einsteinR = halo1;
  float ringR = 0.18 + u_bass * 0.04;
  float einsteinRing = exp(-pow((einsteinR - ringR) * 20.0, 2.0));
  float arcMask = smoothstep(-0.3, 0.3, sin(einsteinAngle * 2.0 + t));
  color += lensColor * einsteinRing * arcMask * 0.1;

  // Negative space emphasis — where mass is, light is absent
  float massProximity = exp(-halo1 * 5.0) + exp(-halo2 * 6.0) + exp(-halo3 * 7.0);
  color *= 1.0 - massProximity * 0.4;

  // Vignette
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.3, 1.4, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
