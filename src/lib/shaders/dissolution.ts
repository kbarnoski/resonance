import {
  U,
  SMOOTH_NOISE,
  VISIONARY_PALETTE,
  ROT2,
  SMIN,
} from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.4;

  // ── Dissolution cycle (~30s period) ──
  // Bass accelerates the dissolution speed
  float cycleSpeed = 0.2093 + u_bass * 0.08;
  float phase = mod(u_time * cycleSpeed, 6.28318);
  // Dissolution amount: 0 = solid form, 1 = fully dissolved into fractal
  float dissolve = smoothstep(-0.2, 1.0, sin(phase)) * 0.85 + 0.15 * u_bass;
  dissolve = clamp(dissolve, 0.0, 1.0);

  // ── Complex centered SDF shape ──
  // Build a solid form from smooth unions of circles and boxes
  vec2 p = uv;

  // Slowly rotate the entire form
  p = rot2(t * 0.3 + u_amplitude * 0.2) * p;

  // Main body: large circle
  float body = length(p) - 0.35;

  // Orbiting lobes — four smooth blobs around the center
  float lobe1 = length(p - vec2(0.28, 0.0)) - 0.15;
  float lobe2 = length(p + vec2(0.28, 0.0)) - 0.15;
  float lobe3 = length(p - vec2(0.0, 0.28)) - 0.15;
  float lobe4 = length(p + vec2(0.0, 0.28)) - 0.15;

  // Smooth union of all lobes with the body
  float shape = smin(body, lobe1, 0.15);
  shape = smin(shape, lobe2, 0.15);
  shape = smin(shape, lobe3, 0.15);
  shape = smin(shape, lobe4, 0.15);

  // Add a rounded box in the center for complexity
  vec2 bp = abs(rot2(t * 0.5) * p) - vec2(0.12, 0.12);
  float box = length(max(bp, 0.0)) + min(max(bp.x, bp.y), 0.0) - 0.06;
  shape = smin(shape, box, 0.1);

  // Add a ring accent
  float ring = abs(length(p) - 0.5) - 0.025;
  shape = smin(shape, ring, 0.08);

  // ── Erosion with fbm noise ──
  // The noise carves into the SDF based on the dissolve amount
  float erosionScale = 3.0 + u_treble * 2.0;
  float noiseField = fbm(p * erosionScale + t * 0.5);
  float noiseField2 = fbm(p * erosionScale * 1.7 - t * 0.3 + vec2(7.3, 2.1));

  // Combine noise layers for more complex erosion pattern
  float erosion = (noiseField * 0.6 + noiseField2 * 0.4);

  // The eroded SDF: noise carves away at the shape boundary
  // As dissolve increases, the erosion threshold grows, eating more of the form
  float erodeThreshold = dissolve * 0.8 - 0.1;
  float erodedShape = max(shape, erosion - (1.0 - erodeThreshold));

  // ── IFS fractal pattern (revealed underneath) ──
  vec2 fz = uv * 2.5;
  fz = rot2(t * 0.2 - u_amplitude * 0.3) * fz;

  // Iterative fractal folding (IFS-style)
  float fractalAcc = 0.0;
  float scale = 1.0;
  int detailIter = 6 + int(u_treble * 4.0);

  for (int i = 0; i < 10; i++) {
    if (i >= detailIter) break;

    // Fold: mirror across axes
    fz = abs(fz) - vec2(0.8 + 0.1 * sin(t + float(i) * 0.7), 0.6 + 0.1 * cos(t + float(i) * 0.5));

    // Rotate each iteration
    fz = rot2(0.785 + t * 0.05 + float(i) * 0.15) * fz;

    // Scale down
    fz *= 1.5;
    scale *= 1.5;

    // Accumulate pattern from line distances
    float lineDist = min(abs(fz.x), abs(fz.y)) / scale;
    fractalAcc += exp(-lineDist * 40.0) / scale;
  }

  // ── Color palettes ──
  // Palette A: warm amber/magenta for the solid form
  vec3 formColor1 = palette(
    length(p) * 2.0 + noiseField * 0.5 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.2)
  );

  // Palette B: deeper red/violet accent for form interior
  vec3 formColor2 = palette(
    noiseField * 1.5 + t * 0.2 + paletteShift + 0.3,
    vec3(0.5, 0.4, 0.4),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 0.3, 0.5),
    vec3(0.1, 0.0, 0.3)
  );

  // Palette C: cool cyan/blue for the fractal
  vec3 fractalColor1 = palette(
    fractalAcc * 3.0 + t * 0.15 + paletteShift + 0.6,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.3, 0.7, 1.0),
    vec3(0.2, 0.3, 0.5)
  );

  // Palette D: electric violet for fractal highlights
  vec3 fractalColor2 = palette(
    fractalAcc * 5.0 - t * 0.1 + paletteShift + 0.9,
    vec3(0.5, 0.5, 0.6),
    vec3(0.5, 0.5, 0.4),
    vec3(0.6, 0.4, 1.0),
    vec3(0.7, 0.2, 0.5)
  );

  // ── Compositing ──
  vec3 color = vec3(0.0);

  // Solid form layer
  float formMask = 1.0 - smoothstep(-0.01, 0.02, erodedShape);
  vec3 formBlend = mix(formColor1, formColor2, smoothstep(-0.2, 0.2, noiseField));
  float formShading = 0.4 + 0.6 * smoothstep(0.1, -0.15, erodedShape);
  color += formBlend * formMask * formShading;

  // Fractal layer — visible where the form has been eroded away
  // Only show fractal where the original shape existed but erosion removed it
  float originalMask = 1.0 - smoothstep(-0.01, 0.02, shape);
  float fractalReveal = originalMask * (1.0 - formMask);
  // Also show some fractal faintly behind everything
  float bgFractal = (1.0 - originalMask) * 0.15;

  vec3 fractalBlend = mix(fractalColor1, fractalColor2, smoothstep(0.3, 0.8, fractalAcc));
  float fractalIntensity = fractalAcc * (0.6 + 0.4 * u_treble);
  color += fractalBlend * fractalIntensity * (fractalReveal + bgFractal);

  // ── Emissive edge glow where noise meets SDF boundary ──
  // The dissolution boundary — where the eroded shape transitions
  float edgeDist = abs(erodedShape);
  float edgeGlow = exp(-edgeDist * 60.0) * (0.8 + dissolve * 1.5);

  // Edge takes on a warm-tinted emissive white
  vec3 edgeEmissive = vec3(1.4, 1.15, 0.9) * edgeGlow;
  color += edgeEmissive * (1.0 + u_bass * 0.8);

  // Secondary cool edge glow on the outer boundary of the original shape
  float outerEdge = exp(-abs(shape) * 50.0) * 0.6;
  color += vec3(0.85, 1.05, 1.4) * outerEdge;

  // ── Emissive highlights at fractal hotspots ──
  float fractalHot = smoothstep(0.6, 1.2, fractalAcc);
  color += vec3(1.1, 1.25, 1.5) * fractalHot * fractalReveal * 1.6;

  // Form interior bright core
  float coreDist = length(p);
  float coreGlow = smoothstep(0.2, 0.0, coreDist) * formMask;
  color += vec3(1.35, 1.2, 1.0) * coreGlow * 1.2;

  // ── Subtle noise texture on the form surface ──
  float surfaceNoise = snoise(p * 12.0 + t * 2.0) * 0.05;
  color += formMask * formColor1 * surfaceNoise;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.6, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
