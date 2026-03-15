import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.04;
  float paletteShift = u_amplitude * 0.08;

  // ── Seed points for lichen colonies ──
  // 7 fixed positions scattered across the field
  vec2 seeds[7];
  seeds[0] = vec2(-0.45, 0.30);
  seeds[1] = vec2( 0.50, -0.25);
  seeds[2] = vec2(-0.10, -0.50);
  seeds[3] = vec2( 0.35,  0.45);
  seeds[4] = vec2(-0.55, -0.15);
  seeds[5] = vec2( 0.15,  0.10);
  seeds[6] = vec2(-0.25,  0.55);

  // Growth rates per colony (different species grow at different speeds)
  float rates[7];
  rates[0] = 0.90;
  rates[1] = 1.10;
  rates[2] = 0.75;
  rates[3] = 1.00;
  rates[4] = 0.85;
  rates[5] = 1.15;
  rates[6] = 0.95;

  // ── FBM distortion field — breaks circles into organic lobes ──
  float warp1 = fbm(uv * 3.0 + vec2(t * 0.12, t * 0.08));
  float warp2 = fbm(uv * 5.5 + vec2(-t * 0.09, t * 0.11) + warp1 * 0.4);
  vec2 warpOffset = vec2(warp1, warp2) * 0.12;

  // ── Accumulate colony contributions ──
  float totalCover = 0.0;
  float ringPattern = 0.0;
  float closestDist = 10.0;
  float secondDist = 10.0;
  float colonyIndex = 0.0;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 warped = uv + warpOffset + vec2(
      snoise(uv * 2.0 + fi * 1.3 + t * 0.1) * 0.06,
      snoise(uv * 2.0 + fi * 2.7 - t * 0.08) * 0.06
    );
    float dist = length(warped - seeds[i]);

    // Growth front expands over time
    float radius = t * rates[i] * 0.15 + 0.05;
    radius = min(radius, 0.9); // cap maximum spread

    // Concentric ring structure within each colony
    float ringFreq = 18.0 + fi * 3.0;
    float rings = sin(dist * ringFreq - t * rates[i] * 0.5) * 0.5 + 0.5;
    rings *= rings; // sharpen

    // Growth envelope — sharp leading edge, gradual interior fade
    float envelope = smoothstep(radius + 0.02, radius - 0.04, dist);
    float edge = smoothstep(radius + 0.01, radius - 0.01, dist)
               - smoothstep(radius - 0.01, radius - 0.06, dist);

    totalCover = max(totalCover, envelope);
    ringPattern += rings * envelope * 0.3;

    // Track closest colony for color assignment
    if (dist < closestDist) {
      secondDist = closestDist;
      closestDist = dist;
      colonyIndex = fi;
    } else if (dist < secondDist) {
      secondDist = dist;
    }

    // Growth edge accumulation
    ringPattern += edge * 0.5;
  }

  // ── Interference where colonies overlap ──
  // When two growth fronts are close, create interference bands
  float overlap = smoothstep(0.15, 0.0, abs(closestDist - secondDist));
  float interferenceBands = sin((closestDist + secondDist) * 40.0 + t * 0.3) * 0.5 + 0.5;
  interferenceBands *= overlap;

  // ── Fine thallus texture ──
  float detail = fbm(uv * 12.0 + warp1 * 0.6 + t * 0.05);
  float thallus = detail * 0.5 + 0.5;

  // ── Stone substrate color ──
  float stoneNoise = fbm(uv * 4.0 + vec2(3.7, 1.2));
  vec3 stone = palette(
    stoneNoise * 0.4 + paletteShift + 0.3,
    vec3(0.32, 0.30, 0.27),
    vec3(0.10, 0.09, 0.08),
    vec3(0.5, 0.45, 0.38),
    vec3(0.02, 0.05, 0.08)
  );

  // ── Lichen body — pale silver-green ──
  vec3 lichenBody = palette(
    colonyIndex * 0.12 + thallus * 0.3 + t * 0.02 + paletteShift,
    vec3(0.35, 0.40, 0.30),
    vec3(0.15, 0.18, 0.10),
    vec3(0.6, 0.8, 0.4),
    vec3(0.05, 0.20, 0.10)
  );

  // ── Growth edge — warm rust/orange tones ──
  vec3 edgeColor = palette(
    closestDist * 2.0 + t * 0.03 + paletteShift + 0.6,
    vec3(0.45, 0.28, 0.15),
    vec3(0.25, 0.15, 0.08),
    vec3(0.8, 0.5, 0.3),
    vec3(0.05, 0.10, 0.20)
  );

  // ── Interference zone color — lighter, bleached ──
  vec3 interferenceColor = palette(
    interferenceBands * 0.8 + paletteShift + 0.4,
    vec3(0.42, 0.43, 0.38),
    vec3(0.12, 0.12, 0.10),
    vec3(0.5, 0.6, 0.4),
    vec3(0.10, 0.15, 0.08)
  );

  // ── Compose ──
  vec3 color = stone;

  // Lichen coverage with ring texture modulation
  float lichenMask = totalCover * (0.7 + ringPattern * 0.3);
  lichenMask *= (0.8 + thallus * 0.2);
  color = mix(color, lichenBody, smoothstep(0.0, 0.3, lichenMask));

  // Ring pattern detail — concentric structure
  float ringBright = ringPattern * totalCover;
  color += lichenBody * ringBright * 0.15;

  // Growth edges — warm tones at expanding fronts
  float edgeMask = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float dist = length(uv + warpOffset - seeds[i]);
    float radius = t * rates[i] * 0.15 + 0.05;
    radius = min(radius, 0.9);
    float e = smoothstep(radius + 0.02, radius - 0.005, dist)
            - smoothstep(radius - 0.005, radius - 0.04, dist);
    edgeMask = max(edgeMask, e);
  }
  color = mix(color, edgeColor, edgeMask * 0.6);

  // Interference bands where colonies meet
  color = mix(color, interferenceColor, interferenceBands * totalCover * 0.4);

  // ── Subtle stone grain beneath lichen ──
  float grain = snoise(uv * 40.0) * 0.03;
  color += grain * (1.0 - totalCover * 0.7);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
