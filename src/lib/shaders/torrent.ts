import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Fast turbulent flow noise — river current
float flowNoise(vec2 p, float time, float speed) {
  // Domain warp for turbulence
  float wx = fbm(p * 0.8 + vec2(time * speed * 0.4, 0.0));
  float wy = fbm(p * 0.8 + vec2(1.7, time * speed * 0.35));
  vec2 warped = p + vec2(wx, wy) * 0.5;

  // Flow in primary direction — forward (z) is screen center, we're swept through
  float flow = fbm(warped + vec2(0.0, -time * speed));
  return flow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.18;
  float paletteShift = u_amplitude * 0.29;

  // Perspective: we are in the river, being pulled forward
  // Center of screen is ahead, water rushes toward / past us
  // Simulate depth by treating distance from center as depth into the torrent

  float speed = 1.8 + u_bass * 0.8;

  // River perspective: project floor plane
  // uv.y < 0: water surface below eye level
  // uv.y > 0: far water rushing in (the source, infinitely far)
  // We keep it as a flat "tunnel" — you're submerged, pulled through

  // UV for flow calculation — stretched by perspective
  // Closer (bottom): slower apparent motion, wider turbulence
  // Further (top/center): faster, narrower convergence
  float convergeDist = length(uv); // distance from vanishing point
  float perspScale = 1.0 + (1.0 - convergeDist) * 2.0;

  // Main flow direction: forward (toward screen center / up-screen)
  vec2 flowDir = normalize(vec2(0.0, 1.0) - uv * 0.5); // converges to center
  float flowAlong = dot(uv, flowDir);

  // Lateral UV: perpendicular to flow
  vec2 flowPerp = vec2(-flowDir.y, flowDir.x);
  float flowAcross = dot(uv, flowPerp);

  // Flow UV: perspective-correct
  vec2 flowUV = vec2(flowAcross, flowAlong * perspScale);

  // Multi-scale flow layers
  float f1 = flowNoise(flowUV * 2.0, t, speed);
  float f2 = flowNoise(flowUV * 4.5 + 1.3, t * 1.3, speed * 1.4);
  float f3 = flowNoise(flowUV * 9.0 + 2.7, t * 0.9, speed * 0.8);

  float flow = f1 * 0.5 + f2 * 0.3 + f3 * 0.2;
  flow = flow * 0.5 + 0.5;

  // Turbulence: chaotic peaks and troughs
  float turbulence = abs(f2 * 2.0 - 1.0) * 0.5 + abs(f3 * 2.0 - 1.0) * 0.25;

  // Wave crests: bright peaks of turbulence
  float crestMask = smoothstep(0.62, 0.82, flow);
  // Deep troughs: dark cavities
  float troughMask = 1.0 - smoothstep(0.15, 0.4, flow);

  // Foam: high turbulence + crest
  float foam = smoothstep(0.5, 0.9, turbulence) * crestMask;
  // Treble-driven extra foam
  foam += smoothstep(0.8, 1.0, snoise(flowUV * 12.0 + t * 2.0) * 0.5 + 0.5) * u_treble * 0.2;

  // Depth within the water column
  // Near center: deepest, darkest
  float waterDepth = 1.0 - convergeDist * 0.6;
  float depthFog = exp(-waterDepth * 1.2);

  // ─── COLORS ───

  // Deep water base: near-black with crushing dark blue-green
  vec3 deepColor = palette(0.58 + paletteShift + u_mid * 0.06,
    vec3(0.0, 0.005, 0.01),
    vec3(0.01, 0.03, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.65, 0.75));

  // Mid-flow: dark teal, swirling
  vec3 flowColor = palette(0.52 + paletteShift + flow * 0.05,
    vec3(0.005, 0.02, 0.025),
    vec3(0.02, 0.06, 0.07),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.6, 0.7));

  // Wave crest: dark silvery-white water edge
  vec3 crestColor = palette(0.64 + paletteShift,
    vec3(0.04, 0.05, 0.06),
    vec3(0.08, 0.09, 0.11),
    vec3(1.0, 1.0, 1.0),
    vec3(0.2, 0.35, 0.5));

  // Foam: near-white but still dark overall
  vec3 foamColor = palette(0.7 + paletteShift + u_treble * 0.05,
    vec3(0.06, 0.07, 0.08),
    vec3(0.12, 0.13, 0.14),
    vec3(1.0, 1.0, 1.0),
    vec3(0.1, 0.2, 0.35));

  // Trough: darkest water
  vec3 troughColor = palette(0.55 + paletteShift,
    vec3(0.0, 0.003, 0.005),
    vec3(0.005, 0.01, 0.015),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.6, 0.7));

  // Compose water
  vec3 color = deepColor;
  color = mix(color, flowColor, smoothstep(0.3, 0.6, flow));
  color = mix(color, crestColor, crestMask * 0.6);
  color += foamColor * foam * 0.4;
  color = mix(color, troughColor, troughMask * 0.7);

  // Bass: makes water heavier, darker, deeper
  color = mix(color, deepColor * 0.3, u_bass * 0.3);

  // Depth fog — center vanishing point is deepest
  color = mix(color, deepColor * 0.2, waterDepth * 0.5);

  // Speed lines: radial streaks toward center — motion blur effect
  float speedLine = snoise(vec2(atan(uv.y, uv.x) * 5.0, convergeDist * 8.0 - t * speed * 0.5));
  speedLine = smoothstep(0.4, 0.8, speedLine * 0.5 + 0.5) * (1.0 - convergeDist) * 0.08;
  color += flowColor * speedLine * (0.5 + u_amplitude * 0.3);

  // Spray: treble-triggered mist at center
  float spray = fbm(uv * 6.0 + t * 1.5) * 0.5 + 0.5;
  spray = smoothstep(0.6, 0.85, spray) * exp(-convergeDist * 3.0) * u_treble * 0.06;
  color += crestColor * spray;

  // Vignette — walls of the canyon/river close in
  float vd = length(uv * vec2(0.8, 1.0));
  float vignette = pow(1.0 - smoothstep(0.05, 1.2, vd), 2.2);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
