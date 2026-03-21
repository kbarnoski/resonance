import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Distance to a line segment
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Dark neural background
  float bgNoise = fbm(uv * 2.0 + t * 0.02);
  vec3 color = palette(
    bgNoise * 0.3 + 0.7,
    vec3(0.02, 0.01, 0.04),
    vec3(0.02, 0.01, 0.03),
    vec3(0.3, 0.2, 0.5),
    vec3(0.0, 0.1, 0.3)
  ) * 0.15;

  // Generate branching axon paths
  float totalGlow = 0.0;
  float totalBranch = 0.0;
  float totalSignal = 0.0;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float seed = fi * 7.13 + 2.5;

    // Axon origin and winding path via noise
    vec2 origin = vec2(
      sin(seed * 1.3 + t * 0.1) * 0.7,
      cos(seed * 0.9 + t * 0.07) * 0.7
    );

    // Build a path with 6 segments
    vec2 prev = origin;
    float pathDist = 1e6;
    float pathLen = 0.0;
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      float angle = snoise(vec2(seed + fj * 0.5, t * 0.08)) * 3.14;
      float segLen = 0.12 + snoise(vec2(seed * 2.0 + fj, t * 0.05)) * 0.04;
      vec2 next = prev + vec2(cos(angle), sin(angle)) * segLen;
      float d = sdSeg(uv, prev, next);
      pathDist = min(pathDist, d);
      pathLen += segLen;
      prev = next;
    }

    // Axon body
    float thickness = 0.006 + u_mid * 0.003;
    float axon = smoothstep(thickness + 0.002, thickness - 0.001, pathDist);
    float glow = smoothstep(0.06, 0.0, pathDist);

    // Electrical signal pulse traveling along the axon
    float signalPhase = fract(t * 0.5 + fi * 0.2);
    float signalPos = signalPhase * pathLen;
    float pulse = exp(-pathDist * 80.0) * pow(sin(pathDist * 120.0 - t * 8.0 + fi * 2.0) * 0.5 + 0.5, 6.0);

    totalBranch += axon;
    totalGlow += glow;
    totalSignal += pulse * u_bass;
  }

  // Axon color — cool blue-white neural
  vec3 axonColor = palette(
    totalGlow * 0.5 + t * 0.03,
    vec3(0.3, 0.45, 0.6),
    vec3(0.3, 0.35, 0.5),
    vec3(0.7, 0.9, 1.0),
    vec3(0.0, 0.15, 0.35)
  );

  // Signal color — bright electric cyan/white
  vec3 signalColor = palette(
    t * 0.05 + totalSignal,
    vec3(0.6, 0.8, 0.9),
    vec3(0.4, 0.4, 0.3),
    vec3(0.8, 1.0, 1.0),
    vec3(0.0, 0.05, 0.1)
  );

  color += axonColor * (totalBranch * 0.9 + totalGlow * 0.15);
  color += signalColor * totalSignal * 2.0;

  // Synaptic sparkles at treble
  float sparkle = pow(snoise(uv * 20.0 + t * 2.0) * 0.5 + 0.5, 12.0);
  color += vec3(0.7, 0.8, 1.0) * sparkle * u_treble * 0.6;

  color *= 0.9 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
