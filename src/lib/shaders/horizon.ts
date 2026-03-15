import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Infinite ground plane with vanishing-point convergence and god rays.
// Camera at ground level, the horizon always ahead — unreachable.

float cheapFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.3;

  // ── Ground plane via perspective projection ──
  // Camera looks forward along Z, slight downward tilt
  float camHeight = 0.15 + u_bass * 0.05;
  float horizonY = -0.05;

  // Sky vs ground split
  float isGround = step(uv.y, horizonY);

  // Ground: project UV to infinite plane
  float groundDepth = camHeight / max(horizonY - uv.y, 0.001);
  vec2 groundUV = vec2(uv.x * groundDepth, groundDepth + t * 8.0);

  // Ground texture — layered noise at different scales for infinite detail
  float groundTex = cheapFbm(groundUV * 0.15) * 0.5 +
                     snoise(groundUV * 0.4 + vec2(t * 0.5, 0.0)) * 0.3;

  // Ground color — dark earth tones with depth fog
  float depthFog = exp(-groundDepth * 0.04);
  vec3 groundNear = palette(
    groundTex + paletteShift,
    vec3(0.15, 0.12, 0.1),
    vec3(0.2, 0.15, 0.12),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Ground lines — subtle grid receding to infinity
  float gridX = smoothstep(0.03, 0.0, abs(fract(groundUV.x * 0.5) - 0.5));
  float gridZ = smoothstep(0.02, 0.0, abs(fract(groundUV.y * 0.1) - 0.5));
  float grid = max(gridX, gridZ) * depthFog * 0.3;

  vec3 groundColor = groundNear * depthFog + vec3(0.4, 0.35, 0.5) * (1.0 - depthFog) * 0.15;
  groundColor += vec3(0.8, 0.7, 0.9) * grid;

  // ── Sky — gradient with volumetric god rays ──
  float skyGrad = smoothstep(horizonY, horizonY + 0.8, uv.y);

  vec3 skyLow = palette(
    t * 0.1 + paletteShift,
    vec3(0.35, 0.25, 0.3),
    vec3(0.3, 0.2, 0.25),
    vec3(0.6, 0.4, 0.3),
    vec3(0.0, 0.1, 0.2)
  );
  vec3 skyHigh = vec3(0.01, 0.01, 0.03);
  vec3 skyColor = mix(skyLow, skyHigh, skyGrad);

  // God rays — radial from vanishing point at horizon center
  vec2 rayOrigin = vec2(0.0, horizonY);
  vec2 rayDir = uv - rayOrigin;
  float rayAngle = atan(rayDir.y, rayDir.x);
  float rayDist = length(rayDir);

  // Multiple ray frequencies
  float rays = 0.0;
  rays += sin(rayAngle * 8.0 + t * 0.5) * 0.5 + 0.5;
  rays *= sin(rayAngle * 13.0 - t * 0.3) * 0.5 + 0.5;
  rays += (sin(rayAngle * 21.0 + t * 0.8) * 0.5 + 0.5) * 0.3;
  rays = pow(rays, 2.0);

  // Rays fade with distance from origin and are strongest near horizon
  float rayMask = exp(-rayDist * 1.5) * smoothstep(horizonY - 0.1, horizonY + 0.1, uv.y);
  rayMask *= (0.4 + u_bass * 0.6);

  vec3 rayColor = palette(
    rayAngle * 0.3 + t * 0.1 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.5),
    vec3(0.4, 0.3, 0.4),
    vec3(0.8, 0.5, 0.6),
    vec3(0.0, 0.1, 0.25)
  );

  skyColor += rayColor * rays * rayMask * 0.6;

  // Horizon glow — bright line at the vanishing point
  float horizonGlow = exp(-abs(uv.y - horizonY) * 20.0);
  float horizonPulse = 0.5 + u_amplitude * 0.5;
  vec3 glowCol = palette(
    t * 0.15 + paletteShift + 0.3,
    vec3(0.7, 0.6, 0.55),
    vec3(0.3, 0.25, 0.3),
    vec3(0.6, 0.4, 0.5),
    vec3(0.05, 0.1, 0.2)
  );
  skyColor += glowCol * horizonGlow * horizonPulse * 0.8;
  groundColor += glowCol * horizonGlow * horizonPulse * 0.4;

  // ── Stars in upper sky ──
  vec2 starUV = uv * 6.0;
  vec2 starId = floor(starUV);
  vec2 starF = fract(starUV) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.93, starH);
  float starDist = length(starF);
  float starBright = smoothstep(0.04, 0.0, starDist) * star;
  float twinkle = sin(t * 20.0 + starH * 100.0) * 0.4 + 0.6;
  starBright *= twinkle * skyGrad;
  skyColor += vec3(0.9, 0.85, 1.0) * starBright * 0.8;

  // ── Composite ──
  vec3 color = mix(groundColor, skyColor, 1.0 - isGround);

  // Mid-frequency drives subtle color temperature shift
  color = mix(color, color * vec3(1.05, 0.95, 1.1), u_mid * 0.3);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
