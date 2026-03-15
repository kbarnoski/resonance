import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite deep ocean — view from below the surface.
// Waves undulate overhead filtering light; infinite dark depth falls beneath.

// Gerstner-style wave approximation — returns surface height at xz
float wave(vec2 p, float k, float speed, float angle) {
  vec2 dir = vec2(cos(angle), sin(angle));
  return sin(dot(p, dir) * k + u_time * speed) * (1.0 / k) * 0.5;
}

// Caustic network from animated Voronoi ridges
float caustic(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.5 * sin(u_time * 0.35 + 6.28 * fract(
        sin(vec2(dot(i + g, vec2(127.1, 311.7)), dot(i + g, vec2(269.5, 183.3))))
        * 43758.5453));
      float d = length(f - g - o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.30;

  // ── Surface position — perspective projection looking up ──
  // Screen top = surface directly overhead; screen bottom = deep abyss.
  float upFraction = (uv.y + 0.5);   // 0 = bottom, 1 = top
  upFraction = clamp(upFraction, 0.0, 1.0);

  // Distance to surface scales inversely with upFraction (parallax effect)
  float depthToSurface = 1.5 / max(upFraction + 0.05, 0.05);

  // Project uv into surface-plane coordinates
  vec2 surfaceUV = vec2(uv.x * depthToSurface, depthToSurface * 0.5 + t * 3.0);

  // ── Ocean surface wave shape ──
  float h = 0.0;
  h += wave(surfaceUV, 2.1, 1.2, 0.0);
  h += wave(surfaceUV, 3.7, 0.9, 0.8);
  h += wave(surfaceUV, 1.4, 0.6, 2.3);
  h += wave(surfaceUV, 5.2, 1.5, 4.1);
  h += fbm(surfaceUV * 0.4 + vec2(t)) * 0.15;

  // Bass makes waves more turbulent
  h *= (1.0 + u_bass * 0.4);

  // Surface normal approximation — used to refract light direction
  float eps = 0.02;
  float hx = wave(surfaceUV + vec2(eps, 0.0), 2.1, 1.2, 0.0)
           + wave(surfaceUV + vec2(eps, 0.0), 3.7, 0.9, 0.8);
  float hy = wave(surfaceUV + vec2(0.0, eps), 2.1, 1.2, 0.0)
           + wave(surfaceUV + vec2(0.0, eps), 3.7, 0.9, 0.8);
  vec2 surfaceNormal = vec2(h - hx, h - hy) * 3.0;

  // ── Caustic light from above ──
  vec2 causticUV = surfaceUV * 1.8 + surfaceNormal;
  float c1 = caustic(causticUV);
  float c2 = caustic(causticUV * 1.6 + vec2(50.0, 30.0));
  float causticBright = (1.0 - smoothstep(0.0, 0.18, c1))
                      * (1.0 - smoothstep(0.0, 0.12, c2));
  causticBright = pow(causticBright, 1.4) * upFraction * upFraction;
  causticBright *= (0.5 + u_bass * 0.5);

  // ── Light column — shaft of surface light pointing downward ──
  float lightShaft = exp(-pow(uv.x * 0.8 + surfaceNormal.x * 0.3, 2.0) * 4.0)
                   * upFraction * upFraction;
  lightShaft *= (0.4 + u_mid * 0.6);

  // ── Depth fog — absolute darkness below ──
  float depthFog = exp(-depthToSurface * 0.18);       // 0 = deep, 1 = near surface
  float abyssFog = 1.0 - upFraction;                  // stronger at bottom

  // ── Color ──
  // Deep abyss color — almost black, hints of indigo
  vec3 deepColor = palette(
    t * 0.04 + paletteShift + 0.65,
    vec3(0.01, 0.01, 0.04),
    vec3(0.02, 0.02, 0.06),
    vec3(0.3, 0.4, 0.7),
    vec3(0.08, 0.1, 0.25)
  );

  // Mid-water color — teal/cyan
  vec3 midColor = palette(
    upFraction * 0.4 + h * 0.2 + paletteShift + 0.2,
    vec3(0.04, 0.12, 0.20),
    vec3(0.05, 0.12, 0.22),
    vec3(0.3, 0.6, 0.8),
    vec3(0.05, 0.15, 0.35)
  );

  // Surface/caustic color — bright aqua
  vec3 surfaceColor = palette(
    causticBright * 0.5 + paletteShift + 0.0,
    vec3(0.35, 0.55, 0.65),
    vec3(0.25, 0.35, 0.45),
    vec3(0.5, 0.8, 0.9),
    vec3(0.1, 0.2, 0.35)
  );

  // Build water color from deep to shallow
  vec3 color = mix(deepColor, midColor, upFraction * 0.7);
  color = mix(color, surfaceColor, depthFog * 0.6);

  // Caustic overlay
  color += surfaceColor * causticBright * 0.5;

  // Light shaft
  color += vec3(0.6, 0.85, 0.9) * lightShaft * 0.25;

  // Bioluminescent particles in the deep
  float bio = snoise(uv * 8.0 + vec2(t * 1.5, 0.0));
  bio = pow(max(-bio, 0.0), 4.0) * (1.0 - upFraction) * u_treble * 0.6;
  vec3 bioCol = palette(
    bio + paletteShift + 0.5,
    vec3(0.2, 0.4, 0.5),
    vec3(0.2, 0.4, 0.5),
    vec3(0.3, 0.9, 0.8),
    vec3(0.1, 0.3, 0.5)
  );
  color += bioCol * bio * 0.4;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  // Extra depth vignette at the bottom
  color *= 1.0 - abyssFog * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;
