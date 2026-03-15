import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite horizontal mist — camera gliding forward through endless fog layers.
// Each layer recedes with perspective, creating depth that never resolves.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.28;

  // ── Perspective fog plane projection ──
  // Camera moves forward along Z, slightly above ground.
  // uv.y maps to vertical angle: negative = ground, positive = sky.
  float camHeight = 0.22 + u_bass * 0.06;
  float horizonY = 0.0;

  // Ground fog: project screen uv onto infinite horizontal plane.
  float planeDist = camHeight / max(abs(uv.y - horizonY) + 0.002, 0.002);
  // Cap planeDist for sky rays
  float isFog = step(uv.y, horizonY + 0.04); // everything near/below horizon is fog plane
  float depth = clamp(planeDist, 0.5, 60.0);

  // World-space coords on the fog plane, advancing with time
  vec2 worldXZ = vec2(uv.x * depth, depth + t * 12.0);

  // ── Six fog layers at different depths / scales / speeds ──
  // Each layer: a distinct fbm sheet drifting at its own pace.
  float layer1 = fbm(worldXZ * 0.12 + vec2(t * 0.7, 0.0)) * 0.5 + 0.5;
  float layer2 = fbm(worldXZ * 0.07 - vec2(t * 0.4, t * 0.1) + vec2(31.0, 7.0)) * 0.5 + 0.5;
  float layer3 = fbm(worldXZ * 0.22 + vec2(t * 0.5, t * 0.05) + vec2(17.0, 53.0)) * 0.5 + 0.5;

  // Mid-distance layers — finer turbulence, less speed
  float layer4 = fbm(worldXZ * 0.04 + vec2(t * 0.2, 0.0) + vec2(90.0, 40.0)) * 0.5 + 0.5;
  float layer5 = fbm(worldXZ * 0.015 + vec2(t * 0.1, 0.0)) * 0.5 + 0.5;

  // Dissolve mask — fog density varies horizontally
  float drifting = fbm(vec2(uv.x * 1.5 + t * 0.3, uv.y * 2.0)) * 0.5 + 0.5;

  // Composite fog density — weighted blend of all layers
  float fogDensity = layer1 * 0.35 + layer2 * 0.25 + layer3 * 0.2
                   + layer4 * 0.12 + layer5 * 0.08;
  fogDensity = pow(fogDensity, 0.8) * drifting;

  // Depth attenuation: fog becomes uniform (white-out) in the far distance
  float depthFog = exp(-1.0 / max(depth * 0.07, 0.01));  // 0 = far (thick), 1 = near (see detail)
  float nearFog  = 1.0 - exp(-depth * 0.015);            // thickens close to camera

  // ── Sky portion ──
  float skyGrad = smoothstep(horizonY, horizonY + 0.6, uv.y);
  float skyNoise = fbm(uv * vec2(2.0, 1.0) + vec2(t * 0.15, 0.0)) * 0.5 + 0.5;

  // ── Color — three palette lookups ──
  // Thick fog / far distance: pale, almost white
  vec3 farFogCol = palette(
    layer5 * 0.4 + paletteShift + 0.05,
    vec3(0.75, 0.72, 0.78),
    vec3(0.12, 0.10, 0.15),
    vec3(0.5, 0.4, 0.6),
    vec3(0.0, 0.05, 0.12)
  );

  // Near fog: slightly warmer, more saturated
  vec3 nearFogCol = palette(
    fogDensity * 0.6 + paletteShift + 0.3,
    vec3(0.55, 0.50, 0.58),
    vec3(0.25, 0.20, 0.30),
    vec3(0.6, 0.5, 0.7),
    vec3(0.05, 0.0, 0.15)
  );

  // Sky / upper atmosphere
  vec3 skyCol = palette(
    skyGrad * 0.5 + skyNoise * 0.3 + paletteShift + 0.6,
    vec3(0.30, 0.28, 0.38),
    vec3(0.20, 0.18, 0.25),
    vec3(0.5, 0.3, 0.6),
    vec3(0.08, 0.05, 0.18)
  );

  // Ground fog color — composite near/far
  vec3 fogColor = mix(nearFogCol, farFogCol, depthFog);
  fogColor = mix(fogColor, farFogCol, nearFog * 0.4);  // near-camera ground-level haze
  fogColor *= 0.85 + fogDensity * 0.3;                  // density-driven brightness

  // Bass pulses the fog brightness dramatically
  fogColor += farFogCol * u_bass * 0.15;

  // Horizon glow line — atmospheric scattering
  float horizonGlow = exp(-abs(uv.y - horizonY) * 18.0) * (0.6 + u_mid * 0.4);
  vec3 glowCol = palette(
    t * 0.12 + paletteShift + 0.45,
    vec3(0.8, 0.78, 0.85),
    vec3(0.15, 0.12, 0.20),
    vec3(0.4, 0.3, 0.5),
    vec3(0.0, 0.08, 0.15)
  );
  fogColor += glowCol * horizonGlow * 0.5;

  // Treble adds fine sparkle to near fog
  float sparkle = snoise(uv * 30.0 + vec2(t * 5.0, 0.0));
  fogColor += vec3(0.9, 0.95, 1.0) * max(sparkle, 0.0) * u_treble * 0.12 * (1.0 - depthFog);

  // Composite sky and fog
  vec3 color = mix(fogColor, skyCol, skyGrad * skyGrad);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
