import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Symmetric torii gate
  vec2 suv = vec2(abs(uv.x), uv.y);

  // Gate structure — two pillars + two crossbeams
  float pillarSpacing = 0.25;
  float pillarWidth = 0.03;

  // Left and right pillars (using abs for symmetry)
  float pillar = sdBox(suv - vec2(pillarSpacing, -0.05), vec2(pillarWidth, 0.45));

  // Upper crossbeam — curved (kasagi)
  float beamY = 0.3;
  float beamCurve = -uv.x * uv.x * 0.3; // Slight upward curve
  float upperBeam = sdBox(uv - vec2(0.0, beamY + beamCurve), vec2(0.38, 0.025));

  // Lower crossbeam (nuki) — straight
  float lowerBeam = sdBox(uv - vec2(0.0, 0.18), vec2(0.3, 0.015));

  // Combine gate structure
  float gate = min(min(pillar, upperBeam), lowerBeam);
  float gateEdge = smoothstep(0.01, 0.0, abs(gate));
  float gateBody = smoothstep(0.01, -0.01, gate);

  // The gateway opening — the space between pillars below upper beam
  float openingMask = step(-pillarSpacing + pillarWidth, uv.x)
                    * step(uv.x, pillarSpacing - pillarWidth)
                    * step(-0.5, uv.y)
                    * step(uv.y, beamY - 0.03);

  // Energy flowing through the gate
  vec2 flowUV = uv;
  flowUV.y -= t * 0.5;
  float energyFlow = fbm(flowUV * vec2(3.0, 5.0) + t * 0.3);
  float flowMask = openingMask * (0.5 + u_amplitude * 0.5);

  // Vertical energy streams through the gate
  float streams = 0.0;
  for (int i = 0; i < 5; i++) {
    float sx = (float(i) - 2.0) * 0.08;
    float wave = sin(uv.y * 12.0 + t * 3.0 + float(i) * 1.2) * 0.015;
    float streamDist = abs(uv.x - sx - wave);
    streams += smoothstep(0.02, 0.0, streamDist) * openingMask;
  }
  streams *= u_mid * 0.6 + 0.3;

  // Cherry blossom particles drifting through
  float petals = 0.0;
  for (int i = 0; i < 12; i++) {
    float seed = float(i) * 7.31;
    float px = sin(seed * 1.7 + t * 0.3) * 0.5;
    float py = mod(seed * 0.43 - t * 0.15, 1.4) - 0.7;
    float drift = sin(t + seed) * 0.05;
    vec2 pp = vec2(px + drift, py);
    float petal = length(uv - pp);
    petals += smoothstep(0.015, 0.005, petal);
  }

  // Atmospheric mist around the base
  float mist = fbm(uv * 2.0 + vec2(t * 0.1, 0.0));
  float mistMask = smoothstep(-0.1, -0.4, uv.y) * smoothstep(-0.7, -0.4, uv.y);

  // Radiant light behind the gate — sunrise/sunset
  float behindLight = exp(-length(uv - vec2(0.0, 0.1)) * 2.0);
  behindLight *= openingMask + 0.2;

  // Concentric energy arcs above the gate
  float arcs = 0.0;
  for (int i = 0; i < 3; i++) {
    float arcR = 0.45 + float(i) * 0.08;
    float arcDist = abs(length(uv - vec2(0.0, 0.25)) - arcR) - 0.003;
    float arc = smoothstep(0.006, 0.0, abs(arcDist));
    arc *= step(0.25, uv.y); // Only above gate
    arcs += arc * (0.5 + 0.3 * sin(t * 2.0 + float(i)));
  }

  // Vermillion / crimson gate palette
  vec3 col1 = palette(
    uv.y + paletteShift,
    vec3(0.55, 0.2, 0.15),
    vec3(0.45, 0.25, 0.2),
    vec3(0.9, 0.3, 0.2),
    vec3(0.0, 0.1, 0.1)
  );

  // Energy flow — warm gold / white
  vec3 col2 = palette(
    energyFlow * 2.0 + t * 0.2 + paletteShift + 0.3,
    vec3(0.7, 0.65, 0.5),
    vec3(0.4, 0.35, 0.3),
    vec3(1.0, 0.9, 0.6),
    vec3(0.0, 0.05, 0.15)
  );

  // Cherry blossom pink / soft dawn
  vec3 col3 = palette(
    petals + t * 0.1 + paletteShift + 0.6,
    vec3(0.7, 0.55, 0.6),
    vec3(0.35, 0.3, 0.3),
    vec3(1.0, 0.6, 0.7),
    vec3(0.9, 0.3, 0.4)
  );

  vec3 color = vec3(0.0);

  // Background light behind gate
  color += col2 * behindLight * 0.6 * (0.7 + u_bass * 0.5);

  // Gate structure
  color += col1 * gateEdge * 2.0;
  color += col1 * gateBody * 0.4;

  // Energy streams
  color += col2 * streams * 1.5 * (0.5 + u_treble * 0.5);

  // FBM energy through opening
  color += col2 * abs(energyFlow) * flowMask * 0.6;

  // Energy arcs
  color += col2 * arcs * 0.8 * (0.5 + u_mid * 0.5);

  // Cherry blossom particles
  color += col3 * petals * 1.2;

  // Mist
  color += col3 * abs(mist) * mistMask * 0.3;

  // Emissive gate highlights
  color += vec3(1.3, 0.9, 0.7) * gateEdge * 0.3 * u_bass;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
