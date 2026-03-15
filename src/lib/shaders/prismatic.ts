import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + VISIONARY_PALETTE + ROT2 + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Slow global rotation + breathing scale
  float breathe = 1.0 + 0.15 * sin(u_time * 0.3) + u_bass * 0.1;
  float globalAngle = u_time * 0.05 + u_amplitude * 0.3;
  uv = rot2(globalAngle) * uv;
  uv *= breathe;

  // Track accumulated color across IFS iterations
  vec3 color = vec3(0.0);
  float totalWeight = 0.0;

  // Palette offset — amplitude slowly shifts
  float paletteShift = u_amplitude * 0.2 + u_time * 0.01;

  // Store original uv for fine detail layer
  vec2 origUv = uv;

  // === Kaleidoscopic IFS: 8 iterations ===
  // Each iteration: polar fold, rotate, translate
  float foldBase = 3.14159 / 4.0;  // base: 8-fold symmetry (pi/4)

  for (int i = 0; i < 8; i++) {
    float fi = float(i);

    // Bass widens fold angles
    float foldAngle = foldBase + u_bass * 0.15 * sin(fi * 1.3 + u_time * 0.2);

    // Convert to polar
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Kaleidoscopic fold — fold angle into positive sector
    a = abs(mod(a, foldAngle * 2.0) - foldAngle);

    // Convert back to cartesian
    uv = vec2(cos(a), sin(a)) * r;

    // Rotate by iteration-dependent angle
    float rotAngle = 0.5 + fi * 0.3 + u_time * 0.04 + u_mid * 0.2;
    uv = rot2(rotAngle) * uv;

    // Translate — creates the recursive offset
    float translateDist = 0.6 + 0.1 * sin(u_time * 0.15 + fi);
    uv -= vec2(translateDist, 0.0);

    // Treble adds fine detail at smaller scales
    float detailScale = 1.5 + u_treble * 0.3;
    uv *= detailScale;

    // Accumulate color from each iteration level
    float d = length(uv);
    float weight = exp(-d * (1.0 + fi * 0.3));

    // Each iteration gets a different palette lookup
    vec3 layerCol1 = palette(
      d * 2.0 + fi * 0.25 + paletteShift + u_mid * 0.3,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0 + fi * 0.05, 0.1 + fi * 0.07, 0.2 + fi * 0.03)
    );

    // Second palette lookup at different t for richer color
    vec3 layerCol2 = palette(
      d * 1.5 + fi * 0.4 + paletteShift + 0.5,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.7, 0.4),
      vec3(0.3, 0.2 + fi * 0.04, 0.1)
    );

    // Blend the two palette layers per iteration
    float blendT = 0.5 + 0.3 * sin(fi * 2.0 + u_time * 0.1);
    vec3 layerCol = mix(layerCol1, layerCol2, blendT);

    color += layerCol * weight;
    totalWeight += weight;
  }

  // Normalize accumulated color
  color /= max(totalWeight, 0.001);

  // === Emissive outer petals ===
  // Use the final IFS-transformed coordinates for petal glow
  float petalDist = length(uv);
  float petalGlow = exp(-petalDist * 0.8) * 2.2;

  // Warm white emissive for outer petals — never pure white
  color += petalGlow * vec3(1.25, 1.1, 0.9);

  // === Inner chrysanthemum core glow ===
  float coreDist = length(origUv);
  float coreGlow = exp(-coreDist * 3.0) * 1.5;
  // Cool white emissive for the core
  color += coreGlow * vec3(0.9, 1.0, 1.3);

  // === Fine detail layer — treble-driven ===
  // Use final IFS coordinates for filament detail
  float filament = exp(-abs(uv.y) * (6.0 + u_treble * 8.0));
  filament += exp(-abs(uv.x) * (6.0 + u_treble * 8.0));
  vec3 filamentColor = palette(
    length(uv) * 3.0 + paletteShift + 1.5,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 1.0, 1.0),
    vec3(0.6, 0.7, 0.8)
  );
  color += filament * filamentColor * 0.4 * u_treble;

  // === Mid-driven saturation boost ===
  color *= 0.85 + u_mid * 0.3;

  // Fade edges to black for vignette
  float vignette = 1.0 - smoothstep(0.4, 1.5, length(origUv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
