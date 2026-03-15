import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  `
// Infinite river delta — branching channels seen from high above,
// channels subdivide finer and finer as they recede to the horizon.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.28;

  // ── Perspective projection — camera high overhead, looking down ──
  // uv.y positive = near, negative = far (toward the sea).
  float camHeight = 1.8;
  float horizonY  = 0.08;

  float planeDist = camHeight / max(horizonY - uv.y + 0.005, 0.005);
  planeDist = clamp(planeDist, 0.5, 40.0);
  float depthFog  = exp(-planeDist * 0.05);   // 0 = far, 1 = near
  float isAbove   = step(horizonY, uv.y);

  // World-space position on the delta plane — drifts slowly downstream
  vec2 worldPos = vec2(uv.x * planeDist, planeDist + t * 2.0);

  // ── Multi-scale branching — Voronoi at three scales ──
  // At each scale, Voronoi edges become channel boundaries.
  // Smaller-scale = finer branches that appear further from camera.

  // Scale 1: main large channels (near/big)
  float scale1 = 1.5 / max(depthFog, 0.05);   // nearer = coarser channels
  vec3 v1 = voronoi(worldPos * 0.5 + vec2(0.0, t * 0.3));
  float edge1 = smoothstep(0.12, 0.0, v1.x);   // cell edge width

  // Scale 2: sub-branches (medium distance)
  vec3 v2 = voronoi(worldPos * 1.2 + vec2(10.0, t * 0.5));
  float edge2 = smoothstep(0.07, 0.0, v2.x);

  // Scale 3: finest channels (far)
  vec3 v3 = voronoi(worldPos * 2.8 + vec2(30.0, t * 0.8));
  float edge3 = smoothstep(0.04, 0.0, v3.x);

  // Depth-weighted edge blend:
  // Near camera: mostly scale1 wide channels.
  // Far camera: scale2+3 fine channels dominate.
  float channelNear = edge1 * depthFog;
  float channelMid  = edge2 * (1.0 - depthFog * 0.7);
  float channelFar  = edge3 * (1.0 - depthFog);
  float channel = clamp(channelNear * 0.8 + channelMid * 0.7 + channelFar * 0.5, 0.0, 1.0);

  // ── Water flow within channels ──
  // Animated noise along channel direction gives sense of flowing water
  vec2 flowUV = worldPos + vec2(0.0, u_time * 0.5);
  float flowNoise = fbm(flowUV * vec2(0.8, 0.3)) * 0.5 + 0.5;

  // ── Sediment / land texture ──
  float land = fbm(worldPos * 0.4 + vec2(t * 0.05)) * 0.5 + 0.5;
  land = pow(land, 0.7);

  // Bass increases channel depth contrast
  channel = pow(channel, 0.7 + u_bass * 0.3);

  // ── Color ──
  // Land — tidal mudflat / sediment
  vec3 landCol = palette(
    land * 0.5 + t * 0.04 + paletteShift + 0.45,
    vec3(0.38, 0.30, 0.22),
    vec3(0.18, 0.14, 0.10),
    vec3(0.6, 0.5, 0.35),
    vec3(0.02, 0.0, 0.05)
  );

  // Channel water — rich teal, shifts with mid
  vec3 waterCol = palette(
    flowNoise * 0.5 + u_mid * 0.2 + paletteShift + 0.1,
    vec3(0.10, 0.28, 0.40),
    vec3(0.10, 0.22, 0.35),
    vec3(0.4, 0.7, 0.9),
    vec3(0.05, 0.15, 0.3)
  );

  // Fine distant channels — slightly lighter (reflection of sky)
  vec3 farWaterCol = palette(
    flowNoise * 0.3 + paletteShift + 0.3,
    vec3(0.30, 0.45, 0.58),
    vec3(0.12, 0.18, 0.25),
    vec3(0.35, 0.55, 0.75),
    vec3(0.08, 0.15, 0.28)
  );

  // Blend near vs far water
  vec3 finalWater = mix(waterCol, farWaterCol, 1.0 - depthFog);

  // Composite land + channels
  vec3 color = mix(landCol, finalWater, channel);

  // Treble — glint on water surface
  float glint = snoise(worldPos * 10.0 + vec2(u_time * 2.0, 0.0));
  glint = pow(max(glint, 0.0), 6.0) * channel * u_treble * 0.5;
  color += vec3(0.85, 0.92, 1.0) * glint;

  // ── Sky above horizon ──
  float skyGrad = smoothstep(horizonY, horizonY + 0.5, uv.y);
  float skyNoise = fbm(uv * vec2(2.0, 1.0) + vec2(t * 0.2, 0.0)) * 0.5 + 0.5;
  vec3 skyCol = palette(
    skyGrad * 0.4 + skyNoise * 0.25 + paletteShift + 0.65,
    vec3(0.35, 0.40, 0.55),
    vec3(0.15, 0.18, 0.28),
    vec3(0.4, 0.4, 0.6),
    vec3(0.06, 0.08, 0.2)
  );

  // Horizon glow
  float horizonGlow = exp(-abs(uv.y - horizonY) * 14.0);
  color += skyCol * horizonGlow * 0.35;

  // Depth fog — far delta fades into pale haze
  vec3 hazeCol = mix(farWaterCol, skyCol, 0.5);
  color = mix(hazeCol, color, depthFog * 0.85 + 0.15);

  color = mix(color, skyCol, isAbove);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
