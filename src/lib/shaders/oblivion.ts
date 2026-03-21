import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Oblivion — total erasure, structures dissolving to nothing

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Grid structure — something that once had order
  vec2 gridUV = uv * 6.0;
  vec2 gridId = floor(gridUV);
  vec2 gridF = fract(gridUV) - 0.5;

  // Each grid cell has a structure that is dissolving
  float cellSeed = dot(gridId, vec2(127.1, 311.7));
  float cellPhase = fract(sin(cellSeed) * 43758.5453);

  // Dissolution front — sweeps through, different cells at different phases
  float dissolveTime = t * 0.3 + cellPhase * 0.8;
  float dissolution = smoothstep(0.0, 1.0, dissolveTime - length(gridId) * 0.05);

  // Original structure — geometric shapes
  float structure = length(gridF) - 0.3;
  float structureEdge = smoothstep(0.02, 0.0, abs(structure));
  float structureFill = smoothstep(0.01, -0.01, structure);

  // Dissolve effect: noise eats away at the structure
  float dissolveNoise = fbm(gridUV * 2.0 + t * 0.2 + cellSeed);
  float dissolveThreshold = dissolution * 1.5 - 0.5;
  float dissolved = smoothstep(dissolveThreshold - 0.1, dissolveThreshold + 0.1, dissolveNoise);

  // What remains of the structure
  float remaining = structureFill * (1.0 - dissolved);
  float remainingEdge = structureEdge * (1.0 - dissolved);

  // Particles breaking off — the structure becoming dust
  float particleField = snoise(uv * 20.0 + t * 1.5);
  float particles = smoothstep(0.7, 0.9, particleField) * dissolved * structureFill;
  particles *= exp(-dissolution * 2.0); // particles also fade

  // Void left behind — absolute nothing
  float voidness = dissolved * structureFill;

  // Colors: fading structures, growing void
  vec3 structColor = palette(0.3 + cellPhase * 0.2,
    vec3(0.02, 0.018, 0.025),
    vec3(0.03, 0.025, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.3, 0.35, 0.5));

  vec3 edgeColor = palette(0.5 + u_mid * 0.1,
    vec3(0.03, 0.025, 0.04),
    vec3(0.05, 0.04, 0.06),
    vec3(1.0, 1.0, 1.0),
    vec3(0.35, 0.4, 0.55));

  vec3 particleColor = palette(0.4 + u_treble * 0.12,
    vec3(0.015, 0.012, 0.02),
    vec3(0.03, 0.025, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.45, 0.6));

  vec3 bgColor = vec3(0.004, 0.003, 0.005);
  vec3 voidColor = vec3(0.001, 0.001, 0.001);

  // Compose
  vec3 color = bgColor;

  // Remaining structure
  color = mix(color, structColor, remaining * 0.6);
  color += edgeColor * remainingEdge * 0.08 * (1.0 + u_bass * 0.5);

  // Dissolving edge glow — the moment of erasure
  float dissolveEdge = smoothstep(dissolveThreshold - 0.05, dissolveThreshold, dissolveNoise)
                     - smoothstep(dissolveThreshold, dissolveThreshold + 0.05, dissolveNoise);
  dissolveEdge *= structureFill;
  color += edgeColor * dissolveEdge * 0.1 * (1.0 + u_amplitude * 0.8);

  // Particles
  color += particleColor * particles * 0.06;

  // Void — darker than dark where structure was erased
  color = mix(color, voidColor, voidness * 0.5);

  // Bass: accelerates dissolution
  color *= 1.0 - dissolution * u_bass * 0.2;

  // Background noise
  float bgNoise = fbm(uv * 2.0 + t * 0.03) * 0.01;
  color += bgColor * bgNoise;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
