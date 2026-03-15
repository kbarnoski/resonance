import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite river currents — flow-field streamlines seen from above,
// curves stretching to the horizon with perspective projection.

// Curl noise from gradient of noise field — produces divergence-free flow
vec2 curlNoise(vec2 p) {
  float eps = 0.01;
  float n1 = snoise(p + vec2(0.0, eps));
  float n2 = snoise(p - vec2(0.0, eps));
  float n3 = snoise(p + vec2(eps, 0.0));
  float n4 = snoise(p - vec2(eps, 0.0));
  // Curl: (dn/dy, -dn/dx)
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * eps);
}

// Flow-field advection — trace a point backward through the field
vec2 advect(vec2 p, float steps) {
  float dt = 0.04;
  for (int i = 0; i < 8; i++) {
    vec2 vel = curlNoise(p * 0.5 + vec2(u_time * 0.05, 0.0));
    vel += fbm(p * 0.8 + vec2(u_time * 0.03, 0.0)) * 0.3;
    p -= vel * dt;
  }
  return p;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.28;

  // ── Perspective projection — overhead view looking down at a river plane ──
  // Camera is elevated; uv.y positive = near, uv.y negative = far horizon.
  float camHeight = 1.2 + u_bass * 0.2;
  float horizonY  = 0.05;

  // Ground plane depth
  float planeDist  = camHeight / max(horizonY - uv.y + 0.01, 0.01);
  planeDist = clamp(planeDist, 0.3, 30.0);

  // World-space position on the river plane
  vec2 worldPos = vec2(uv.x * planeDist, planeDist + t * 4.0);

  // Depth-based fog (far = 0, near = 1)
  float depthFog  = exp(-planeDist * 0.06);
  float isAbove   = step(horizonY, uv.y);  // 1 if above horizon (sky)

  // ── Flow field at this world position ──
  // Layer multiple scales for fractal-like flow detail
  vec2 flow1 = curlNoise(worldPos * 0.3);
  vec2 flow2 = curlNoise(worldPos * 0.7 + vec2(30.0, 0.0)) * 0.5;
  vec2 flow3 = curlNoise(worldPos * 1.5 + vec2(0.0, 60.0)) * 0.25;
  vec2 flow  = flow1 + flow2 + flow3;

  // Advected position — trace the flow back in time for streamline density
  vec2 advPos = advect(worldPos, 8.0);

  // ── Streamline density — how many lines pass near this point ──
  // Use the advected uv to compute a stripe function aligned with flow
  float streamPhase = advPos.x * 4.0 + fbm(advPos * 0.5) * 2.0;
  float streamLine  = sin(streamPhase + u_time * 0.8) * 0.5 + 0.5;
  streamLine = pow(streamLine, 4.0);

  // Flow magnitude — faster currents are brighter
  float speed = length(flow) * (0.7 + u_mid * 0.3);

  // Foam — white flecks on fast-moving water
  float foamNoise = snoise(worldPos * 5.0 + vec2(u_time * 1.0, 0.0));
  float foam = pow(max(foamNoise, 0.0), 4.0) * speed * 0.5
             * (0.5 + u_treble * 0.5);

  // ── Sky above horizon ──
  float skyGrad = smoothstep(horizonY, horizonY + 0.6, uv.y);
  float skyNoise = fbm(uv * vec2(1.5, 1.0) + vec2(t * 0.2, 0.0)) * 0.5 + 0.5;

  // ── Color — three lookups ──
  // Deep/far water
  vec3 deepWater = palette(
    streamLine * 0.4 + t * 0.05 + paletteShift + 0.55,
    vec3(0.05, 0.12, 0.22),
    vec3(0.06, 0.12, 0.22),
    vec3(0.4, 0.6, 0.9),
    vec3(0.08, 0.15, 0.35)
  );

  // Shallow/near water — richer, more saturated
  vec3 shallowWater = palette(
    streamLine * 0.6 + speed * 0.2 + paletteShift + 0.15,
    vec3(0.15, 0.35, 0.48),
    vec3(0.15, 0.28, 0.40),
    vec3(0.5, 0.75, 0.9),
    vec3(0.05, 0.15, 0.3)
  );

  // Sky
  vec3 skyCol = palette(
    skyGrad * 0.5 + skyNoise * 0.3 + paletteShift + 0.7,
    vec3(0.28, 0.32, 0.48),
    vec3(0.15, 0.18, 0.28),
    vec3(0.4, 0.4, 0.6),
    vec3(0.05, 0.08, 0.2)
  );

  // Water composite — near is more saturated
  vec3 waterCol = mix(deepWater, shallowWater, depthFog);
  waterCol += vec3(0.85, 0.92, 1.0) * foam;

  // Streamline highlight — glimmer on flow lines
  waterCol += shallowWater * streamLine * speed * depthFog * 0.4;

  // Bass ripple — shimmer across the near water
  float bassShimmer = snoise(worldPos * 3.0 + vec2(u_time * 2.0, 0.0)) * 0.5 + 0.5;
  waterCol += shallowWater * bassShimmer * u_bass * 0.2 * depthFog;

  // Horizon glow
  float horizonGlow = exp(-abs(uv.y - horizonY) * 15.0);
  vec3 glowCol = palette(
    t * 0.1 + paletteShift + 0.3,
    vec3(0.55, 0.62, 0.75),
    vec3(0.15, 0.15, 0.2),
    vec3(0.4, 0.5, 0.7),
    vec3(0.05, 0.08, 0.2)
  );

  vec3 color = mix(waterCol, skyCol, isAbove);
  color += glowCol * horizonGlow * 0.4;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
