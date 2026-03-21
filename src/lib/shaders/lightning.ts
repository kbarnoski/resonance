import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Lightning — electric discharge with branching bright paths

float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Electric arc between two points with jagged displacement
float arc(vec2 p, vec2 a, vec2 b, float seed, float jag) {
  vec2 ba = b - a;
  float len = length(ba);
  vec2 dir = ba / len;
  vec2 norm = vec2(-dir.y, dir.x);
  vec2 pa = p - a;
  float proj = dot(pa, dir);
  float t = clamp(proj / len, 0.0, 1.0);
  // Jagged displacement along the arc
  float disp = snoise(vec2(t * 8.0 + seed, seed * 3.7)) * jag * (1.0 - pow(2.0 * t - 1.0, 2.0));
  vec2 closest = a + dir * proj + norm * disp;
  return length(p - closest);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.2;

  vec3 color = vec3(0.0);

  // Background: dark sky with subtle electrical haze
  float bgNoise = fbm(uv * 2.0 + vec2(t * 0.05, 0.0)) * 0.5 + 0.5;
  vec3 bgColor = palette(
    bgNoise * 0.3 + paletteShift,
    vec3(0.02, 0.02, 0.06),
    vec3(0.03, 0.02, 0.06),
    vec3(0.3, 0.2, 0.6),
    vec3(0.1, 0.05, 0.3)
  );
  color = bgColor;

  // Multiple lightning bolts radiating from different origins
  float totalGlow = 0.0;
  float totalBolt = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float seed = floor(t * (0.4 + fi * 0.15)) + fi * 17.3;
    float flash = hash1(seed);

    // Only some bolts are active at any time — bass increases probability
    float threshold = 0.55 - u_bass * 0.2;
    if (flash < threshold) continue;

    float flashBright = smoothstep(threshold, 1.0, flash);
    float fadePhase = fract(t * (0.4 + fi * 0.15));
    flashBright *= exp(-fadePhase * 6.0);

    // Origin and endpoint
    vec2 origin = vec2(hash1(seed + 1.0) * 1.2 - 0.6, 0.4 + hash1(seed + 2.0) * 0.2);
    vec2 endpoint = vec2(hash1(seed + 3.0) * 1.4 - 0.7, -0.4 - hash1(seed + 4.0) * 0.2);

    // Main bolt
    float jag = 0.12 + u_mid * 0.05;
    float d = arc(uv, origin, endpoint, seed, jag);
    float boltBright = flashBright * (0.003 / (d * d + 0.0004));

    // Branches — 2 per bolt
    for (int j = 0; j < 2; j++) {
      float fj = float(j);
      float branchT = 0.3 + fj * 0.3;
      vec2 branchStart = mix(origin, endpoint, branchT);
      vec2 branchEnd = branchStart + vec2(
        (hash1(seed + fj * 7.0 + 10.0) - 0.5) * 0.4,
        -0.15 - hash1(seed + fj * 9.0 + 20.0) * 0.1
      );
      float bd = arc(uv, branchStart, branchEnd, seed + fj * 5.0 + 100.0, jag * 0.7);
      boltBright += flashBright * (0.0015 / (bd * bd + 0.0005)) * 0.5;
    }

    totalBolt += boltBright;
    totalGlow += flashBright * exp(-d * 4.0) * 0.3;
  }

  totalBolt = min(totalBolt, 3.0);

  // Bolt color — electric blue-white
  vec3 boltColor = palette(
    totalBolt * 0.2 + paletteShift + 0.5,
    vec3(0.7, 0.8, 1.0),
    vec3(0.2, 0.15, 0.05),
    vec3(0.5, 0.4, 0.9),
    vec3(0.0, 0.1, 0.3)
  );

  color += boltColor * totalBolt;

  // Ambient glow around bolts
  color += vec3(0.1, 0.1, 0.3) * totalGlow;

  // Treble: electrical static/sparks
  float spark = snoise(uv * 40.0 + vec2(t * 5.0, -t * 3.0));
  spark = pow(max(spark, 0.0), 8.0) * u_treble * 0.3;
  color += vec3(0.4, 0.5, 0.9) * spark;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
