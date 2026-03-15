import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Infinite whirlpool — spinning water vortex pulling into bottomless depth.
// Polar spiral with turbulent texture and perspective depth at the center.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.30;

  // ── Polar coordinates ──
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // ── Vortex spin — angular velocity increases toward center ──
  // This creates the illusion of an infinite spiral drain.
  float spinSpeed = 0.8 + u_bass * 0.5;
  float vortexAngle = a - spinSpeed * u_time / max(r * r, 0.01) * 0.12;

  // ── Perspective depth — compress the center toward infinity ──
  // Map r to a "depth" value: as r -> 0, depth -> infinity.
  float depth = 1.0 / max(r * 1.5, 0.02);  // depth blows up at center
  float depthNorm = clamp(depth * 0.05, 0.0, 1.0);  // 0 = edge, 1 = center abyss

  // ── Surface texture — spiral coordinate sampling ──
  // Convert polar back to Cartesian, but with vortex-distorted angle.
  vec2 spiralUV = vec2(cos(vortexAngle), sin(vortexAngle)) * r;

  // Multi-layer turbulent surface
  // Layer 1: large surface waves
  float surf1 = fbm(spiralUV * 2.5 + vec2(0.0, -u_time * 0.4));
  // Layer 2: medium ripples
  float surf2 = fbm(spiralUV * 5.0 + vec2(u_time * 0.3, 0.0) + vec2(20.0, 10.0));
  // Layer 3: fine turbulence at the center (higher frequency)
  vec2 innerUV = spiralUV * (1.0 + depthNorm * 8.0);  // zoom into center
  float surf3 = fbm(innerUV * 3.0 - vec2(0.0, u_time * 0.7) + vec2(50.0));

  // Composite surface
  float surface = surf1 * 0.5 + surf2 * 0.3 + surf3 * 0.2;
  surface = surface * 0.5 + 0.5;

  // ── Depth-driven darkening — center is the bottomless pit ──
  float pitBlack = pow(depthNorm, 2.5);   // very dark at center
  float rimLight = smoothstep(0.6, 0.4, r) * smoothstep(0.0, 0.15, r);  // bright rim

  // ── Foam lines — streaks along spiral arms ──
  // Foam accumulates on the surface in spiral bands
  float foamAngle = vortexAngle * 3.0 + r * 8.0;   // tight spiral frequency
  float foam = sin(foamAngle) * 0.5 + 0.5;
  foam = pow(foam, 6.0) * (1.0 - depthNorm) * 0.6;
  foam *= (0.5 + u_treble * 0.5);

  // ── Spray and mist at mid-radius ──
  float spray = snoise(spiralUV * 12.0 + vec2(t * 2.0, 0.0));
  spray = pow(max(spray, 0.0), 5.0) * smoothstep(0.5, 0.2, r) * u_treble * 0.4;

  // ── Rotation of the whole texture — the water turns ──
  // Already baked into vortexAngle above.

  // ── Color ──
  // Deep pit — near black with a tinge of cold blue
  vec3 pitCol = palette(
    depthNorm * 0.5 + t * 0.05 + paletteShift + 0.6,
    vec3(0.01, 0.01, 0.04),
    vec3(0.02, 0.03, 0.08),
    vec3(0.3, 0.5, 0.8),
    vec3(0.08, 0.1, 0.25)
  );

  // Water surface — blue-green
  vec3 waterCol = palette(
    surface * 0.6 + vortexAngle * 0.05 + paletteShift + 0.15,
    vec3(0.20, 0.38, 0.50),
    vec3(0.18, 0.28, 0.38),
    vec3(0.5, 0.7, 0.9),
    vec3(0.05, 0.15, 0.3)
  );

  // Outer calm water — lighter, less turbulent
  vec3 outerCol = palette(
    r * 0.3 + surface * 0.3 + paletteShift + 0.38,
    vec3(0.30, 0.50, 0.60),
    vec3(0.15, 0.22, 0.30),
    vec3(0.4, 0.6, 0.8),
    vec3(0.08, 0.18, 0.32)
  );

  // Build from outer rim to center pit
  vec3 color = outerCol;
  color = mix(color, waterCol, smoothstep(0.5, 0.15, r));   // water swirl zone
  color = mix(color, pitCol,   pitBlack);                    // center abyss

  // Foam overlay
  color += vec3(0.85, 0.90, 0.95) * foam;
  // Rim highlight — mid audio drives the bright ring
  color += outerCol * rimLight * (0.3 + u_mid * 0.5) * 0.5;
  // Spray
  color += vec3(0.9, 0.95, 1.0) * spray;

  // Bass warps the color temperature
  color = mix(color, color * vec3(0.9, 1.0, 1.1), u_bass * 0.25);

  // Vignette — natural darkening at corners, which aren't part of the whirlpool
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
